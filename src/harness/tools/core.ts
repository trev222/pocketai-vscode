import * as child_process from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { createCheckpoint } from "../../checkpoints";
import { EXCLUDED_DIRS, EXCLUDED_DIRS_GLOB } from "../../constants";
import { formatFileSize } from "../../helpers";
import { runHooks } from "../../hooks";
import { checkPermissionRules } from "../../permissions";
import type { ToolLoopDeps } from "../../tool-loop";
import {
  cancelBackgroundTask,
  checkBackgroundTask,
  hasReadFileInSession,
  markFileReadInSession,
  runCommandWithStreaming,
  startBackgroundCommand,
} from "../../tool-executor";
import type { MemoryType } from "../../memory-manager";
import type { ChatSession, ToolCall, ToolCallType } from "../../types";

type GuardedContext = {
  rootPath: string;
  fullPath: string;
};

export async function executeReadFileTool(
  deps: ToolLoopDeps,
  session: ChatSession,
  toolCall: ToolCall,
) {
  return withStandardGuards(deps, session, toolCall, async ({ fullPath }) => {
    try {
      const stat = fs.statSync(fullPath);
      const ext = path.extname(fullPath).toLowerCase();
      const imageExts = [".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp", ".svg", ".ico"];
      if (imageExts.includes(ext)) {
        markFileReadInSession(toolCall.filePath);
        return `[Image file: ${toolCall.filePath} (${formatFileSize(stat.size)})]`;
      }

      const content = fs.readFileSync(fullPath, "utf-8");
      const allLines = content.split("\n");
      markFileReadInSession(toolCall.filePath);

      const maxLines = 2000;
      const maxLineLength = 2000;
      const offset = Math.max(0, (toolCall.offset ?? 1) - 1);
      const limit = toolCall.limit ?? maxLines;
      const sliced = allLines.slice(offset, offset + limit);
      const truncatedLineCount = Math.max(0, allLines.length - offset - limit);

      const numbered = sliced
        .map((line, index) => {
          const lineNum = offset + index + 1;
          const truncated =
            line.length > maxLineLength
              ? `${line.slice(0, maxLineLength)}...`
              : line;
          return `${String(lineNum).padStart(6)}\t${truncated}`;
        })
        .join("\n");

      return truncatedLineCount > 0
        ? `${numbered}\n\n... (${truncatedLineCount} more lines not shown. Use offset/limit to read more.)`
        : numbered;
    } catch (error) {
      return `Error reading file: ${(error as Error).message}`;
    }
  });
}

export async function executeEditFileTool(
  deps: ToolLoopDeps,
  session: ChatSession,
  toolCall: ToolCall,
) {
  return withStandardGuards(deps, session, toolCall, async ({ fullPath }) => {
    try {
      if (!hasReadFileInSession(toolCall.filePath)) {
        return `Error: You must read ${toolCall.filePath} before editing it. Use read_file first.`;
      }

      const content = fs.readFileSync(fullPath, "utf-8");
      const searchText = toolCall.search || "";
      if (!searchText) {
        return "Error: old_string (search) is required and must not be empty.";
      }

      if (!content.includes(searchText)) {
        const lines = content.split("\n");
        const totalLines = lines.length;
        const previewLines = Math.min(30, totalLines);
        const snippet = lines.slice(0, previewLines).join("\n");
        return (
          `Error: old_string not found in \`${toolCall.filePath}\`.\n\n` +
          `Searched for:\n\`\`\`\n${searchText}\n\`\`\`\n\n` +
          `First ${previewLines} lines of file (${totalLines} total):\n\`\`\`\n${snippet}\n\`\`\`\n\n` +
          "Tip: The old_string must match EXACTLY including whitespace and indentation. Re-read the file to get its current contents."
        );
      }

      if (toolCall.replaceAll) {
        createCheckpoint(session, [toolCall.filePath]);
        const newContent = content.split(searchText).join(toolCall.replace || "");
        const occurrences = content.split(searchText).length - 1;
        fs.writeFileSync(fullPath, newContent, "utf-8");
        void runHooks(deps.config, deps.outputChannel, "postEdit", {
          file: toolCall.filePath,
          tool: "edit_file",
        });
        return `Successfully replaced ${occurrences} occurrence(s) in \`${toolCall.filePath}\`.`;
      }

      const occurrences = content.split(searchText).length - 1;
      if (occurrences > 1) {
        return (
          `Error: old_string matches ${occurrences} locations in \`${toolCall.filePath}\`. ` +
          "The edit will FAIL if old_string is not unique. Either include more surrounding context to make it unique, or use replace_all to change every instance."
        );
      }

      createCheckpoint(session, [toolCall.filePath]);
      const newContent = content.replace(searchText, toolCall.replace || "");
      fs.writeFileSync(fullPath, newContent, "utf-8");
      void runHooks(deps.config, deps.outputChannel, "postEdit", {
        file: toolCall.filePath,
        tool: "edit_file",
      });
      return `Successfully edited \`${toolCall.filePath}\`.`;
    } catch (error) {
      return `Error editing file: ${(error as Error).message}`;
    }
  });
}

