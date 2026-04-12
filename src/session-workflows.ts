import { isDefaultSessionTitle, summarizePrompt } from "./helpers";
import type { ChatEntry, ChatSession, SessionSummary } from "./types";

type SessionRecencyLike = {
  id: string;
  updatedAt: number;
};

export function sortSessionsByRecency<T extends SessionRecencyLike>(sessions: T[]): T[] {
  return [...sessions].sort((a, b) => b.updatedAt - a.updatedAt);
}

export function buildSessionSummaries(
  sessions: Array<Pick<ChatSession, "id" | "title" | "updatedAt" | "transcript">>,
): SessionSummary[] {
  return sortSessionsByRecency(sessions)
    .filter((session) => hasSessionStarted(session.transcript))
    .map((session) => ({
      id: session.id,
      title: session.title,
      updatedAt: session.updatedAt,
    }));
}

export function hasSessionStarted(transcript: ChatEntry[]): boolean {
  return transcript.some((entry) => entry.role === "user");
}

export function resolveSidebarSessionId(
  sidebarSessionId: string,
  sessions: SessionRecencyLike[],
): string {
  if (sessions.some((session) => session.id === sidebarSessionId)) {
    return sidebarSessionId;
  }

  return sortSessionsByRecency(sessions)[0]?.id ?? "";
}

export function resolveSessionDeletion(
  deletedSessionId: string,
  sidebarSessionId: string,
  remainingSessions: SessionRecencyLike[],
): {
  fallbackSessionId?: string;
  nextSidebarSessionId: string;
} {
  const fallbackSessionId = sortSessionsByRecency(remainingSessions)[0]?.id;

  return {
    fallbackSessionId,
    nextSidebarSessionId:
      sidebarSessionId === deletedSessionId
        ? fallbackSessionId ?? ""
        : sidebarSessionId,
  };
}

export function normalizeRenamedSessionTitle(title: string): string {
  return title.trim().replace(/\s+/g, " ").slice(0, 120);
}

export function resolveRenamedSessionTitle(
  currentTitle: string,
  nextTitleInput: string,
): string | undefined {
  const normalized = normalizeRenamedSessionTitle(nextTitleInput);
  if (!normalized || normalized === currentTitle) {
    return undefined;
  }

  return normalized;
}

export function resolveAutoSessionTitle(
  currentTitle: string,
  prompt: string,
  fallbackNumber: number,
): string | undefined {
  if (!isDefaultSessionTitle(currentTitle)) {
    return undefined;
  }

  const nextTitle = summarizePrompt(prompt, fallbackNumber);
  return nextTitle === currentTitle ? undefined : nextTitle;
}
