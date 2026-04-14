import type { EndpointProviderKind } from "./provider-capabilities";

export type ChatRole = "system" | "user" | "assistant" | "tool";
export type InteractionMode = "ask" | "auto" | "plan";

export type ToolCallType =
  | "list_tools"
  | "list_skills"
  | "run_skill"
  | "diagnostics"
  | "open_file"
  | "open_definition"
  | "workspace_symbols"
  | "hover_symbol"
  | "code_actions"
  | "apply_code_action"
  | "go_to_definition"
  | "find_references"
  | "document_symbols"
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
  // IDE tools
  line?: number;
  character?: number;
  includeDeclaration?: boolean;
  // skills
  skillName?: string;
  skillPrompt?: string;
  actionTitle?: string;
  actionKind?: string;
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

export type HarnessPendingApproval = {
  toolCallId: string;
  toolType: string;
  filePath: string;
};

export type HarnessPendingDiff = {
  toolCallId: string;
  filePath: string;
};

export type HarnessTodoItem = {
  content: string;
  status: "pending" | "in_progress" | "completed";
};

export type HarnessBackgroundTaskStatus =
  | "running"
  | "completed"
  | "failed"
  | "cancelled"
  | "interrupted";

export type HarnessBackgroundTask = {
  id: string;
  command: string;
  status: HarnessBackgroundTaskStatus;
  outputPreview: string;
  exitCode?: number;
  updatedAt: number;
  cwd?: string;
};

export type HarnessSessionState = {
  pendingApprovals: HarnessPendingApproval[];
  pendingDiffs: HarnessPendingDiff[];
  todoItems: HarnessTodoItem[];
  backgroundTasks: HarnessBackgroundTask[];
};

export type HarnessRuntimeHealth = {
  level: "ok" | "warning" | "error";
  summary: string;
  issues: string[];
  suggestions: string[];
  actions: Array<"compact" | "refresh-models" | "show-jobs">;
};

export type SessionActiveSkill = {
  id: string;
  name: string;
  description: string;
  source: "builtin" | "workspace";
  prompt: string;
  note?: string;
};

export type EndpointConfig = {
  name: string;
  url: string;
  model?: string;
  reasoningEffort?: string;
  maxTokens?: number;
  systemPrompt?: string;
  apiKey?: string;
  managed?: boolean;
  managedSource?: string;
  deviceId?: string;
  subdomain?: string;
  remoteUrl?: string;
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

export type FileAttachment = {
  name: string;
  mimeType: string;
  content: string;
  sizeBytes: number;
  truncated?: boolean;
};

export type ChatEntry = {
  role: ChatRole;
  content: string;
  toolCalls?: ToolCall[];
  images?: ImageAttachment[];
  files?: FileAttachment[];
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
  activeSkills: SessionActiveSkill[];
  activeSkillInjection?: string;
  skillPreflightContext?: string;
  harnessState: HarnessSessionState;
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

export type PersistedChatSession = Omit<
  ChatSession,
  "busy" | "currentRequest" | "checkpoints" | "activeSkills" | "activeSkillInjection" | "skillPreflightContext" | "harnessState"
> & {
  backgroundTasks?: HarnessBackgroundTask[];
};

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
  model?: string;
  choices?: Array<{
    message?: { content?: string };
    finish_reason?: string;
  }>;
  error?: { message?: string };
  usage?: { prompt_tokens?: number; completion_tokens?: number };
};

export type WebviewToExtensionMessage =
  | { type: "ready" }
  | {
      type: "sendPrompt";
      prompt: string;
      images?: ImageAttachment[];
      files?: FileAttachment[];
    }
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
  | { type: "removeActiveSkill"; skillId: string }
  | { type: "clearActiveSkills" }
  | { type: "cancelBackgroundTask"; taskId: string }
  | { type: "rerunBackgroundTask"; taskId: string }
  | { type: "clearBackgroundTasks" }
  | { type: "previewAllChanges" };

export type ExtensionToWebviewMessage = {
  type: "state";
  transcript: ChatEntry[];
  models: string[];
  selectedModel: string;
  providerKind: EndpointProviderKind;
  selectedReasoningEffort: string;
  showReasoningControl: boolean;
  reasoningOptions: string[];
  endpoints: EndpointHealth[];
  selectedEndpoint: string;
  status: string;
  busy: boolean;
  sessions: SessionSummary[];
  activeSessionId: string;
  activeSessionTitle: string;
  mode: InteractionMode;
  diagnostics: RuntimeDiagnostics;
  projectInstructionsLoaded: boolean;
  contextTokenEstimate: number;
  contextWindowSize: number;
  cumulativeTokens: { prompt: number; completion: number };
  activeSkills: Array<Omit<SessionActiveSkill, "prompt">>;
  harnessState: HarnessSessionState;
  runtimeHealth: HarnessRuntimeHealth;
} | {
  type: "streamStart";
  label?: string;
  detail?: string;
} | {
  type: "streamChunk";
  text: string;
} | {
  type: "streamToolCallDetected";
  toolName?: string;
  toolTarget?: string;
  detail?: string;
} | {
  type: "streamEnd";
  fullText: string;
  tokenUsage?: { promptTokens: number; completionTokens: number };
  responseModel?: string;
} | {
  type: "filteredSessions";
  sessions: SessionSummary[];
} | {
  type: "atMentionResults";
  suggestions: Array<{ label: string; kind: "file" | "folder" }>;
};
