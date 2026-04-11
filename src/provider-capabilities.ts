import { normalizeBaseUrl } from "./helpers";
import { CODEX_BRIDGE_URL, LOCAL_POCKETAI_URL } from "./provider-constants";

export type EndpointProviderKind =
  | "local-pocketai"
  | "codex-bridge"
  | "openai-compatible";

export type EndpointCapabilities = {
  kind: EndpointProviderKind;
  supportsStructuredTools: boolean;
  supportsReasoningEffort: boolean;
  requiresBridgeBootstrap: boolean;
};

export function getEndpointProviderKind(url: string): EndpointProviderKind {
  const normalizedUrl = normalizeBaseUrl(url);
  if (normalizedUrl === normalizeBaseUrl(CODEX_BRIDGE_URL)) {
    return "codex-bridge";
  }
  if (normalizedUrl === normalizeBaseUrl(LOCAL_POCKETAI_URL)) {
    return "local-pocketai";
  }
  return "openai-compatible";
}

export function getEndpointCapabilities(
  url: string,
  options?: { structuredToolsEnabled?: boolean },
): EndpointCapabilities {
  const kind = getEndpointProviderKind(url);
  const structuredToolsEnabled = options?.structuredToolsEnabled ?? true;

  return {
    kind,
    supportsStructuredTools:
      structuredToolsEnabled && kind !== "codex-bridge",
    supportsReasoningEffort: kind === "codex-bridge",
    requiresBridgeBootstrap: kind === "codex-bridge",
  };
}
