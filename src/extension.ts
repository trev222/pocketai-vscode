import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import * as child_process from "child_process";

import type {
  InteractionMode,
  WebviewToExtensionMessage,
  ExtensionToWebviewMessage,
} from "./types";

import {
  DEFAULT_MAX_TOKENS,
  DEFAULT_CONTEXT_WINDOW_SIZE,
  DEFAULT_PROJECT_INSTRUCTIONS_FILE,
  DEFAULT_SYSTEM_PROMPT,
  VSCODE_SKILL_COMMANDS,
} from "./constants";

import { normalizeBaseUrl, getNonce } from "./helpers";

import { getSettingsHtml } from "./settings-html";
import { getChatHtml } from "./chat-html";
import { rewindToCheckpoint } from "./checkpoints";
import { SessionManager } from "./session-manager";
import { EndpointManager } from "./endpoint-manager";
import { DiffViewer } from "./diff-viewer";
import { executeToolCallWithHooks } from "./tool-executor";
import { runToolLoop, type ToolLoopDeps } from "./tool-loop";
import { type StreamingDeps } from "./streaming";
import {
  buildWorkspaceContext,
  buildDiagnostics,
  estimateSessionTokens,
} from "./workspace-context";
import { resolveAtMentions, injectAtMentionContent } from "./at-mentions";
import { McpManager, type McpServerConfig } from "./mcp-client";
import { InlineDiffManager } from "./inline-diff";
import { TerminalManager } from "./terminal-manager";

/* ────────────────────────────── Activation ────────────────────────────── */

let providerInstance: PocketAIViewProvider | undefined;

