import type { ToolCall, ToolCallType } from "./types";
import { matchGlob } from "./helpers";

export type PermissionDecision = "allow" | "deny" | "default";

export type PermissionRuleContext = {
  toolType: string;
  toolArg: string;
  commandRisk?: string;
};

export function getToolPermissionArg(toolCall: ToolCall): string {
  const argByType: Partial<Record<ToolCallType, string>> = {
    web_search: toolCall.query || "",
    web_fetch: toolCall.url || "",
    run_command: toolCall.command || "",
    grep: toolCall.pattern || "",
    glob: toolCall.glob || "",
    git_commit: toolCall.commitMessage || "",
    task: toolCall.taskPrompt || toolCall.subagentName || "",
  };
  return argByType[toolCall.type] ?? toolCall.filePath;
}

export type RememberPermissionRuleKind =
  | "exact"
  | "command-risk"
  | "path";

export function buildRememberedPermissionRule(
  toolCall: ToolCall,
  kind: RememberPermissionRuleKind,
  commandRisk?: string,
): string {
  if (kind === "command-risk" && toolCall.type === "run_command" && commandRisk) {
    return `run_command:${commandRisk}(*)`;
  }

  if (kind === "path" && toolCall.filePath) {
    return `${toolCall.type}(${escapePermissionPattern(toolCall.filePath)})`;
  }

  return `${toolCall.type}(${escapePermissionPattern(getToolPermissionArg(toolCall))})`;
}

function escapePermissionPattern(value: string): string {
  const normalized = String(value || "").trim();
  return normalized || "*";
}

export function evaluatePermissionRules(
  allowRules: readonly string[],
  denyRules: readonly string[],
  context: PermissionRuleContext,
): PermissionDecision {
  if (denyRules.some((rule) => matchesPermissionRule(rule, context))) {
    return "deny";
  }
  if (allowRules.some((rule) => matchesPermissionRule(rule, context))) {
    return "allow";
  }
  return "default";
}

export function matchesPermissionRule(
  rule: string,
  context: PermissionRuleContext,
): boolean {
  const parsed = parsePermissionRule(rule);
  if (!parsed || parsed.toolType !== context.toolType) return false;
  if (parsed.qualifier) {
    if (context.toolType !== "run_command") return false;
    if (parsed.qualifier !== context.commandRisk) return false;
  }
  return matchGlob(parsed.pattern, context.toolArg);
}

function parsePermissionRule(rule: string):
  | { toolType: string; qualifier?: string; pattern: string }
  | undefined {
  const match = rule
    .trim()
    .match(/^([A-Za-z_][\w-]*)(?::([A-Za-z_][\w-]*))?\((.*)\)$/);
  if (!match) return undefined;
  return {
    toolType: match[1],
    qualifier: match[2],
    pattern: match[3],
  };
}
