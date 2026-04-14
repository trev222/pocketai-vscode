import { normalizeBaseUrl } from "./helpers";
import { isXAIEndpoint, normalizeXAIBaseUrl } from "./xai";

export const OPENCODE_GO_BASE_URL = "https://opencode.ai/zen/go";

const OPENCODE_GO_PREFIX = "https://opencode.ai/zen/go";

const OPENCODE_GO_CHAT_MODEL_IDS = [
  "opencode-go/glm-5",
  "opencode-go/glm-5.1",
  "opencode-go/kimi-k2.5",
  "opencode-go/mimo-v2-pro",
  "opencode-go/mimo-v2-omni",
];

const OPENCODE_GO_MODEL_PREFIX = "opencode-go/";

export function isOpenCodeGoEndpoint(url: string): boolean {
  const normalized = normalizeBaseUrl(String(url || ""));
  return /^https:\/\/opencode\.ai\/zen\/go(?:\/.*)?$/i.test(normalized);
}

export function normalizeOpenCodeGoBaseUrl(url: string): string {
  const normalized = normalizeBaseUrl(String(url || ""));
  if (!isOpenCodeGoEndpoint(normalized)) {
    return normalized;
  }

  return normalized
    .replace(/\/v1\/chat\/completions$/i, "")
    .replace(/\/v1\/messages$/i, "")
    .replace(/\/v1$/i, "");
}

export function normalizeEndpointInputUrl(url: string): string {
  const normalized = normalizeBaseUrl(String(url || ""));
  if (isOpenCodeGoEndpoint(normalized)) {
    return normalizeOpenCodeGoBaseUrl(normalized);
  }
  if (isXAIEndpoint(normalized)) {
    return normalizeXAIBaseUrl(normalized);
  }
  return normalized;
}

export function getOpenCodeGoChatModels(): string[] {
  return [...OPENCODE_GO_CHAT_MODEL_IDS];
}

export function toOpenCodeGoRequestModel(
  modelId: string,
  endpointUrl: string,
): string {
  const trimmed = String(modelId || "").trim();
  if (!trimmed || !isOpenCodeGoEndpoint(endpointUrl)) {
    return trimmed;
  }
  return trimmed.startsWith(OPENCODE_GO_MODEL_PREFIX)
    ? trimmed.slice(OPENCODE_GO_MODEL_PREFIX.length)
    : trimmed;
}

export function getOpenCodeGoStatusLabel(hasApiKey: boolean): string {
  return hasApiKey
    ? "OpenCode Go configured"
    : "OpenCode Go configured — add API key to chat.";
}

export function getOpenCodeGoHealthProbeUrl(baseUrl: string): string {
  return `${normalizeOpenCodeGoBaseUrl(baseUrl)}/v1/chat/completions`;
}

export function getOpenCodeGoHealthProbeInit(apiKey: string): {
  method: "POST";
  headers: Record<string, string>;
  body: string;
} {
  return {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    // Intentionally incomplete so the provider returns a cheap validation
    // error like 400/422 while still proving the route is reachable.
    body: JSON.stringify({}),
  };
}

export function getOpenCodeGoProviderName(name: string): string {
  const trimmed = String(name || "").trim();
  if (!trimmed || isOpenCodeGoEndpoint(trimmed)) {
    return "OpenCode Go";
  }
  return trimmed;
}

export function isLikelyReachableOpenCodeStatus(status: number): boolean {
  return [200, 400, 401, 403, 405, 415, 422].includes(status);
}

export function matchesOpenCodeGoBaseUrl(url: string): boolean {
  return normalizeOpenCodeGoBaseUrl(url) === OPENCODE_GO_PREFIX;
}