export async function executeWriteFileTool(
  deps: ToolLoopDeps,
  session: ChatSession,
  toolCall: ToolCall,
) {
  return withStandardGuards(deps, session, toolCall, async ({ fullPath }) => {
    try {
      const exists = fs.existsSync(fullPath);
      if (exists && !hasReadFileInSession(toolCall.filePath)) {
        return `Error: File \`${toolCall.filePath}\` already exists. You must read it with read_file before overwriting. Use edit_file instead if you only need to change part of it.`;
      }

      createCheckpoint(session, [toolCall.filePath]);
      fs.mkdirSync(path.dirname(fullPath), { recursive: true });
      fs.writeFileSync(fullPath, toolCall.content || "", "utf-8");
      markFileReadInSession(toolCall.filePath);
      void runHooks(
        deps.config,
        deps.outputChannel,
        exists ? "postEdit" : "postCreate",
        {
          file: toolCall.filePath,
          tool: "write_file",
        },
      );
      return exists
        ? `Successfully overwrote \`${toolCall.filePath}\`.`
        : `Successfully created \`${toolCall.filePath}\`.`;
    } catch (error) {
      return `Error writing file: ${(error as Error).message}`;
    }
  });
}

export async function executeWebSearchTool(
  deps: ToolLoopDeps,
  session: ChatSession,
  toolCall: ToolCall,
) {
  return withStandardGuards(deps, session, toolCall, async () => {
    try {
      const query = toolCall.query || "";
      const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
      const response = await fetch(url, {
        headers: { "User-Agent": "PocketAI/1.0" },
      });
      if (!response.ok) {
        return `Web search failed (HTTP ${response.status}): ${response.statusText}`;
      }

      const html = await response.text();
      const results: string[] = [];
      const resultRegex =
        /<a rel="nofollow" class="result__a" href="[^"]*"[^>]*>(.+?)<\/a>[\s\S]*?<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
      let match: RegExpExecArray | null;
      while ((match = resultRegex.exec(html)) !== null && results.length < 8) {
        const title = match[1].replace(/<[^>]+>/g, "").trim();
        const snippet = match[2].replace(/<[^>]+>/g, "").trim();
        if (title && snippet) {
          results.push(`**${title}**\n${snippet}`);
        }
      }

      if (results.length === 0) {
        const snippetRegex = /<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
        while ((match = snippetRegex.exec(html)) !== null && results.length < 8) {
          const snippet = match[1].replace(/<[^>]+>/g, "").trim();
          if (snippet) results.push(snippet);
        }
      }

      if (results.length === 0) {
        return `Web search for "${query}": No results found.`;
      }

      return `Web search results for "${query}":\n\n${results.join("\n\n---\n\n")}`;
    } catch (error) {
      return `Error searching the web: ${(error as Error).message}`;
    }
  });
}

export async function executeWebFetchTool(
  deps: ToolLoopDeps,
  session: ChatSession,
  toolCall: ToolCall,
) {
  return withStandardGuards(deps, session, toolCall, async () => {
    try {
      const fetchUrl = toolCall.url || "";
      if (!fetchUrl) return "Error: No URL provided.";

      const response = await fetch(fetchUrl, {
        headers: {
          "User-Agent": "PocketAI/1.0",
          Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.7",
        },
        redirect: "follow",
        signal: AbortSignal.timeout(30000),
      });

      if (!response.ok) {
        return `Fetch failed (HTTP ${response.status}): ${response.statusText}`;
      }

      const contentType = response.headers.get("content-type") || "";
      const text = await response.text();

      if (
        contentType.includes("text/html") ||
        contentType.includes("application/xhtml")
      ) {
        const extracted = extractTextFromHtml(text);
        const maxChars = 50000;
        const truncated =
          extracted.length > maxChars
            ? `${extracted.slice(0, maxChars)}\n\n... [truncated]`
            : extracted;
        return `Content from ${fetchUrl}:\n\n${truncated}`;
      }

      const maxChars = 50000;
      const truncated =
        text.length > maxChars
          ? `${text.slice(0, maxChars)}\n\n... [truncated]`
          : text;
      return `Content from ${fetchUrl}:\n\n${truncated}`;
    } catch (error) {
      return `Error fetching URL: ${(error as Error).message}`;
    }
  });
}

