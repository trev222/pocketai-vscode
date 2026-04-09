import type { CodexConnectionState } from "./codex-bridge-manager";
import {
  getEndpointCapabilities,
  type EndpointProviderKind,
} from "./provider-capabilities";
import type { ChatSession } from "./types";

export type ProviderChatControlsState = {
  models: string[];
  selectedModel: string;
  providerKind: EndpointProviderKind;
  selectedReasoningEffort: string;
  showReasoningControl: boolean;
  reasoningOptions: string[];
};

export type ProviderReasoningControlsState = {
  selectedReasoningEffort: string;
  reasoningOptions: string[];
};

export function buildCodexReasoningControlsState(options: {
  selectedModel: string;
  selectedReasoningEffort: string;
  codexState?: Pick<CodexConnectionState, "models">;
}): ProviderReasoningControlsState {
  const defaultCodexModel =
    options.codexState?.models.find((model) => model.isDefault) ??
    options.codexState?.models[0];
  const effectiveCodexModelId =
    options.selectedModel || defaultCodexModel?.id || "";
  const reasoningModel =
    options.codexState?.models.find(
      (model) => model.id === effectiveCodexModelId,
    ) ?? defaultCodexModel;
  const reasoningOptions =
    reasoningModel?.supportedReasoningEfforts.map(
      (option) => option.reasoningEffort,
    ) ?? [];
  const selectedReasoningEffort =
    options.selectedReasoningEffort &&
    reasoningOptions.includes(options.selectedReasoningEffort)
      ? options.selectedReasoningEffort
      : "";

  return {
    selectedReasoningEffort,
    reasoningOptions,
  };
}

export function buildProviderChatControlsState(options: {
  endpointUrl: string;
  structuredToolsEnabled?: boolean;
  availableModels: string[];
  session: ChatSession;
  codexState?: CodexConnectionState;
}): ProviderChatControlsState {
  const capabilities = getEndpointCapabilities(options.endpointUrl, {
    structuredToolsEnabled: options.structuredToolsEnabled,
  });

  const baseState: ProviderChatControlsState = {
    models: options.availableModels,
    selectedModel: options.session.selectedModel,
    providerKind: capabilities.kind,
    selectedReasoningEffort: "",
    showReasoningControl: capabilities.supportsReasoningEffort,
    reasoningOptions: [],
  };

  if (!capabilities.supportsReasoningEffort || !options.codexState) {
    return baseState;
  }

  const reasoningControls = buildCodexReasoningControlsState({
    selectedModel: options.session.selectedModel,
    selectedReasoningEffort: options.session.selectedReasoningEffort,
    codexState: options.codexState,
  });

  return {
    ...baseState,
    selectedReasoningEffort: reasoningControls.selectedReasoningEffort,
    reasoningOptions: reasoningControls.reasoningOptions,
  };
}
