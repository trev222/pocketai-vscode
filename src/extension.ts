import * as vscode from "vscode";
import * as os from "node:os";

import type {
  ExtensionToWebviewMessage,
} from "./types";

import {
  COMPAT_PROJECT_INSTRUCTIONS_FILES,
  DEFAULT_MAX_TOKENS,
  DEFAULT_CONTEXT_WINDOW_SIZE,
  DEFAULT_PROJECT_INSTRUCTIONS_FILE,
  DEFAULT_SYSTEM_PROMPT,
} from "./constants";

import { normalizeBaseUrl, getNonce } from "./helpers";

import { getSettingsHtml } from "./settings-html";
import { getChatHtml } from "./chat-html";
import { SessionManager } from "./session-manager";
import { EndpointManager } from "./endpoint-manager";
import { DiffViewer } from "./diff-viewer";
import {
  clearReadTracking,
  restoreBackgroundTaskSnapshots,
  subscribeToBackgroundTasks,
  type BackgroundTaskSnapshot,
} from "./tool-executor";
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
import { CodexBridgeManager } from "./codex-bridge-manager";
import {
  buildCodexReasoningControlsState,
  buildProviderChatControlsState,
} from "./provider-chat-state";
import { CODEX_BRIDGE_URL, LOCAL_POCKETAI_URL } from "./provider-constants";
import { syncSessionsToActiveEndpoint } from "./endpoint-workflows";
import {
  bindPanelToSession,
  getPanelsBoundToSession,
  rebindDeletedSessionPanels,
} from "./panel-session-workflows";
import {
  buildBackgroundTaskRestoreSnapshots,
  resolveExistingSessionId,
  shouldPersistStartupState,
} from "./startup-workflows";
import {
  buildCancelledLoopOutcome,
  buildFailedLoopOutcome,
  getPostLoopReadyStatus,
  shouldFinalizeCompletedLoop,
} from "./run-loop-workflows";
import {
  applyHarnessEventToSession,
  clearPendingToolState,
  syncHarnessPendingState,
  upsertBackgroundTask,
} from "./harness/state";
import type { HarnessEvent } from "./harness/types";
import { DefaultHarnessToolRuntime } from "./harness/runtime";
import { createHarnessToolRegistry } from "./harness/tools/registry";
import {
  clearSessionSkills,
} from "./harness/skills/active";
import { buildSkillPreflightContext } from "./harness/skills/preflight";
import { listHarnessSkills } from "./harness/skills/registry";
import { buildHarnessRuntimeHealth } from "./harness/runtime-health";
import {
  beginPromptTurn,
  preparePromptForSend,
} from "./prompt-workflows";
import {
  applyErroredToolCallResult,
  applyExecutedToolCallResult,
  applyRejectedToolCallResult,
  findToolCallInTranscript,
  shouldContinueAfterToolResolution,
} from "./tool-approval-workflows";

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
  private readonly codexBridgeMgr: CodexBridgeManager;
  private memoryMgr?: MemoryManager;

  constructor(private readonly context: vscode.ExtensionContext) {
    this.sessionMgr = new SessionManager(context);
    this.endpointMgr = new EndpointManager(context);
    this.diffViewer = new DiffViewer(context);
    this.mcpManager = new McpManager(this.outputChannel);
    this.inlineDiffMgr = new InlineDiffManager(context);
    this.terminalMgr = new TerminalManager(this.outputChannel);
    this.codexBridgeMgr = new CodexBridgeManager(context, this.outputChannel);
    context.subscriptions.push(
      subscribeToBackgroundTasks((task) => this.handleBackgroundTaskUpdate(task)),
    );

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

    const normalizedRestoredTasks = this.sessionMgr.restoreState();
    restoreBackgroundTaskSnapshots(
      buildBackgroundTaskRestoreSnapshots(
        Array.from(this.sessionMgr.sessions.values()),
      ),
    );
    let createdInitialSession = false;
    if (!this.sessionMgr.sessions.size) {
      const session = this.sessionMgr.createSession(this.endpointMgr.models);
      this.sessionMgr.sidebarSessionId = session.id;
      createdInitialSession = true;
    }
    this.endpointMgr.initEndpoints();
    const endpointSelectionsSynced = this.syncSessionEndpointSelections();
    if (
      shouldPersistStartupState({
        createdInitialSession,
        normalizedRestoredTasks,
        endpointSelectionsSynced,
      })
    ) {
      void this.sessionMgr.saveState();
    }
    this.startEndpointHealthChecks();
    this.endpointMgr.initStatusBar(
      this.sessionMgr.sidebarSessionId,
      this.sessionMgr.sessions,
    );
    this.loadProjectInstructions();
    this.watchProjectInstructions();
    // Auto-detect models on startup
    void this.refreshModels();
    this.connectMcpServers();
    this.codexBridgeMgr.startPolling(
      this.endpointMgr,
      () => this.pushSettingsState(),
      async (state) => {
        const codexIsActive =
          this.endpointMgr.getActiveEndpointCapabilities().kind ===
          "codex-bridge";
        if (
          state.loggedIn &&
          state.bridgeRunning &&
          codexIsActive &&
          (!state.endpointHealthy || this.endpointMgr.models.length === 0)
        ) {
          await this.refreshModels();
        }
      },
    );
    void this.autoConnectConfiguredCodexBridge();
  }

  dispose() {
    this.endpointMgr.dispose();
    this.projectInstructionsWatcher?.dispose();
    for (const d of this.projectInstructionsWatcherDisposables) d.dispose();
    this.mcpManager.disposeAll();
    this.inlineDiffMgr.dispose();
    this.terminalMgr.dispose();
    this.codexBridgeMgr.dispose();
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

  private handleHarnessEvent(event: HarnessEvent) {
    const session = this.sessionMgr.requireSession(event.sessionId);
    if (!session) return;

    applyHarnessEventToSession(session, event);
    this.postState();
  }

  private handleBackgroundTaskUpdate(task: BackgroundTaskSnapshot) {
    const session = this.sessionMgr.requireSession(task.sessionId);
    if (!session) return;

    const previousTask = session.harnessState.backgroundTasks.find(
      (item) => item.id === task.id,
    );
    upsertBackgroundTask(session, {
      id: task.id,
      command: task.command,
      status: task.status,
      outputPreview: task.outputPreview,
      exitCode: task.exitCode,
      updatedAt: task.updatedAt,
      cwd: task.cwd,
    });
    const shouldPersist =
      !previousTask ||
      previousTask.status !== task.status ||
      previousTask.cwd !== task.cwd;
    if (shouldPersist) {
      void this.sessionMgr.saveState();
    }
    this.postState();
  }

  private get config() {
    return vscode.workspace.getConfiguration("pocketai");
  }

  private getStreamingDeps(): StreamingDeps {
    return {
      baseUrl: this.endpointMgr.baseUrl,
      apiKey: this.endpointMgr.getActiveEndpointConfig().apiKey || "local-pocketai",
      config: this.config,
      outputChannel: this.outputChannel,
      projectInstructionsCache: this.projectInstructionsCache,
      getActiveSystemPrompt: () =>
        (this.endpointMgr.getActiveEndpointConfig().systemPrompt ?? "").trim(),
      getActiveReasoningEffort: () =>
        (this.endpointMgr.getActiveEndpointConfig().reasoningEffort ?? "").trim(),
      getActiveMaxTokens: () =>
        this.endpointMgr.getActiveEndpointConfig().maxTokens ?? DEFAULT_MAX_TOKENS,
      getActiveEndpointCapabilities: () =>
        this.endpointMgr.getActiveEndpointCapabilities(),
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
      onHarnessEvent: (event) => this.handleHarnessEvent(event),
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

  private startEndpointHealthChecks() {
    this.endpointMgr.initEndpoints();
    this.endpointMgr.startHealthChecks(
      () => this.postState(),
      () => this.pushSettingsState(),
    );
  }

  private getWorkspaceRoot(): string {
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? os.homedir();
  }

  private getEndpointCapabilities(url: string) {
    return this.endpointMgr.getEndpointCapabilities(url);
  }

  private hasCodexEndpoint(): boolean {
    return this.endpointMgr
      .getEndpoints()
      .some(
        (endpoint) =>
          this.getEndpointCapabilities(endpoint.url).requiresBridgeBootstrap,
      );
  }

  private async autoConnectConfiguredCodexBridge() {
    if (!this.hasCodexEndpoint()) return;

    await this.codexBridgeMgr.autoConnectIfConfigured({
      config: this.config,
      endpointMgr: this.endpointMgr,
      defaultSystemPrompt: DEFAULT_SYSTEM_PROMPT,
      workspaceRoot: this.getWorkspaceRoot(),
    });

    this.startEndpointHealthChecks();
    if (
      this.endpointMgr.getActiveEndpointCapabilities().requiresBridgeBootstrap
    ) {
      await this.refreshModels();
      return;
    }
    this.pushSettingsState();
    this.postState();
    this.updateStatusBar();
  }

  private async handleEndpointSelection(endpointUrl: string) {
    this.endpointMgr.switchEndpoint(endpointUrl);
    if (this.syncSessionEndpointSelections()) {
      await this.sessionMgr.saveState();
    }
    if (this.getEndpointCapabilities(endpointUrl).requiresBridgeBootstrap) {
      await this.autoConnectConfiguredCodexBridge();
      return;
    }
    await this.refreshModels();
  }

  /* ── Project Instructions (.pocketai.md / AGENTS.md / CLAUDE.md) ── */

  private getProjectInstructionCandidates() {
    const configuredFile =
      this.config.get<string>("projectInstructionsFile") ??
      DEFAULT_PROJECT_INSTRUCTIONS_FILE;
    return Array.from(
      new Set([
        configuredFile.trim(),
        ...COMPAT_PROJECT_INSTRUCTIONS_FILES,
      ].filter(Boolean)),
    );
  }

  private async loadProjectInstructions() {
    try {
      const sections: string[] = [];
      const loadedSources: string[] = [];

      for (const fileName of this.getProjectInstructionCandidates()) {
        const files = await vscode.workspace.findFiles(fileName, null, 1);
        if (!files.length) continue;
        const content = await vscode.workspace.fs.readFile(files[0]);
        const text = Buffer.from(content).toString("utf-8").trim();
        if (!text) continue;
        sections.push(`[${fileName}]\n${text}`);
        loadedSources.push(fileName);
      }

      if (sections.length) {
        this.projectInstructionsCache = sections.join("\n\n");
        this.outputChannel.appendLine(
          `Loaded project guidance from ${loadedSources.join(", ")} (${this.projectInstructionsCache.length} chars)`,
        );
      } else {
        this.projectInstructionsCache = "";
      }
    } catch {
      this.projectInstructionsCache = "";
    }
  }

  private watchProjectInstructions() {
    this.projectInstructionsWatcher?.dispose();
    for (const d of this.projectInstructionsWatcherDisposables) d.dispose();
    this.projectInstructionsWatcherDisposables = [];

    for (const fileName of this.getProjectInstructionCandidates()) {
      const watcher = vscode.workspace.createFileSystemWatcher(
        `**/${fileName}`,
      );
      this.projectInstructionsWatcherDisposables.push(
        watcher,
        watcher.onDidChange(() => {
          void this.loadProjectInstructions().then(() => this.postState());
        }),
        watcher.onDidCreate(() => {
          void this.loadProjectInstructions().then(() => this.postState());
        }),
        watcher.onDidDelete(() => {
          void this.loadProjectInstructions().then(() => this.postState());
        }),
      );
    }
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

  private getPanelViewColumn() {
    for (const panel of this.panelSessions.keys()) {
      if (panel.active && panel.viewColumn !== undefined) {
        return panel.viewColumn;
      }
    }

    const panels = Array.from(this.panelSessions.keys());
    for (let index = panels.length - 1; index >= 0; index -= 1) {
      const panel = panels[index];
      if (panel.viewColumn !== undefined) {
        return panel.viewColumn;
      }
    }

    return vscode.ViewColumn.Beside;
  }

  async openPanel() {
    const session = this.sessionMgr.createSession(this.endpointMgr.models);
    session.selectedEndpoint = this.endpointMgr.activeEndpointUrl;
    const panel = vscode.window.createWebviewPanel(
      PocketAIViewProvider.panelType,
      this.getPanelTitle(session.id),
      { viewColumn: this.getPanelViewColumn(), preserveFocus: false },
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
            this.startEndpointHealthChecks();
            this.pushSettingsState();
            this.updateStatusBar();
            if (this.getEndpointCapabilities(url).requiresBridgeBootstrap) {
              void this.autoConnectConfiguredCodexBridge();
            }
            break;
          }
          case "removeEndpoint": {
            const url = normalizeBaseUrl(String(message.url || ""));
            const existingEndpoints = this.endpointMgr.getEndpoints();
            const target = existingEndpoints.find(
              (ep) => normalizeBaseUrl(ep.url) === url,
            );
            if (!target) break;
            if (this.getEndpointCapabilities(url).kind === "local-pocketai") {
              void vscode.window.showWarningMessage(
                "Local PocketAI is built in and can't be removed.",
              );
              this.pushSettingsState();
              break;
            }

            const endpoints = existingEndpoints.filter(
              (ep) => normalizeBaseUrl(ep.url) !== url,
            );
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
            await this.handleEndpointSelection(String(message.url || ""));
            break;
          }
          case "refreshEndpoints": {
            this.startEndpointHealthChecks();
            setTimeout(() => this.pushSettingsState(), 2000);
            break;
          }
          case "connectCodex": {
            try {
              const state = await this.codexBridgeMgr.connect({
                config: this.config,
                endpointMgr: this.endpointMgr,
                defaultSystemPrompt: DEFAULT_SYSTEM_PROMPT,
                workspaceRoot: this.getWorkspaceRoot(),
              });
              this.startEndpointHealthChecks();
              this.pushSettingsState();
              this.postState();
              this.updateStatusBar();

              if (state.loggedIn) {
                void vscode.window.showInformationMessage(
                  "Codex connected. PocketAI is now using the Codex Bridge endpoint.",
                );
                await this.refreshModels();
              } else {
                void vscode.window.showInformationMessage(
                  "Finish signing in to Codex in the terminal we opened. PocketAI will connect automatically when sign-in finishes.",
                );
              }
            } catch (error) {
              void vscode.window.showErrorMessage(
                error instanceof Error
                  ? error.message
                  : "Failed to connect to Codex.",
              );
              this.pushSettingsState();
            }
            break;
          }
          case "signInCodex": {
            try {
              await this.codexBridgeMgr.signIn(
                this.getWorkspaceRoot(),
                this.endpointMgr,
              );
              this.pushSettingsState();
              void vscode.window.showInformationMessage(
                "A terminal was opened for Codex sign-in. Finish the login flow there, then PocketAI will refresh automatically.",
              );
            } catch (error) {
              void vscode.window.showErrorMessage(
                error instanceof Error
                  ? error.message
                  : "Failed to start Codex sign-in.",
              );
            }
            break;
          }
          case "refreshCodexStatus": {
            await this.codexBridgeMgr.refresh(this.endpointMgr);
            this.pushSettingsState();
            break;
          }
          case "updateCodexReasoning": {
            const endpoints = this.endpointMgr.getEndpoints();
            const codexEndpoint = endpoints.find(
              (endpoint) =>
                normalizeBaseUrl(endpoint.url) === normalizeBaseUrl(CODEX_BRIDGE_URL),
            );
            if (!codexEndpoint) break;

            codexEndpoint.reasoningEffort = String(message.value || "").trim();

            await this.config.update(
              "endpoints",
              endpoints,
              vscode.ConfigurationTarget.Global,
            );

            this.pushSettingsState();
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
    const codexState = this.codexBridgeMgr.getState(this.endpointMgr);
    const codexReasoningControls = buildCodexReasoningControlsState({
      selectedModel: codexState.selectedModel,
      selectedReasoningEffort: codexState.selectedReasoningEffort,
      codexState,
    });
    const endpoints = Array.from(
      this.endpointMgr.endpointHealthMap.values(),
    ).map((health) => {
      const epConfig = configEndpoints.find(
        (ep) => normalizeBaseUrl(ep.url) === health.url,
      );
      const capabilities = this.endpointMgr.getEndpointCapabilities(health.url);
      return {
        ...health,
        providerKind: capabilities.kind,
        model: epConfig?.model ?? "",
        reasoningEffort: epConfig?.reasoningEffort ?? "",
        maxTokens: epConfig?.maxTokens ?? 4096,
        systemPrompt:
          epConfig?.systemPrompt ?? DEFAULT_SYSTEM_PROMPT,
        apiKey: epConfig?.apiKey ?? "",
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
      codex: {
        ...codexState,
        selectedReasoningEffort:
          codexReasoningControls.selectedReasoningEffort,
        reasoningOptions: codexReasoningControls.reasoningOptions,
      },
    });
  }

  /* ── Chat / Streaming ── */

  private async sendPrompt(
    sessionId: string,
    prompt: string,
    images?: import("./types").ImageAttachment[],
    files?: import("./types").FileAttachment[],
  ) {
    const session = this.sessionMgr.requireSession(sessionId);
    let loopResult: Awaited<ReturnType<typeof runToolLoop>> | undefined;
    const initialTrimmed = prompt.trim();
    if (!session || (!initialTrimmed && !images?.length && !files?.length) || session.busy) return;

    // Slash commands
    if (initialTrimmed.startsWith("/")) {
      const handled = await this.handleSlashCommandMethod(session, initialTrimmed);
      if (handled) return;
    }
    const preparedPrompt = preparePromptForSend({
      session,
      prompt: initialTrimmed,
      availableSkills: listHarnessSkills(),
      preferredModel: this.sessionMgr.getPreferredModel(this.endpointMgr.models),
      fallbackTitleNumber: this.sessionMgr.nextSessionNumber - 1,
    });
    if (preparedPrompt.kind === "handled") {
      if (preparedPrompt.titleChanged) {
        this.updateBoundTitles(session.id);
      }
      this.sessionMgr.touchSession(session);
      await this.sessionMgr.saveState();
      this.postState();
      return;
    }
    if (preparedPrompt.kind === "blocked") {
      this.postState();
      return;
    }
    const trimmed = preparedPrompt.prompt;

    const resolvedPrompt = await injectAtMentionContent(trimmed, this.config);
    const promptStart = beginPromptTurn({
      session,
      rawPrompt: trimmed,
      resolvedPrompt,
      fallbackTitleNumber: this.sessionMgr.nextSessionNumber - 1,
      images,
      files,
    });
    if (promptStart.titleChanged) {
      this.updateBoundTitles(session.id);
    }
    this.sessionMgr.touchSession(session);
    this.postState();

    if (promptStart.needsSkillPreflight) {
      session.skillPreflightContext = await buildSkillPreflightContext(
        session,
        this.getToolLoopDeps(),
      );
      session.status = "Thinking...";
      this.postState();
    }

    session.currentRequest = new AbortController();
    clearReadTracking();
    this.outputChannel.appendLine(
      `→ ${this.endpointMgr.baseUrl}/v1/chat/completions [${session.selectedModel}]`,
    );

    try {
      loopResult = await runToolLoop(session, this.getToolLoopDeps());
      session.status =
        getPostLoopReadyStatus(loopResult.stoppedBecause) ?? session.status;
      this.outputChannel.appendLine(
        `← Response received [${session.id}]`,
      );
    } catch (error) {
      if ((error as Error).name === "AbortError") {
        const outcome = buildCancelledLoopOutcome();
        session.status = outcome.status;
        session.transcript.push(outcome.transcriptEntry);
      } else {
        const outcome = buildFailedLoopOutcome(error);
        session.status = outcome.status;
        session.transcript.push(outcome.transcriptEntry);
      }
      this.outputChannel.appendLine(
        `✗ Error [${session.id}]: ${(error as Error).message}`,
      );
    } finally {
      session.busy = false;
      session.currentRequest = undefined;
      if (shouldFinalizeCompletedLoop(loopResult?.stoppedBecause)) {
        clearSessionSkills(session);
        this.notifyCompletion(session);
      }
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
      outputChannel: this.outputChannel,
      getStreamingDeps: () => this.getStreamingDeps(),
      estimateTokens: (s) => this.estimateTokens(s),
      refreshModels: () => this.refreshModels(),
      selectEndpoint: (endpointUrl) => this.handleEndpointSelection(endpointUrl),
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

  private async executeApprovedToolCall(
    session: NonNullable<ReturnType<SessionManager["requireSession"]>>,
    tc: import("./types").ToolCall,
  ): Promise<string> {
    const runtime = new DefaultHarnessToolRuntime(
      this.getToolLoopDeps(),
      createHarnessToolRegistry(this.getToolLoopDeps()),
    );
    return runtime.execute(session, tc);
  }

  private async applyToolApprovalDecision(
    session: NonNullable<ReturnType<SessionManager["requireSession"]>>,
    tc: import("./types").ToolCall,
    approved: boolean,
  ) {
    if (approved) {
      tc.status = "approved";
      try {
        const result = await this.executeApprovedToolCall(session, tc);
        applyExecutedToolCallResult(tc, session.transcript, result);
      } catch (error) {
        applyErroredToolCallResult(tc, session.transcript, error);
      }
      return;
    }

    clearPendingToolState(session, tc.id);
    applyRejectedToolCallResult(tc, session.transcript);
  }

  private async handleToolApproval(
    sessionId: string,
    toolCallId: string,
    approved: boolean,
  ) {
    const session = this.sessionMgr.requireSession(sessionId);
    if (!session) return;

    const resolved = findToolCallInTranscript(session.transcript, toolCallId);
    if (!resolved) return;

    this.inlineDiffMgr.clearChange(toolCallId);
    await this.applyToolApprovalDecision(session, resolved.toolCall, approved);

    this.sessionMgr.touchSession(session);
    await this.sessionMgr.saveState();
    this.postState();

    if (
      shouldContinueAfterToolResolution(
        resolved.entry.toolCalls,
        session.busy,
      )
    ) {
      this.continueAfterToolResults(session);
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
        await this.applyToolApprovalDecision(session, tc, approved);
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
    let loopResult: Awaited<ReturnType<typeof runToolLoop>> | undefined;
    session.busy = true;
    session.status = "Thinking...";
    session.currentRequest = new AbortController();
    this.postState();

    try {
      loopResult = await runToolLoop(session, this.getToolLoopDeps());
      session.status =
        getPostLoopReadyStatus(loopResult.stoppedBecause) ?? session.status;
    } catch (error) {
      if ((error as Error).name === "AbortError") {
        const outcome = buildCancelledLoopOutcome();
        session.status = outcome.status;
        session.transcript.push(outcome.transcriptEntry);
      } else {
        const outcome = buildFailedLoopOutcome(error);
        session.status = outcome.status;
        session.transcript.push(outcome.transcriptEntry);
      }
    } finally {
      session.busy = false;
      session.currentRequest = undefined;
      if (shouldFinalizeCompletedLoop(loopResult?.stoppedBecause)) {
        clearSessionSkills(session);
        this.notifyCompletion(session);
      }
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

  private syncSessionEndpointSelections() {
    return syncSessionsToActiveEndpoint(
      this.sessionMgr.sessions.values(),
      this.endpointMgr.activeEndpointUrl,
    );
  }

  private createSessionForPanel(panel: vscode.WebviewPanel): string {
    const session = this.sessionMgr.createSession(this.endpointMgr.models);
    session.selectedEndpoint = this.endpointMgr.activeEndpointUrl;
    bindPanelToSession(
      this.panelSessions,
      panel,
      session.id,
      this.sessionMgr.sessions.keys(),
    );
    panel.title = this.getPanelTitle(session.id);
    this.postState();
    return session.id;
  }

  private switchPanelSession(panel: vscode.WebviewPanel, sessionId: string) {
    const currentSessionId = this.panelSessions.get(panel) ?? "";
    const resolvedSessionId = resolveExistingSessionId(
      sessionId,
      this.sessionMgr.sessions.keys(),
      currentSessionId,
    );
    if (
      !bindPanelToSession(
        this.panelSessions,
        panel,
        resolvedSessionId,
        this.sessionMgr.sessions.keys(),
      )
    ) {
      return;
    }
    panel.title = this.getPanelTitle(resolvedSessionId);
    void this.sessionMgr.saveState();
    this.postState();
  }

  private deleteSession(sessionId: string) {
    const fallbackId = this.sessionMgr.deleteSession(
      sessionId,
      this.endpointMgr.models,
    );
    if (!fallbackId) return;

    if (this.syncSessionEndpointSelections()) {
      void this.sessionMgr.saveState();
    }

    for (const panel of rebindDeletedSessionPanels(
      this.panelSessions,
      sessionId,
      fallbackId,
    )) {
      panel.title = this.getPanelTitle(fallbackId);
    }
    this.postState();
  }

  private async renameSession(sessionId: string, title: string) {
    const session = this.sessionMgr.renameSession(sessionId, title);
    if (!session) return;

    this.updateBoundTitles(sessionId);
    await this.sessionMgr.saveState();
    this.postState();
  }

  private openForkedPanel(forked: ReturnType<SessionManager["forkSession"]>) {
    const panel = vscode.window.createWebviewPanel(
      PocketAIViewProvider.panelType,
      this.getPanelTitle(forked.id),
      { viewColumn: this.getPanelViewColumn(), preserveFocus: false },
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
    for (const panel of getPanelsBoundToSession(this.panelSessions, sessionId)) {
      panel.title = this.getPanelTitle(sessionId);
    }
  }

  private getPanelTitle(sessionId: string) {
    const session = this.sessionMgr.requireSession(sessionId);
    return session ? session.title : "Chat";
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
      (models) => this.sessionMgr.getPreferredModel(models),
    );
    this.postState();
    this.pushSettingsState();
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
    syncHarnessPendingState(session);
    const endpointCapabilities = this.endpointMgr.getActiveEndpointCapabilities();
    const codexState = endpointCapabilities.kind === "codex-bridge"
      ? this.codexBridgeMgr.getState(this.endpointMgr)
      : undefined;
    const modelControls = buildProviderChatControlsState({
      endpointUrl: this.endpointMgr.activeEndpointUrl,
      structuredToolsEnabled:
        this.config.get<boolean>("useStructuredTools", true),
      availableModels: this.endpointMgr.models,
      session,
      codexState,
    });

    const contextWindowSize =
      this.config.get<number>("contextWindowSize") ?? DEFAULT_CONTEXT_WINDOW_SIZE;
    const contextTokenEstimate = this.estimateTokens(session);
    const runtimeHealth = buildHarnessRuntimeHealth({
      session,
      endpointMgr: this.endpointMgr,
      estimatedTokens: contextTokenEstimate,
      contextWindowSize,
    });
    webview.postMessage({
      type: "state",
      transcript: session.transcript,
      models: modelControls.models,
      selectedModel: modelControls.selectedModel,
      providerKind: modelControls.providerKind,
      selectedReasoningEffort: modelControls.selectedReasoningEffort,
      showReasoningControl: modelControls.showReasoningControl,
      reasoningOptions: modelControls.reasoningOptions,
      endpoints: Array.from(this.endpointMgr.endpointHealthMap.values()),
      selectedEndpoint: this.endpointMgr.activeEndpointUrl,
      status: session.status,
      busy: session.busy,
      sessions: this.sessionMgr.getSessionSummaries(),
      activeSessionId: session.id,
      mode: session.mode,
      diagnostics: buildDiagnostics(
        this.endpointMgr.baseUrl || LOCAL_POCKETAI_URL,
        this.endpointMgr.statusSummary,
        this.endpointMgr.models,
      ),
      projectInstructionsLoaded: !!this.projectInstructionsCache,
      contextTokenEstimate,
      contextWindowSize,
      cumulativeTokens: session.cumulativeTokens,
      activeSkills: session.activeSkills.map((skill) => ({
        id: skill.id,
        name: skill.name,
        description: skill.description,
        source: skill.source,
        note: skill.note,
      })),
      harnessState: session.harnessState,
      runtimeHealth,
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
      sendPrompt: (sid, prompt, images, files) =>
        this.sendPrompt(sid, prompt, images, files),
      handleUseSelection: (sid) => this.handleUseSelection(sid),
      handleToolApproval: (sid, tcId, approved) =>
        this.handleToolApproval(sid, tcId, approved),
      handleBatchToolApproval: (sid, approved) =>
        this.handleBatchToolApproval(sid, approved),
      refreshModels: () => this.refreshModels(),
      selectEndpoint: (endpointUrl) => this.handleEndpointSelection(endpointUrl),
      postState: () => this.postState(),
      postStateToWebview: (wv, sid) => this.postStateToWebview(wv, sid),
      openForkedPanel: (f) => this.openForkedPanel(f),
      renameSession: (sid, title) => this.renameSession(sid, title),
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
