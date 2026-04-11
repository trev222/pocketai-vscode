import type {
  ChatEntry,
  ChatSession,
  InteractionMode,
  SessionSummary,
} from "./types";

export function getInteractionModeStatus(mode: InteractionMode): string {
  const labels: Record<InteractionMode, string> = {
    ask: "Ask mode — I'll ask before making changes.",
    auto: "Auto mode — changes applied automatically.",
    plan: "Plan mode — I'll describe changes before making them.",
  };
  return labels[mode];
}

export function buildSessionExportMarkdown(
  transcript: Pick<ChatEntry, "role" | "content">[],
): string {
  return transcript
    .filter((entry) => entry.role === "user" || entry.role === "assistant")
    .map(
      (entry) =>
        `## ${entry.role === "user" ? "You" : "PocketAI"}\n\n${entry.content}\n`,
    )
    .join("\n");
}

export function buildSessionExportFileName(title: string): string {
  return `${title.replace(/[^a-zA-Z0-9]/g, "_")}.md`;
}

export function filterSessionSummariesByQuery(
  query: string,
  summaries: SessionSummary[],
  sessions: Iterable<Pick<ChatSession, "id" | "transcript">>,
): SessionSummary[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return summaries;
  }

  const transcriptsBySessionId = new Map(
    Array.from(sessions, (session) => [session.id, session.transcript]),
  );

  return summaries.filter((summary) => {
    if (summary.title.toLowerCase().includes(normalizedQuery)) {
      return true;
    }

    const transcript = transcriptsBySessionId.get(summary.id) ?? [];
    return transcript.some((entry) =>
      entry.content.toLowerCase().includes(normalizedQuery),
    );
  });
}

export function getFinishedBackgroundTaskIds(
  tasks: Array<{ id: string; status: string }>,
): string[] {
  return tasks
    .filter((task) => task.status !== "running")
    .map((task) => task.id);
}

export function buildClearedBackgroundTasksMessage(count: number): string {
  return `Cleared ${count} finished background command${count === 1 ? "" : "s"}.`;
}
