import * as os from "node:os";
import * as path from "node:path";
import { execFile, spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

import * as vscode from "vscode";

import type { EndpointConfig } from "./types";
import type { EndpointManager } from "./endpoint-manager";
import { normalizeBaseUrl } from "./helpers";
import { CLAUDE_BRIDGE_URL } from "./provider-constants";

export const CLAUDE_BRIDGE_NAME = "Claude CLI Bridge";
const CLAUDE_BRIDGE_ROOT_URL = `${CLAUDE_BRIDGE_URL}/`;
const CLAUDE_BRIDGE_POLL_MS = 5000;

export type ClaudeModelInfo = {
  id: string;
  displayName: string;
  description: string;
};

export type ClaudeConnectionState = {
  available: boolean;
  loggedIn: boolean;
  loginLabel: string;
  bridgeRunning: boolean;
  endpointConfigured: boolean;
  endpointActive: boolean;
  endpointHealthy: boolean;
  models: ClaudeModelInfo[];
  selectedModel: string;
  busy: boolean;
  status: string;
  error: string;
};

type CommandResult = {
  exitCode: number | null;
  stdout: string;
  stderr: string;
  notFound: boolean;
};

function defaultState(): ClaudeConnectionState {
  return {
    available: false,
    loggedIn: false,
    loginLabel: "Sign in required",
    bridgeRunning: false,
    endpointConfigured: false,
    endpointActive: false,
    endpointHealthy: false,
    models: [],
    selectedModel: "",
    busy: false,
    status: "One click will add the endpoint and start Claude for you.",
    error: "",
  };
}

export class ClaudeBridgeManager {
  private bridgeProcess?: ChildProcessWithoutNullStreams;
  private loginTerminal?: vscode.Terminal;
  private refreshTimer?: ReturnType<typeof setInterval>;
  private refreshInFlight?: Promise<ClaudeConnectionState>;
  private state: ClaudeConnectionState = defaultState();
  private claudeBin = "claude";
  private busyMessage = "";
  private lastError = "";
  private usabilityProbe = {
    expiresAt: 0,
    usable: false,
  };

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly outputChannel: vscode.OutputChannel,
  ) {}

  getState(endpointMgr: EndpointManager): ClaudeConnectionState {
    return this.withEndpointState(this.state, endpointMgr);
  }

  startPolling(
    endpointMgr: EndpointManager,
    onChange: (state: ClaudeConnectionState) => void,
    onReady?: (state: ClaudeConnectionState) => Promise<void>,
  ) {
    if (this.refreshTimer) return;

    const tick = async () => {
      const next = await this.refresh(endpointMgr);
      if (onReady) {
        await onReady(next);
      }
      onChange(next);
    };

    void tick();
    this.refreshTimer = setInterval(() => void tick(), CLAUDE_BRIDGE_POLL_MS);
  }

  async refresh(endpointMgr: EndpointManager): Promise<ClaudeConnectionState> {
    if (this.refreshInFlight) return this.refreshInFlight;

    this.refreshInFlight = (async () => {
      const available = await this.resolveClaudeBinary();
      const login = available
        ? await this.getEffectiveLoginStatus()
        : { loggedIn: false, label: "Claude CLI not found" };
      const bridgeRunning = await this.isBridgeResponsive();
      const models = bridgeRunning ? await this.getBridgeModels() : [];

      const base: ClaudeConnectionState = {
        ...this.state,
        available,
        loggedIn: login.loggedIn,
        loginLabel: login.label,
        bridgeRunning,
        models,
        busy: this.state.busy,
        error: this.lastError,
        status: this.deriveStatus({
          available,
          loggedIn: login.loggedIn,
          bridgeRunning,
          modelsCount: models.length,
          endpointMgr,
          busy: this.state.busy,
        }),
      };

      this.state = this.withEndpointState(base, endpointMgr);
      return this.state;
    })().finally(() => {
      this.refreshInFlight = undefined;
    });

    return this.refreshInFlight;
  }

  async connect(options: {
    config: vscode.WorkspaceConfiguration;
    endpointMgr: EndpointManager;
    defaultSystemPrompt: string;
    workspaceRoot?: string;
  }): Promise<ClaudeConnectionState> {
    const workspaceRoot = options.workspaceRoot || os.homedir();

    this.state.busy = true;
    this.busyMessage = "Connecting to Claude...";
    this.lastError = "";

    try {
      const available = await this.resolveClaudeBinary();
      if (!available) {
        throw new Error(
          "Claude CLI was not found. Install Claude Code or make the `claude` command available in PATH.",
        );
      }

      await this.ensureEndpointConfigured(
        options.config,
        options.defaultSystemPrompt,
      );
      options.endpointMgr.initEndpoints();
      options.endpointMgr.switchEndpoint(CLAUDE_BRIDGE_URL);

      await this.ensureBridgeRunning(workspaceRoot);

      const login = await this.getEffectiveLoginStatus();
      if (!login.loggedIn) {
        this.openLoginTerminal(workspaceRoot);
        this.busyMessage =
          "Finish signing in to Claude in the terminal we opened.";
      } else {
        this.busyMessage = "Claude CLI connected.";
      }
    } catch (error) {
      this.lastError =
        error instanceof Error ? error.message : "Failed to connect to Claude.";
      throw error;
    } finally {
      this.state.busy = false;
    }

    return this.refresh(options.endpointMgr);
  }

  async autoConnectIfConfigured(options: {
    config: vscode.WorkspaceConfiguration;
    endpointMgr: EndpointManager;
    defaultSystemPrompt: string;
    workspaceRoot?: string;
  }): Promise<ClaudeConnectionState> {
    if (this.state.busy) {
      return this.refresh(options.endpointMgr);
    }

    const current = await this.refresh(options.endpointMgr);
    if (!current.endpointConfigured || !current.available || current.bridgeRunning) {
      return current;
    }

    const workspaceRoot = options.workspaceRoot || os.homedir();

    this.state.busy = true;
    this.busyMessage = "Starting Claude bridge...";
    this.lastError = "";

    try {
      await this.ensureEndpointConfigured(
        options.config,
        options.defaultSystemPrompt,
      );
      options.endpointMgr.initEndpoints();
      await this.ensureBridgeRunning(workspaceRoot);

      const login = await this.getEffectiveLoginStatus();
      this.busyMessage = login.loggedIn
        ? "Claude bridge is ready."
        : "Claude bridge is ready. Sign in to finish connecting.";
    } catch (error) {
      this.lastError =
        error instanceof Error ? error.message : "Failed to start Claude bridge.";
    } finally {
      this.state.busy = false;
    }

    return this.refresh(options.endpointMgr);
  }

  async signIn(
    workspaceRoot: string | undefined,
    endpointMgr: EndpointManager,
  ): Promise<ClaudeConnectionState> {
    const available = await this.resolveClaudeBinary();
    if (!available) {
      const message =
        "Claude CLI was not found. Install Claude Code or make the `claude` command available in PATH.";
      this.lastError = message;
      throw new Error(message);
    }

    this.lastError = "";
    this.openLoginTerminal(workspaceRoot || os.homedir());
    this.busyMessage =
      "Finish signing in to Claude in the terminal we opened.";
    return this.refresh(endpointMgr);
  }

  dispose() {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = undefined;
    }

    if (this.bridgeProcess && this.bridgeProcess.exitCode === null) {
      this.bridgeProcess.kill("SIGTERM");
    }
  }

  private async resolveClaudeBinary(): Promise<boolean> {
    const envCandidate = process.env.CLAUDE_BIN?.trim();
    const candidates = Array.from(
      new Set(
        [
          envCandidate,
          this.claudeBin,
          "claude",
          process.platform === "darwin"
            ? "/usr/local/bin/claude"
            : "",
          process.platform === "darwin"
            ? "/opt/homebrew/bin/claude"
            : "",
        ].filter((value): value is string => Boolean(value)),
      ),
    );

    for (const candidate of candidates) {
      const result = await this.runCommand(candidate, ["--version"], 5000);
      if (result.exitCode === 0) {
        this.claudeBin = candidate;
        return true;
      }
    }

    return false;
  }

  private async getLoginStatus(): Promise<{ loggedIn: boolean; label: string }> {
    const result = await this.runCommand(this.claudeBin, ["auth", "status"], 8000);
    const stdout = result.stdout.trim();
    const output = `${stdout}\n${result.stderr}`.trim();

    if (stdout) {
      try {
        const payload = JSON.parse(stdout) as {
          loggedIn?: boolean;
          authMethod?: string;
          apiProvider?: string;
        };
        if (payload.loggedIn) {
          const providerSuffix = payload.apiProvider
            ? ` (${payload.apiProvider})`
            : "";
          return {
            loggedIn: true,
            label: `Logged in${providerSuffix}`,
          };
        }
      } catch {
        // Fall back to string matching below.
      }
    }

    if (result.exitCode === 0 && /logged in/i.test(output)) {
      return { loggedIn: true, label: output.split("\n")[0] ?? "Logged in" };
    }

    if (output) {
      return { loggedIn: false, label: output.split("\n")[0] ?? "Sign in required" };
    }

    return { loggedIn: false, label: "Sign in required" };
  }

  private async getEffectiveLoginStatus(): Promise<{
    loggedIn: boolean;
    label: string;
  }> {
    const login = await this.getLoginStatus();
    if (login.loggedIn) {
      this.usabilityProbe = {
        expiresAt: Date.now() + 60_000,
        usable: true,
      };
      return login;
    }

    const usable = await this.isClaudeUsableWithoutExplicitLogin();
    if (usable) {
      return {
        loggedIn: true,
        label: "Ready via Claude CLI",
      };
    }

    return login;
  }

  private async isClaudeUsableWithoutExplicitLogin(): Promise<boolean> {
    const now = Date.now();
    if (this.usabilityProbe.expiresAt > now) {
      return this.usabilityProbe.usable;
    }

    const result = await this.runCommand(
      this.claudeBin,
      [
        "-p",
        "Reply with exactly: pong",
        "--output-format",
        "json",
        "--disable-slash-commands",
        "--permission-mode",
        "default",
        "--tools",
        "",
      ],
      12000,
    );

    const usable = result.exitCode === 0 && /pong/i.test(result.stdout);
    this.usabilityProbe = {
      expiresAt: now + 60_000,
      usable,
    };
    return usable;
  }

  private async ensureEndpointConfigured(
    config: vscode.WorkspaceConfiguration,
    defaultSystemPrompt: string,
  ) {
    const endpoints = (config.get<EndpointConfig[]>("endpoints") ?? []).slice();
    const normalizedTarget = normalizeBaseUrl(CLAUDE_BRIDGE_URL);
    const existing = endpoints.find(
      (endpoint) => normalizeBaseUrl(endpoint.url) === normalizedTarget,
    );

    if (existing) {
      existing.name = CLAUDE_BRIDGE_NAME;
      existing.url = CLAUDE_BRIDGE_URL;
      existing.model = existing.model || "sonnet";
      existing.maxTokens = existing.maxTokens ?? 4096;
      existing.systemPrompt = existing.systemPrompt || defaultSystemPrompt;
      existing.apiKey = "";
      existing.reasoningEffort = "";
    } else {
      endpoints.push({
        name: CLAUDE_BRIDGE_NAME,
        url: CLAUDE_BRIDGE_URL,
        model: "sonnet",
        reasoningEffort: "",
        maxTokens: 4096,
        systemPrompt: defaultSystemPrompt,
        apiKey: "",
      });
    }

    await config.update("endpoints", endpoints, vscode.ConfigurationTarget.Global);
  }

  private async ensureBridgeRunning(workspaceRoot: string) {
    if (await this.isBridgeResponsive()) {
      return;
    }

    if (this.bridgeProcess && this.bridgeProcess.exitCode === null) {
      this.bridgeProcess.kill("SIGTERM");
      this.bridgeProcess = undefined;
    }

    const scriptPath = path.join(
      this.context.extensionPath,
      "scripts",
      "claude-openai-bridge.mjs",
    );

    const child = spawn(process.execPath, [scriptPath], {
      cwd: this.context.extensionPath,
      env: {
        ...process.env,
        CLAUDE_BRIDGE_CWD: workspaceRoot,
        CLAUDE_BRIDGE_CLAUDE_BIN: this.claudeBin,
      },
      stdio: ["pipe", "pipe", "pipe"],
    });
    this.bridgeProcess = child;

    child.stdout.on("data", (chunk: Buffer) => {
      this.appendBridgeOutput(chunk.toString("utf8"));
    });

    child.stderr.on("data", (chunk: Buffer) => {
      this.appendBridgeOutput(chunk.toString("utf8"));
    });

    child.once("exit", (code) => {
      if (this.bridgeProcess === child) {
        this.bridgeProcess = undefined;
      }
      if (code && !this.lastError) {
        this.lastError = `Claude bridge exited with code ${code}.`;
      }
    });

    const deadline = Date.now() + 10000;
    while (Date.now() < deadline) {
      if (await this.isBridgeResponsive()) return;
      if (this.bridgeProcess?.exitCode !== null && this.bridgeProcess?.exitCode !== undefined) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }

    throw new Error(
      this.lastError || "Claude bridge failed to start. Check the PocketAI output channel.",
    );
  }

  private async isBridgeResponsive(): Promise<boolean> {
    try {
      const response = await fetch(CLAUDE_BRIDGE_ROOT_URL, {
        signal: AbortSignal.timeout(1500),
      });
      if (!response.ok) return false;
      const payload = (await response.json()) as { name?: string };
      return payload.name === "pocketai-claude-bridge";
    } catch {
      return false;
    }
  }

  private async getBridgeModels(): Promise<ClaudeModelInfo[]> {
    try {
      const response = await fetch(`${CLAUDE_BRIDGE_URL}/v1/models`, {
        signal: AbortSignal.timeout(2000),
      });
      if (!response.ok) return [];
      const payload = (await response.json()) as {
        data?: Array<{
          id?: string;
          display_name?: string;
          description?: string;
        }>;
      };
      return Array.isArray(payload.data)
        ? payload.data
            .map((model) => ({
              id: model.id?.trim() ?? "",
              displayName: model.display_name?.trim() || model.id?.trim() || "",
              description: model.description?.trim() ?? "",
            }))
            .filter((model) => Boolean(model.id))
        : [];
    } catch {
      return [];
    }
  }

  private withEndpointState(
    state: ClaudeConnectionState,
    endpointMgr: EndpointManager,
  ): ClaudeConnectionState {
    const normalizedTarget = normalizeBaseUrl(CLAUDE_BRIDGE_URL);
    const endpoint = endpointMgr
      .getEndpoints()
      .find((configuredEndpoint) => normalizeBaseUrl(configuredEndpoint.url) === normalizedTarget);
    const health = endpointMgr.endpointHealthMap.get(normalizedTarget);

    return {
      ...state,
      endpointConfigured: Boolean(endpoint),
      endpointActive: normalizeBaseUrl(endpointMgr.activeEndpointUrl) === normalizedTarget,
      endpointHealthy: Boolean(health?.healthy),
      selectedModel: endpoint?.model ?? "",
    };
  }

  private deriveStatus(params: {
    available: boolean;
    loggedIn: boolean;
    bridgeRunning: boolean;
    modelsCount: number;
    endpointMgr: EndpointManager;
    busy: boolean;
  }): string {
    if (params.busy && this.busyMessage) return this.busyMessage;
    if (this.lastError) return this.lastError;

    const next = this.withEndpointState(defaultState(), params.endpointMgr);

    if (!params.available) {
      return "Claude CLI not found yet. Install Claude Code to use this shortcut.";
    }
    if (!params.loggedIn) {
      return params.bridgeRunning
        ? "Bridge is ready. Sign in to Claude to finish connecting."
        : "Sign in to Claude to get started.";
    }
    if (next.endpointActive && next.endpointHealthy && params.bridgeRunning) {
      return "Connected. PocketAI is ready to chat through Claude.";
    }
    if (params.bridgeRunning && next.endpointConfigured) {
      return next.endpointActive
        ? "Claude bridge is running. Refreshing the connection..."
        : "Claude is ready. Click Use on the Claude endpoint to switch over.";
    }
    if (next.endpointConfigured) {
      return "Claude endpoint is saved. Click Connect to start it.";
    }
    return "One click will add the endpoint and start Claude for you.";
  }

  private openLoginTerminal(workspaceRoot: string) {
    const terminalAlive = this.loginTerminal?.exitStatus === undefined;
    if (!terminalAlive) {
      this.loginTerminal = vscode.window.createTerminal({
        name: "PocketAI Claude Login",
        cwd: workspaceRoot,
      });
    }

    this.loginTerminal?.show(true);
    this.loginTerminal?.sendText(
      `${this.shellQuote(this.claudeBin)} auth login`,
      true,
    );
  }

  private shellQuote(value: string): string {
    if (process.platform === "win32") {
      return `"${value.replace(/"/g, '\\"')}"`;
    }
    return `'${value.replace(/'/g, "'\\''")}'`;
  }

  private appendBridgeOutput(text: string) {
    for (const line of text.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      this.outputChannel.appendLine(`[Claude CLI Bridge] ${trimmed}`);
    }
  }

  private runCommand(
    command: string,
    args: string[],
    timeoutMs: number,
  ): Promise<CommandResult> {
    return new Promise((resolve) => {
      execFile(
        command,
        args,
        {
          cwd: this.context.extensionPath,
          env: process.env,
          timeout: timeoutMs,
          maxBuffer: 1024 * 1024,
        },
        (error, stdout, stderr) => {
          const stdOut = String(stdout || "");
          const stdErr = String(stderr || "");

          if (!error) {
            resolve({
              exitCode: 0,
              stdout: stdOut,
              stderr: stdErr,
              notFound: false,
            });
            return;
          }

          const exitCode =
            typeof (error as NodeJS.ErrnoException & { code?: number | string }).code === "number"
              ? Number((error as NodeJS.ErrnoException & { code?: number }).code)
              : null;
          const notFound =
            (error as NodeJS.ErrnoException).code === "ENOENT";

          resolve({
            exitCode,
            stdout: stdOut,
            stderr: stdErr || (error as Error).message,
            notFound,
          });
        },
      );
    });
  }
}