export function activate(context: vscode.ExtensionContext) {
  providerInstance = new PocketAIViewProvider(context);

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(
      PocketAIViewProvider.viewType,
      providerInstance,
      { webviewOptions: { retainContextWhenHidden: true } },
    ),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("pocketai.openPanel", async () => {
      await providerInstance?.openPanel();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("pocketai.askSelection", async () => {
      await providerInstance?.focus();
      await providerInstance?.handleUseSelection();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("pocketai.askPrompt", async () => {
      await providerInstance?.focus();
      await providerInstance?.promptForInput();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("pocketai.focus", async () => {
      await providerInstance?.focus();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("pocketai.focusInput", async () => {
      await providerInstance?.focus();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("pocketai.sendSelection", async () => {
      await providerInstance?.focus();
      await providerInstance?.handleUseSelection();
    }),
  );
}

export function deactivate() {
  providerInstance?.dispose();
}

/* ────────────────────────────── Provider ────────────────────────────── */

class PocketAIViewProvider implements vscode.WebviewViewProvider {
  static readonly viewType = "pocketai.sidebarView";
  static readonly panelType = "pocketai.chatPanel";

  private readonly outputChannel = vscode.window.createOutputChannel("PocketAI");
  private readonly panelSessions = new Map<vscode.WebviewPanel, string>();
  private readonly webviews = new Set<vscode.Webview>();
  private view?: vscode.WebviewView;
  private settingsWebview?: vscode.Webview;
  private projectInstructionsCache = "";
  private projectInstructionsWatcher?: vscode.FileSystemWatcher;

  private readonly sessionMgr: SessionManager;
  private readonly endpointMgr: EndpointManager;
  private readonly diffViewer: DiffViewer;
  private readonly mcpManager: McpManager;
  private readonly inlineDiffMgr: InlineDiffManager;
  private readonly terminalMgr: TerminalManager;

  constructor(private readonly context: vscode.ExtensionContext) {
    this.sessionMgr = new SessionManager(context);
    this.endpointMgr = new EndpointManager(context);
    this.diffViewer = new DiffViewer(context);
    this.mcpManager = new McpManager(this.outputChannel);
    this.inlineDiffMgr = new InlineDiffManager(context);
    this.terminalMgr = new TerminalManager(this.outputChannel);

    // Wire inline diff accept/reject to tool approval flow
    this.inlineDiffMgr.onAccept = (toolCallId) => {
      const sessionId = this.findSessionWithToolCall(toolCallId);
      if (sessionId) this.handleToolApproval(sessionId, toolCallId, true);
    };
    this.inlineDiffMgr.onReject = (toolCallId) => {
      const sessionId = this.findSessionWithToolCall(toolCallId);
      if (sessionId) this.handleToolApproval(sessionId, toolCallId, false);
    };

    this.sessionMgr.restoreState();
    if (!this.sessionMgr.sessions.size) {
      const session = this.sessionMgr.createSession(
        this.endpointMgr.models,
        () => this.getConfiguredModel(),
      );
      this.sessionMgr.sidebarSessionId = session.id;
      void this.sessionMgr.saveState();
    }
    this.endpointMgr.initEndpoints();
    this.endpointMgr.startHealthChecks(
      () => this.postState(),
      () => this.pushSettingsState(),
    );
    this.endpointMgr.initStatusBar(
      this.sessionMgr.sidebarSessionId,
      this.sessionMgr.sessions,
    );
    this.loadProjectInstructions();
    this.watchProjectInstructions();
    this.connectMcpServers();
  }

  dispose() {
    this.endpointMgr.dispose();
    this.projectInstructionsWatcher?.dispose();
    this.mcpManager.disposeAll();
    this.inlineDiffMgr.dispose();
    this.terminalMgr.dispose();
  }

  /* ── Helpers ── */

  /** Find which session contains a given tool call ID. */
  private findSessionWithToolCall(toolCallId: string): string | undefined {
    for (const [id, session] of this.sessionMgr.sessions) {
      for (const entry of session.transcript) {
        if (entry.toolCalls?.some((tc) => tc.id === toolCallId)) return id;
      }
    }
    return undefined;
  }

  private get config() {
    return vscode.workspace.getConfiguration("pocketai");
  }

  private getConfiguredModel(): string {
    return (this.endpointMgr.getActiveEndpointConfig().model ?? "").trim();
  }

  private getStreamingDeps(): StreamingDeps {
    return {
      baseUrl: this.endpointMgr.baseUrl,
      config: this.config,
      outputChannel: this.outputChannel,
      projectInstructionsCache: this.projectInstructionsCache,
      getActiveSystemPrompt: () =>
        (this.endpointMgr.getActiveEndpointConfig().systemPrompt ?? "").trim(),
      getActiveMaxTokens: () =>
        this.endpointMgr.getActiveEndpointConfig().maxTokens ?? DEFAULT_MAX_TOKENS,
      broadcastToWebviews: (msg) => this.broadcastToWebviews(msg),
    };
  }

  private getToolLoopDeps(): ToolLoopDeps {
    return {
      config: this.config,
      outputChannel: this.outputChannel,
      streamingDeps: this.getStreamingDeps(),
      buildWorkspaceContext: () => buildWorkspaceContext(this.config),
      postState: () => this.postState(),
      mcpManager: this.mcpManager,
      inlineDiffMgr: this.inlineDiffMgr,
      terminalMgr: this.terminalMgr,
      autoCompact: async (session) => {
        const contextWindow =
          this.config.get<number>("contextWindowSize") ?? DEFAULT_CONTEXT_WINDOW_SIZE;
        const estimated = estimateSessionTokens(
          session,
          this.config,
          this.projectInstructionsCache,
          this.endpointMgr.getActiveEndpointConfig().systemPrompt ?? "",
        );
        // Auto-compact when context exceeds 75% of the window
        if (estimated > contextWindow * 0.75 && session.transcript.length > 6) {
          this.outputChannel.appendLine(
            `Auto-compacting: ~${estimated} tokens estimated, window is ${contextWindow}`,
          );
          await this.sessionMgr.compactSession(
            session,
            this.getStreamingDeps(),
            (s) =>
              estimateSessionTokens(
                s,
                this.config,
                this.projectInstructionsCache,
                this.endpointMgr.getActiveEndpointConfig().systemPrompt ?? "",
              ),
            () => this.postState(),
          );
        }
      },
    };
  }

  private updateStatusBar() {
    this.endpointMgr.updateStatusBar(
      this.sessionMgr.sidebarSessionId,
      this.sessionMgr.sessions,
    );
  }

  /* ── Project Instructions (.pocketai.md) ── */

  private async loadProjectInstructions() {
    const fileName =
      this.config.get<string>("projectInstructionsFile") ??
      DEFAULT_PROJECT_INSTRUCTIONS_FILE;
    try {
      const files = await vscode.workspace.findFiles(fileName, null, 1);
      if (files.length) {
        const content = await vscode.workspace.fs.readFile(files[0]);
        this.projectInstructionsCache = Buffer.from(content).toString("utf-8");
        this.outputChannel.appendLine(
          `Loaded project instructions from ${fileName} (${this.projectInstructionsCache.length} chars)`,
        );
      } else {
        this.projectInstructionsCache = "";
      }
    } catch {
      this.projectInstructionsCache = "";
    }
  }

  private watchProjectInstructions() {
    const fileName =
      this.config.get<string>("projectInstructionsFile") ??
      DEFAULT_PROJECT_INSTRUCTIONS_FILE;
    this.projectInstructionsWatcher?.dispose();
    this.projectInstructionsWatcher = vscode.workspace.createFileSystemWatcher(
      `**/${fileName}`,
    );
    this.projectInstructionsWatcher.onDidChange(() =>
      this.loadProjectInstructions(),
    );
    this.projectInstructionsWatcher.onDidCreate(() =>
      this.loadProjectInstructions(),
    );
    this.projectInstructionsWatcher.onDidDelete(() => {
      this.projectInstructionsCache = "";
    });
  }

  /* ── MCP Servers ── */

  private connectMcpServers() {
    const configs = this.config.get<McpServerConfig[]>("mcpServers") ?? [];
    if (configs.length === 0) return;
    void this.mcpManager.connectAll(configs).then(() => {
      const servers = this.mcpManager.getConnectedServers();
      if (servers.length > 0) {
        this.outputChannel.appendLine(
          `MCP: ${servers.length} server(s) connected: ${servers.join(", ")}`,
        );
      }
    });
  }

  /* ── Webview lifecycle ── */

  async resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken,
  ) {
    this.view = webviewView;
    this.initializeSettingsWebview(webviewView.webview);
  }

  async openPanel() {
    const session = this.sessionMgr.createSession(
      this.endpointMgr.models,
      () => this.getConfiguredModel(),
    );
    const panel = vscode.window.createWebviewPanel(
      PocketAIViewProvider.panelType,
      this.getPanelTitle(session.id),
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: false },
      { enableScripts: true, retainContextWhenHidden: true },
    );
    panel.iconPath = vscode.Uri.joinPath(
      this.context.extensionUri,
      "media",
      "logo-black2-zoom.png",
    );
    this.panelSessions.set(panel, session.id);
    this.initializeChatWebview(
      panel.webview,
      () => this.panelSessions.get(panel) ?? session.id,
      (id) => this.switchPanelSession(panel, id),
      () => this.createSessionForPanel(panel),
      (id) => this.deleteSession(id),
    );
    panel.onDidDispose(() => {
      this.panelSessions.delete(panel);
      this.webviews.delete(panel.webview);
    });
    this.postState();
  }

  async focus() {
    await this.openPanel();
  }

  async promptForInput() {
    const prompt = await vscode.window.showInputBox({
      title: "Ask PocketAI",
      prompt: "Send a prompt to PocketAI",
      placeHolder: "Explain this error in plain English.",
      ignoreFocusOut: true,
    });
    if (!prompt?.trim()) return;
    await this.sendPrompt(this.sessionMgr.sidebarSessionId, prompt.trim());
  }

  async handleUseSelection(sessionId = this.sessionMgr.sidebarSessionId) {
    const session = this.sessionMgr.requireSession(sessionId);
    if (!session) return;

    const editor = vscode.window.activeTextEditor;
    if (!editor) {
      session.status = "No active editor found.";
      this.sessionMgr.touchSession(session);
      this.postState();
      return;
    }

    const selectedText = editor.document.getText(editor.selection).trim();
    const fallbackText = editor.document
      .lineAt(editor.selection.active.line)
      .text.trim();
    const content = selectedText || fallbackText;

    if (!content) {
      session.status = "Select some code or place the cursor on a non-empty line.";
      this.sessionMgr.touchSession(session);
      this.postState();
      return;
    }

    const relativePath = vscode.workspace.asRelativePath(
      editor.document.uri,
      false,
    );
    const prompt = `Here is code from \`${relativePath}\`:\n\n\`\`\`\n${content}\n\`\`\`\n\nExplain this code.`;
    await this.sendPrompt(sessionId, prompt);
  }

  /* ── Settings sidebar ── */

  private initializeSettingsWebview(webview: vscode.Webview) {
    webview.options = { enableScripts: true };
    webview.html = getSettingsHtml();
    this.settingsWebview = webview;
    this.pushSettingsState();

    webview.onDidReceiveMessage(
      async (message: { type: string; [key: string]: unknown }) => {
        switch (message.type) {
          case "addEndpoint": {
            const name = String(message.name || "").trim();
            const url = String(message.url || "").trim();
            if (!name || !url) return;
            const endpoints = this.endpointMgr.getEndpoints();
            endpoints.push({ name, url });
            await this.config.update(
              "endpoints",
              endpoints,
              vscode.ConfigurationTarget.Global,
            );
            this.endpointMgr.initEndpoints();
            this.endpointMgr.startHealthChecks(
              () => this.postState(),
              () => this.pushSettingsState(),
            );
            this.pushSettingsState();
            this.updateStatusBar();
            break;
          }
          case "removeEndpoint": {
            const url = normalizeBaseUrl(String(message.url || ""));
            const endpoints = this.endpointMgr
              .getEndpoints()
              .filter((ep) => normalizeBaseUrl(ep.url) !== url);
            await this.config.update(
              "endpoints",
              endpoints.length ? endpoints : undefined,
              vscode.ConfigurationTarget.Global,
            );
            this.endpointMgr.endpointHealthMap.delete(url);
            if (this.endpointMgr.activeEndpointUrl === url) {
              this.endpointMgr.initEndpoints();
              void this.refreshModels();
            }
            this.pushSettingsState();
            this.updateStatusBar();
            break;
          }
          case "setActiveEndpoint": {
            this.endpointMgr.switchEndpoint(String(message.url || ""));
            void this.refreshModels();
            this.pushSettingsState();
            break;
          }
          case "refreshEndpoints": {
            this.endpointMgr.initEndpoints();
            this.endpointMgr.startHealthChecks(
              () => this.postState(),
              () => this.pushSettingsState(),
            );
            setTimeout(() => this.pushSettingsState(), 2000);
            break;
          }
          case "openChat": {
            await this.openPanel();
            break;
          }
          case "updateSetting": {
            const key = String(message.key || "");
            const value = message.value;
            if (key) {
              await this.config.update(
                key,
                value,
                vscode.ConfigurationTarget.Global,
              );
              this.pushSettingsState();
            }
            break;
          }
          case "updateEndpointSetting": {
            const epUrl = normalizeBaseUrl(String(message.url || ""));
            const key = String(message.key || "");
            const value = message.value;
            if (epUrl && key) {
              const endpoints = this.endpointMgr.getEndpoints();
              const ep = endpoints.find(
                (e) => normalizeBaseUrl(e.url) === epUrl,
              );
              if (ep) {
                (ep as any)[key] = value;
                await this.config.update(
                  "endpoints",
                  endpoints,
                  vscode.ConfigurationTarget.Global,
                );
                this.pushSettingsState();
              }
            }
            break;
          }
        }
      },
    );
  }

  private pushSettingsState() {
    if (!this.settingsWebview) return;
    const configEndpoints = this.endpointMgr.getEndpoints();
    const endpoints = Array.from(
      this.endpointMgr.endpointHealthMap.values(),
    ).map((health) => {
      const epConfig = configEndpoints.find(
        (ep) => normalizeBaseUrl(ep.url) === health.url,
      );
      return {
        ...health,
        model: epConfig?.model ?? "",
        maxTokens: epConfig?.maxTokens ?? 4096,
        systemPrompt:
          epConfig?.systemPrompt ?? DEFAULT_SYSTEM_PROMPT,
      };
    });
    this.settingsWebview.postMessage({
      type: "settingsState",
      endpoints,
      activeEndpoint: this.endpointMgr.activeEndpointUrl,
      settings: {
        includeWorkspaceContext:
          this.config.get<boolean>("includeWorkspaceContext") ?? true,
      },
      models: this.endpointMgr.models,
    });
  }

  /* ── Chat / Streaming ── */

  private async sendPrompt(
    sessionId: string,
    prompt: string,
    images?: import("./types").ImageAttachment[],
  ) {
    const session = this.sessionMgr.requireSession(sessionId);
    let trimmed = prompt.trim();
    if (!session || (!trimmed && !images?.length) || session.busy) return;

    // Slash commands
    if (trimmed.startsWith("/")) {
      const handled = await this.handleSlashCommand(session, trimmed);
      if (handled) return;

      // Skill slash commands
      const parts = trimmed.split(/\s+/);
      const cmd = parts[0].toLowerCase();
      const arg = parts.slice(1).join(" ").trim();
      const skillDef = VSCODE_SKILL_COMMANDS[cmd];
      if (skillDef) {
        session.activeSkillInjection = skillDef.injection;
        if (!arg) {
          session.status = `${skillDef.name} skill active — type your prompt.`;
          this.sessionMgr.touchSession(session);
          this.postState();
          return;
        }
        trimmed = arg;
      }
    }

    if (!session.selectedModel) {
      if (this.endpointMgr.models.length) {
        session.selectedModel = this.endpointMgr.models[0];
      } else {
        session.status = "No model selected. Click refresh or check your server.";
        this.postState();
        return;
      }
    }

    const resolvedPrompt = await injectAtMentionContent(trimmed, this.config);
    const userEntry: import("./types").ChatEntry = { role: "user", content: resolvedPrompt };
    if (images?.length) {
      userEntry.images = images;
    }
    session.transcript.push(userEntry);
    this.sessionMgr.autoTitle(session, trimmed);
    this.updateBoundTitles(session.id);
    session.busy = true;
    session.status = "Thinking...";
    this.sessionMgr.touchSession(session);
    this.postState();

    session.currentRequest = new AbortController();
    this.outputChannel.appendLine(
      `→ ${this.endpointMgr.baseUrl}/v1/chat/completions [${session.selectedModel}]`,
    );

    try {
      await runToolLoop(session, this.getToolLoopDeps());
      session.status = "Ready";
      this.outputChannel.appendLine(
        `← Response received [${session.id}]`,
      );
    } catch (error) {
      if ((error as Error).name === "AbortError") {
        session.status = "Cancelled.";
        session.transcript.push({
          role: "assistant",
          content: "_Request cancelled._",
        });
      } else {
        const message =
          error instanceof Error ? error.message : "Request failed.";
        session.status = message;
        session.transcript.push({
          role: "assistant",
          content: `**Error:** ${message}`,
        });
      }
      this.outputChannel.appendLine(
        `✗ Error [${session.id}]: ${(error as Error).message}`,
      );
    } finally {
      session.busy = false;
      session.currentRequest = undefined;
      session.activeSkillInjection = undefined;
      this.notifyCompletion(session);
      this.sessionMgr.touchSession(session);
      await this.sessionMgr.saveState();
      this.postState();
    }
  }

  private async handleSlashCommand(
    session: NonNullable<ReturnType<SessionManager["requireSession"]>>,
    input: string,
  ): Promise<boolean> {
    const parts = input.split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const arg = parts.slice(1).join(" ").trim();

    switch (cmd) {
      case "/clear":
        session.transcript = [];
        session.status = "Cleared.";
        this.sessionMgr.touchSession(session);
        await this.sessionMgr.saveState();
        this.postState();
        return true;
      case "/model":
        if (arg && this.endpointMgr.models.includes(arg)) {
          session.selectedModel = arg;
          session.status = `Model switched to ${arg}`;
        } else {
          session.status = arg
            ? `Model "${arg}" not found. Available: ${this.endpointMgr.models.join(", ")}`
            : `Available models: ${this.endpointMgr.models.join(", ")}`;
        }
        this.sessionMgr.touchSession(session);
        this.updateStatusBar();
        await this.sessionMgr.saveState();
        this.postState();
        return true;
      case "/endpoint":
        if (arg) {
          const match = Array.from(
            this.endpointMgr.endpointHealthMap.values(),
          ).find(
            (h) =>
              h.name.toLowerCase() === arg.toLowerCase() ||
              h.url === normalizeBaseUrl(arg),
          );
          if (match) {
            this.endpointMgr.switchEndpoint(match.url);
            void this.refreshModels();
            session.status = `Switched to endpoint: ${match.name}`;
          } else {
            session.status = `Endpoint "${arg}" not found.`;
          }
        } else {
          session.status = `Endpoints: ${Array.from(this.endpointMgr.endpointHealthMap.values()).map((h) => h.name).join(", ")}`;
        }
        this.sessionMgr.touchSession(session);
        await this.sessionMgr.saveState();
        this.postState();
        return true;
      case "/mode":
        if (arg === "ask" || arg === "auto" || arg === "plan") {
          session.mode = arg;
          const labels: Record<InteractionMode, string> = {
            ask: "Ask mode — I'll ask before making changes.",
            auto: "Auto mode — changes applied automatically.",
            plan: "Plan mode — I'll describe changes before making them.",
          };
          session.status = labels[arg];
        } else {
          session.status = `Usage: /mode <ask|auto|plan>`;
        }
        this.sessionMgr.touchSession(session);
        await this.sessionMgr.saveState();
        this.postState();
        return true;
      case "/sessions":
        session.status = `Sessions: ${this.sessionMgr.getSessionSummaries().map((s) => s.title).join(", ")}`;
        this.postState();
        return true;
      case "/compact":
        await this.sessionMgr.compactSession(
          session,
          this.getStreamingDeps(),
          (s) => this.estimateTokens(s),
          () => this.postState(),
        );
        return true;
      case "/fork": {
        const forked = this.sessionMgr.forkSession(session);
        this.openForkedPanel(forked);
        session.status = `Forked → "${forked.title}"`;
        this.sessionMgr.touchSession(session);
        await this.sessionMgr.saveState();
        this.postState();
        return true;
      }
      case "/branch": {
        const workspaceFolders = vscode.workspace.workspaceFolders;
        if (!workspaceFolders?.length) {
          session.status = "No workspace folder open.";
          this.postState();
          return true;
        }
        const rootPath = workspaceFolders[0].uri.fsPath;
        try {
          if (!arg) {
            // Show current branch
            const current = child_process
              .execSync("git branch --show-current", { cwd: rootPath, encoding: "utf-8" })
              .trim();
            const branches = child_process
              .execSync("git branch --list", { cwd: rootPath, encoding: "utf-8" })
              .trim();
            session.status = `On branch: ${current}`;
            session.transcript.push({
              role: "tool",
              content: `Current branch: **${current}**\n\`\`\`\n${branches}\n\`\`\``,
            });
          } else if (arg.startsWith("-d ")) {
            const branchName = arg.slice(3).trim();
            child_process.execSync(`git branch -d ${branchName}`, { cwd: rootPath, encoding: "utf-8" });
            session.status = `Deleted branch: ${branchName}`;
          } else {
            // Create and switch to branch, or just switch if it exists
            try {
              child_process.execSync(`git checkout -b ${arg}`, { cwd: rootPath, encoding: "utf-8" });
              session.status = `Created and switched to branch: ${arg}`;
            } catch {
              child_process.execSync(`git checkout ${arg}`, { cwd: rootPath, encoding: "utf-8" });
              session.status = `Switched to branch: ${arg}`;
            }
          }
        } catch (e) {
          session.status = `Git error: ${(e as Error).message}`;
        }
        this.sessionMgr.touchSession(session);
        await this.sessionMgr.saveState();
        this.postState();
        return true;
      }
      case "/tokens": {
        const cum = session.cumulativeTokens;
        const total = cum.prompt + cum.completion;
        session.status = total > 0
          ? `Session tokens — Prompt: ${cum.prompt.toLocaleString()}, Completion: ${cum.completion.toLocaleString()}, Total: ${total.toLocaleString()}`
          : "No tokens used yet in this session.";
        this.postState();
        return true;
      }
      default:
        return false;
    }
  }

  private async executeMcpToolCall(tc: import("./types").ToolCall): Promise<string> {
    try {
      const args = (tc as { mcpArgs?: Record<string, unknown> }).mcpArgs ?? {};
      return await this.mcpManager.executeTool(tc.type, args);
    } catch (e) {
      return `MCP error: ${(e as Error).message}`;
    }
  }

  private async handleToolApproval(
    sessionId: string,
    toolCallId: string,
    approved: boolean,
  ) {
    const session = this.sessionMgr.requireSession(sessionId);
    if (!session) return;

    for (const entry of session.transcript) {
      if (!entry.toolCalls) continue;
      for (const tc of entry.toolCalls) {
        if (tc.id !== toolCallId) continue;

        // Clear inline diff decoration for this tool call
        this.inlineDiffMgr.clearChange(toolCallId);

        if (approved) {
          tc.status = "approved";
          const result = this.mcpManager.isMcpTool(tc.type)
            ? await this.executeMcpToolCall(tc)
            : await executeToolCallWithHooks(
                this.config,
                this.outputChannel,
                session,
                tc,
                this.terminalMgr,
              );
          tc.result = result;
          tc.status = "executed";
          session.transcript.push({ role: "tool", content: result });
        } else {
          tc.status = "rejected";
          tc.result = "Edit rejected by user.";
          session.transcript.push({
            role: "tool",
            content: "User rejected this change.",
          });
        }

        this.sessionMgr.touchSession(session);
        await this.sessionMgr.saveState();
        this.postState();

        const allResolved = entry.toolCalls!.every(
          (t) => t.status === "executed" || t.status === "rejected",
        );
        if (allResolved && !session.busy) {
          this.continueAfterToolResults(session);
        }
        return;
      }
    }
  }

  private async handleBatchToolApproval(
    sessionId: string,
    approved: boolean,
  ) {
    const session = this.sessionMgr.requireSession(sessionId);
    if (!session) return;

    // Clear all inline diff decorations
    this.inlineDiffMgr.clearAll();

    for (const entry of session.transcript) {
      if (!entry.toolCalls) continue;
      for (const tc of entry.toolCalls) {
        if (tc.status !== "pending") continue;

        if (approved) {
          tc.status = "approved";
          const result = this.mcpManager.isMcpTool(tc.type)
            ? await this.executeMcpToolCall(tc)
            : await executeToolCallWithHooks(
                this.config,
                this.outputChannel,
                session,
                tc,
                this.terminalMgr,
              );
          tc.result = result;
          tc.status = "executed";
          session.transcript.push({ role: "tool", content: result });
        } else {
          tc.status = "rejected";
          tc.result = "Edit rejected by user.";
          session.transcript.push({
            role: "tool",
            content: "User rejected this change.",
          });
        }
      }
    }

    this.sessionMgr.touchSession(session);
    await this.sessionMgr.saveState();
    this.postState();

    if (!session.busy) {
      this.continueAfterToolResults(session);
    }
  }

  private async continueAfterToolResults(
    session: NonNullable<ReturnType<SessionManager["requireSession"]>>,
  ) {
    session.busy = true;
    session.status = "Thinking...";
    session.currentRequest = new AbortController();
    this.postState();

    try {
      await runToolLoop(session, this.getToolLoopDeps());
      session.status = "Ready";
    } catch (error) {
      if ((error as Error).name === "AbortError") {
        session.status = "Cancelled.";
        session.transcript.push({
          role: "assistant",
          content: "_Request cancelled._",
        });
      } else {
        const message =
          error instanceof Error ? error.message : "Request failed.";
        session.status = message;
        session.transcript.push({
          role: "assistant",
          content: `**Error:** ${message}`,
        });
      }
    } finally {
      session.busy = false;
      session.currentRequest = undefined;
      this.notifyCompletion(session);
      this.sessionMgr.touchSession(session);
      await this.sessionMgr.saveState();
      this.postState();
    }
  }

  /** Show a VS Code notification when a task completes and the editor isn't focused. */
  private notifyCompletion(session: { title: string; status: string }) {
    // Only notify if VS Code window isn't focused (user switched away)
    if (!vscode.window.state.focused) {
      const status = session.status === "Ready" ? "completed" : "finished with errors";
      void vscode.window.showInformationMessage(
        `PocketAI ${status}: ${session.title}`,
      );
    }
  }

  /* ── Session helpers ── */

  private createSessionForPanel(panel: vscode.WebviewPanel): string {
    const session = this.sessionMgr.createSession(
      this.endpointMgr.models,
      () => this.getConfiguredModel(),
    );
    this.panelSessions.set(panel, session.id);
    panel.title = this.getPanelTitle(session.id);
    this.postState();
    return session.id;
  }

  private switchPanelSession(panel: vscode.WebviewPanel, sessionId: string) {
    if (!this.sessionMgr.sessions.has(sessionId)) return;
    this.panelSessions.set(panel, sessionId);
    panel.title = this.getPanelTitle(sessionId);
    void this.sessionMgr.saveState();
    this.postState();
  }

  private deleteSession(sessionId: string) {
    const fallbackId = this.sessionMgr.deleteSession(
      sessionId,
      this.endpointMgr.models,
      () => this.getConfiguredModel(),
    );
    if (!fallbackId) return;

    for (const [panel, pSessionId] of this.panelSessions.entries()) {
      if (pSessionId === sessionId) {
        this.panelSessions.set(panel, fallbackId);
        panel.title = this.getPanelTitle(fallbackId);
      }
    }
    this.postState();
  }

  private openForkedPanel(forked: ReturnType<SessionManager["forkSession"]>) {
    const panel = vscode.window.createWebviewPanel(
      PocketAIViewProvider.panelType,
      this.getPanelTitle(forked.id),
      { viewColumn: vscode.ViewColumn.Beside, preserveFocus: false },
      { enableScripts: true, retainContextWhenHidden: true },
    );
    panel.iconPath = vscode.Uri.joinPath(
      this.context.extensionUri,
      "media",
      "logo-black2-zoom.png",
    );
    this.panelSessions.set(panel, forked.id);
    this.initializeChatWebview(
      panel.webview,
      () => this.panelSessions.get(panel) ?? forked.id,
      (id) => this.switchPanelSession(panel, id),
      () => this.createSessionForPanel(panel),
      (id) => this.deleteSession(id),
    );
    panel.onDidDispose(() => {
      this.panelSessions.delete(panel);
      this.webviews.delete(panel.webview);
    });
  }

  private updateBoundTitles(sessionId: string) {
    for (const [panel, pId] of this.panelSessions.entries()) {
      if (pId === sessionId) panel.title = this.getPanelTitle(sessionId);
    }
  }

  private getPanelTitle(sessionId: string) {
    const session = this.sessionMgr.requireSession(sessionId);
    return session ? `PocketAI · ${session.title}` : "PocketAI";
  }

  private estimateTokens(
    session: NonNullable<ReturnType<SessionManager["requireSession"]>>,
  ) {
    return estimateSessionTokens(
      session,
      this.config,
      this.projectInstructionsCache,
      (this.endpointMgr.getActiveEndpointConfig().systemPrompt ?? "").trim(),
    );
  }

  private async refreshModels() {
    await this.endpointMgr.refreshModels(
      this.sessionMgr.sessions,
      () => this.sessionMgr.saveState(),
    );
    this.updateStatusBar();
  }

  /* ── State broadcast ── */

  private postState() {
    if (this.view)
      this.postStateToWebview(
        this.view.webview,
        this.sessionMgr.sidebarSessionId,
      );
    for (const [panel, sessionId] of this.panelSessions.entries()) {
      this.postStateToWebview(panel.webview, sessionId);
    }
    this.updateStatusBar();
  }

  private postStateToWebview(webview: vscode.Webview, sessionId: string) {
    const session = this.sessionMgr.requireSession(sessionId);
    if (!session) return;

    const contextWindowSize =
      this.config.get<number>("contextWindowSize") ?? DEFAULT_CONTEXT_WINDOW_SIZE;
    webview.postMessage({
      type: "state",
      transcript: session.transcript,
      models: this.endpointMgr.models,
      selectedModel: session.selectedModel,
      endpoints: Array.from(this.endpointMgr.endpointHealthMap.values()),
      selectedEndpoint: this.endpointMgr.activeEndpointUrl,
      status: session.status,
      busy: session.busy,
      sessions: this.sessionMgr.getSessionSummaries(),
      activeSessionId: session.id,
      mode: session.mode,
      diagnostics: buildDiagnostics(
        this.endpointMgr.baseUrl,
        this.endpointMgr.statusSummary,
        this.endpointMgr.models,
      ),
      projectInstructionsLoaded: !!this.projectInstructionsCache,
      contextTokenEstimate: this.estimateTokens(session),
      contextWindowSize,
      cumulativeTokens: session.cumulativeTokens,
    } satisfies ExtensionToWebviewMessage);
  }

  private broadcastToWebviews(message: ExtensionToWebviewMessage) {
    for (const webview of this.webviews) {
      webview.postMessage(message);
    }
  }

  /* ── Chat webview initialization ── */

  private initializeChatWebview(
    webview: vscode.Webview,
    getSessionId: () => string,
    switchSession: (id: string) => void,
    newSession: () => string,
    deleteSession: (id: string) => void,
  ) {
    webview.options = { enableScripts: true };
    webview.html = this.getHtml(webview);
    this.webviews.add(webview);

    webview.onDidReceiveMessage(async (message: WebviewToExtensionMessage) => {
      try {
        const sessionId = getSessionId();
        switch (message.type) {
          case "ready":
            await this.refreshModels();
            this.postStateToWebview(webview, getSessionId());
            return;
          case "sendPrompt":
            await this.sendPrompt(sessionId, message.prompt, message.images);
            return;
          case "selectModel": {
            const session = this.sessionMgr.requireSession(sessionId);
            if (!session) return;
            session.selectedModel = message.modelId;
            this.sessionMgr.touchSession(session);
            await this.sessionMgr.saveState();
            this.postState();
            return;
          }
          case "refreshModels":
            await this.refreshModels();
            this.postState();
            return;
          case "useSelection":
            await this.handleUseSelection(sessionId);
            return;
          case "clear": {
            const session = this.sessionMgr.requireSession(sessionId);
            if (!session) return;
            session.transcript = [];
            session.status = "Cleared.";
            this.sessionMgr.touchSession(session);
            await this.sessionMgr.saveState();
            this.postState();
            return;
          }
          case "newSession":
            newSession();
            return;
          case "switchSession":
            switchSession(message.sessionId);
            return;
          case "deleteSession":
            deleteSession(message.sessionId);
            return;
          case "setMode": {
            const session = this.sessionMgr.requireSession(sessionId);
            if (!session) return;
            session.mode = message.mode;
            const modeLabels: Record<InteractionMode, string> = {
              ask: "Ask mode — I'll ask before making changes.",
              auto: "Auto mode — changes applied automatically.",
              plan: "Plan mode — I'll describe changes before making them.",
            };
            session.status = modeLabels[session.mode];
            this.sessionMgr.touchSession(session);
            await this.sessionMgr.saveState();
            this.postState();
            return;
          }
          case "approveToolCall":
            await this.handleToolApproval(sessionId, message.toolCallId, true);
            return;
          case "rejectToolCall":
            await this.handleToolApproval(sessionId, message.toolCallId, false);
            return;
          case "approveAllToolCalls":
            await this.handleBatchToolApproval(sessionId, true);
            return;
          case "rejectAllToolCalls":
            await this.handleBatchToolApproval(sessionId, false);
            return;
          case "cancelRequest": {
            const session = this.sessionMgr.requireSession(sessionId);
            if (!session) return;
            session.currentRequest?.abort();
            return;
          }
          case "selectEndpoint":
            this.endpointMgr.switchEndpoint(message.endpointUrl);
            void this.refreshModels();
            return;
          case "exportSession": {
            const session = this.sessionMgr.requireSession(sessionId);
            if (!session) return;
            const md = session.transcript
              .filter((e) => e.role === "user" || e.role === "assistant")
              .map(
                (e) =>
                  `## ${e.role === "user" ? "You" : "PocketAI"}\n\n${e.content}\n`,
              )
              .join("\n");
            const uri = await vscode.window.showSaveDialog({
              defaultUri: vscode.Uri.file(
                `${session.title.replace(/[^a-zA-Z0-9]/g, "_")}.md`,
              ),
              filters: { Markdown: ["md"] },
            });
            if (uri) {
              fs.writeFileSync(uri.fsPath, md, "utf-8");
              void vscode.window.showInformationMessage(
                `Exported to ${uri.fsPath}`,
              );
            }
            return;
          }
          case "searchSessions": {
            const query = message.query.toLowerCase();
            if (!query) {
              this.postState();
              return;
            }
            const filtered = this.sessionMgr
              .getSessionSummaries()
              .filter((s) => {
                if (s.title.toLowerCase().includes(query)) return true;
                const sess = this.sessionMgr.sessions.get(s.id);
                return sess?.transcript.some((e) =>
                  e.content.toLowerCase().includes(query),
                );
              });
            for (const wv of this.webviews) {
              wv.postMessage({
                type: "filteredSessions",
                sessions: filtered,
              } satisfies ExtensionToWebviewMessage);
            }
            return;
          }
          case "rewindToCheckpoint": {
            const session = this.sessionMgr.requireSession(sessionId);
            if (!session) return;
            const status = await rewindToCheckpoint(
              session,
              message.checkpointIndex,
              message.restoreCode,
              message.restoreConversation,
              this.outputChannel,
            );
            session.status = status;
            this.sessionMgr.touchSession(session);
            await this.sessionMgr.saveState();
            this.postState();
            return;
          }
          case "forkFromMessage": {
            const session = this.sessionMgr.requireSession(sessionId);
            if (!session) return;
            const forked = this.sessionMgr.forkSession(
              session,
              message.messageIndex,
            );
            this.openForkedPanel(forked);
            session.status = `Forked → "${forked.title}"`;
            this.sessionMgr.touchSession(session);
            await this.sessionMgr.saveState();
            this.postState();
            return;
          }
          case "resolveAtMention": {
            const suggestions = await resolveAtMentions(message.query);
            webview.postMessage({
              type: "atMentionResults",
              suggestions,
            } satisfies ExtensionToWebviewMessage);
            return;
          }
          case "openDiff": {
            const session = this.sessionMgr.requireSession(sessionId);
            if (!session) return;
            await this.diffViewer.openDiffForToolCall(
              session,
              message.toolCallId,
              this.outputChannel,
            );
            return;
          }
          case "openFile": {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders?.length) return;
            const rootPath = workspaceFolders[0].uri.fsPath;
            const filePath = message.filePath as string;
            const absPath = path.resolve(rootPath, filePath);
            if (!absPath.startsWith(rootPath)) return;
            try {
              const doc = await vscode.workspace.openTextDocument(
                vscode.Uri.file(absPath),
              );
              await vscode.window.showTextDocument(doc);
            } catch {
              void vscode.window.showWarningMessage(
                `Could not open file: ${filePath}`,
              );
            }
            return;
          }
          case "openExternal": {
            const url = message.url as string;
            if (url) {
              void vscode.env.openExternal(vscode.Uri.parse(url));
            }
            return;
          }
        }
      } catch (err) {
        this.outputChannel.appendLine(
          `✗ Message handler error: ${(err as Error).message}`,
        );
        vscode.window.showErrorMessage(
          `PocketAI: ${(err as Error).message}`,
        );
      }
    });
  }

  /* ── HTML ── */

  private getHtml(webview: vscode.Webview) {
    const nonce = getNonce();
    const brandIconUri = webview.asWebviewUri(
      vscode.Uri.joinPath(
        this.context.extensionUri,
        "media",
        "logo-black2-zoom.png",
      ),
    );
    return getChatHtml(nonce, webview.cspSource, brandIconUri.toString());
  }
}
