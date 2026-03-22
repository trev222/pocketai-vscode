import * as vscode from "vscode";

import type {
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
import { SessionManager } from "./session-manager";
import { EndpointManager } from "./endpoint-manager";
import { DiffViewer } from "./diff-viewer";
import { executeToolCallWithHooks, clearReadTracking } from "./tool-executor";
import { runToolLoop, type ToolLoopDeps } from "./tool-loop";
import { type StreamingDeps } from "./streaming";
import {
  buildWorkspaceContext,
  buildDiagnostics,
  estimateSessionTokens,
} from "./workspace-context";
import { injectAtMentionContent } from "./at-mentions";
import { McpManager, type McpServerConfig } from "./mcp-client";
import { InlineDiffManager } from "./inline-diff";
import { TerminalManager } from "./terminal-manager";
import { MemoryManager } from "./memory-manager";
import { handleSlashCommand, type SlashCommandDeps } from "./slash-commands";
import { setupChatMessageHandler, type MessageHandlerDeps } from "./message-handler";

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
  private projectInstructionsWatcherDisposables: vscode.Disposable[] = [];

  private readonly sessionMgr: SessionManager;
  private readonly endpointMgr: EndpointManager;
  private readonly diffViewer: DiffViewer;
  private readonly mcpManager: McpManager;
  private readonly inlineDiffMgr: InlineDiffManager;
  private readonly terminalMgr: TerminalManager;
  private memoryMgr?: MemoryManager;

  constructor(private readonly context: vscode.ExtensionContext) {
    this.sessionMgr = new SessionManager(context);
    this.endpointMgr = new EndpointManager(context);
    this.diffViewer = new DiffViewer(context);
    this.mcpManager = new McpManager(this.outputChannel);
    this.inlineDiffMgr = new InlineDiffManager(context);
    this.terminalMgr = new TerminalManager(this.outputChannel);

    // Initialize memory manager if workspace is available
    const rootPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (rootPath) {
      this.memoryMgr = new MemoryManager(rootPath);
      this.memoryMgr.load();
    }

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
    for (const d of this.projectInstructionsWatcherDisposables) d.dispose();
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
      memoryContext: this.memoryMgr?.buildMemoryContext() || "",
    };
  }

  private getToolLoopDeps(): ToolLoopDeps {
    return {
      config: this.config,
      outputChannel: this.outputChannel,
      streamingDeps: this.getStreamingDeps(),
      buildWorkspaceContext: (session) => buildWorkspaceContext(this.config, session),
      postState: () => this.postState(),
      mcpManager: this.mcpManager,
      inlineDiffMgr: this.inlineDiffMgr,
      terminalMgr: this.terminalMgr,
      memoryMgr: this.memoryMgr,
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
    for (const d of this.projectInstructionsWatcherDisposables) d.dispose();
    this.projectInstructionsWatcherDisposables = [];

    this.projectInstructionsWatcher = vscode.workspace.createFileSystemWatcher(
      `**/${fileName}`,
    );
    this.projectInstructionsWatcherDisposables.push(
      this.projectInstructionsWatcher.onDidChange(() =>
        this.loadProjectInstructions(),
      ),
      this.projectInstructionsWatcher.onDidCreate(() =>
        this.loadProjectInstructions(),
      ),
      this.projectInstructionsWatcher.onDidDelete(() => {
        this.projectInstructionsCache = "";
      }),
    );
  }

  /* ── MCP Servers ── */

  private connectMcpServers() {
    const configs = this.config.get<McpServerConfig[]>("mcpServers") ?? [];
    if (configs.length === 0) return;
    void this.mcpManager.connectAll(configs).then(
      () => {
        const servers = this.mcpManager.getConnectedServers();
        if (servers.length > 0) {
          this.outputChannel.appendLine(
            `MCP: ${servers.length} server(s) connected: ${servers.join(", ")}`,
          );
        }
      },
      (err) => {
        this.outputChannel.appendLine(
          `MCP connection error: ${(err as Error).message}`,
        );
      },
    );
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
      const handled = await this.handleSlashCommandMethod(session, trimmed);
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
    clearReadTracking();
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

  private getSlashCommandDeps(): SlashCommandDeps {
    return {
      sessionMgr: this.sessionMgr,
      endpointMgr: this.endpointMgr,
      memoryMgr: this.memoryMgr,
      config: this.config,
      getStreamingDeps: () => this.getStreamingDeps(),
      estimateTokens: (s) => this.estimateTokens(s),
      refreshModels: () => this.refreshModels(),
      postState: () => this.postState(),
      updateStatusBar: () => this.updateStatusBar(),
      openForkedPanel: (f) => this.openForkedPanel(f),
    };
  }

  private async handleSlashCommandMethod(
    session: NonNullable<ReturnType<SessionManager["requireSession"]>>,
    input: string,
  ): Promise<boolean> {
    return handleSlashCommand(session, input, this.getSlashCommandDeps());
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
                this.memoryMgr,
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
                this.memoryMgr,
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

  private getMessageHandlerDeps(): MessageHandlerDeps {
    return {
      sessionMgr: this.sessionMgr,
      endpointMgr: this.endpointMgr,
      diffViewer: this.diffViewer,
      outputChannel: this.outputChannel,
      webviews: this.webviews,
      sendPrompt: (sid, prompt, images) => this.sendPrompt(sid, prompt, images),
      handleUseSelection: (sid) => this.handleUseSelection(sid),
      handleToolApproval: (sid, tcId, approved) =>
        this.handleToolApproval(sid, tcId, approved),
      handleBatchToolApproval: (sid, approved) =>
        this.handleBatchToolApproval(sid, approved),
      refreshModels: () => this.refreshModels(),
      postState: () => this.postState(),
      postStateToWebview: (wv, sid) => this.postStateToWebview(wv, sid),
      openForkedPanel: (f) => this.openForkedPanel(f),
    };
  }

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

    setupChatMessageHandler(
      webview,
      getSessionId,
      switchSession,
      newSession,
      deleteSession,
      this.getMessageHandlerDeps(),
    );
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
