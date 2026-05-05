import type { OpenAITool } from "../tool-definitions";
import type {
  ChatSession,
  InteractionMode,
  ToolCall,
} from "../types";

export type HarnessExecutionMode = InteractionMode;

export type HarnessToolRisk =
  | "safe"
  | "caution"
  | "destructive"
  | "external";

export type HarnessApprovalDecision =
  | "auto-execute"
  | "requires-approval";

export type HarnessToolApprovalPolicy =
  | "always-auto"
  | "mode-auto"
  | "always-ask";

export type HarnessToolPreviewKind =
  | "none"
  | "inline-diff";

export type HarnessEventType =
  | "turn_started"
  | "assistant_delta"
  | "assistant_message_completed"
  | "tool_calls_detected"
  | "tool_call_pending_approval"
  | "tool_call_started"
  | "tool_call_completed"
  | "tool_call_failed"
  | "diff_ready"
  | "background_task_updated"
  | "turn_completed"
  | "turn_failed";

export type HarnessEvent = {
  type: HarnessEventType;
  sessionId: string;
  toolCallId?: string;
  detail?: string;
};

export type HarnessToolDescriptor = {
  name: string;
  description: string;
  risk: HarnessToolRisk;
  source: "builtin" | "mcp";
  approvalPolicy: HarnessToolApprovalPolicy;
  previewKind: HarnessToolPreviewKind;
  definition?: OpenAITool;
  execute?: (context: {
    session: ChatSession;
    toolCall: ToolCall;
    registry: HarnessToolRegistry;
  }) => Promise<string>;
};

export interface HarnessToolRegistry {
  list(): HarnessToolDescriptor[];
  getToolDescriptor(toolName: string): HarnessToolDescriptor | undefined;
  isMcpTool(toolName: string): boolean;
  getStructuredToolDefinitions(): OpenAITool[] | undefined;
  listSkills(query?: string): Array<{
    id: string;
    name: string;
    description: string;
    source: "builtin" | "workspace";
    path?: string;
  }>;
  getSkill(skillId: string): {
    id: string;
    name: string;
    description: string;
    source: "builtin" | "workspace";
    prompt: string;
    path?: string;
  } | undefined;
}

export interface HarnessToolRuntime {
  execute(session: ChatSession, toolCall: ToolCall): Promise<string>;
}

export type HarnessAssistantTurn = {
  cleanedText: string;
  toolCalls: ToolCall[];
};

export interface HarnessModelProvider {
  shouldUseStructuredTools(): boolean;
  streamAssistantTurn(
    session: ChatSession,
    workspaceContext: string,
    maxTokens: number,
  ): Promise<HarnessAssistantTurn>;
}

export type HarnessLoopSnapshot = {
  previousToolKeys: Set<string>;
  fileReadCounts: Map<string, number>;
  nudgedReadLoopFiles: Set<string>;
  repeatedToolRecoveryUsed: boolean;
  contextCompactions: number;
  consecutiveModelErrors: { count: number; maxRetries: number };
  consecutiveToolFailures: { count: number; maxRetries: number };
};

export type HarnessRunnerResult = {
  stoppedBecause:
    | "completed"
    | "pending_approval"
    | "loop_detected"
    | "tool_failures"
    | "max_turns";
  turnsCompleted: number;
};
