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

export function normalizeSessionEndpointSelections(
  sessions: Iterable<Pick<ChatSession, "selectedEndpoint">>,
  knownEndpointUrls: Iterable<string>,
  fallbackEndpointUrl: string,
): boolean {
  const normalizedKnownUrls = new Set(
    Array.from(knownEndpointUrls)
      .map((endpointUrl) => normalizeBaseUrl(endpointUrl))
      .filter(Boolean),
  );
  const normalizedFallbackEndpointUrl = normalizeBaseUrl(fallbackEndpointUrl);
  let changed = false;

  for (const session of sessions) {
    const normalizedSelectedEndpoint = normalizeBaseUrl(
      session.selectedEndpoint ?? "",
    );
    const nextSelectedEndpoint =
      normalizedSelectedEndpoint &&
      normalizedKnownUrls.has(normalizedSelectedEndpoint)
        ? normalizedSelectedEndpoint
        : normalizedFallbackEndpointUrl;
    if (!nextSelectedEndpoint || session.selectedEndpoint === nextSelectedEndpoint) {
      continue;
    }

    session.selectedEndpoint = nextSelectedEndpoint;
    changed = true;
  }

  return changed;
}

export function syncSessionsToActiveEndpoint(
  sessions: Iterable<Pick<ChatSession, "selectedEndpoint">>,
  activeEndpointUrl: string,
): boolean {
  return normalizeSessionEndpointSelections(
    sessions,
    [activeEndpointUrl],
    activeEndpointUrl,
  );
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
