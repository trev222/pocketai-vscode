import * as vscode from "vscode";
import type {
  EndpointConfig,
  EndpointHealth,
  ModelListResponse,
  StatusResponse,
  OllamaTagsResponse,
  ChatSession,
} from "./types";
import { normalizeBaseUrl } from "./helpers";

export class EndpointManager {
  readonly endpointHealthMap = new Map<string, EndpointHealth>();
  activeEndpointUrl = "";
  models: string[] = [];
  statusSummary = "status unavailable";
  private healthCheckTimer?: ReturnType<typeof setInterval>;
  private statusBarItem?: vscode.StatusBarItem;

  constructor(private readonly context: vscode.ExtensionContext) {}

  get config() {
    return vscode.workspace.getConfiguration("pocketai");
  }

  get baseUrl() {
    return (
      this.activeEndpointUrl ||
      normalizeBaseUrl(
        this.config.get<string>("baseUrl") ?? "http://127.0.0.1:11434",
      )
    );
  }

  getEndpoints(): EndpointConfig[] {
    const endpoints = this.config.get<EndpointConfig[]>("endpoints") ?? [];
    if (endpoints.length) return endpoints;
    const legacy = (
      this.config.get<string>("baseUrl") ?? "http://127.0.0.1:11434"
    ).trim();
    return [{ name: "Local PocketAI", url: legacy }];
  }

  getActiveEndpointConfig(): EndpointConfig {
    const endpoints = this.getEndpoints();
    const match = endpoints.find(
      (ep) => normalizeBaseUrl(ep.url) === this.activeEndpointUrl,
    );
    return (
      match ??
      endpoints[0] ?? { name: "Local PocketAI", url: "http://127.0.0.1:11434" }
    );
  }

  initEndpoints() {
    const endpoints = this.getEndpoints();
    for (const ep of endpoints) {
      const url = normalizeBaseUrl(ep.url);
      if (!this.endpointHealthMap.has(url)) {
        this.endpointHealthMap.set(url, {
          name: ep.name,
          url,
          healthy: false,
          lastChecked: 0,
        });
      }
    }
    if (
      !this.activeEndpointUrl ||
      !this.endpointHealthMap.has(this.activeEndpointUrl)
    ) {
      this.activeEndpointUrl = normalizeBaseUrl(
        endpoints[0]?.url ?? "http://127.0.0.1:11434",
      );
    }
  }

  startHealthChecks(postState: () => void, pushSettingsState: () => void) {
    const check = async () => {
      const endpoints = this.getEndpoints();
      const currentUrls = new Set<string>();
      for (const ep of endpoints) {
        const url = normalizeBaseUrl(ep.url);
        currentUrls.add(url);
        if (!this.endpointHealthMap.has(url)) {
          this.endpointHealthMap.set(url, {
            name: ep.name,
            url,
            healthy: false,
            lastChecked: 0,
          });
        }
      }
      for (const url of this.endpointHealthMap.keys()) {
        if (!currentUrls.has(url)) this.endpointHealthMap.delete(url);
      }

      for (const health of this.endpointHealthMap.values()) {
        const start = Date.now();
        try {
          const resp = await fetch(`${health.url}/v1/models`, {
            headers: { Authorization: "Bearer local-pocketai" },
            signal: AbortSignal.timeout(5000),
          });
          health.healthy = resp.ok;
          health.latencyMs = Date.now() - start;
        } catch {
          health.healthy = false;
          health.latencyMs = undefined;
        }
        health.lastChecked = Date.now();
      }
      this.updateStatusBar();
      postState();
      pushSettingsState();
    };
    void check();
    this.healthCheckTimer = setInterval(() => void check(), 30000);
  }

