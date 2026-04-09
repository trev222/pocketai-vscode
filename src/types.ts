export type ChatRole = "system" | "user" | "assistant" | "tool";
export type InteractionMode = "ask" | "auto" | "plan";

export type ToolCallType =
  | "read_file"
  | "edit_file"
  | "write_file"
  | "web_search"
  | "web_fetch"
  | "list_files"
  | "run_command"
  | "grep"
  | "glob"
  | "git_status"
  | "git_diff"
  | "git_commit"
  | "todo_write"
  | "memory_read"
  | "memory_write"
  | "memory_delete";

export type ToolCall = {
  id: string;
  type: ToolCallType;
  filePath: string;
  // read_file
  offset?: number;
  limit?: number;
  // edit_file
  query?: string;
  search?: string;
  replace?: string;
  replaceAll?: boolean;
  // write_file / create_file (legacy)
  content?: string;
  // run_command
  command?: string;
  description?: string;
  timeout?: number;
  background?: boolean;
  // grep
  pattern?: string;
  glob?: string;
  grepType?: string;
  outputMode?: "content" | "files_with_matches" | "count";
  contextLines?: number;
  beforeLines?: number;
  afterLines?: number;
  caseInsensitive?: boolean;
  multiline?: boolean;
  headLimit?: number;
  grepOffset?: number;
  // glob (path scope)
  globPath?: string;
  // web_search / web_fetch
  url?: string;
  // git_commit
  commitMessage?: string;
  // todo_write
  todos?: Array<{ content: string; status: string }>;
  // memory tools
  memoryType?: string;
  memoryName?: string;
  memoryDescription?: string;
  memoryContent?: string;
  memoryQuery?: string;
  // general
  status: "pending" | "approved" | "rejected" | "executed" | "error";
  result?: string;
};

export type EndpointConfig = {
  name: string;
  url: string;
  model?: string;
  reasoningEffort?: string;
  maxTokens?: number;
  systemPrompt?: string;
  apiKey?: string;
};

export type EndpointHealth = {
  name: string;
  url: string;
  healthy: boolean;
  latencyMs?: number;
  lastChecked: number;
  error?: string;
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
  selectedReasoningEffort: string;
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
  lastSelectedModel?: string;
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
  | { type: "selectReasoningEffort"; reasoningEffort: string }
  | { type: "selectEndpoint"; endpointUrl: string }
  | { type: "refreshModels" }
  | { type: "useSelection" }
  | { type: "clear" }
  | { type: "newSession" }
  | { type: "switchSession"; sessionId: string }
  | { type: "renameSession"; sessionId: string; title: string }
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
  selectedReasoningEffort: string;
  showReasoningControl: boolean;
  reasoningOptions: string[];
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
