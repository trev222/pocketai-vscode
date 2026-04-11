import type { ChatEntry, ToolCall } from "./types";

const REJECTED_TOOL_RESULT = "Edit rejected by user.";
const REJECTED_TOOL_MESSAGE = "User rejected this change.";

export function findToolCallInTranscript(
  transcript: Pick<ChatEntry, "toolCalls">[],
  toolCallId: string,
): {
  entry: Pick<ChatEntry, "toolCalls">;
  toolCall: ToolCall;
} | undefined {
  for (const entry of transcript) {
    if (!entry.toolCalls) continue;
    for (const toolCall of entry.toolCalls) {
      if (toolCall.id === toolCallId) {
        return { entry, toolCall };
      }
    }
  }

  return undefined;
}

export function buildToolExecutionErrorMessage(error: unknown): string {
  return error instanceof Error
    ? `Tool execution error: ${error.message}`
    : "Tool execution error.";
}

export function applyExecutedToolCallResult(
  toolCall: ToolCall,
  transcript: ChatEntry[],
  result: string,
) {
  toolCall.result = result;
  toolCall.status = "executed";
  transcript.push({ role: "tool", content: result });
}

export function applyErroredToolCallResult(
  toolCall: ToolCall,
  transcript: ChatEntry[],
  error: unknown,
) {
  const result = buildToolExecutionErrorMessage(error);
  toolCall.result = result;
  toolCall.status = "error";
  transcript.push({ role: "tool", content: result });
}

export function applyRejectedToolCallResult(
  toolCall: ToolCall,
  transcript: ChatEntry[],
) {
  toolCall.result = REJECTED_TOOL_RESULT;
  toolCall.status = "rejected";
  transcript.push({
    role: "tool",
    content: REJECTED_TOOL_MESSAGE,
  });
}

export function areToolCallsResolved(toolCalls: ToolCall[] | undefined): boolean {
  if (!toolCalls?.length) return false;
  return toolCalls.every(
    (toolCall) =>
      toolCall.status === "executed" ||
      toolCall.status === "rejected" ||
      toolCall.status === "error",
  );
}

export function shouldContinueAfterToolResolution(
  toolCalls: ToolCall[] | undefined,
  sessionBusy: boolean,
): boolean {
  return areToolCallsResolved(toolCalls) && !sessionBusy;
}
