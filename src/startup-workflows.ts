import type { CommandTaskSnapshot } from "./harness/commands/runtime";
import type { ChatSession } from "./types";

export function buildBackgroundTaskRestoreSnapshots(
  sessions: Array<Pick<ChatSession, "id" | "harnessState">>,
): CommandTaskSnapshot[] {
  return sessions.flatMap((session) =>
    session.harnessState.backgroundTasks.map((task) => {
      const snapshot: CommandTaskSnapshot = {
        id: task.id,
        sessionId: session.id,
        command: task.command,
        kind: task.kind,
        status: task.status,
        outputPreview: task.outputPreview,
        updatedAt: task.updatedAt,
        cwd: task.cwd,
      };
      if (task.toolCallId) snapshot.toolCallId = task.toolCallId;
      if (typeof task.exitCode === "number") snapshot.exitCode = task.exitCode;
      if (typeof task.startedAt === "number") snapshot.startedAt = task.startedAt;
      if (typeof task.completedAt === "number") snapshot.completedAt = task.completedAt;
      return snapshot;
    }),
  );
}

export function shouldPersistStartupState(options: {
  createdInitialSession: boolean;
  normalizedRestoredTasks: boolean;
  endpointSelectionsSynced: boolean;
}): boolean {
  return (
    options.createdInitialSession ||
    options.normalizedRestoredTasks ||
    options.endpointSelectionsSynced
  );
}

export function resolveExistingSessionId(
  requestedSessionId: string,
  availableSessionIds: Iterable<string>,
  fallbackSessionId = "",
): string {
  const knownIds = Array.from(availableSessionIds);
  if (requestedSessionId && knownIds.includes(requestedSessionId)) {
    return requestedSessionId;
  }
  if (fallbackSessionId && knownIds.includes(fallbackSessionId)) {
    return fallbackSessionId;
  }
  return knownIds[0] ?? "";
}
