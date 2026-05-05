import type {
  ChatEntry,
  ChatSession,
  HarnessBackgroundTask,
  PersistedChatSession,
} from "./types";
import { createEmptyHarnessSessionState } from "./harness/state";
import { sortSessionsByRecency } from "./session-workflows";

const MAX_PERSISTED_BACKGROUND_TASKS = 20;
const MAX_PERSISTED_TASK_OUTPUT = 4000;

export function serializeSessionForPersistence(
  session: ChatSession,
): PersistedChatSession {
  return {
    id: session.id,
    title: session.title,
    transcript: session.transcript.map(sanitizeTranscriptEntryForPersistence),
    selectedModel: session.selectedModel,
    selectedReasoningEffort: session.selectedReasoningEffort,
    selectedEndpoint: session.selectedEndpoint,
    worktreeRoot: session.worktreeRoot,
    status: session.status,
    updatedAt: session.updatedAt,
    mode: session.mode,
    cumulativeTokens: session.cumulativeTokens,
    backgroundTasks: session.harnessState.backgroundTasks.map((task) => ({
      id: task.id,
      command: task.command,
      status: task.status,
      outputPreview:
        task.outputPreview.length > MAX_PERSISTED_TASK_OUTPUT
          ? task.outputPreview.slice(-MAX_PERSISTED_TASK_OUTPUT)
          : task.outputPreview,
      exitCode: task.exitCode,
      updatedAt: task.updatedAt,
      cwd: task.cwd,
    })),
  };
}

export function restoreSessionFromPersistence(
  session: PersistedChatSession,
): {
  session: ChatSession;
  hadRunningBackgroundTasks: boolean;
} {
  const hadRunningBackgroundTasks =
    session.backgroundTasks?.some((task) => task.status === "running") ?? false;

  return {
    hadRunningBackgroundTasks,
    session: {
      ...session,
      selectedReasoningEffort:
        (session as ChatSession).selectedReasoningEffort ?? "",
      worktreeRoot: (session as ChatSession).worktreeRoot ?? "",
      busy: false,
      checkpoints: [],
      cumulativeTokens:
        (session as ChatSession).cumulativeTokens ?? {
          prompt: 0,
          completion: 0,
        },
      activeSkills: [],
      harnessState: {
        ...createEmptyHarnessSessionState(),
        backgroundTasks: restorePersistedBackgroundTasks(session.backgroundTasks),
      },
    },
  };
}

export function restorePersistedBackgroundTasks(
  tasks: HarnessBackgroundTask[] | undefined,
): HarnessBackgroundTask[] {
  if (!Array.isArray(tasks)) return [];

  return tasks
    .map((task) => {
      const status =
        task.status === "running" ? "interrupted" : task.status;
      const note =
        task.status === "running"
          ? "[Interrupted after PocketAI reload]"
          : "";
      const outputPreview = [note, String(task.outputPreview || "").trim()]
        .filter(Boolean)
        .join("\n");

      return {
        id: String(task.id || "").trim(),
        command: String(task.command || "").trim(),
        status,
        outputPreview,
        exitCode:
          typeof task.exitCode === "number" ? task.exitCode : undefined,
        updatedAt:
          typeof task.updatedAt === "number" ? task.updatedAt : Date.now(),
        cwd: typeof task.cwd === "string" ? task.cwd.trim() : "",
      } satisfies HarnessBackgroundTask;
    })
    .filter((task) => task.id && task.command)
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, MAX_PERSISTED_BACKGROUND_TASKS);
}

export function deriveLastSelectedModel(
  storedLastSelectedModel: string | undefined,
  sessions: ChatSession[],
): string {
  const normalizedStored = (storedLastSelectedModel ?? "").trim();
  if (normalizedStored) {
    return normalizedStored;
  }

  return sortSessionsByRecency(sessions).find((session) => session.selectedModel)
    ?.selectedModel ?? "";
}

export function getPreferredModelForNewSession(
  models: string[],
  lastSelectedModel: string,
  sessions: ChatSession[],
): string {
  if (!models.length) return "";
  if (lastSelectedModel && models.includes(lastSelectedModel)) {
    return lastSelectedModel;
  }

  const recentMatch = sortSessionsByRecency(sessions).find(
    (session) => session.selectedModel && models.includes(session.selectedModel),
  );
  return recentMatch?.selectedModel || models[0] || "";
}

function sanitizeTranscriptEntryForPersistence(entry: ChatEntry): ChatEntry {
  const nextEntry = { ...entry };
  if (entry.images?.length) {
    nextEntry.images = entry.images.map((img) => ({ ...img, data: "" }));
  }
  if (entry.files?.length) {
    nextEntry.files = entry.files.map((file) => ({ ...file, content: "" }));
  }
  return nextEntry;
}
