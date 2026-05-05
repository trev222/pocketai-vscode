import { NON_DESTRUCTIVE_TOOL_TYPES } from "../constants";
import type {
  InteractionMode,
  ToolCall,
  ToolCallType,
} from "../types";
import type {
  HarnessApprovalDecision,
  HarnessToolApprovalPolicy,
  HarnessToolRisk,
} from "./types";

export function classifyToolRisk(
  toolName: ToolCallType | string,
  isMcp = false,
): HarnessToolRisk {
  if (isMcp) return "external";
  if (toolName === "git_commit") return "destructive";
  if (toolName === "memory_write" || toolName === "memory_delete") return "caution";
  if (toolName === "run_command") return "caution";
  if (NON_DESTRUCTIVE_TOOL_TYPES.has(toolName as ToolCallType)) return "safe";
  return "caution";
}

export type ShellCommandRisk =
  | "safe"
  | "caution"
  | "destructive"
  | "long-running"
  | "network";

const SAFE_COMMAND_PATTERNS = [
  /^(?:npm|pnpm|yarn|bun)\s+(?:test|run\s+(?:test|typecheck|lint|build)\b)/,
  /^npx\s+(?:tsc|eslint|prettier)\b/,
  /^node\s+--test\b/,
  /^cargo\s+(?:test|check|clippy|fmt\s+--check)\b/,
  /^go\s+test\b/,
  /^(?:pytest|ruff\s+check|mypy)\b/,
  /^git\s+(?:status|diff|log|show|branch\s+--show-current)\b/,
  /^(?:pwd|date|whoami|uname)(?:\s|$)/,
];

const NETWORK_COMMAND_PATTERN =
  /\b(?:npm|pnpm|yarn|bun)\s+(?:install|add|dlx|create|upgrade|update)\b|\b(?:curl|wget|ssh|scp|rsync|gh\s+repo|git\s+(?:clone|pull|fetch|push))\b/;

const LONG_RUNNING_COMMAND_PATTERN =
  /\b(?:npm|pnpm|yarn|bun)\s+run\s+(?:dev|serve|start|watch)\b|\b(?:vite|next\s+dev|webpack\s+serve|tail\s+-f)\b/;

const DESTRUCTIVE_COMMAND_PATTERN =
  /(?:^|[\s;&|()])(?:rm\s+-[^\n]*[rf]|rm\s+[^-\n]|\bsudo\b|\bchmod\b|\bchown\b|\bdd\b|\bmkfs\b|\bgit\s+reset\b|\bgit\s+checkout\b|\bgit\s+clean\b|\bgit\s+push\b|\bkill(?:all)?\b|\bpkill\b)/;

export function classifyShellCommandRisk(command: string): ShellCommandRisk {
  const normalized = command.trim().replace(/\s+/g, " ");
  if (!normalized) return "caution";
  if (DESTRUCTIVE_COMMAND_PATTERN.test(normalized)) return "destructive";
  if (NETWORK_COMMAND_PATTERN.test(normalized)) return "network";
  if (LONG_RUNNING_COMMAND_PATTERN.test(normalized)) return "long-running";
  if (SAFE_COMMAND_PATTERNS.some((pattern) => pattern.test(normalized))) {
    return "safe";
  }
  return "caution";
}

/**
 * Mirrors PocketAI's current execution semantics so the harness extraction does
 * not change user-visible behavior in the first migration slice.
 */
export function getToolApprovalDecision(
  mode: InteractionMode,
  toolCall: ToolCall,
  descriptorOrIsMcp?: { approvalPolicy: HarnessToolApprovalPolicy } | boolean,
): HarnessApprovalDecision {
  if (
    descriptorOrIsMcp &&
    typeof descriptorOrIsMcp === "object"
  ) {
    if (descriptorOrIsMcp.approvalPolicy === "always-auto") {
      return "auto-execute";
    }
    if (descriptorOrIsMcp.approvalPolicy === "always-ask") {
      return "requires-approval";
    }
    if (toolCall.type === "run_command") {
      return mode === "auto" &&
        classifyShellCommandRisk(toolCall.command || "") === "safe"
        ? "auto-execute"
        : "requires-approval";
    }
    return mode === "auto" ? "auto-execute" : "requires-approval";
  }

  const isMcp = descriptorOrIsMcp === true;
  if (isMcp) {
    return mode === "auto" ? "auto-execute" : "requires-approval";
  }

  if (toolCall.type === "run_command" || toolCall.type === "git_commit") {
    if (toolCall.type === "run_command") {
      return mode === "auto" &&
        classifyShellCommandRisk(toolCall.command || "") === "safe"
        ? "auto-execute"
        : "requires-approval";
    }
    return "requires-approval";
  }

  return NON_DESTRUCTIVE_TOOL_TYPES.has(toolCall.type) || mode === "auto"
    ? "auto-execute"
    : "requires-approval";
}

export function shouldAutoExecuteTool(
  mode: InteractionMode,
  toolCall: ToolCall,
  descriptorOrIsMcp?: { approvalPolicy: HarnessToolApprovalPolicy } | boolean,
): boolean {
  return (
    getToolApprovalDecision(mode, toolCall, descriptorOrIsMcp) ===
    "auto-execute"
  );
}
