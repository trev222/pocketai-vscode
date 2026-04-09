import type { EndpointManager } from "../endpoint-manager";
import type { ChatSession, HarnessRuntimeHealth } from "../types";

export function buildHarnessRuntimeHealth(options: {
  session: ChatSession;
  endpointMgr: EndpointManager;
  estimatedTokens: number;
  contextWindowSize: number;
}): HarnessRuntimeHealth {
  const { session, endpointMgr, estimatedTokens, contextWindowSize } = options;
  const health = endpointMgr.endpointHealthMap.get(endpointMgr.activeEndpointUrl);
  const capabilities = endpointMgr.getActiveEndpointCapabilities();
  const pendingApprovals = session.harnessState.pendingApprovals || [];
  const backgroundTasks = session.harnessState.backgroundTasks || [];
  const runningTasks = backgroundTasks.filter((task) => task.status === "running");
  const failedTasks = backgroundTasks.filter((task) => task.status === "failed");
  const interruptedTasks = backgroundTasks.filter((task) => task.status === "interrupted");

  const issues: string[] = [];
  const suggestions: string[] = [];
  const actions = new Set<HarnessRuntimeHealth["actions"][number]>();
  let level: HarnessRuntimeHealth["level"] = "ok";

  if (!health?.healthy) {
    level = "error";
    issues.push(
      `Active endpoint is not healthy${health?.error ? `: ${health.error}` : "."}`,
    );
    suggestions.push("Check the endpoint server, or switch endpoints.");
    actions.add("refresh-models");
  }

  if (!endpointMgr.models.length) {
    level = level === "error" ? "error" : "warning";
    issues.push("No models are currently loaded for the active endpoint.");
    suggestions.push("Refresh models or verify the endpoint is exposing chat models.");
    actions.add("refresh-models");
  }

  if (estimatedTokens > contextWindowSize * 0.75) {
    level = level === "error" ? "error" : "warning";
    issues.push("Conversation context is getting full.");
    suggestions.push("Run `/compact` before the next large request.");
    actions.add("compact");
  }

  if (pendingApprovals.length) {
    level = level === "error" ? "error" : "warning";
    issues.push(
      `${pendingApprovals.length} tool approval${pendingApprovals.length === 1 ? "" : "s"} waiting.`,
    );
    suggestions.push("Review the pending approval cards in chat.");
  }

  if (runningTasks.length) {
    level = level === "error" ? "error" : "warning";
    issues.push(
      `${runningTasks.length} background command${runningTasks.length === 1 ? " is" : "s are"} still running.`,
    );
    suggestions.push("Wait for running jobs to finish or cancel them from the harness pane.");
    actions.add("show-jobs");
  }

  if (failedTasks.length) {
    level = "error";
    issues.push(
      `${failedTasks.length} background command${failedTasks.length === 1 ? " has" : "s have"} failed recently.`,
    );
    suggestions.push("Inspect recent job output and fix the failing command path.");
    actions.add("show-jobs");
  }

  if (interruptedTasks.length) {
    level = level === "error" ? "error" : "warning";
    issues.push(
      `${interruptedTasks.length} background command${interruptedTasks.length === 1 ? " was" : "s were"} interrupted by reload or restart.`,
    );
    suggestions.push("Inspect interrupted jobs and rerun any work that still matters.");
    actions.add("show-jobs");
  }

  if (!capabilities.supportsStructuredTools) {
    suggestions.push("Structured tool calling is unavailable on this provider, so expect more text-first turns.");
  }

  const summary =
    level === "error"
      ? "Harness attention needed."
      : level === "warning"
        ? "Harness has pending work."
        : "Harness looks healthy.";

  return {
    level,
    summary,
    issues,
    suggestions,
    actions: Array.from(actions),
  };
}