export async function executeGrepTool(
  deps: ToolLoopDeps,
  session: ChatSession,
  toolCall: ToolCall,
) {
  return withStandardGuards(deps, session, toolCall, async ({ rootPath }) => {
    const pattern = toolCall.pattern || "";
    if (!pattern) return "Error: No search pattern provided.";

    try {
      const args = ["--color=never", "-n", "-r"];
      const mode = toolCall.outputMode || "files_with_matches";
      if (mode === "files_with_matches") {
        args.push("-l");
      } else if (mode === "count") {
        args.push("-c");
      }

      if (mode === "content") {
        if (toolCall.contextLines !== undefined) args.push("-C", String(toolCall.contextLines));
        if (toolCall.beforeLines !== undefined) args.push("-B", String(toolCall.beforeLines));
        if (toolCall.afterLines !== undefined) args.push("-A", String(toolCall.afterLines));
      }

      if (toolCall.caseInsensitive) args.push("-i");
      if (toolCall.multiline) args.push("-P", "-z");

      if (toolCall.grepType) {
        const typeGlobs: Record<string, string> = {
          ts: "*.ts",
          tsx: "*.tsx",
          js: "*.js",
          jsx: "*.jsx",
          py: "*.py",
          rust: "*.rs",
          go: "*.go",
          java: "*.java",
          css: "*.css",
          html: "*.html",
          json: "*.json",
          yaml: "*.yaml",
          yml: "*.yml",
          md: "*.md",
          swift: "*.swift",
        };
        const glob = typeGlobs[toolCall.grepType] || `*.${toolCall.grepType}`;
        args.push("--include", glob);
      } else if (toolCall.glob) {
        args.push("--include", toolCall.glob);
      } else {
        for (const dir of EXCLUDED_DIRS) {
          args.push(`--exclude-dir=${dir}`);
        }
      }

      const maxCount = toolCall.headLimit || 200;
      if (mode !== "files_with_matches") {
        args.push("--max-count=500");
      }

      args.push("-E", pattern);
      args.push(toolCall.filePath || ".");

      const result = child_process.execFileSync("grep", args, {
        cwd: rootPath,
        encoding: "utf-8",
        timeout: 15000,
        maxBuffer: 1024 * 1024,
      });

      let lines = result.trim().split("\n").filter(Boolean);
      if (toolCall.grepOffset) lines = lines.slice(toolCall.grepOffset);
      if (maxCount && lines.length > maxCount) lines = lines.slice(0, maxCount);

      const output = lines.join("\n");
      const label =
        mode === "files_with_matches"
          ? `${lines.length} file(s)`
          : mode === "count"
            ? "Match counts"
            : `${lines.length} match(es)`;

      return `Search results for \`${pattern}\`${toolCall.glob ? ` (glob: ${toolCall.glob})` : ""} — ${label}:\n\`\`\`\n${output}\n\`\`\``;
    } catch (error) {
      const err = error as {
        status?: number;
        stderr?: string;
        message: string;
      };
      if (err.status === 1) {
        return `No matches found for pattern \`${pattern}\`${toolCall.glob ? ` in ${toolCall.glob}` : ""}.`;
      }
      return `Error searching: ${err.stderr || err.message}`;
    }
  });
}

