import { normalizeBaseUrl } from "./helpers";
import type {
  EndpointHealth,
  HarnessBackgroundTask,
  HarnessRuntimeHealth,
  HarnessTodoItem,
  InteractionMode,
  SessionActiveSkill,
} from "./types";
import type { EndpointProviderKind } from "./provider-capabilities";

export type JobsCommandAction =
  | { type: "list" }
  | { type: "clear" }
  | { type: "cancel"; taskId: string }
  | { type: "rerun"; taskId: string }
  | { type: "details"; taskId: string };

export function parseJobsCommandArg(arg: string): JobsCommandAction {
  const trimmed = arg.trim();
  if (!trimmed) {
    return { type: "list" };
  }

  if (/^(?:clear|clean|prune)$/i.test(trimmed)) {
    return { type: "clear" };
  }

  const rerunMatch = trimmed.match(/^(?:rerun|retry|restart)\s+(.+)$/i);
  if (rerunMatch) {
    return { type: "rerun", taskId: rerunMatch[1].trim() };
  }

  const cancelMatch = trimmed.match(/^(?:cancel|stop|kill)\s+(.+)$/i);
  if (cancelMatch) {
    return { type: "cancel", taskId: cancelMatch[1].trim() };
  }

  return { type: "details", taskId: trimmed };
}

export function findEndpointMatch(
  endpoints: EndpointHealth[],
  arg: string,
): EndpointHealth | undefined {
  const normalizedArg = arg.trim();
  if (!normalizedArg) return undefined;

  return endpoints.find(
    (endpoint) =>
      endpoint.name.toLowerCase() === normalizedArg.toLowerCase() ||
      endpoint.url === normalizeBaseUrl(normalizedArg),
  );
}

export function formatEndpointList(
  endpoints: EndpointHealth[],
  activeUrl: string,
): string {
  return `Available endpoints:\n${endpoints
    .map((endpoint) => {
      const marker = endpoint.url === activeUrl ? "*" : "-";
      const health = endpoint.healthy ? "healthy" : "unreachable";
      return `${marker} **${endpoint.name}** — \`${endpoint.url}\` (${health})`;
    })
    .join("\n")}`;
}

export function formatTrackedTasks(todoItems: HarnessTodoItem[]): string {
  return `Tracked tasks:\n${todoItems
    .map((todo, index) => {
      const icon =
        todo.status === "completed"
          ? "[x]"
          : todo.status === "in_progress"
            ? "[~]"
            : "[ ]";
      return `${index + 1}. ${icon} ${todo.content}`;
    })
    .join("\n")}`;
}

export function formatBackgroundTaskList(
  backgroundTasks: HarnessBackgroundTask[],
): string {
  return [
    "Background commands:",
    backgroundTasks
      .map(
        (task) =>
          `- \`${task.id}\` [${task.status}] \`${task.command}\``,
      )
      .join("\n"),
    "",
    "Use `/jobs <taskId>` to inspect output, `/jobs cancel <taskId>` to stop a running job, `/jobs rerun <taskId>` to relaunch a finished one, or `/jobs clear` to remove finished jobs from this chat.",
  ].join("\n");
}

export function buildDoctorReport(options: {
  endpointName: string;
  endpointUrl: string;
  providerKind: EndpointProviderKind;
  healthy: boolean;
  selectedModel: string;
  mode: InteractionMode;
  supportsStructuredTools: boolean;
  supportsReasoningEffort: boolean;
  activeSkills: SessionActiveSkill[];
  todoItems: HarnessTodoItem[];
  pendingApprovalCount: number;
  backgroundTaskCount: number;
  estimatedTokens: number;
  contextWindowSize: number;
  runtimeHealth: HarnessRuntimeHealth;
}): string {
  const lines = [
    `- Endpoint: **${options.endpointName || "Unknown"}**`,
    `- URL: \`${options.endpointUrl}\``,
    `- Provider: \`${options.providerKind}\``,
    `- Healthy: ${options.healthy ? "yes" : "no"}`,
    `- Model: \`${options.selectedModel || "(auto)"}\``,
    `- Mode: \`${options.mode}\``,
    `- Structured tools: ${options.supportsStructuredTools ? "enabled" : "disabled"}`,
    `- Reasoning support: ${options.supportsReasoningEffort ? "yes" : "no"}`,
    `- Active skills: ${options.activeSkills.length ? options.activeSkills.map((skill) => skill.name).join(", ") : "none"}`,
    `- Tracked tasks: ${options.todoItems.length}`,
    `- Pending approvals: ${options.pendingApprovalCount}`,
    `- Background commands: ${options.backgroundTaskCount}`,
    `- Estimated context tokens: ${options.estimatedTokens.toLocaleString()} / ${options.contextWindowSize.toLocaleString()}`,
    `- Health summary: ${options.runtimeHealth.summary}`,
  ];

  return [
    "PocketAI doctor:",
    lines.join("\n"),
    "",
    "Issues:",
    options.runtimeHealth.issues.length
      ? options.runtimeHealth.issues.map((issue) => `- ${issue}`).join("\n")
      : "- None detected.",
    "",
    "Suggested next actions:",
    options.runtimeHealth.suggestions.length
      ? options.runtimeHealth.suggestions.map((suggestion) => `- ${suggestion}`).join("\n")
      : "- No action needed right now.",
  ].join("\n");
}

export function getSessionTitlesStatus(sessionTitles: string[]): string {
  return `Sessions: ${sessionTitles.join(", ")}`;
}
