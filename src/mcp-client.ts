import * as vscode from "vscode";
import * as child_process from "child_process";
import type { ToolCall } from "./types";
import type { OpenAITool } from "./tool-definitions";

/**
 * MCP (Model Context Protocol) client for connecting to external tool servers.
 * Supports stdio-based MCP servers that communicate via JSON-RPC over stdin/stdout.
 */

export type McpServerConfig = {
  name: string;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  enabled?: boolean;
};

type McpTool = {
  name: string;
  description?: string;
  inputSchema?: {
    type: string;
    properties?: Record<string, { type: string; description?: string }>;
    required?: string[];
  };
};

type JsonRpcMessage = {
  jsonrpc: "2.0";
  id?: number;
  method?: string;
  params?: unknown;
  result?: unknown;
  error?: { code: number; message: string };
};

export class McpManager {
  private servers = new Map<string, McpServerConnection>();
  private outputChannel: vscode.OutputChannel;

  constructor(outputChannel: vscode.OutputChannel) {
    this.outputChannel = outputChannel;
  }

  /** Connect to all configured MCP servers. */
  async connectAll(configs: McpServerConfig[]) {
    // Disconnect any servers no longer in config
    for (const [name, conn] of this.servers) {
      if (!configs.find((c) => c.name === name && c.enabled !== false)) {
        conn.dispose();
        this.servers.delete(name);
      }
    }

    for (const config of configs) {
      if (config.enabled === false) continue;
      if (this.servers.has(config.name)) continue;

      try {
        const conn = new McpServerConnection(config, this.outputChannel);
        await conn.initialize();
        this.servers.set(config.name, conn);
        this.outputChannel.appendLine(`MCP: Connected to ${config.name}`);
      } catch (e) {
        this.outputChannel.appendLine(
          `MCP: Failed to connect to ${config.name}: ${(e as Error).message}`,
        );
      }
    }
  }

  /** Get OpenAI-format tool definitions from all connected MCP servers. */
  getToolDefinitions(): OpenAITool[] {
    const tools: OpenAITool[] = [];
    for (const [serverName, conn] of this.servers) {
      for (const tool of conn.tools) {
        tools.push({
          type: "function",
          function: {
            name: `mcp__${serverName}__${tool.name}`,
            description: tool.description || `MCP tool from ${serverName}`,
            parameters: tool.inputSchema || { type: "object", properties: {} },
          },
        });
      }
    }
    return tools;
  }

  /** Check if a tool name is an MCP tool. */
  isMcpTool(toolName: string): boolean {
    return toolName.startsWith("mcp__");
  }

  /** Execute an MCP tool call. */
  async executeTool(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<string> {
    const parts = toolName.split("__");
    if (parts.length < 3) return `Error: Invalid MCP tool name: ${toolName}`;

    const serverName = parts[1];
    const mcpToolName = parts.slice(2).join("__");
    const conn = this.servers.get(serverName);
    if (!conn) return `Error: MCP server "${serverName}" not connected.`;

    try {
      return await conn.callTool(mcpToolName, args);
    } catch (e) {
      return `MCP error: ${(e as Error).message}`;
    }
  }

  /** Execute an MCP tool call wrapped as a ToolCall. */
  async executeToolCall(toolCall: ToolCall): Promise<string> {
    const args: Record<string, unknown> = {};
    // The tool call's various fields are the arguments
    if (toolCall.command) args.command = toolCall.command;
    if (toolCall.query) args.query = toolCall.query;
    if (toolCall.pattern) args.pattern = toolCall.pattern;
    if (toolCall.filePath) args.path = toolCall.filePath;
    if (toolCall.content) args.content = toolCall.content;
    // For structured tool calls, the args are passed via mcpArgs
    if ((toolCall as { mcpArgs?: Record<string, unknown> }).mcpArgs) {
      Object.assign(args, (toolCall as { mcpArgs?: Record<string, unknown> }).mcpArgs);
    }

    return this.executeTool(toolCall.type, args);
  }

  /** Get list of connected server names. */
  getConnectedServers(): string[] {
    return Array.from(this.servers.keys());
  }

  /** Disconnect all servers. */
  disposeAll() {
    for (const conn of this.servers.values()) {
      conn.dispose();
    }
    this.servers.clear();
  }
}

class McpServerConnection {
  private process: child_process.ChildProcess;
  private nextId = 1;
  private pending = new Map<
    number,
    { resolve: (v: unknown) => void; reject: (e: Error) => void }
  >();
  private buffer = "";
  tools: McpTool[] = [];