export async function executeGlobTool(
  deps: ToolLoopDeps,
  session: ChatSession,
  toolCall: ToolCall,
) {
  return withStandardGuards(deps, session, toolCall, async ({ rootPath }) => {
    const globPattern = toolCall.glob || "";
    if (!globPattern) return "Error: No glob pattern provided.";

    try {
      const searchBase = toolCall.globPath
        ? new vscode.RelativePattern(
            vscode.Uri.file(path.resolve(rootPath, toolCall.globPath)),
            globPattern,
          )
        : globPattern;

      const uris = await vscode.workspace.findFiles(
        searchBase,
        EXCLUDED_DIRS_GLOB,
        500,
      );
      if (uris.length === 0) {
        return `No files found matching \`${globPattern}\`.`;
      }

      const filesWithTime = uris.map((uri) => {
        let mtime = 0;
        try {
          mtime = fs.statSync(uri.fsPath).mtimeMs;
        } catch {}
        return { uri, mtime };
      });
      filesWithTime.sort((a, b) => b.mtime - a.mtime);
      const files = filesWithTime.map((file) =>
        vscode.workspace.asRelativePath(file.uri, false),
      );
      return `Files matching \`${globPattern}\` (${files.length} results${files.length === 500 ? ", truncated" : ""}):\n${files.map((file) => `- ${file}`).join("\n")}`;
    } catch (error) {
      return `Error finding files: ${(error as Error).message}`;
    }
  });
}

export async function executeRunCommandTool(
  deps: ToolLoopDeps,
  session: ChatSession,
  toolCall: ToolCall,
) {
  return withStandardGuards(deps, session, toolCall, async ({ rootPath }) => {
    const cmd = toolCall.command || "";
    if (!cmd) return "Error: No command provided.";

    if (cmd.startsWith("bg_status ")) {
      return checkBackgroundTask(cmd.slice(10).trim());
    }
    if (cmd.startsWith("bg_cancel ")) {
      return cancelBackgroundTask(cmd.slice(10).trim());
    }

    const timeoutMs = Math.min(toolCall.timeout || 120000, 600000);

    if (toolCall.background) {
      const taskId = startBackgroundCommand(
        session.id,
        cmd,
        rootPath,
        deps.outputChannel,
      );
      return `Command started in background (id: ${taskId}): \`${cmd}\`\nUse run_command with "bg_status ${taskId}" to check status.`;
    }

    const useTerminal =
      deps.config.get<boolean>("useIntegratedTerminal", true) && deps.terminalMgr;
    if (useTerminal) {
      try {
        const { output: terminalOutput, exitCode } =
          await deps.terminalMgr!.executeCommand(cmd, rootPath);
        const output =
          terminalOutput.length > 10000
            ? `${terminalOutput.slice(0, 10000)}\n... [truncated]`
            : terminalOutput;
        if (exitCode !== undefined && exitCode !== 0) {
          return `Command failed (exit ${exitCode}): \`${cmd}\`\n\`\`\`\n${output}\n\`\`\``;
        }
        return `Command: \`${cmd}\`\n\`\`\`\n${output}\n\`\`\``;
      } catch (error) {
        return `Command failed: \`${cmd}\`\n\`\`\`\n${(error as Error).message}\n\`\`\``;
      }
    }

    try {
      const result = await runCommandWithStreaming(
        cmd,
        rootPath,
        deps.outputChannel,
        timeoutMs,
      );
      const output =
        result.length > 10000 ? `${result.slice(0, 10000)}\n... [truncated]` : result;
      return `Command: \`${cmd}\`\n\`\`\`\n${output}\n\`\`\``;
    } catch (error) {
      const err = error as {
        stderr?: string;
        stdout?: string;
        message: string;
      };
      const output = (err.stderr || err.stdout || err.message).slice(0, 10000);
      return `Command failed: \`${cmd}\`\n\`\`\`\n${output}\n\`\`\``;
    }
  });
}

export async function executeListFilesTool(
  deps: ToolLoopDeps,
  session: ChatSession,
  toolCall: ToolCall,
) {
  return withStandardGuards(deps, session, toolCall, async ({ fullPath }) => {
    try {
      const entries = fs.readdirSync(fullPath, { withFileTypes: true });
      const lines = entries.map((entry) => {
        const isDir = entry.isDirectory();
        let size = "";
        if (!isDir) {
          try {
            const stat = fs.statSync(path.join(fullPath, entry.name));
            size = ` (${formatFileSize(stat.size)})`;
          } catch {}
        }
        return `${isDir ? "[dir]  " : "[file] "}${entry.name}${size}`;
      });
      return `Contents of \`${toolCall.filePath}\` (${entries.length} entries):\n${lines.join("\n")}`;
    } catch (error) {
      return `Error listing directory: ${(error as Error).message}`;
    }
  });
}

