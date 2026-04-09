import { CODEX_BRIDGE_URL } from "./codex-bridge-manager";
import { normalizeBaseUrl } from "./helpers";

export const LOCAL_POCKETAI_URL = "http://127.0.0.1:39457";

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
