import { clearSessionSkills } from "./harness/skills/active";
import {
  buildClearedBackgroundTasksMessage,
  getFinishedBackgroundTaskIds,
  getInteractionModeStatus,
} from "./chat-workflows";
import {
  findEndpointMatch,
  formatBackgroundTaskList,
  formatEndpointList,
  formatTrackedTasks,
  getSessionTitlesStatus,
  parseJobsCommandArg,
  type JobsCommandAction,
} from "./slash-command-utils";
import type {
  ChatEntry,
  ChatSession,
  EndpointHealth,
  HarnessBackgroundTask,
  HarnessTodoItem,
  InteractionMode,
} from "./types";

export function buildSlashHelpContent(skillLines: string[]): string {
  const commandLines = [
    "- `/ask`, `/auto`, `/plan` — switch chat mode quickly",
    "- `/mode <ask|auto|plan>` — switch chat mode explicitly",
    "- `/model [name]` — list models or switch the current chat model",
    "- `/endpoint [name|url]` — list endpoints or switch the active endpoint",
    "- `/skills [query]` — list skills, optionally filtered",
    "- `/tasks` or `/todo` — show the current tracked task list",
    "- `/jobs` — show tracked background commands",
    "- `/jobs cancel <taskId>` — cancel a background command",
    "- `/refresh` — refresh models for the active endpoint",
    "- `/status` or `/doctor` — show harness and endpoint health",
    "- `/compact` — compact the current chat context",
    "- `/tokens` — show token usage for this chat",
    "- `/sessions` — list saved chat sessions",
    "- `/fork` — fork the current chat into a new one",
    "- `/branch [name]` — inspect or switch git branches",
    "- `/worktree <name|status|exit>` — isolate this chat in a git worktree",
    "- `/memory [query|clear]` — inspect or clear saved memory",
    "- `/remember <text>` — save a memory",
    "- `/clear` — clear this chat",
  ];

  return [
    "PocketAI slash commands:",
    commandLines.join("\n"),
    "",
    "Skill shortcuts:",
    skillLines.join("\n"),
  ].join("\n");
}

export function applyQuickModeSlashCommand(
  session: ChatSession,
  mode: InteractionMode,
) {
  session.mode = mode;
  session.status = getInteractionModeStatus(mode);
}

export function applyExplicitModeSlashCommand(
  session: ChatSession,
  arg: string,
) {
  if (arg === "ask" || arg === "auto" || arg === "plan") {
    applyQuickModeSlashCommand(session, arg);
    return true;
  }

  session.status = "Usage: /mode <ask|auto|plan>";
  return false;
}

export function applyClearSlashCommand(session: ChatSession) {
  session.transcript = [];
  clearSessionSkills(session);
  session.status = "Cleared.";
}

export function applyModelSlashCommand(options: {
  session: ChatSession;
  arg: string;
  availableModels: string[];
  setSessionModel: (modelId: string) => void;
}) {
  if (options.arg && options.availableModels.includes(options.arg)) {
    options.setSessionModel(options.arg);
    options.session.status = `Model switched to ${options.arg}`;
    return { changedModel: true };
  }

  options.session.status = options.arg
    ? `Model "${options.arg}" not found. Available: ${options.availableModels.join(", ")}`
    : `Available models: ${options.availableModels.join(", ")}`;
  return { changedModel: false };
}

export type EndpointSlashOutcome =
  | {
      kind: "list";
      transcriptEntry: ChatEntry;
      status: string;
    }
  | {
      kind: "switch";
      endpointUrl: string;
      transcriptEntry: ChatEntry;
      status: string;
    }
  | {
      kind: "missing";
      status: string;
    };