export async function executeGitStatusTool(
  deps: ToolLoopDeps,
  session: ChatSession,
  toolCall: ToolCall,
) {
  return withStandardGuards(deps, session, toolCall, async ({ rootPath }) => {
    try {
      const result = child_process.execSync("git status --short", {
        cwd: rootPath,
        encoding: "utf-8",
        timeout: 10000,
      });
      return result.trim()
        ? `Git status:\n\`\`\`\n${result}\`\`\``
        : "Git status: Working tree clean.";
    } catch (error) {
      return `Error running git status: ${(error as Error).message}`;
    }
  });
}

export async function executeGitDiffTool(
  deps: ToolLoopDeps,
  session: ChatSession,
  toolCall: ToolCall,
) {
  return withStandardGuards(deps, session, toolCall, async ({ rootPath }) => {
    try {
      const unstaged = child_process.execSync("git diff", {
        cwd: rootPath,
        encoding: "utf-8",
        timeout: 10000,
        maxBuffer: 512 * 1024,
      });
      const staged = child_process.execSync("git diff --cached", {
        cwd: rootPath,
        encoding: "utf-8",
        timeout: 10000,
        maxBuffer: 512 * 1024,
      });

      if (!unstaged.trim() && !staged.trim()) {
        return "No changes (working tree and staging area are clean).";
      }

      const parts: string[] = [];
      if (staged.trim()) {
        const truncated =
          staged.length > 5000 ? `${staged.slice(0, 5000)}\n... [truncated]` : staged;
        parts.push(`Staged changes:\n\`\`\`diff\n${truncated}\n\`\`\``);
      }
      if (unstaged.trim()) {
        const truncated =
          unstaged.length > 5000 ? `${unstaged.slice(0, 5000)}\n... [truncated]` : unstaged;
        parts.push(`Unstaged changes:\n\`\`\`diff\n${truncated}\n\`\`\``);
      }
      return parts.join("\n\n");
    } catch (error) {
      return `Error running git diff: ${(error as Error).message}`;
    }
  });
}

export async function executeGitCommitTool(
  deps: ToolLoopDeps,
  session: ChatSession,
  toolCall: ToolCall,
) {
  return withStandardGuards(deps, session, toolCall, async ({ rootPath }) => {
    const msg = toolCall.commitMessage || "";
    if (!msg) return "Error: No commit message provided.";

    try {
      const modifiedFiles = new Set<string>();
      for (const checkpoint of session.checkpoints) {
        for (const filePath of checkpoint.files.keys()) {
          modifiedFiles.add(filePath);
        }
      }

      if (modifiedFiles.size > 0) {
        for (const file of modifiedFiles) {
          const absPath = path.resolve(rootPath, file);
          if (absPath.startsWith(rootPath)) {
            child_process.execFileSync("git", ["add", absPath], {
              cwd: rootPath,
              encoding: "utf-8",
              timeout: 5000,
            });
          }
        }
      } else {
        child_process.execFileSync("git", ["add", "-u"], {
          cwd: rootPath,
          encoding: "utf-8",
          timeout: 10000,
        });
      }

      const result = child_process.execFileSync(
        "git",
        ["commit", "-m", msg],
        { cwd: rootPath, encoding: "utf-8", timeout: 15000 },
      );
      return `Git commit successful:\n\`\`\`\n${result}\`\`\``;
    } catch (error) {
      const err = error as { stderr?: string; stdout?: string; message: string };
      return `Git commit failed:\n\`\`\`\n${err.stderr || err.stdout || err.message}\n\`\`\``;
    }
  });
}

export async function executeTodoWriteTool(
  deps: ToolLoopDeps,
  session: ChatSession,
  toolCall: ToolCall,
) {
  return withStandardGuards(deps, session, toolCall, async () => {
    const todos = toolCall.todos || [];
    if (todos.length === 0) return "Todo list cleared.";

    const lines = todos.map((todo, index) => {
      const icon =
        todo.status === "completed"
          ? "[x]"
          : todo.status === "in_progress"
            ? "[~]"
            : "[ ]";
      return `${index + 1}. ${icon} ${todo.content}`;
    });
    return `Task list updated:\n${lines.join("\n")}`;
  });
}

