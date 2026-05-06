import type { ToolCallType } from "../types";

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
