import type { BackgroundTaskSnapshot } from "./tool-executor";
import type { ChatSession } from "./types";

export function buildBackgroundTaskRestoreSnapshots(
  sessions: Array<Pick<ChatSession, "id" | "harnessState">>,
): BackgroundTaskSnapshot[] {
  return sessions.flatMap((session) =>
    session.harnessState.backgroundTasks.map((task) => ({
      ...task,
      sessionId: session.id,
    })),
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
