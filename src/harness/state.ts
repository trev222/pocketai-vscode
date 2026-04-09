import type {
  ChatSession,
  HarnessBackgroundTask,
  HarnessPendingApproval,
  HarnessPendingDiff,
  HarnessTodoItem,
  ToolCall,
} from "../types";
import type { HarnessEvent } from "./types";

const MAX_BACKGROUND_TASKS = 20;

export function createEmptyHarnessSessionState() {
  return {
    pendingApprovals: [],
    pendingDiffs: [],
    todoItems: [],
    backgroundTasks: [],
  };
}

export function applyHarnessEventToSession(
  session: ChatSession,
  event: HarnessEvent,
) {
  switch (event.type) {
    case "turn_started":
      session.harnessState.pendingApprovals = [];
      session.harnessState.pendingDiffs = [];
      return;
    case "tool_call_pending_approval":
      if (!event.toolCallId) return;
      upsertPendingApproval(session, {
        toolCallId: event.toolCallId,
        toolType: event.detail || "tool",
        filePath: findToolCall(session, event.toolCallId)?.filePath || "",
      });
      return;
    case "diff_ready":
      if (!event.toolCallId || !event.detail) return;
      upsertPendingDiff(session, {
        toolCallId: event.toolCallId,
        filePath: event.detail,
      });
      return;
    case "tool_call_started":
    case "tool_call_completed":
    case "tool_call_failed":
      if (!event.toolCallId) return;
      clearPendingToolState(session, event.toolCallId);
      return;
    case "turn_completed":
    case "turn_failed":
      session.harnessState.pendingApprovals = [];
      session.harnessState.pendingDiffs = [];
      return;
    default:
      return;
  }
}

export function syncHarnessPendingState(session: ChatSession) {
  const pendingApprovals: HarnessPendingApproval[] = [];
  const pendingDiffs: HarnessPendingDiff[] = [];

  for (const entry of session.transcript) {
    if (!entry.toolCalls?.length) continue;
    for (const toolCall of entry.toolCalls) {
      if (toolCall.status !== "pending") continue;
      pendingApprovals.push({
        toolCallId: toolCall.id,
        toolType: toolCall.type,
        filePath: toolCall.filePath,
      });
      if (toolCall.type === "edit_file" && toolCall.filePath) {
        pendingDiffs.push({
          toolCallId: toolCall.id,
          filePath: toolCall.filePath,
        });
      }
    }
  }

  session.harnessState.pendingApprovals = dedupeByToolCallId(pendingApprovals);
  session.harnessState.pendingDiffs = dedupeByToolCallId(pendingDiffs);
  session.harnessState.todoItems = extractTodoItems(session);
}

export function clearPendingToolState(
  session: ChatSession,
  toolCallId: string,
) {
  session.harnessState.pendingApprovals =
    session.harnessState.pendingApprovals.filter(
      (item) => item.toolCallId !== toolCallId,
    );
  session.harnessState.pendingDiffs = session.harnessState.pendingDiffs.filter(
    (item) => item.toolCallId !== toolCallId,
  );
}

export function upsertBackgroundTask(
  session: ChatSession,
  task: HarnessBackgroundTask,
) {
  const withoutCurrent = session.harnessState.backgroundTasks.filter(
    (item) => item.id !== task.id,
  );
  session.harnessState.backgroundTasks = [task, ...withoutCurrent]
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_BACKGROUND_TASKS);
}

function upsertPendingApproval(
  session: ChatSession,
  pendingApproval: HarnessPendingApproval,
) {
  const next = session.harnessState.pendingApprovals.filter(
    (item) => item.toolCallId !== pendingApproval.toolCallId,
  );
  next.push(pendingApproval);
  session.harnessState.pendingApprovals = next;
}

function upsertPendingDiff(session: ChatSession, pendingDiff: HarnessPendingDiff) {
  const next = session.harnessState.pendingDiffs.filter(
    (item) => item.toolCallId !== pendingDiff.toolCallId,
  );
  next.push(pendingDiff);
  session.harnessState.pendingDiffs = next;
}

function dedupeByToolCallId<T extends { toolCallId: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];

  for (const item of items) {
    if (seen.has(item.toolCallId)) continue;
    seen.add(item.toolCallId);
    result.push(item);
  }

  return result;
}

function findToolCall(session: ChatSession, toolCallId: string): ToolCall | undefined {
  for (const entry of session.transcript) {
    const toolCall = entry.toolCalls?.find((item) => item.id === toolCallId);
    if (toolCall) return toolCall;
  }
  return undefined;
}

function extractTodoItems(session: ChatSession): HarnessTodoItem[] {
  for (let entryIndex = session.transcript.length - 1; entryIndex >= 0; entryIndex--) {
    const entry = session.transcript[entryIndex];
    if (!entry.toolCalls?.length) continue;

    for (let toolIndex = entry.toolCalls.length - 1; toolIndex >= 0; toolIndex--) {
      const toolCall = entry.toolCalls[toolIndex];
      if (toolCall.type !== "todo_write" || toolCall.status !== "executed") {
        continue;
      }

      return (toolCall.todos || [])
        .map((todo) => {
          const status: HarnessTodoItem["status"] =
            todo.status === "completed"
              ? "completed"
              : todo.status === "in_progress"
                ? "in_progress"
                : "pending";

          return {
            content: String(todo.content || "").trim(),
            status,
          };
        })
        .filter((todo) => todo.content);
    }
  }

  return [];
}
