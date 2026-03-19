import * as vscode from "vscode";
import type { ChatSession, ToolCall } from "./types";
import { parseToolCalls, stripFabricatedResults } from "./helpers";
import { executeToolCallWithHooks } from "./tool-executor";
import {
  streamResponse,
  streamResponseWithTools,
  buildMessages,
  type StreamingDeps,
} from "./streaming";
import { NON_DESTRUCTIVE_TOOL_TYPES } from "./constants";
import type { McpManager } from "./mcp-client";
import type { InlineDiffManager } from "./inline-diff";
import type { TerminalManager } from "./terminal-manager";

const MAX_TOOL_TURNS = 5;

export interface ToolLoopDeps {
  config: vscode.WorkspaceConfiguration;
  outputChannel: vscode.OutputChannel;
  streamingDeps: StreamingDeps;
  buildWorkspaceContext: () => Promise<string>;
  postState: () => void;
  autoCompact?: (session: ChatSession) => Promise<void>;
  mcpManager?: McpManager;
  inlineDiffMgr?: InlineDiffManager;
  terminalMgr?: TerminalManager;
}

/**
 * Runs the tool-call loop: streams a response, parses tool calls, executes
 * auto-approved ones, and loops until no more tool calls or a pending approval
 * is needed. Used by both sendPrompt and continueAfterToolResults.
 *
 * When `pocketai.useStructuredTools` is enabled, sends OpenAI-format tool
 * definitions and parses structured tool_calls from the response. Otherwise
 * falls back to text-based @tool_name parsing.
 */
export async function runToolLoop(
  session: ChatSession,
  deps: ToolLoopDeps,
): Promise<void> {
  const maxTokens = Math.max(
    128,
    deps.streamingDeps.getActiveMaxTokens(),
  );
  const previousToolKeys = new Set<string>();
  const fileReadCounts = new Map<string, number>();
  const useStructured = deps.config.get<boolean>("useStructuredTools", false);

  // Auto-compact before starting the loop
  if (deps.autoCompact) {
    await deps.autoCompact(session);
  }

  // Build workspace context once per loop invocation (unlikely to change mid-loop)
  const workspaceContext = await deps.buildWorkspaceContext();

  for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
    let cleanedText: string;
    let toolCalls: ToolCall[];

    if (useStructured) {
      // Structured tool calling path
      const currentMessages = buildMessages(
        session,
        workspaceContext,
        deps.streamingDeps,
        true,
      );
      const mcpTools = deps.mcpManager?.getToolDefinitions() ?? [];
      const result = await streamResponseWithTools(
        session,
        currentMessages,
        maxTokens,
        deps.streamingDeps,
        mcpTools.length > 0 ? mcpTools : undefined,
      );
      cleanedText = stripFabricatedResults(
        result.text.replace(/\s*\[end of text\]/g, ""),
      );

      if (cleanedText) {
        session.transcript.push({ role: "assistant", content: cleanedText });
      }

      // Use structured tool calls if present, else try text parsing as fallback
      toolCalls =
        result.toolCalls.length > 0
          ? result.toolCalls
          : parseToolCalls(cleanedText);

      // If we got tool calls but no text, add a placeholder transcript entry
      if (!cleanedText && toolCalls.length > 0) {
        const summary = toolCalls
          .map((tc) => `${tc.type}(${tc.filePath || tc.pattern || tc.glob || tc.query || tc.command || ""})`)
          .join(", ");
        session.transcript.push({
          role: "assistant",
          content: `[Calling tools: ${summary}]`,
        });
      }
    } else {
      // Text-based tool calling path (original behavior)
      const currentMessages = buildMessages(
        session,
        workspaceContext,
        deps.streamingDeps,
      );
      const text = await streamResponse(
        session,
        currentMessages,
        maxTokens,
        deps.streamingDeps,
      );
      cleanedText = stripFabricatedResults(
        text.replace(/\s*\[end of text\]/g, ""),
      );
      session.transcript.push({ role: "assistant", content: cleanedText });
      toolCalls = parseToolCalls(cleanedText);
    }

    if (toolCalls.length === 0) break;

    // Loop detection: same tool calls repeated
    const toolKey = toolCalls
      .map((tc) => `${tc.type}:${tc.filePath}:${tc.query || tc.pattern || ""}`)
      .join("|");
    if (previousToolKeys.has(toolKey)) {
      deps.outputChannel.appendLine(
        `⚠ Loop detected — same tool calls repeated, stopping.`,
      );
      session.transcript.push({
        role: "tool",
        content:
          "Loop detected: you are repeating the same tool calls. Try a different approach or explain the issue to the user.",
      });
      break;
    }
    previousToolKeys.add(toolKey);

    // Loop detection: same file read too many times
    let loopDetected = false;
    for (const tc of toolCalls) {
      if (tc.type === "read_file") {
        const count = (fileReadCounts.get(tc.filePath) ?? 0) + 1;
        fileReadCounts.set(tc.filePath, count);
        if (count > 3) {
          deps.outputChannel.appendLine(
            `⚠ Loop detected — ${tc.filePath} read ${count} times without an edit.`,
          );
          session.transcript.push({
            role: "tool",
            content: `Loop detected: you have read ${tc.filePath} ${count} times without editing it. Try a different approach.`,
          });
          loopDetected = true;
          break;
        }
      } else if (tc.type === "edit_file" || tc.type === "create_file") {
        fileReadCounts.delete(tc.filePath);
      }
    }
    if (loopDetected) break;

    const lastEntry = session.transcript[session.transcript.length - 1];
    lastEntry.toolCalls = toolCalls;

    // Auto-execute non-destructive tools (and MCP tools)
    for (const tc of toolCalls) {
      const isMcp = deps.mcpManager?.isMcpTool(tc.type) ?? false;
      const autoExec = isMcp
        ? session.mode === "auto"
        : tc.type === "run_command" || tc.type === "git_commit"
          ? false
          : NON_DESTRUCTIVE_TOOL_TYPES.has(tc.type) || session.mode === "auto";
      if (autoExec) {
        tc.status = "approved";
        let result: string;
        if (isMcp) {
          try {
            const args = (tc as { mcpArgs?: Record<string, unknown> }).mcpArgs ?? {};
            result = await deps.mcpManager!.executeTool(tc.type, args);
          } catch (e) {
            result = `MCP error: ${(e as Error).message}`;
          }
        } else {
          result = await executeToolCallWithHooks(
            deps.config,
            deps.outputChannel,
            session,
            tc,
            deps.terminalMgr,
          );
        }
        tc.result = result;
        tc.status = "executed";
        session.transcript.push({ role: "tool", content: result });
      }
    }

    // If any tools still need approval, show inline diffs and stop
    if (toolCalls.some((tc) => tc.status === "pending")) {
      if (deps.inlineDiffMgr) {
        for (const tc of toolCalls) {
          if (tc.status === "pending" && tc.type === "edit_file") {
            void deps.inlineDiffMgr.showInlineDiff(tc);
          }
        }
      }
      deps.postState();
      break;
    }

    session.status = "Thinking...";
    deps.postState();
  }
}
