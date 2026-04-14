import { normalizeBaseUrl } from "./helpers";

export const XAI_BASE_URL = "https://api.x.ai";

export function isXAIEndpoint(url: string): boolean {
  const normalized = normalizeBaseUrl(String(url || ""));
  return /^https:\/\/(?:[a-z0-9-]+\.)?api\.x\.ai(?:\/.*)?$/i.test(normalized);
}

export function normalizeXAIBaseUrl(url: string): string {
  const normalized = normalizeBaseUrl(String(url || ""));
  if (!isXAIEndpoint(normalized)) {
    return normalized;
  }

  return normalized
    .replace(/\/v1\/chat\/completions$/i, "")
    .replace(/\/v1\/responses$/i, "")
    .replace(/\/v1\/models$/i, "")
    .replace(/\/v1\/language-models$/i, "")
    .replace(/\/v1$/i, "");
}

export function getXAIProviderName(name: string): string {
  const trimmed = String(name || "").trim();
  if (!trimmed || isXAIEndpoint(trimmed)) {
    return "Grok (xAI)";
  }
  return trimmed;
}
