import type { ToolCall } from "./types";

export function normalizeBaseUrl(value: string): string {
  return value.replace(/\/+$/, "");
}

export function shellEscape(value: string): string {
  return "'" + value.replace(/'/g, "'\\''") + "'";
}

export function matchGlob(pattern: string, value: string): boolean {
  const regexStr = pattern
    .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
    .replace(/\*\*/g, "§DOUBLESTAR§")
    .replace(/\*/g, "[^/]*")
    .replace(/§DOUBLESTAR§/g, ".*");
  return new RegExp(`^${regexStr}$`).test(value);
}

export function formatTokenCount(tokens: number): string {
  if (tokens < 1000) return `${tokens}`;
  return `${(tokens / 1000).toFixed(1)}k`;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function getNonce() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let v = "";
  for (let i = 0; i < 24; i++) v += chars.charAt(Math.floor(Math.random() * chars.length));
  return v;
}

export function createId() {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let v = "session_";
  for (let i = 0; i < 10; i++) v += chars.charAt(Math.floor(Math.random() * chars.length));
  return v;
}

export function generateToolCallId() {
  return `tc_${Math.random().toString(36).slice(2, 10)}`;
}

export function isDefaultSessionTitle(value: string) {
  return /^Chat \d+$/.test(value);
}

export function summarizePrompt(prompt: string, fallbackNumber: number) {
  const compact = prompt.replace(/\s+/g, " ").trim();
  if (!compact) return `Chat ${fallbackNumber}`;
  return compact.length > 32 ? `${compact.slice(0, 32).trimEnd()}...` : compact;
}

export function parseToolCalls(text: string): ToolCall[] {
  const calls: ToolCall[] = [];

  const readRegex = /@read_file:\s*(.+?)(?:\n|$)/g;
  let match;
  while ((match = readRegex.exec(text)) !== null) {
    calls.push({
      id: generateToolCallId(),
      type: "read_file",
      filePath: match[1].trim(),
      status: "pending",
    });
  }

  const editRegex = /@edit_file:\s*(.+?)\n<<<SEARCH\n([\s\S]*?)\n===\n([\s\S]*?)\nREPLACE>>>/g;
  while ((match = editRegex.exec(text)) !== null) {
    calls.push({
      id: generateToolCallId(),
      type: "edit_file",
      filePath: match[1].trim(),
      search: match[2],
      replace: match[3],
      status: "pending",
    });
  }

  const createRegex = /@create_file:\s*(.+?)\n<<<CONTENT\n([\s\S]*?)\nCONTENT>>>/g;
  while ((match = createRegex.exec(text)) !== null) {
    calls.push({
      id: generateToolCallId(),
      type: "create_file",
      filePath: match[1].trim(),
      content: match[2],
      status: "pending",
    });
  }

  const searchRegex = /@web_search:\s*(.+?)(?:\n|$)/g;
  while ((match = searchRegex.exec(text)) !== null) {
    calls.push({
      id: generateToolCallId(),
      type: "web_search",
      filePath: "",
      query: match[1].trim(),
      status: "pending",
    });
  }

  const listRegex = /@list_files:\s*(.+?)(?:\n|$)/g;
  while ((match = listRegex.exec(text)) !== null) {
    calls.push({
      id: generateToolCallId(),
      type: "list_files",
      filePath: match[1].trim(),
      status: "pending",
    });
  }

  const runRegex = /@run_command:\s*(.+?)(?:\n|$)/g;
  while ((match = runRegex.exec(text)) !== null) {
    calls.push({
      id: generateToolCallId(),
      type: "run_command",
      filePath: "",
      command: match[1].trim(),
      status: "pending",
    });
  }

  const grepRegex = /@grep:\s*(.+?)(?:\s+--glob\s+(\S+))?(?:\n|$)/g;
  while ((match = grepRegex.exec(text)) !== null) {
    calls.push({
      id: generateToolCallId(),
      type: "grep",
      filePath: "",
      pattern: match[1].trim(),
      glob: match[2]?.trim(),
      status: "pending",
    });
  }

  const globRegex = /@glob:\s*(.+?)(?:\n|$)/g;
  while ((match = globRegex.exec(text)) !== null) {
    calls.push({
      id: generateToolCallId(),
      type: "glob",
      filePath: "",
      glob: match[1].trim(),
      status: "pending",
    });
  }

  const gitStatusRegex = /@git_status(?:\n|$)/g;
  while ((match = gitStatusRegex.exec(text)) !== null) {
    calls.push({
      id: generateToolCallId(),
      type: "git_status",
      filePath: "",
      status: "pending",
    });
  }

  const gitDiffRegex = /@git_diff(?:\n|$)/g;
  while ((match = gitDiffRegex.exec(text)) !== null) {
    calls.push({
      id: generateToolCallId(),
      type: "git_diff",
      filePath: "",
      status: "pending",
    });
  }

  const gitCommitRegex = /@git_commit:\s*(.+?)(?:\n|$)/g;
  while ((match = gitCommitRegex.exec(text)) !== null) {
    calls.push({
      id: generateToolCallId(),
      type: "git_commit",
      filePath: "",
      commitMessage: match[1].trim(),
      status: "pending",
    });
  }

  return calls;
}

export function stripFabricatedResults(text: string): string {
  let cleaned = text;
  cleaned = cleaned.replace(/@delete_file:\s*.+?(?:\n|$)/g, "");
  cleaned = cleaned.replace(/\n(?:User|A|Assistant|System|Tool Result):\s*.*$/gms, "");
  return cleaned.trim();
}