export async function executeMemoryReadTool(
  deps: ToolLoopDeps,
  session: ChatSession,
  toolCall: ToolCall,
) {
  return withStandardGuards(deps, session, toolCall, async () => {
    if (!deps.memoryMgr) return "Memory system not available.";
    const query = toolCall.memoryQuery;
    const typeFilter = toolCall.memoryType as MemoryType | undefined;
    let results = query ? deps.memoryMgr.search(query) : deps.memoryMgr.getAll();
    if (typeFilter) {
      results = results.filter((memory) => memory.type === typeFilter);
    }
    if (results.length === 0) {
      return query
        ? `No memories found matching "${query}".`
        : "No memories stored yet.";
    }
    const lines = results.map(
      (memory) => `- **${memory.name}** [${memory.type}]: ${memory.content}`,
    );
    return `Memories (${results.length}):\n${lines.join("\n")}`;
  });
}

export async function executeMemoryWriteTool(
  deps: ToolLoopDeps,
  session: ChatSession,
  toolCall: ToolCall,
) {
  return withStandardGuards(deps, session, toolCall, async () => {
    if (!deps.memoryMgr) return "Memory system not available.";
    const type = (toolCall.memoryType || "project") as MemoryType;
    const name = toolCall.memoryName || "";
    const description = toolCall.memoryDescription || "";
    const content = toolCall.memoryContent || "";
    if (!name) return "Error: Memory name is required.";
    if (!content) return "Error: Memory content is required.";
    const entry = deps.memoryMgr.upsert(type, name, description, content);
    return `Memory saved: **${entry.name}** [${entry.type}]`;
  });
}

export async function executeMemoryDeleteTool(
  deps: ToolLoopDeps,
  session: ChatSession,
  toolCall: ToolCall,
) {
  return withStandardGuards(deps, session, toolCall, async () => {
    if (!deps.memoryMgr) return "Memory system not available.";
    const name = toolCall.memoryName || "";
    if (!name) return "Error: Memory name is required.";
    const removed = deps.memoryMgr.remove(name);
    return removed
      ? `Memory "${name}" removed.`
      : `No memory found with name "${name}".`;
  });
}

async function withStandardGuards(
  deps: ToolLoopDeps,
  _session: ChatSession,
  toolCall: ToolCall,
  executor: (context: GuardedContext) => Promise<string>,
) {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders?.length) {
    return "Error: No workspace folder open.";
  }

  const rootPath = workspaceFolders[0].uri.fsPath;
  const fullPath = toolCall.filePath
    ? path.resolve(rootPath, toolCall.filePath)
    : rootPath;

  const toolArg = getToolArg(toolCall);
  const permission = checkPermissionRules(deps.config, toolCall.type, toolArg);
  if (permission === "deny") {
    return `Blocked by permission rule: ${toolCall.type}(${toolArg})`;
  }

  try {
    await runHooks(deps.config, deps.outputChannel, "preToolUse", {
      tool: toolCall.type,
      file: toolCall.filePath,
    });
  } catch (error) {
    return `Blocked by hook: ${(error as Error).message}`;
  }

  if (toolCall.filePath && !fullPath.startsWith(rootPath)) {
    return "Error: Path is outside the workspace.";
  }

  const result = await executor({ rootPath, fullPath });
  void runHooks(deps.config, deps.outputChannel, "postToolUse", {
    tool: toolCall.type,
    file: toolCall.filePath,
  });
  return result;
}

function getToolArg(toolCall: ToolCall): string {
  const argByType: Partial<Record<ToolCallType, string>> = {
    web_search: toolCall.query || "",
    web_fetch: toolCall.url || "",
    run_command: toolCall.command || "",
    grep: toolCall.pattern || "",
    glob: toolCall.glob || "",
    git_commit: toolCall.commitMessage || "",
  };
  return argByType[toolCall.type] ?? toolCall.filePath;
}

function extractTextFromHtml(html: string): string {
  let text = html.replace(/<script[\s\S]*?<\/script>/gi, "");
  text = text.replace(/<style[\s\S]*?<\/style>/gi, "");
  text = text.replace(/<noscript[\s\S]*?<\/noscript>/gi, "");
  text = text.replace(
    /<\/?(p|div|br|hr|h[1-6]|li|tr|td|th|blockquote|pre|section|article|header|footer|nav|aside|main)[^>]*>/gi,
    "\n",
  );
  text = text.replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, "$2");
  text = text.replace(/<[^>]+>/g, "");
  text = text.replace(/&amp;/g, "&");
  text = text.replace(/&lt;/g, "<");
  text = text.replace(/&gt;/g, ">");
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");
  text = text.replace(/&nbsp;/g, " ");
  text = text.replace(/[ \t]+/g, " ");
  text = text.replace(/\n{3,}/g, "\n\n");
  return text.trim();
}
