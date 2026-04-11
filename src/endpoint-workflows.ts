import { normalizeBaseUrl } from "./helpers";
import type { ChatSession, EndpointConfig } from "./types";

export function buildConnectedSessionStatus(modelCount: number): string {
  return modelCount
    ? `Connected — ${modelCount} model${modelCount > 1 ? "s" : ""} available`
    : "Server reachable, but no models found.";
}

export function resolveActiveEndpointUrl(options: {
  endpoints: EndpointConfig[];
  currentActiveEndpointUrl?: string;
  storedActiveEndpointUrl?: string;
  fallbackUrl?: string;
}): string {
  const knownUrls = new Set(
    options.endpoints.map((endpoint) => normalizeBaseUrl(endpoint.url)),
  );
  const normalizedCurrent = normalizeBaseUrl(
    options.currentActiveEndpointUrl ?? "",
  );
  if (normalizedCurrent && knownUrls.has(normalizedCurrent)) {
    return normalizedCurrent;
  }

  const normalizedStored = normalizeBaseUrl(
    options.storedActiveEndpointUrl ?? "",
  );
  if (normalizedStored && knownUrls.has(normalizedStored)) {
    return normalizedStored;
  }

  return normalizeBaseUrl(
    options.endpoints[0]?.url ?? options.fallbackUrl ?? "",
  );
}

export function syncSessionsToActiveEndpoint(
  sessions: Iterable<Pick<ChatSession, "selectedEndpoint">>,
  activeEndpointUrl: string,
): boolean {
  let changed = false;
  for (const session of sessions) {
    if (session.selectedEndpoint === activeEndpointUrl) continue;
    session.selectedEndpoint = activeEndpointUrl;
    changed = true;
  }
  return changed;
}

export function applyRefreshedModelsToSessions(
  sessions: Iterable<Pick<ChatSession, "selectedModel" | "selectedReasoningEffort" | "status">>,
  models: string[],
  getPreferredModel: (models: string[]) => string,
): boolean {
  const fallbackModel = getPreferredModel(models) || models[0] || "";
  const nextStatus = buildConnectedSessionStatus(models.length);
  let changed = false;

  for (const session of sessions) {
    const shouldResetModel =
      !session.selectedModel || !models.includes(session.selectedModel);
    if (shouldResetModel) {
      if (session.selectedModel !== fallbackModel) {
        session.selectedModel = fallbackModel;
        changed = true;
      }
      if (session.selectedReasoningEffort) {
        session.selectedReasoningEffort = "";
        changed = true;
      }
    }

    if (session.status !== nextStatus) {
      session.status = nextStatus;
      changed = true;
    }
  }

  return changed;
}
