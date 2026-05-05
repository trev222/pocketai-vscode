import { normalizeBaseUrl } from "./helpers";
import { isOpenCodeGoEndpoint } from "./opencode-go";
import {
  CLAUDE_BRIDGE_URL,
  CODEX_BRIDGE_URL,
  LOCAL_POCKETAI_URL,
} from "./provider-constants";

export type EndpointProviderKind =
  | "local-pocketai"
  | "codex-bridge"
  | "claude-bridge"
  | "openai-compatible";

export type EndpointCapabilities = {
  kind: EndpointProviderKind;
  supportsStructuredTools: boolean;
  supportsReasoningEffort: boolean;
  requiresBridgeBootstrap: boolean;
  usesReportedUsageForContext: boolean;
};

export function getEndpointProviderKind(url: string): EndpointProviderKind {
  const normalizedUrl = normalizeBaseUrl(url);
  if (normalizedUrl === normalizeBaseUrl(CODEX_BRIDGE_URL)) {
    return "codex-bridge";
  }
  if (normalizedUrl === normalizeBaseUrl(CLAUDE_BRIDGE_URL)) {
    return "claude-bridge";
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
      structuredToolsEnabled,
    supportsReasoningEffort: kind === "codex-bridge",
    requiresBridgeBootstrap:
      kind === "codex-bridge" || kind === "claude-bridge",
    // OpenCode Go reports usage in a way that can look much larger than the
    // user-visible transcript for tiny chats, so use our local estimate for
    // context pressure instead of trusting the provider totals.
    usesReportedUsageForContext:
      kind !== "codex-bridge" &&
      kind !== "claude-bridge" &&
      !isOpenCodeGoEndpoint(url),
  };
}
