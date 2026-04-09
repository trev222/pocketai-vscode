import { NON_DESTRUCTIVE_TOOL_TYPES } from "../constants";
import type {
  InteractionMode,
  ToolCall,
  ToolCallType,
} from "../types";
import type {
  HarnessApprovalDecision,
  HarnessToolRisk,
} from "./types";

export function classifyToolRisk(
  toolName: ToolCallType | string,
  isMcp = false,
): HarnessToolRisk {
  if (isMcp) return "external";
  if (toolName === "git_commit") return "destructive";
  if (toolName === "run_command") return "caution";
  if (NON_DESTRUCTIVE_TOOL_TYPES.has(toolName as ToolCallType)) return "safe";
  return "caution";
}

/**
 * Mirrors PocketAI's current execution semantics so the harness extraction does
 * not change user-visible behavior in the first migration slice.
 */
export function getToolApprovalDecision(
  mode: InteractionMode,
  toolCall: ToolCall,
  descriptorOrIsMcp?: { approvalPolicy: "always-auto" | "mode-auto" } | boolean,
): HarnessApprovalDecision {
  if (
    descriptorOrIsMcp &&
    typeof descriptorOrIsMcp === "object"
  ) {
    if (descriptorOrIsMcp.approvalPolicy === "always-auto") {
      return "auto-execute";
    }
    return mode === "auto" ? "auto-execute" : "requires-approval";
  }

  const isMcp = descriptorOrIsMcp === true;
  if (isMcp) {
    return mode === "auto" ? "auto-execute" : "requires-approval";
  }

  if (toolCall.type === "run_command" || toolCall.type === "git_commit") {
    return mode === "auto" ? "auto-execute" : "requires-approval";
  }

  return NON_DESTRUCTIVE_TOOL_TYPES.has(toolCall.type) || mode === "auto"
    ? "auto-execute"
    : "requires-approval";
}

export function shouldAutoExecuteTool(
  mode: InteractionMode,
  toolCall: ToolCall,
  descriptorOrIsMcp?: { approvalPolicy: "always-auto" | "mode-auto" } | boolean,
): boolean {
  return (
    getToolApprovalDecision(mode, toolCall, descriptorOrIsMcp) ===
    "auto-execute"
  );
}