export function resolveEndpointSlashCommand(options: {
  arg: string;
  endpoints: EndpointHealth[];
  activeUrl: string;
}): EndpointSlashOutcome {
  if (options.arg) {
    const match = findEndpointMatch(options.endpoints, options.arg);
    if (match) {
      return {
        kind: "switch",
        endpointUrl: match.url,
        transcriptEntry: {
          role: "tool",
          content: `Switched endpoint to **${match.name}** (\`${match.url}\`).`,
        },
        status: `Endpoint switch requested: ${match.name}`,
      };
    }

    return {
      kind: "missing",
      status: `Endpoint "${options.arg}" not found.`,
    };
  }

  return {
    kind: "list",
    transcriptEntry: {
      role: "tool",
      content: formatEndpointList(options.endpoints, options.activeUrl),
    },
    status: `${options.endpoints.length} endpoint${options.endpoints.length === 1 ? "" : "s"} available.`,
  };
}

export function applySessionsSlashCommand(
  session: ChatSession,
  sessionTitles: string[],
) {
  session.status = getSessionTitlesStatus(sessionTitles);
}

export function applyTokensSlashCommand(session: ChatSession) {
  const total = session.cumulativeTokens.prompt + session.cumulativeTokens.completion;
  session.status = total > 0
    ? `Session tokens — Prompt: ${session.cumulativeTokens.prompt.toLocaleString()}, Completion: ${session.cumulativeTokens.completion.toLocaleString()}, Total: ${total.toLocaleString()}`
    : "No tokens used yet in this session.";
}

export function buildRefreshSlashStatus(
  endpointName: string,
  modelCount: number,
): string {
  return modelCount
    ? `Refreshed models for ${endpointName}.`
    : `Refreshed ${endpointName}, but no models were found.`;
}

export function applyTodoSlashCommand(
  session: ChatSession,
  todoItems: HarnessTodoItem[],
): { handled: boolean } {
  if (!todoItems.length) {
    session.status = "No tracked tasks yet.";
    return { handled: false };
  }

  session.transcript.push({
    role: "tool",
    content: formatTrackedTasks(todoItems),
  });
  session.status = `${todoItems.length} tracked task${todoItems.length === 1 ? "" : "s"}.`;
  return { handled: true };
}

export type JobsSlashOutcome =
  | { kind: "none"; status: string }
  | { kind: "list"; transcriptEntry: ChatEntry; status: string }
  | { kind: "clear-none"; status: string }
  | {
      kind: "clear";
      staleTaskIds: string[];
      remainingTasks: HarnessBackgroundTask[];
      transcriptEntry: ChatEntry;
      status: string;
    }
  | { kind: "cancel"; taskId: string }
  | { kind: "rerun"; taskId: string }
  | { kind: "details"; taskId: string; status: string };

export function resolveJobsSlashCommand(
  arg: string,
  backgroundTasks: HarnessBackgroundTask[],
): JobsSlashOutcome {
  const action = parseJobsCommandArg(arg);

  if (action.type === "clear") {
    const staleTaskIds = getFinishedBackgroundTaskIds(backgroundTasks);
    if (!staleTaskIds.length) {
      return {
        kind: "clear-none",
        status: "No finished background commands to clear.",
      };
    }
    const status = buildClearedBackgroundTasksMessage(staleTaskIds.length);
    return {
      kind: "clear",
      staleTaskIds,
      remainingTasks: backgroundTasks.filter((task) => task.status === "running"),
      transcriptEntry: {
        role: "tool",
        content: status,
      },
      status,
    };
  }

  if (action.type === "rerun") {
    return {
      kind: "rerun",
      taskId: action.taskId,
    };
  }

  if (action.type === "cancel") {
    return {
      kind: "cancel",
      taskId: action.taskId,
    };
  }

  if (action.type === "details") {
    return {
      kind: "details",
      taskId: action.taskId,
      status: `Background task details: ${action.taskId}`,
    };
  }

  if (!backgroundTasks.length) {
    return {
      kind: "none",
      status: "No background commands tracked in this chat.",
    };
  }

  return {
    kind: "list",
    transcriptEntry: {
      role: "tool",
      content: formatBackgroundTaskList(backgroundTasks),
    },
    status: `${backgroundTasks.length} background command${backgroundTasks.length === 1 ? "" : "s"} tracked.`,
  };
}

export { parseJobsCommandArg, type JobsCommandAction };