  constructor(
    private config: McpServerConfig,
    private outputChannel: vscode.OutputChannel,
  ) {
    this.process = child_process.spawn(config.command, config.args || [], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, ...config.env },
    });

    this.process.stdout?.on("data", (data: Buffer) => {
      this.buffer += data.toString();
      this.processBuffer();
    });

    this.process.stderr?.on("data", (data: Buffer) => {
      this.outputChannel.appendLine(
        `MCP [${config.name}] stderr: ${data.toString().trim()}`,
      );
    });

    this.process.on("error", (err) => {
      this.outputChannel.appendLine(
        `MCP [${config.name}] process error: ${err.message}`,
      );
    });

    this.process.on("close", (code) => {
      this.outputChannel.appendLine(
        `MCP [${config.name}] process exited with code ${code}`,
      );
      // Reject all pending requests
      for (const [, p] of this.pending) {
        p.reject(new Error(`MCP server ${config.name} exited`));
      }
      this.pending.clear();
    });
  }

  private processBuffer() {
    // MCP uses newline-delimited JSON
    while (true) {
      const newlineIdx = this.buffer.indexOf("\n");
      if (newlineIdx === -1) break;

      const line = this.buffer.slice(0, newlineIdx).trim();
      this.buffer = this.buffer.slice(newlineIdx + 1);

      if (!line) continue;

      try {
        const msg = JSON.parse(line) as JsonRpcMessage;
        if (msg.id !== undefined && this.pending.has(msg.id)) {
          const p = this.pending.get(msg.id)!;
          this.pending.delete(msg.id);
          if (msg.error) {
            p.reject(new Error(msg.error.message));
          } else {
            p.resolve(msg.result);
          }
        }
      } catch {
        this.outputChannel.appendLine(
          `MCP [${this.config.name}] invalid JSON: ${line.slice(0, 200)}`,
        );
      }
    }
  }

  private sendRequest(method: string, params?: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = this.nextId++;
      this.pending.set(id, { resolve, reject });

      const msg: JsonRpcMessage = {
        jsonrpc: "2.0",
        id,
        method,
        params,
      };

      const data = JSON.stringify(msg) + "\n";
      const ok = this.process.stdin?.write(data);
      if (!ok) {
        this.pending.delete(id);
        reject(new Error(`Failed to write to MCP server ${this.config.name}`));
      }

      // Timeout after 30s
      setTimeout(() => {
        if (this.pending.has(id)) {
          this.pending.delete(id);
          reject(
            new Error(`MCP request timed out: ${method} on ${this.config.name}`),
          );
        }
      }, 30000);
    });
  }

  async initialize() {
    const result = (await this.sendRequest("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "PocketAI", version: "1.0.0" },
    })) as { capabilities?: Record<string, unknown> };

    // Send initialized notification
    const notification: JsonRpcMessage = {
      jsonrpc: "2.0",
      method: "notifications/initialized",
    };
    this.process.stdin?.write(JSON.stringify(notification) + "\n");

    // List available tools
    await this.refreshTools();
    return result;
  }

  async refreshTools() {
    const result = (await this.sendRequest("tools/list")) as {
      tools?: McpTool[];
    };
    this.tools = result?.tools || [];
    this.outputChannel.appendLine(
      `MCP [${this.config.name}]: ${this.tools.length} tools available`,
    );
  }

  async callTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<string> {
    const result = (await this.sendRequest("tools/call", {
      name,
      arguments: args,
    })) as { content?: Array<{ type: string; text?: string }> };

    if (!result?.content?.length) return "(empty result)";

    return result.content
      .map((c) => c.text || JSON.stringify(c))
      .join("\n");
  }

  dispose() {
    try {
      this.process.kill();
    } catch {}
    this.pending.clear();
  }
}
