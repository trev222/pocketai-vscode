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
import {
  getEndpointCapabilities,
  LOCAL_POCKETAI_URL,
  type EndpointCapabilities,
} from "./provider-capabilities";

/**
 * ID prefixes for non-chat models (image gen, video gen, voice/TTS/STT).
 * These should be excluded from the chat model selector.
 */
const NON_CHAT_MODEL_PREFIXES = [
  // Image generation
  "sd-", "sdxl-", "sd3", "flux", "chroma", "z-image-", "qwen-image-", "ovis-image-",
  // Video generation
  "wan2",
  // Voice / STT / TTS / VAD
  "whisper-", "silero-", "kokoro-", "piper-",
];

const ACTIVE_ENDPOINT_STORAGE_KEY = "pocketai.activeEndpointUrl";

/**
 * Extract a numeric parameter size from a model ID (e.g. "qwen3.5-9b" → 9).
 * Returns Infinity if no size is found so unknowns sort to the end.
 */
function extractModelSizeB(id: string): number {
  // Match patterns like "0.8b", "2b", "14b", "122b", "397b", "80b"
  // Also handles MoE patterns like "35b-a3b" — use the first (total) size
  const match = id.match(/(\d+(?:\.\d+)?)b(?:-|$|[^a-z])/i);
  return match ? parseFloat(match[1]) : Infinity;
}

/** Filter out non-chat models and sort by parameter size (smallest first). */
function filterAndSortChatModels(models: string[]): string[] {
  const lower = (id: string) => id.toLowerCase();
  return models
    .filter((id) => {
      const lid = lower(id);
      return !NON_CHAT_MODEL_PREFIXES.some((prefix) => lid.startsWith(prefix));
    })
    .sort((a, b) => extractModelSizeB(a) - extractModelSizeB(b));
}

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
        this.config.get<string>("baseUrl") ?? LOCAL_POCKETAI_URL,
      )
    );
  }

  getEndpoints(): EndpointConfig[] {
    const endpoints = this.config.get<EndpointConfig[]>("endpoints") ?? [];
    if (endpoints.length) return endpoints;
    const legacy = (
      this.config.get<string>("baseUrl") ?? LOCAL_POCKETAI_URL
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
      endpoints[0] ?? { name: "Local PocketAI", url: LOCAL_POCKETAI_URL }
    );
  }

  getEndpointCapabilities(endpointUrl: string): EndpointCapabilities {
    return getEndpointCapabilities(endpointUrl, {
      structuredToolsEnabled: this.config.get<boolean>("useStructuredTools", true),
    });
  }

  getActiveEndpointCapabilities(): EndpointCapabilities {
    return this.getEndpointCapabilities(this.baseUrl);
  }

  initEndpoints() {
    const endpoints = this.getEndpoints();
    const storedActiveEndpointUrl = normalizeBaseUrl(
      this.context.workspaceState.get<string>(ACTIVE_ENDPOINT_STORAGE_KEY) ?? "",
    );
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
      const fallbackUrl = normalizeBaseUrl(
        endpoints[0]?.url ?? LOCAL_POCKETAI_URL,
      );
      this.activeEndpointUrl =
        storedActiveEndpointUrl &&
        this.endpointHealthMap.has(storedActiveEndpointUrl)
          ? storedActiveEndpointUrl
          : fallbackUrl;
      void this.persistActiveEndpointUrl();
    }
  }

  startHealthChecks(postState: () => void, pushSettingsState: () => void) {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = undefined;
    }

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

      let changed = false;
      for (const health of this.endpointHealthMap.values()) {
        const ep = endpoints.find((e) => normalizeBaseUrl(e.url) === health.url);
        const apiKey = ep?.apiKey || "local-pocketai";
        const prevHealthy = health.healthy;
        const start = Date.now();
        try {
          const resp = await fetch(`${health.url}/v1/models`, {
            headers: { Authorization: `Bearer ${apiKey}` },
            signal: AbortSignal.timeout(5000),
          });
          health.healthy = resp.ok;
          health.latencyMs = Date.now() - start;
          health.error = resp.ok ? undefined : `HTTP ${resp.status}`;
        } catch (err) {
          health.healthy = false;
          health.latencyMs = undefined;
          const cause = (err as { cause?: { code?: string } }).cause;
          const code = cause?.code ?? "";
          if (code === "ECONNREFUSED") {
            health.error = "Connection refused — server not running";
          } else if (code === "ENOTFOUND") {
            health.error = "Host not found — check endpoint URL";
          } else if (code === "ETIMEDOUT" || code === "UND_ERR_CONNECT_TIMEOUT") {
            health.error = "Connection timed out";
          } else {
            health.error = (err as Error).message ?? "Unknown error";
          }
        }
        health.lastChecked = Date.now();
        if (health.healthy !== prevHealthy) changed = true;
      }
      this.updateStatusBar();
      // Only push state to webviews when health status actually changes,
      // to avoid unnecessary full re-renders that cause visible blinking.
      if (changed) {
        postState();
        pushSettingsState();
      }
    };
    void check();
    this.healthCheckTimer = setInterval(() => void check(), 30000);
  }

  async refreshModels(
    sessions: Map<string, ChatSession>,
    saveState: () => Promise<void>,
    getPreferredModel: (models: string[]) => string,
  ) {
    try {
      this.statusSummary = "checking...";
      const activeApiKey = this.getActiveEndpointConfig().apiKey || "local-pocketai";
      let foundModels: string[] = [];

      try {
        const response = await fetch(`${this.baseUrl}/v1/models`, {
          headers: { Authorization: `Bearer ${activeApiKey}` },
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
            headers: { Authorization: `Bearer ${activeApiKey}` },
          });
          const sp = (await sr.json()) as StatusResponse;
          this.statusSummary = JSON.stringify(sp);
          if (sp.defaultModelId?.trim()) {
            foundModels = [sp.defaultModelId.trim()];
          }
        } catch {}
      }

      this.models = filterAndSortChatModels(foundModels);

      const activeHealth = this.endpointHealthMap.get(this.activeEndpointUrl);
      if (activeHealth) {
        activeHealth.healthy = true;
        activeHealth.lastChecked = Date.now();
      }

      const fallbackModel = getPreferredModel(this.models) || this.models[0] || "";
      for (const session of sessions.values()) {
        if (
          !session.selectedModel ||
          !this.models.includes(session.selectedModel)
        ) {
          session.selectedModel = fallbackModel;
          session.selectedReasoningEffort = "";
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
    void this.persistActiveEndpointUrl();
    this.updateStatusBar();
  }

  private persistActiveEndpointUrl() {
    return this.context.workspaceState.update(
      ACTIVE_ENDPOINT_STORAGE_KEY,
      this.activeEndpointUrl || undefined,
    );
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
    const connectionStatus = busy
      ? (session?.status || "Busy")
      : health?.healthy
        ? "Connected"
        : health?.error
          ? `Disconnected — ${health.error}`
          : "Disconnected";
    this.statusBarItem.tooltip = `PocketAI: ${endpointName}\nModel: ${model}\nMode: ${mode}\nStatus: ${connectionStatus}${tokenInfo}`;
  }

  dispose() {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = undefined;
    }
  }
}
