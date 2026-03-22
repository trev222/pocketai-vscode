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
  let match;

  // read_file — supports optional --offset and --limit
  const readRegex = /@read_file:\s*(\S+)(.*?)(?:\n|$)/g;
  while ((match = readRegex.exec(text)) !== null) {
    const tc: ToolCall = {
      id: generateToolCallId(),
      type: "read_file",
      filePath: match[1].trim(),
      status: "pending",
    };
    const rest = match[2] || "";
    const offsetMatch = rest.match(/--offset\s+(\d+)/);
    const limitMatch = rest.match(/--limit\s+(\d+)/);
    if (offsetMatch) tc.offset = parseInt(offsetMatch[1], 10);
    if (limitMatch) tc.limit = parseInt(limitMatch[1], 10);
    calls.push(tc);
  }

  // edit_file — supports optional --replace-all flag
  const editRegex = /@edit_file:\s*(\S+)(.*?)\n<<<SEARCH\n([\s\S]*?)\n===\n([\s\S]*?)\nREPLACE>>>/g;
  while ((match = editRegex.exec(text)) !== null) {
    const flags = match[2] || "";
    calls.push({
      id: generateToolCallId(),
      type: "edit_file",
      filePath: match[1].trim(),
      search: match[3],
      replace: match[4],
      replaceAll: flags.includes("--replace-all"),
      status: "pending",
    });
  }

  // write_file (also matches legacy @create_file)
  const writeRegex = /@(?:write_file|create_file):\s*(\S+)\n<<<CONTENT\n([\s\S]*?)\nCONTENT>>>/g;
  while ((match = writeRegex.exec(text)) !== null) {
    calls.push({
      id: generateToolCallId(),
      type: "write_file",
      filePath: match[1].trim(),
      content: match[2],
      status: "pending",
    });
  }

  // web_search
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

  // web_fetch
  const fetchRegex = /@web_fetch:\s*(\S+)(?:\n|$)/g;
  while ((match = fetchRegex.exec(text)) !== null) {
    calls.push({
      id: generateToolCallId(),
      type: "web_fetch",
      filePath: "",
      url: match[1].trim(),
      status: "pending",
    });
  }

  // list_files
  const listRegex = /@list_files:\s*(.+?)(?:\n|$)/g;
  while ((match = listRegex.exec(text)) !== null) {
    calls.push({
      id: generateToolCallId(),
      type: "list_files",
      filePath: match[1].trim(),
      status: "pending",
    });
  }

  // run_command — supports --background flag
  const runRegex = /@run_command:\s*(--background\s+)?(.+?)(?:\n|$)/g;
  while ((match = runRegex.exec(text)) !== null) {
    calls.push({
      id: generateToolCallId(),
      type: "run_command",
      filePath: "",
      command: match[2].trim(),
      background: !!match[1],
      status: "pending",
    });
  }

  // grep — supports --glob, --output, --context, -i flags
  const grepRegex = /@grep:\s*(.+?)(?:\n|$)/g;
  while ((match = grepRegex.exec(text)) !== null) {
    const full = match[1].trim();
    // Extract flags from the line
    const globMatch = full.match(/--glob\s+(\S+)/);
    const outputMatch = full.match(/--output\s+(\S+)/);
    const contextMatch = full.match(/--context\s+(\d+)/);
    const caseFlag = /\s-i(?:\s|$)/.test(full);
    // Pattern is everything before the first flag
    const pattern = full.replace(/\s+--\S+\s+\S+/g, "").replace(/\s+-i(?:\s|$)/, " ").trim();

    const tc: ToolCall = {
      id: generateToolCallId(),
      type: "grep",
      filePath: "",
      pattern,
      status: "pending",
    };
    if (globMatch) tc.glob = globMatch[1];
    if (outputMatch) tc.outputMode = outputMatch[1] as ToolCall["outputMode"];
    if (contextMatch) tc.contextLines = parseInt(contextMatch[1], 10);
    if (caseFlag) tc.caseInsensitive = true;
    calls.push(tc);
  }

  // glob — supports --path flag
  const globRegex = /@glob:\s*(\S+)(.*?)(?:\n|$)/g;
  while ((match = globRegex.exec(text)) !== null) {
    const tc: ToolCall = {
      id: generateToolCallId(),
      type: "glob",
      filePath: "",
      glob: match[1].trim(),
      status: "pending",
    };
    const rest = match[2] || "";
    const pathMatch = rest.match(/--path\s+(\S+)/);
    if (pathMatch) tc.globPath = pathMatch[1];
    calls.push(tc);
  }

  // git_status
  const gitStatusRegex = /@git_status(?:\n|$)/g;
  while ((match = gitStatusRegex.exec(text)) !== null) {
    calls.push({
      id: generateToolCallId(),
      type: "git_status",
      filePath: "",
      status: "pending",
    });
  }

  // git_diff
  const gitDiffRegex = /@git_diff(?:\n|$)/g;
  while ((match = gitDiffRegex.exec(text)) !== null) {
    calls.push({
      id: generateToolCallId(),
      type: "git_diff",
      filePath: "",
      status: "pending",
    });
  }

  // git_commit
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

  // todo_write (pipe-separated tasks)
  const todoRegex = /@todo_write:\s*(.+?)(?:\n|$)/g;
  while ((match = todoRegex.exec(text)) !== null) {
    const items = match[1].split("|").map((s) => s.trim()).filter(Boolean);
    calls.push({
      id: generateToolCallId(),
      type: "todo_write",
      filePath: "",
      todos: items.map((content) => ({ content, status: "pending" })),
      status: "pending",
    });
  }

  // memory_read
  const memReadRegex = /@memory_read(?::\s*(.+?))?(?:\n|$)/g;
  while ((match = memReadRegex.exec(text)) !== null) {
    calls.push({
      id: generateToolCallId(),
      type: "memory_read",
      filePath: "",
      memoryQuery: match[1]?.trim(),
      status: "pending",
    });
  }

  // memory_write (pipe-separated: type | name | content)
  const memWriteRegex = /@memory_write:\s*(.+?)(?:\n|$)/g;
  while ((match = memWriteRegex.exec(text)) !== null) {
    const parts = match[1].split("|").map((s) => s.trim());
    if (parts.length >= 3) {
      calls.push({
        id: generateToolCallId(),
        type: "memory_write",
        filePath: "",
        memoryType: parts[0],
        memoryName: parts[1],
        memoryContent: parts.slice(2).join("|"),
        status: "pending",
      });
    }
  }

  // memory_delete
  const memDeleteRegex = /@memory_delete:\s*(.+?)(?:\n|$)/g;
  while ((match = memDeleteRegex.exec(text)) !== null) {
    calls.push({
      id: generateToolCallId(),
      type: "memory_delete",
      filePath: "",
      memoryName: match[1].trim(),
      status: "pending",
    });
  }

  return calls;
}

export function stripFabricatedResults(text: string): string {
  let cleaned = text;
  // Strip fabricated tool calls for tools that don't exist
  cleaned = cleaned.replace(/@delete_file:\s*.+?(?:\n|$)/g, "");
  cleaned = cleaned.replace(/@rename_file:\s*.+?(?:\n|$)/g, "");
  cleaned = cleaned.replace(/@move_file:\s*.+?(?:\n|$)/g, "");
  // Strip fabricated conversation continuations
  cleaned = cleaned.replace(/\n(?:User|A|Assistant|System|Tool Result):\s*.*$/gms, "");
  return cleaned.trim();
}
