export type ChatRole = "system" | "user" | "assistant" | "tool";
export type InteractionMode = "ask" | "auto" | "plan";

export type ToolCallType = "read_file" | "edit_file" | "create_file" | "web_search" | "list_files" | "run_command" | "grep" | "glob" | "git_status" | "git_diff" | "git_commit";

export type ToolCall = {
  id: string;
  type: ToolCallType;
  filePath: string;
  query?: string;
  search?: string;
  replace?: string;
  content?: string;
  command?: string;
  pattern?: string;
  glob?: string;
  commitMessage?: string;
  background?: boolean;
  status: "pending" | "approved" | "rejected" | "executed" | "error";
  result?: string;
};

export type EndpointConfig = {
  name: string;
  url: string;
  model?: string;
  maxTokens?: number;
  systemPrompt?: string;
};

export type EndpointHealth = {
  name: string;
  url: string;
  healthy: boolean;
  latencyMs?: number;
  lastChecked: number;
};

export type ImageAttachment = {
  data: string; // base64
  mimeType: string;
  name?: string;
};

export type ChatEntry = {
  role: ChatRole;
  content: string;
  toolCalls?: ToolCall[];
  images?: ImageAttachment[];
};

export type ChatSession = {
  id: string;
  title: string;
  transcript: ChatEntry[];
  selectedModel: string;
  selectedEndpoint: string;
  status: string;
  updatedAt: number;
  busy: boolean;
  mode: InteractionMode;
  currentRequest?: AbortController;
  checkpoints: Checkpoint[];
  lastTokenUsage?: { promptTokens: number; completionTokens: number };
  cumulativeTokens: { prompt: number; completion: number };
  activeSkillInjection?: string;
};

export type ResourceWarning = {
  type: "memory" | "storage";
  message: string;
};

export type RuntimeDiagnostics = {
  baseUrl: string;
  statusSummary: string;
  detectedModelIds: string[];
  totalMemoryGB: number;
  freeMemoryGB: number;
  resourceWarnings: ResourceWarning[];
};

export type Checkpoint = {
  timestamp: number;
  files: Map<string, string>;
  transcriptIndex: number;
};

export type HookEvent = "postEdit" | "postCreate" | "preToolUse" | "postToolUse" | "onSessionStart" | "onSessionEnd";

export type PersistedChatSession = Omit<ChatSession, "busy" | "currentRequest" | "checkpoints">;

export type SessionSummary = {
  id: string;
  title: string;
  updatedAt: number;
};

export type PersistedState = {
  sessions: PersistedChatSession[];
  sidebarSessionId: string;
  nextSessionNumber: number;
};

export type ModelListResponse = {
  data?: Array<{ id?: string }>;
};

export type StatusResponse = {
  ok?: boolean;
  defaultModelId?: string;
};

export type OllamaTagsResponse = {
  models?: Array<{ name?: string; model?: string }>;
};

export type ChatCompletionResponse = {
  choices?: Array<{
    message?: { content?: string };
    finish_reason?: string;
  }>;
  error?: { message?: string };
  usage?: { completion_tokens?: number };
};

export type WebviewToExtensionMessage =
  | { type: "ready" }
  | { type: "sendPrompt"; prompt: string; images?: ImageAttachment[] }
  | { type: "selectModel"; modelId: string }
  | { type: "selectEndpoint"; endpointUrl: string }
  | { type: "refreshModels" }
  | { type: "useSelection" }
  | { type: "clear" }
  | { type: "newSession" }
  | { type: "switchSession"; sessionId: string }
  | { type: "deleteSession"; sessionId: string }
  | { type: "setMode"; mode: InteractionMode }
  | { type: "approveToolCall"; toolCallId: string }
  | { type: "rejectToolCall"; toolCallId: string }
  | { type: "cancelRequest" }
  | { type: "exportSession" }
  | { type: "searchSessions"; query: string }
  | { type: "rewindToCheckpoint"; checkpointIndex: number; restoreCode: boolean; restoreConversation: boolean }
  | { type: "forkFromMessage"; messageIndex: number }
  | { type: "resolveAtMention"; query: string }
  | { type: "openDiff"; toolCallId: string }
  | { type: "approveAllToolCalls" }
  | { type: "rejectAllToolCalls" }
  | { type: "openFile"; filePath: string }
  | { type: "openExternal"; url: string }
  | { type: "previewAllChanges" };

export type ExtensionToWebviewMessage = {
  type: "state";
  transcript: ChatEntry[];
  models: string[];
  selectedModel: string;
  endpoints: EndpointHealth[];
  selectedEndpoint: string;
  status: string;
  busy: boolean;
  sessions: SessionSummary[];
  activeSessionId: string;
  mode: InteractionMode;
  diagnostics: RuntimeDiagnostics;
  projectInstructionsLoaded: boolean;
  contextTokenEstimate: number;
  contextWindowSize: number;
  cumulativeTokens: { prompt: number; completion: number };
} | {
  type: "streamStart";
} | {
  type: "streamChunk";
  text: string;
} | {
  type: "streamEnd";
  fullText: string;
  tokenUsage?: { promptTokens: number; completionTokens: number };
} | {
  type: "filteredSessions";
  sessions: SessionSummary[];
} | {
  type: "atMentionResults";
  suggestions: Array<{ label: string; kind: "file" | "folder" }>;
};
