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
  type EndpointCapabilities,
} from "./provider-capabilities";
import { LOCAL_POCKETAI_URL } from "./provider-constants";
import {
  getOpenCodeGoChatModels,
  getOpenCodeGoHealthProbeInit,
  getOpenCodeGoHealthProbeUrl,
  getOpenCodeGoStatusLabel,
  isLikelyReachableOpenCodeStatus,
  isOpenCodeGoEndpoint,
  normalizeEndpointInputUrl,
} from "./opencode-go";
import {
  applyRefreshedModelsToSessions,
  resolveActiveEndpointUrl,
} from "./endpoint-workflows";

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
  private managedEndpointMap = new Map<string, EndpointConfig>();
  private healthCheckTimer?: ReturnType<typeof setInterval>;
  private statusBarItem?: vscode.StatusBarItem;

  constructor(private readonly context: vscode.ExtensionContext) {}

  private resolveCurrentActiveEndpoint(): {
    url: string;
    config: EndpointConfig;
  } {
    const endpoints = this.getEndpoints();
    const normalizedActive = normalizeBaseUrl(this.activeEndpointUrl);
    const match = endpoints.find(
      (ep) => normalizeEndpointInputUrl(ep.url) === normalizedActive,
    );
    const config =
      match ??
      endpoints[0] ?? { name: "Local PocketAI", url: LOCAL_POCKETAI_URL };

    return {
      url: normalizeEndpointInputUrl(config.url),
      config,
    };
  }

  get config() {
    return vscode.workspace.getConfiguration("pocketai");
  }

  get baseUrl() {
    return this.resolveCurrentActiveEndpoint().url;
  }

  getConfiguredEndpoints(): EndpointConfig[] {
    const endpoints = this.config.get<EndpointConfig[]>("endpoints") ?? [];
    if (endpoints.length) return endpoints;
    const legacy = (
      this.config.get<string>("baseUrl") ?? LOCAL_POCKETAI_URL
    ).trim();
    return [{ name: "Local PocketAI", url: legacy }];
  }

  getEndpoints(): EndpointConfig[] {
    const configured = this.getConfiguredEndpoints();
    const merged = configured.slice();
    const configuredUrls = new Set(
      configured.map((endpoint) => normalizeEndpointInputUrl(endpoint.url)),
    );

    for (const endpoint of this.managedEndpointMap.values()) {
      const url = normalizeEndpointInputUrl(endpoint.url);
      if (!configuredUrls.has(url)) {
        merged.push({ ...endpoint, url });
      }
    }

    return merged;
  }

  setManagedEndpoints(endpoints: EndpointConfig[]): boolean {
    const next = new Map<string, EndpointConfig>();
    for (const endpoint of endpoints) {
      next.set(normalizeEndpointInputUrl(endpoint.url), {
        ...endpoint,
        url: normalizeEndpointInputUrl(endpoint.url),
      });
    }

    const serialize = (map: Map<string, EndpointConfig>) =>
      JSON.stringify(
        Array.from(map.entries())
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([url, endpoint]) => ({
            url,
            name: endpoint.name,
            apiKey: endpoint.apiKey ?? "",
            deviceId: endpoint.deviceId ?? "",
            subdomain: endpoint.subdomain ?? "",
          })),
      );

    if (serialize(next) === serialize(this.managedEndpointMap)) {
      return false;
    }

    this.managedEndpointMap = next;
    return true;
  }

  getActiveEndpointConfig(): EndpointConfig {
    return this.resolveCurrentActiveEndpoint().config;
  }

  getResolvedActiveEndpointUrl(): string {
    return this.resolveCurrentActiveEndpoint().url;
  }

  getEndpointCapabilities(endpointUrl: string): EndpointCapabilities {
    return getEndpointCapabilities(endpointUrl, {
      structuredToolsEnabled: this.config.get<boolean>("useStructuredTools", true),
    });
  }

  getActiveEndpointCapabilities(): EndpointCapabilities {
    return this.getEndpointCapabilities(this.getResolvedActiveEndpointUrl());
  }

  initEndpoints() {
    const endpoints = this.getEndpoints();
      const storedActiveEndpointUrl = normalizeBaseUrl(
      this.context.workspaceState.get<string>(ACTIVE_ENDPOINT_STORAGE_KEY) ?? "",
    );
    for (const ep of endpoints) {
      const url = normalizeEndpointInputUrl(ep.url);
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
      this.activeEndpointUrl = resolveActiveEndpointUrl({
        endpoints,
        currentActiveEndpointUrl: this.activeEndpointUrl,
        storedActiveEndpointUrl,
        fallbackUrl: LOCAL_POCKETAI_URL,
      });
      void this.persistActiveEndpointUrl();
    }
  }

  startHealthChecks(
    syncManagedEndpoints: () => Promise<void>,
    postState: () => void,
    pushSettingsState: () => void,
    onActiveEndpointRecovered?: () => Promise<void> | void,
  ) {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = undefined;
    }

    const check = async () => {
      await syncManagedEndpoints();
      this.initEndpoints();
      const previousActiveHealthy =
        this.endpointHealthMap.get(this.getResolvedActiveEndpointUrl())?.healthy ?? false;
      const endpoints = this.getEndpoints();
      const currentUrls = new Set<string>();
      for (const ep of endpoints) {
        const url = normalizeEndpointInputUrl(ep.url);
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
        const ep = endpoints.find(
          (e) => normalizeEndpointInputUrl(e.url) === health.url,
        );
        const apiKey = ep?.apiKey || "local-pocketai";
        const prevHealthy = health.healthy;
        const start = Date.now();
        const normalizedHealthUrl = normalizeEndpointInputUrl(health.url);
        try {
          const resp = await fetch(`${normalizedHealthUrl}/v1/models`, {
            headers: { Authorization: `Bearer ${apiKey}` },
            signal: AbortSignal.timeout(5000),
          });
          if (resp.ok) {
            health.healthy = true;
            health.latencyMs = Date.now() - start;
            health.error = undefined;
          } else if (isOpenCodeGoEndpoint(normalizedHealthUrl)) {
            const probeResp = await fetch(
              getOpenCodeGoHealthProbeUrl(normalizedHealthUrl),
              {
                ...getOpenCodeGoHealthProbeInit(apiKey),
                signal: AbortSignal.timeout(5000),
              },
            );
            if (isLikelyReachableOpenCodeStatus(probeResp.status)) {
              health.healthy = probeResp.status !== 401 && probeResp.status !== 403;
              health.latencyMs = Date.now() - start;
              health.error =
                probeResp.status === 401 || probeResp.status === 403
                  ? "Authentication required — add a valid API key"
                  : undefined;
            } else {
              health.healthy = false;
              health.latencyMs = Date.now() - start;
              health.error = `HTTP ${probeResp.status}`;
            }
          } else {
            const statusResp = await fetch(`${normalizedHealthUrl}/status`, {
              headers: { Authorization: `Bearer ${apiKey}` },
              signal: AbortSignal.timeout(5000),
            });
            health.healthy = statusResp.ok;
            health.latencyMs = Date.now() - start;
            health.error = statusResp.ok ? undefined : `HTTP ${resp.status}`;
          }
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
      const nextActiveHealthy =
        this.endpointHealthMap.get(this.getResolvedActiveEndpointUrl())?.healthy ?? false;
      if (!previousActiveHealthy && nextActiveHealthy) {
        await onActiveEndpointRecovered?.();
      }
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
      let foundModels: string[] = [];
      let respondedSuccessfully = false;
      let lastError: unknown;
      const normalizedBaseUrl = normalizeEndpointInputUrl(this.baseUrl);
      const isOpenCodeGo = isOpenCodeGoEndpoint(normalizedBaseUrl);
      const configuredApiKey = this.getActiveEndpointConfig().apiKey?.trim() || "";
      const activeApiKey = configuredApiKey || "local-pocketai";

      if (isOpenCodeGo) {
        respondedSuccessfully = true;
        foundModels = getOpenCodeGoChatModels();
        this.statusSummary = getOpenCodeGoStatusLabel(!!configuredApiKey);
      } else {
        try {
          const response = await fetch(`${normalizedBaseUrl}/v1/models`, {
            headers: { Authorization: `Bearer ${activeApiKey}` },
          });
          if (response.ok) {
            respondedSuccessfully = true;
            const payload = (await response.json()) as ModelListResponse;
            foundModels = Array.from(
              new Set(
                (payload.data ?? [])
                  .map((m) => m.id?.trim() ?? "")
                  .filter(Boolean),
              ),
            );
          } else {
            this.statusSummary = `HTTP ${response.status}`;
          }
        } catch (error) {
          lastError = error;
        }
      }

      if (!foundModels.length && !isOpenCodeGo) {
        try {
          const response = await fetch(`${normalizedBaseUrl}/api/tags`);
          if (response.ok) {
            respondedSuccessfully = true;
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
          } else if (!respondedSuccessfully) {
            this.statusSummary = `HTTP ${response.status}`;
          }
        } catch (error) {
          if (!lastError) lastError = error;
        }
      }

      if (!foundModels.length && !isOpenCodeGo) {
        try {
          const sr = await fetch(`${normalizedBaseUrl}/status`, {
            headers: { Authorization: `Bearer ${activeApiKey}` },
          });
          if (sr.ok) {
            respondedSuccessfully = true;
            const sp = (await sr.json()) as StatusResponse;
            this.statusSummary = JSON.stringify(sp);
            if (sp.defaultModelId?.trim()) {
              foundModels = [sp.defaultModelId.trim()];
            }
          } else if (!respondedSuccessfully) {
            this.statusSummary = `HTTP ${sr.status}`;
          }
        } catch (error) {
          if (!lastError) lastError = error;
        }
      }

      if (!respondedSuccessfully) {
        throw (
          lastError ??
          new Error("Could not reach localhost. Is Ollama or PocketAI running?")
        );
      }

      this.models = filterAndSortChatModels(foundModels);

      const activeHealth = this.endpointHealthMap.get(
        this.getResolvedActiveEndpointUrl(),
      );
      if (activeHealth) {
        if (!isOpenCodeGo || !!configuredApiKey) {
          activeHealth.healthy = true;
        }
        activeHealth.lastChecked = Date.now();
        if (!isOpenCodeGo || !!configuredApiKey) {
          activeHealth.error = undefined;
        }
      }

      applyRefreshedModelsToSessions(
        sessions.values(),
        this.models,
        getPreferredModel,
      );

      if (this.models.length) {
        this.statusSummary = `OK — ${this.models.length} model(s)`;
      } else if (!this.statusSummary || this.statusSummary === "checking...") {
        this.statusSummary = "Server reachable, but no models found.";
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
      const activeHealth = this.endpointHealthMap.get(
        this.getResolvedActiveEndpointUrl(),
      );
      if (activeHealth) {
        activeHealth.healthy = false;
        activeHealth.lastChecked = Date.now();
        activeHealth.error = message;
      }
    }
    await saveState();
  }

  switchEndpoint(endpointUrl: string) {
    const url = normalizeEndpointInputUrl(endpointUrl);
    const target = this.getEndpoints().find(
      (endpoint) => normalizeEndpointInputUrl(endpoint.url) === url,
    );
    if (!target) return;
    if (!this.endpointHealthMap.has(url)) {
      this.endpointHealthMap.set(url, {
        name: target.name,
        url,
        healthy: false,
        lastChecked: 0,
      });
    }
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
    const resolvedActiveEndpointUrl = this.getResolvedActiveEndpointUrl();
    const health = this.endpointHealthMap.get(resolvedActiveEndpointUrl);
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
