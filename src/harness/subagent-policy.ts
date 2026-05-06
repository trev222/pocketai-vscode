import * as path from "path";
import type { ChatSession, ToolCallType } from "../types";
import { isInsidePath } from "../helpers";

export const READONLY_SUBAGENT_TOOL_TYPES: ReadonlySet<ToolCallType> = new Set([
  "list_tools",
  "list_skills",
  "run_skill",
  "diagnostics",
  "open_file",
  "open_definition",
  "workspace_symbols",
  "hover_symbol",
  "code_actions",
  "go_to_definition",
  "find_references",
  "document_symbols",
  "read_file",
  "web_search",
  "web_fetch",
  "list_files",
  "grep",
  "glob",
  "git_status",
  "git_diff",
  "memory_read",
]);

export function isReadonlySubagentTool(toolType: ToolCallType): boolean {
  return READONLY_SUBAGENT_TOOL_TYPES.has(toolType);
}

const WRITE_SUBAGENT_TOOL_TYPES: ReadonlySet<ToolCallType> = new Set([
  ...READONLY_SUBAGENT_TOOL_TYPES,
  "edit_file",
  "write_file",
]);

export function isAllowedSubagentTool(
  session: Pick<ChatSession, "subagentReadonly" | "subagentAllowedPaths">,
  toolType: ToolCallType,
): boolean {
  return session.subagentReadonly
    ? isReadonlySubagentTool(toolType)
    : WRITE_SUBAGENT_TOOL_TYPES.has(toolType);
}

export function isAllowedSubagentPath(
  allowedPaths: readonly string[] | undefined,
  filePath: string,
): boolean {
  if (!allowedPaths?.length) return false;
  const normalizedFilePath = normalizeRelativePath(filePath);
  if (!normalizedFilePath) return false;

  return allowedPaths.some((allowedPath) => {
    const normalizedAllowed = normalizeRelativePath(allowedPath);
    if (!normalizedAllowed) return false;
    return isInsidePath(normalizedAllowed, normalizedFilePath);
  });
}

function normalizeRelativePath(value: string): string {
  const normalized = path
    .normalize(String(value || "").replace(/\\/g, "/"))
    .replace(/^\/+/, "");
  return normalized === "." || normalized.startsWith("..") ? "" : normalized;
}