  async refreshModels(
    sessions: Map<string, ChatSession>,
    saveState: () => Promise<void>,
  ) {
    try {
      this.statusSummary = "checking...";
      let foundModels: string[] = [];

      try {
        const response = await fetch(`${this.baseUrl}/v1/models`, {
          headers: { Authorization: "Bearer local-pocketai" },
        });
        const payload = (await response.json()) as ModelListResponse;
        foundModels = Array.from(
          new Set(
            (payload.data ?? [])
              .map((m) => m.id?.trim() ?? "")
              .filter(Boolean),
          ),
        );
      } catch {}

      if (!foundModels.length) {
        try {
          const response = await fetch(`${this.baseUrl}/api/tags`);
          const payload = (await response.json()) as OllamaTagsResponse;
          foundModels = Array.from(
            new Set(
              (payload.models ?? [])
                .map((m) => (m.name || m.model || "").trim())
                .filter(Boolean),
            ),
          );
          if (foundModels.length) {
            this.statusSummary = "Connected via Ollama";
          }
        } catch {}
      }

      if (!foundModels.length) {
        try {
          const sr = await fetch(`${this.baseUrl}/status`, {
            headers: { Authorization: "Bearer local-pocketai" },
          });
          const sp = (await sr.json()) as StatusResponse;
          this.statusSummary = JSON.stringify(sp);
          if (sp.defaultModelId?.trim()) {
            foundModels = [sp.defaultModelId.trim()];
          }
        } catch {}
      }

      this.models = foundModels;

      const activeHealth = this.endpointHealthMap.get(this.activeEndpointUrl);
      if (activeHealth) {
        activeHealth.healthy = true;
        activeHealth.lastChecked = Date.now();
      }

      const fallbackModel =
        (this.getActiveEndpointConfig().model ?? "").trim() ||
        this.models[0] ||
        "";
      for (const session of sessions.values()) {
        if (
          !session.selectedModel ||
          !this.models.includes(session.selectedModel)
        ) {
          session.selectedModel = fallbackModel;
        }
        session.status = this.models.length
          ? `Connected — ${this.models.length} model${this.models.length > 1 ? "s" : ""} available`
          : "Server reachable, but no models found.";
      }

      if (this.models.length) {
        this.statusSummary = `OK — ${this.models.length} model(s)`;
      }
    } catch (error) {
      this.models = [];
      this.statusSummary =
        error instanceof Error ? error.message : "status unavailable";
      const message =
        error instanceof Error
          ? error.message
          : "Could not reach localhost. Is Ollama or PocketAI running?";
      for (const session of sessions.values()) {
        session.status = message;
      }
      const activeHealth = this.endpointHealthMap.get(this.activeEndpointUrl);
      if (activeHealth) {
        activeHealth.healthy = false;
        activeHealth.lastChecked = Date.now();
      }
    }
    await saveState();
  }

  switchEndpoint(endpointUrl: string) {
    const url = normalizeBaseUrl(endpointUrl);
    if (!this.endpointHealthMap.has(url)) return;
    this.activeEndpointUrl = url;
    this.updateStatusBar();
  }

  initStatusBar(sidebarSessionId: string, sessions: Map<string, ChatSession>) {
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100,
    );
    this.statusBarItem.command = "pocketai.focus";
    this.updateStatusBar(sidebarSessionId, sessions);
    this.statusBarItem.show();
    this.context.subscriptions.push(this.statusBarItem);
  }

  updateStatusBar(
    sidebarSessionId?: string,
    sessions?: Map<string, ChatSession>,
  ) {
    if (!this.statusBarItem) return;
    const health = this.endpointHealthMap.get(this.activeEndpointUrl);
    const session = sidebarSessionId
      ? sessions?.get(sidebarSessionId)
      : undefined;
    const model = session?.selectedModel || "no model";
    const mode = session?.mode || "ask";
    const busy = session?.busy ?? false;

    // Mode icons
    const modeIcons: Record<string, string> = {
      ask: "$(question)",
      auto: "$(rocket)",
      plan: "$(note)",
    };
    const modeIcon = modeIcons[mode] || "$(question)";

    // Status
    const statusIcon = busy
      ? "$(loading~spin)"
      : health?.healthy
        ? "$(check)"
        : "$(warning)";
    const statusLabel = busy
      ? (session?.status || "Thinking...").slice(0, 40)
      : "Ready";

    this.statusBarItem.text = `${statusIcon} ${model} ${modeIcon}[${mode}] ${statusLabel}`;

    const endpointName = health?.name ?? "PocketAI";
    const cumTokens = session?.cumulativeTokens;
    const tokenInfo = cumTokens
      ? `\nTokens used: ${cumTokens.prompt + cumTokens.completion}`
      : "";
    this.statusBarItem.tooltip = `PocketAI: ${endpointName}\nModel: ${model}\nMode: ${mode}\nStatus: ${busy ? session?.status || "Busy" : health?.healthy ? "Connected" : "Disconnected"}${tokenInfo}`;
  }

  dispose() {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = undefined;
    }
  }
}
