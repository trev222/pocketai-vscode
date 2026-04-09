import * as fs from "fs";
import * as path from "path";
import * as child_process from "child_process";
import * as vscode from "vscode";
import type {
  ToolCall,
  ToolCallType,
  ChatSession,
  HarnessBackgroundTask,
  HarnessBackgroundTaskStatus,
} from "./types";
import { formatFileSize } from "./helpers";
import { checkPermissionRules } from "./permissions";
import { runHooks } from "./hooks";
import { createCheckpoint } from "./checkpoints";
import { EXCLUDED_DIRS, EXCLUDED_DIRS_GLOB } from "./constants";
import type { TerminalManager } from "./terminal-manager";
import type { MemoryManager, MemoryType } from "./memory-manager";

/**
 * Tracks which files have been read in the current session.
 * Edit and write operations on existing files require a prior read.
 */
const filesReadInSession = new Set<string>();

/** Clear read tracking (call on new session). */
export function clearReadTracking() {
  filesReadInSession.clear();
}

export function hasReadFileInSession(filePath: string) {
  return filesReadInSession.has(filePath);
}

export function markFileReadInSession(filePath: string) {
  filesReadInSession.add(filePath);
}

/** Returns the primary argument for a tool call (used for permission checks). */
function getToolArg(tc: ToolCall): string {
  const argByType: Partial<Record<ToolCallType, string>> = {
    web_search: tc.query || "",
    web_fetch: tc.url || "",
    run_command: tc.command || "",
    grep: tc.pattern || "",
    glob: tc.glob || "",
    git_commit: tc.commitMessage || "",
  };
  return argByType[tc.type] ?? tc.filePath;
}

export async function executeToolCall(
  config: vscode.WorkspaceConfiguration,
  outputChannel: vscode.OutputChannel,
  session: ChatSession,
  toolCall: ToolCall,
  terminalMgr?: TerminalManager,
  memoryMgr?: MemoryManager,
): Promise<string> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders?.length) {
    return "Error: No workspace folder open.";
  }

  const rootPath = workspaceFolders[0].uri.fsPath;
  const fullPath = toolCall.filePath
    ? path.resolve(rootPath, toolCall.filePath)
    : rootPath;

  // Check permission rules
  const toolArg = getToolArg(toolCall);
  const permission = checkPermissionRules(config, toolCall.type, toolArg);
  if (permission === "deny") {
    return `Blocked by permission rule: ${toolCall.type}(${toolArg})`;
  }

  // Run pre-tool hooks
  try {
    await runHooks(config, outputChannel, "preToolUse", {
      tool: toolCall.type,
      file: toolCall.filePath,
    });
  } catch (e) {
    return `Blocked by hook: ${(e as Error).message}`;
  }

  // Security: ensure the path is within the workspace (for file-based tools)
  if (toolCall.filePath && !fullPath.startsWith(rootPath)) {
    return "Error: Path is outside the workspace.";
  }

  switch (toolCall.type) {
    /* ================================================================ */
    /*  READ FILE                                                        */
    /* ================================================================ */
    case "read_file": {
      try {
        const stat = fs.statSync(fullPath);

        // Binary / image file detection
        const ext = path.extname(fullPath).toLowerCase();
        const imageExts = [".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp", ".svg", ".ico"];
        if (imageExts.includes(ext)) {
          filesReadInSession.add(toolCall.filePath);
          return `[Image file: ${toolCall.filePath} (${formatFileSize(stat.size)})]`;
        }

        const content = fs.readFileSync(fullPath, "utf-8");
        const allLines = content.split("\n");

        filesReadInSession.add(toolCall.filePath);

        const MAX_LINES = 2000;
        const MAX_LINE_LENGTH = 2000;
        const offset = Math.max(0, (toolCall.offset ?? 1) - 1); // convert 1-based to 0-based
        const limit = toolCall.limit ?? MAX_LINES;

        const sliced = allLines.slice(offset, offset + limit);
        const truncatedLineCount = Math.max(0, allLines.length - offset - limit);

        const numbered = sliced
          .map((line, i) => {
            const lineNum = offset + i + 1;
            const truncLine =
              line.length > MAX_LINE_LENGTH
                ? line.slice(0, MAX_LINE_LENGTH) + "..."
                : line;
            return `${String(lineNum).padStart(6)}\t${truncLine}`;
          })
          .join("\n");

        let result = numbered;
        if (truncatedLineCount > 0) {
          result += `\n\n... (${truncatedLineCount} more lines not shown. Use offset/limit to read more.)`;
        }

        return result;
      } catch (e) {
        return `Error reading file: ${(e as Error).message}`;
      }
    }

    /* ================================================================ */
    /*  OPEN FILE                                                        */
    /* ================================================================ */
    case "open_file": {
      try {
        const uri = vscode.Uri.file(fullPath);
        const document = await vscode.workspace.openTextDocument(uri);
        const hasLine = toolCall.line !== undefined;
        const position = hasLine
          ? new vscode.Position(
              Math.max(0, (toolCall.line ?? 1) - 1),
              Math.max(0, toolCall.character ?? 0),
            )
          : undefined;
        const selection = position ? new vscode.Range(position, position) : undefined;
        const editor = await vscode.window.showTextDocument(document, {
          preview: false,
          preserveFocus: false,
          selection,
        });
        if (selection) {
          editor.revealRange(
            selection,
            vscode.TextEditorRevealType.InCenterIfOutsideViewport,
          );
        }
        return position
          ? `Opened \`${toolCall.filePath}\` at ${position.line + 1}:${position.character}.`
          : `Opened \`${toolCall.filePath}\`.`;
      } catch (e) {
        return `Error opening file: ${(e as Error).message}`;
      }
    }

    /* ================================================================ */
    /*  OPEN DEFINITION                                                  */
    /* ================================================================ */
    case "open_definition": {
      try {
        if (toolCall.line === undefined || toolCall.character === undefined) {
          return "Error: open_definition requires line and character.";
        }
        const uri = vscode.Uri.file(fullPath);
        const position = new vscode.Position(
          Math.max(0, toolCall.line - 1),
          Math.max(0, toolCall.character),
        );
        const results = await vscode.commands.executeCommand<
          Array<vscode.Location | vscode.LocationLink>
        >(
          "vscode.executeDefinitionProvider",
          uri,
          position,
        );
        if (!results?.length) {
          return `No definition found at \`${toolCall.filePath}\`:${toolCall.line}:${toolCall.character}.`;
        }
        const first = results[0];
        const targetUri = "targetUri" in first ? first.targetUri : first.uri;
        const targetRange = "targetUri" in first
          ? (first.targetSelectionRange ?? first.targetRange)
          : first.range;
        const document = await vscode.workspace.openTextDocument(targetUri);
        const editor = await vscode.window.showTextDocument(document, {
          preview: false,
          preserveFocus: false,
          selection: targetRange,
        });
        editor.revealRange(
          targetRange,
          vscode.TextEditorRevealType.InCenterIfOutsideViewport,
        );
        const relativePath = vscode.workspace.asRelativePath(targetUri, false);
        return `Opened definition at \`${relativePath || targetUri.fsPath}\`:${targetRange.start.line + 1}:${targetRange.start.character}.`;
      } catch (e) {
        return `Error opening definition: ${(e as Error).message}`;
      }
    }

    /* ================================================================ */
    /*  WORKSPACE SYMBOLS                                                */
    /* ================================================================ */
    case "workspace_symbols": {
      try {
        const query = toolCall.query?.trim() || "";
        if (!query) {
          return "Error: workspace_symbols requires a query.";
        }
        const results = await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
          "vscode.executeWorkspaceSymbolProvider",
          query,
        );
        if (!results?.length) {
          return `No workspace symbols matched "${query}".`;
        }
        const visible = results.slice(0, 200);
        const lines = visible.map((symbol) => {
          const relativePath = vscode.workspace.asRelativePath(symbol.location.uri, false);
          const container = symbol.containerName ? ` (${symbol.containerName})` : "";
          return `- ${relativePath}:${symbol.location.range.start.line + 1}:${symbol.location.range.start.character} ${symbol.name}${container}`;
        });
        return `Workspace symbols matching "${query}" (${results.length}):\n${lines.join("\n")}${results.length > visible.length ? `\n... ${results.length - visible.length} more symbols not shown.` : ""}`;
      } catch (e) {
        return `Error searching workspace symbols: ${(e as Error).message}`;
      }
    }

    /* ================================================================ */
    /*  HOVER SYMBOL                                                     */
    /* ================================================================ */
    case "hover_symbol": {
      try {
        if (toolCall.line === undefined || toolCall.character === undefined) {
          return "Error: hover_symbol requires line and character.";
        }
        const uri = vscode.Uri.file(fullPath);
        const position = new vscode.Position(
          Math.max(0, toolCall.line - 1),
          Math.max(0, toolCall.character),
        );
        const results = await vscode.commands.executeCommand<vscode.Hover[]>(
          "vscode.executeHoverProvider",
          uri,
          position,
        );
        if (!results?.length) {
          return `No hover information found at \`${toolCall.filePath}\`:${toolCall.line}:${toolCall.character}.`;
        }
        const blocks = results
          .flatMap((hover) =>
            hover.contents.map((content) => {
              if (typeof content === "string") return content;
              if (content instanceof vscode.MarkdownString) return content.value;
              return "value" in content
                ? `\`\`\`${content.language || ""}\n${content.value}\n\`\`\``
                : "";
            }),
          )
          .map((block) => block.trim())
          .filter(Boolean)
          .slice(0, 10);
        if (!blocks.length) {
          return `Hover provider returned no readable content for \`${toolCall.filePath}\`:${toolCall.line}:${toolCall.character}.`;
        }
        return `Hover info for \`${toolCall.filePath}\`:${toolCall.line}:${toolCall.character}:\n\n${blocks.join("\n\n---\n\n")}`;
      } catch (e) {
        return `Error reading hover info: ${(e as Error).message}`;
      }
    }

    /* ================================================================ */
    /*  CODE ACTIONS                                                     */
    /* ================================================================ */
    case "code_actions": {
      try {
        if (toolCall.line === undefined || toolCall.character === undefined) {
          return "Error: code_actions requires line and character.";
        }
        const uri = vscode.Uri.file(fullPath);
        const position = new vscode.Position(
          Math.max(0, toolCall.line - 1),
          Math.max(0, toolCall.character),
        );
        const range = new vscode.Range(position, position);
        const results = await vscode.commands.executeCommand<
          Array<vscode.Command | vscode.CodeAction>
        >(
          "vscode.executeCodeActionProvider",
          uri,
          range,
        );
        if (!results?.length) {
          return `No code actions found at \`${toolCall.filePath}\`:${toolCall.line}:${toolCall.character}.`;
        }
        const visible = results.slice(0, 25);
        const lines = visible.map((action) => {
          if ("edit" in action || "kind" in action || "diagnostics" in action) {
            const codeAction = action as vscode.CodeAction;
            const kind = codeAction.kind?.value ? ` [${codeAction.kind.value}]` : "";
            const disabled = codeAction.disabled
              ? ` (disabled: ${codeAction.disabled.reason})`
              : "";
            return `- ${codeAction.title}${kind}${disabled}`;
          }
          const command = action as vscode.Command;
          return `- ${command.title}${command.command ? ` [command: ${command.command}]` : ""}`;
        });
        return `Code actions for \`${toolCall.filePath}\`:${toolCall.line}:${toolCall.character}:\n${lines.join("\n")}${results.length > visible.length ? `\n... ${results.length - visible.length} more code actions not shown.` : ""}`;
      } catch (e) {
        return `Error listing code actions: ${(e as Error).message}`;
      }
    }

    /* ================================================================ */
    /*  EDIT FILE                                                        */
    /* ================================================================ */
    case "edit_file": {
      try {
        // Require prior read
        if (!filesReadInSession.has(toolCall.filePath)) {
          return `Error: You must read ${toolCall.filePath} before editing it. Use read_file first.`;
        }

        const content = fs.readFileSync(fullPath, "utf-8");
        const searchText = toolCall.search || "";

        if (!searchText) {
          return "Error: old_string (search) is required and must not be empty.";
        }

        if (!content.includes(searchText)) {
          // Provide helpful context
          const lines = content.split("\n");
          const totalLines = lines.length;
          const previewLines = Math.min(30, totalLines);
          const snippet = lines.slice(0, previewLines).join("\n");
          return (
            `Error: old_string not found in \`${toolCall.filePath}\`.\n\n` +
            `Searched for:\n\`\`\`\n${searchText}\n\`\`\`\n\n` +
            `First ${previewLines} lines of file (${totalLines} total):\n\`\`\`\n${snippet}\n\`\`\`\n\n` +
            `Tip: The old_string must match EXACTLY including whitespace and indentation. ` +
            `Re-read the file to get its current contents.`
          );
        }

        if (toolCall.replaceAll) {
          // Replace all occurrences
          createCheckpoint(session, [toolCall.filePath]);
          const newContent = content.split(searchText).join(toolCall.replace || "");
          const occurrences = content.split(searchText).length - 1;
          fs.writeFileSync(fullPath, newContent, "utf-8");
          void runHooks(config, outputChannel, "postEdit", {
            file: toolCall.filePath,
            tool: "edit_file",
          });
          return `Successfully replaced ${occurrences} occurrence(s) in \`${toolCall.filePath}\`.`;
        }

        // Single replacement — must be unique
        const occurrences = content.split(searchText).length - 1;
        if (occurrences > 1) {
          return (
            `Error: old_string matches ${occurrences} locations in \`${toolCall.filePath}\`. ` +
            `The edit will FAIL if old_string is not unique. ` +
            `Either include more surrounding context to make it unique, or use replace_all to change every instance.`
          );
        }

        createCheckpoint(session, [toolCall.filePath]);
        const newContent = content.replace(searchText, toolCall.replace || "");
        fs.writeFileSync(fullPath, newContent, "utf-8");
        void runHooks(config, outputChannel, "postEdit", {
          file: toolCall.filePath,
          tool: "edit_file",
        });
        return `Successfully edited \`${toolCall.filePath}\`.`;
      } catch (e) {
        return `Error editing file: ${(e as Error).message}`;
      }
    }

    /* ================================================================ */
    /*  WRITE FILE (replaces create_file)                                */
    /* ================================================================ */
    case "write_file": {
      try {
        const exists = fs.existsSync(fullPath);

        // If overwriting an existing file, require prior read
        if (exists && !filesReadInSession.has(toolCall.filePath)) {
          return `Error: File \`${toolCall.filePath}\` already exists. You must read it with read_file before overwriting. Use edit_file instead if you only need to change part of it.`;
        }

        createCheckpoint(session, [toolCall.filePath]);
        const dir = path.dirname(fullPath);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(fullPath, toolCall.content || "", "utf-8");
        filesReadInSession.add(toolCall.filePath);
        void runHooks(config, outputChannel, exists ? "postEdit" : "postCreate", {
          file: toolCall.filePath,
          tool: "write_file",
        });
        return exists
          ? `Successfully overwrote \`${toolCall.filePath}\`.`
          : `Successfully created \`${toolCall.filePath}\`.`;
      } catch (e) {
        return `Error writing file: ${(e as Error).message}`;
      }
    }

    /* ================================================================ */
    /*  WEB SEARCH                                                       */
    /* ================================================================ */
    case "web_search": {
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
        let m;
        while ((m = resultRegex.exec(html)) !== null && results.length < 8) {
          const title = m[1].replace(/<[^>]+>/g, "").trim();
          const snippet = m[2].replace(/<[^>]+>/g, "").trim();
          if (title && snippet) {
            results.push(`**${title}**\n${snippet}`);
          }
        }

        if (results.length === 0) {
          const snippetRegex = /<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
          while ((m = snippetRegex.exec(html)) !== null && results.length < 8) {
            const snippet = m[1].replace(/<[^>]+>/g, "").trim();
            if (snippet) results.push(snippet);
          }
        }

        if (results.length === 0) {
          return `Web search for "${query}": No results found.`;
        }

        return `Web search results for "${query}":\n\n${results.join("\n\n---\n\n")}`;
      } catch (e) {
        return `Error searching the web: ${(e as Error).message}`;
      }
    }

    /* ================================================================ */
    /*  WEB FETCH                                                        */
    /* ================================================================ */
    case "web_fetch": {
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

        if (contentType.includes("text/html") || contentType.includes("application/xhtml")) {
          // Extract readable text from HTML
          const extracted = extractTextFromHtml(text);
          const maxChars = 50000;
          const truncated =
            extracted.length > maxChars
              ? extracted.slice(0, maxChars) + "\n\n... [truncated]"
              : extracted;
          return `Content from ${fetchUrl}:\n\n${truncated}`;
        }

        // Plain text / JSON / other
        const maxChars = 50000;
        const truncated =
          text.length > maxChars
            ? text.slice(0, maxChars) + "\n\n... [truncated]"
            : text;
        return `Content from ${fetchUrl}:\n\n${truncated}`;
      } catch (e) {
        return `Error fetching URL: ${(e as Error).message}`;
      }
    }

    /* ================================================================ */
    /*  LIST FILES                                                       */
    /* ================================================================ */
    case "list_files": {
      try {
        const entries = fs.readdirSync(fullPath, { withFileTypes: true });
        const lines = entries.map((e) => {
          const isDir = e.isDirectory();
          let size = "";
          if (!isDir) {
            try {
              const stat = fs.statSync(path.join(fullPath, e.name));
              size = ` (${formatFileSize(stat.size)})`;
            } catch {}
          }
          return `${isDir ? "[dir]  " : "[file] "}${e.name}${size}`;
        });
        return `Contents of \`${toolCall.filePath}\` (${entries.length} entries):\n${lines.join("\n")}`;
      } catch (e) {
        return `Error listing directory: ${(e as Error).message}`;
      }
    }

    /* ================================================================ */
    /*  RUN COMMAND (Bash)                                               */
    /* ================================================================ */
    case "run_command": {
      const cmd = toolCall.command || "";
      if (!cmd) return "Error: No command provided.";

      // Check background task status
      if (cmd.startsWith("bg_status ")) {
        const taskId = cmd.slice(10).trim();
        return checkBackgroundTask(taskId);
      }
      if (cmd.startsWith("bg_cancel ")) {
        const taskId = cmd.slice(10).trim();
        return cancelBackgroundTask(taskId);
      }

      const timeoutMs = Math.min(toolCall.timeout || 120000, 600000);

      if (toolCall.background) {
        const taskId = `bg_${Date.now().toString(36)}`;
        const task = runCommandInBackground(
          session.id,
          cmd,
          rootPath,
          outputChannel,
          taskId,
        );
        backgroundTasks.set(taskId, task);
        return `Command started in background (id: ${taskId}): \`${cmd}\`\nUse run_command with "bg_status ${taskId}" to check status.`;
      }

      // Use integrated terminal when available and enabled
      const useTerminal =
        config.get<boolean>("useIntegratedTerminal", true) && terminalMgr;
      if (useTerminal) {
        try {
          const { output: termOutput, exitCode } =
            await terminalMgr.executeCommand(cmd, rootPath);
          const output =
            termOutput.length > 10000
              ? termOutput.slice(0, 10000) + "\n... [truncated]"
              : termOutput;
          if (exitCode !== undefined && exitCode !== 0) {
            return `Command failed (exit ${exitCode}): \`${cmd}\`\n\`\`\`\n${output}\n\`\`\``;
          }
          return `Command: \`${cmd}\`\n\`\`\`\n${output}\n\`\`\``;
        } catch (e) {
          return `Command failed: \`${cmd}\`\n\`\`\`\n${(e as Error).message}\n\`\`\``;
        }
      }

      try {
        const result = await runCommandWithStreaming(
          cmd,
          rootPath,
          outputChannel,
          timeoutMs,
        );
        const output =
          result.length > 10000
            ? result.slice(0, 10000) + "\n... [truncated]"
            : result;
        return `Command: \`${cmd}\`\n\`\`\`\n${output}\n\`\`\``;
      } catch (e) {
        const err = e as {
          stderr?: string;
          stdout?: string;
          message: string;
        };
        const output = (err.stderr || err.stdout || err.message).slice(0, 10000);
        return `Command failed: \`${cmd}\`\n\`\`\`\n${output}\n\`\`\``;
      }
    }

    /* ================================================================ */
    /*  GREP                                                             */
    /* ================================================================ */
    case "grep": {
      const pattern = toolCall.pattern || "";
      if (!pattern) return "Error: No search pattern provided.";
      try {
        const args = ["--color=never", "-n", "-r"];

        // Output mode
        const mode = toolCall.outputMode || "files_with_matches";
        if (mode === "files_with_matches") {
          args.push("-l");
        } else if (mode === "count") {
          args.push("-c");
        }

        // Context lines
        if (mode === "content") {
          if (toolCall.contextLines !== undefined) {
            args.push(`-C`, String(toolCall.contextLines));
          }
          if (toolCall.beforeLines !== undefined) {
            args.push(`-B`, String(toolCall.beforeLines));
          }
          if (toolCall.afterLines !== undefined) {
            args.push(`-A`, String(toolCall.afterLines));
          }
        }

        // Case insensitive
        if (toolCall.caseInsensitive) {
          args.push("-i");
        }

        // Multiline (use -P for Perl regex with -z for null-delimited)
        if (toolCall.multiline) {
          args.push("-P", "-z");
        }

        // File type filter
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
          const g = typeGlobs[toolCall.grepType] || `*.${toolCall.grepType}`;
          args.push("--include", g);
        } else if (toolCall.glob) {
          args.push("--include", toolCall.glob);
        } else {
          for (const dir of EXCLUDED_DIRS) {
            args.push(`--exclude-dir=${dir}`);
          }
        }

        // Max results
        const maxCount = toolCall.headLimit || 200;
        if (mode !== "files_with_matches") {
          args.push("--max-count=500");
        }

        args.push("-E", pattern);

        // Search path
        const searchPath = toolCall.filePath || ".";
        args.push(searchPath);

        const result = child_process.execFileSync("grep", args, {
          cwd: rootPath,
          encoding: "utf-8",
          timeout: 15000,
          maxBuffer: 1024 * 1024,
        });

        let lines = result.trim().split("\n").filter(Boolean);

        // Apply offset and head limit
        if (toolCall.grepOffset) {
          lines = lines.slice(toolCall.grepOffset);
        }
        if (maxCount && lines.length > maxCount) {
          lines = lines.slice(0, maxCount);
        }

        const output = lines.join("\n");
        const label =
          mode === "files_with_matches"
            ? `${lines.length} file(s)`
            : mode === "count"
              ? `Match counts`
              : `${lines.length} match(es)`;

        return `Search results for \`${pattern}\`${toolCall.glob ? ` (glob: ${toolCall.glob})` : ""} — ${label}:\n\`\`\`\n${output}\n\`\`\``;
      } catch (e) {
        const err = e as {
          status?: number;
          stdout?: string;
          stderr?: string;
          message: string;
        };
        if (err.status === 1) {
          return `No matches found for pattern \`${pattern}\`${toolCall.glob ? ` in ${toolCall.glob}` : ""}.`;
        }
        return `Error searching: ${err.stderr || err.message}`;
      }
    }

    /* ================================================================ */
    /*  GLOB                                                             */
    /* ================================================================ */
    case "glob": {
      const globPattern = toolCall.glob || "";
      if (!globPattern) return "Error: No glob pattern provided.";
      try {
        // Use relative pattern if path is specified
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

        // Sort by modification time (most recent first)
        const filesWithTime = uris.map((u) => {
          let mtime = 0;
          try {
            mtime = fs.statSync(u.fsPath).mtimeMs;
          } catch {}
          return { uri: u, mtime };
        });
        filesWithTime.sort((a, b) => b.mtime - a.mtime);

        const files = filesWithTime.map((f) =>
          vscode.workspace.asRelativePath(f.uri, false),
        );
        return `Files matching \`${globPattern}\` (${files.length} results${files.length === 500 ? ", truncated" : ""}):\n${files.map((f) => `- ${f}`).join("\n")}`;
      } catch (e) {
        return `Error finding files: ${(e as Error).message}`;
      }
    }

    /* ================================================================ */
    /*  GIT STATUS                                                       */
    /* ================================================================ */
    case "git_status": {
      try {
        const result = child_process.execSync("git status --short", {
          cwd: rootPath,
          encoding: "utf-8",
          timeout: 10000,
        });
        if (!result.trim()) return "Git status: Working tree clean.";
        return `Git status:\n\`\`\`\n${result}\`\`\``;
      } catch (e) {
        return `Error running git status: ${(e as Error).message}`;
      }
    }

    /* ================================================================ */
    /*  GIT DIFF                                                         */
    /* ================================================================ */
    case "git_diff": {
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
          const s =
            staged.length > 5000
              ? staged.slice(0, 5000) + "\n... [truncated]"
              : staged;
          parts.push(`Staged changes:\n\`\`\`diff\n${s}\n\`\`\``);
        }
        if (unstaged.trim()) {
          const u =
            unstaged.length > 5000
              ? unstaged.slice(0, 5000) + "\n... [truncated]"
              : unstaged;
          parts.push(`Unstaged changes:\n\`\`\`diff\n${u}\n\`\`\``);
        }
        return parts.join("\n\n");
      } catch (e) {
        return `Error running git diff: ${(e as Error).message}`;
      }
    }

    /* ================================================================ */
    /*  GIT COMMIT                                                       */
    /* ================================================================ */
    case "git_commit": {
      const msg = toolCall.commitMessage || "";
      if (!msg) return "Error: No commit message provided.";
      try {
        // Only stage files that were modified during this session (via checkpoints)
        const modifiedFiles = new Set<string>();
        for (const cp of session.checkpoints) {
          for (const filePath of cp.files.keys()) {
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
          // Fallback: stage all tracked changes (not untracked files)
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
      } catch (e) {
        const err = e as {
          stderr?: string;
          stdout?: string;
          message: string;
        };
        return `Git commit failed:\n\`\`\`\n${err.stderr || err.stdout || err.message}\n\`\`\``;
      }
    }

    /* ================================================================ */
    /*  TODO WRITE                                                       */
    /* ================================================================ */
    case "todo_write": {
      const todos = toolCall.todos || [];
      if (todos.length === 0) return "Todo list cleared.";

      const lines = todos.map((t, i) => {
        const icon =
          t.status === "completed"
            ? "[x]"
            : t.status === "in_progress"
              ? "[~]"
              : "[ ]";
        return `${i + 1}. ${icon} ${t.content}`;
      });
      return `Task list updated:\n${lines.join("\n")}`;
    }

    /* ================================================================ */
    /*  MEMORY READ                                                      */
    /* ================================================================ */
    case "memory_read": {
      if (!memoryMgr) return "Memory system not available.";
      const query = toolCall.memoryQuery;
      const typeFilter = toolCall.memoryType as MemoryType | undefined;

      let results = query ? memoryMgr.search(query) : memoryMgr.getAll();
      if (typeFilter) {
        results = results.filter((m) => m.type === typeFilter);
      }

      if (results.length === 0) {
        return query
          ? `No memories found matching "${query}".`
          : "No memories stored yet.";
      }

      const lines = results.map(
        (m) => `- **${m.name}** [${m.type}]: ${m.content}`,
      );
      return `Memories (${results.length}):\n${lines.join("\n")}`;
    }

    /* ================================================================ */
    /*  MEMORY WRITE                                                     */
    /* ================================================================ */
    case "memory_write": {
      if (!memoryMgr) return "Memory system not available.";
      const type = (toolCall.memoryType || "project") as MemoryType;
      const name = toolCall.memoryName || "";
      const description = toolCall.memoryDescription || "";
      const content = toolCall.memoryContent || "";

      if (!name) return "Error: Memory name is required.";
      if (!content) return "Error: Memory content is required.";

      const entry = memoryMgr.upsert(type, name, description, content);
      return `Memory saved: **${entry.name}** [${entry.type}]`;
    }

    /* ================================================================ */
    /*  MEMORY DELETE                                                    */
    /* ================================================================ */
    case "memory_delete": {
      if (!memoryMgr) return "Memory system not available.";
      const name = toolCall.memoryName || "";
      if (!name) return "Error: Memory name is required.";

      const removed = memoryMgr.remove(name);
      return removed
        ? `Memory "${name}" removed.`
        : `No memory found with name "${name}".`;
    }

    default:
      return `Unknown tool type: ${toolCall.type}`;
  }
}

/* ================================================================== */
/*  HTML text extraction for web_fetch                                 */
/* ================================================================== */

function extractTextFromHtml(html: string): string {
  // Remove script and style blocks
  let text = html.replace(/<script[\s\S]*?<\/script>/gi, "");
  text = text.replace(/<style[\s\S]*?<\/style>/gi, "");
  text = text.replace(/<noscript[\s\S]*?<\/noscript>/gi, "");

  // Convert common block elements to newlines
  text = text.replace(/<\/?(p|div|br|hr|h[1-6]|li|tr|td|th|blockquote|pre|section|article|header|footer|nav|aside|main)[^>]*>/gi, "\n");

  // Convert links to markdown-ish format
  text = text.replace(/<a[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, "$2");

  // Strip remaining tags
  text = text.replace(/<[^>]+>/g, "");

  // Decode common HTML entities
  text = text.replace(/&amp;/g, "&");
  text = text.replace(/&lt;/g, "<");
  text = text.replace(/&gt;/g, ">");
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");
  text = text.replace(/&nbsp;/g, " ");

  // Collapse whitespace
  text = text.replace(/[ \t]+/g, " ");
  text = text.replace(/\n{3,}/g, "\n\n");

  return text.trim();
}

/* ================================================================== */
/*  Background task tracking                                           */
/* ================================================================== */

type BackgroundTask = {
  id: string;
  sessionId: string;
  cmd: string;
  cwd: string;
  proc?: child_process.ChildProcess;
  status: HarnessBackgroundTaskStatus;
  output: string;
  exitCode?: number;
  updatedAt: number;
};

const MAX_BACKGROUND_TASKS = 100;
const backgroundTasks = new Map<string, BackgroundTask>();
const backgroundTaskListeners = new Set<(task: BackgroundTaskSnapshot) => void>();

export type BackgroundTaskSnapshot = HarnessBackgroundTask & {
  sessionId: string;
};

function pruneBackgroundTasks() {
  if (backgroundTasks.size <= MAX_BACKGROUND_TASKS) return;
  const keys = Array.from(backgroundTasks.keys());
  for (let i = 0; i < keys.length - MAX_BACKGROUND_TASKS; i++) {
    const task = backgroundTasks.get(keys[i]);
    if (task && task.status !== "running") {
      backgroundTasks.delete(keys[i]);
    }
  }
}

function emitBackgroundTask(task: BackgroundTask) {
  const snapshot = toBackgroundTaskSnapshot(task);
  for (const listener of backgroundTaskListeners) {
    listener(snapshot);
  }
}

function toBackgroundTaskSnapshot(task: BackgroundTask): BackgroundTaskSnapshot {
  return {
    id: task.id,
    sessionId: task.sessionId,
    command: task.cmd,
    status: task.status,
    outputPreview:
      task.output.length > 2000 ? task.output.slice(-2000) : task.output,
    exitCode: task.exitCode,
    updatedAt: task.updatedAt,
    cwd: task.cwd,
  };
}

export function restoreBackgroundTaskSnapshots(
  tasks: BackgroundTaskSnapshot[],
) {
  for (const snapshot of tasks) {
    const status =
      snapshot.status === "running" ? "interrupted" : snapshot.status;
    const restored: BackgroundTask = {
      id: snapshot.id,
      sessionId: snapshot.sessionId,
      cmd: snapshot.command,
      cwd: snapshot.cwd || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "",
      status,
      output: snapshot.outputPreview || "",
      exitCode: snapshot.exitCode,
      updatedAt: snapshot.updatedAt,
    };

    backgroundTasks.set(restored.id, restored);
  }
  pruneBackgroundTasks();
}

export function subscribeToBackgroundTasks(
  listener: (task: BackgroundTaskSnapshot) => void,
): vscode.Disposable {
  backgroundTaskListeners.add(listener);
  return new vscode.Disposable(() => {
    backgroundTaskListeners.delete(listener);
  });
}

function runCommandInBackground(
  sessionId: string,
  cmd: string,
  cwd: string,
  outputChannel: vscode.OutputChannel,
  taskId: string,
): BackgroundTask {
  const task: BackgroundTask = {
    id: taskId,
    sessionId,
    cmd,
    cwd,
    status: "running",
    output: "",
    updatedAt: Date.now(),
  };

  outputChannel.appendLine(`▶ [${taskId}] Background: ${cmd}`);
  emitBackgroundTask(task);
  const proc = child_process.spawn("sh", ["-c", cmd], {
    cwd,
    env: { ...process.env, TERM: "dumb" },
  });
  task.proc = proc;

  proc.stdout?.on("data", (data: Buffer) => {
    const chunk = data.toString();
    task.output += chunk;
    task.updatedAt = Date.now();
    outputChannel.append(chunk);
    emitBackgroundTask(task);
  });

  proc.stderr?.on("data", (data: Buffer) => {
    const chunk = data.toString();
    task.output += chunk;
    task.updatedAt = Date.now();
    outputChannel.append(chunk);
    emitBackgroundTask(task);
  });

  proc.on("close", (code) => {
    if (task.status === "cancelled") {
      task.exitCode = code ?? 130;
      task.updatedAt = Date.now();
      outputChannel.appendLine(`▶ [${taskId}] Cancelled`);
      pruneBackgroundTasks();
      emitBackgroundTask(task);
      return;
    }
    task.exitCode = code ?? 1;
    task.status = code === 0 ? "completed" : "failed";
    task.updatedAt = Date.now();
    outputChannel.appendLine(`▶ [${taskId}] Exit code: ${code}`);
    pruneBackgroundTasks();
    emitBackgroundTask(task);
    void vscode.window.showInformationMessage(
      `Background command ${task.status}: ${cmd.slice(0, 50)}`,
    );
  });

  proc.on("error", (err) => {
    task.status = "failed";
    task.output += `\nError: ${err.message}`;
    task.updatedAt = Date.now();
    emitBackgroundTask(task);
  });

  return task;
}

export function startBackgroundCommand(
  sessionId: string,
  cmd: string,
  cwd: string,
  outputChannel: vscode.OutputChannel,
) {
  const taskId = `bg_${Date.now().toString(36)}`;
  const task = runCommandInBackground(sessionId, cmd, cwd, outputChannel, taskId);
  backgroundTasks.set(taskId, task);
  return taskId;
}

/** Check status of a background task. */
export function checkBackgroundTask(taskId: string): string {
  const task = backgroundTasks.get(taskId);
  if (!task) return `No background task found with id: ${taskId}`;

  const output =
    task.output.length > 5000
      ? task.output.slice(-5000) + "\n... [showing last 5000 chars]"
      : task.output;

  const note =
    task.status === "interrupted"
      ? "\nNote: This task was still running before PocketAI reloaded, so it is preserved as interrupted history."
      : "";

  return `Background task ${taskId} (${task.status}):\nCommand: \`${task.cmd}\`${task.cwd ? `\nCwd: \`${task.cwd}\`` : ""}${task.exitCode !== undefined ? `\nExit code: ${task.exitCode}` : ""}${note}\n\`\`\`\n${output}\n\`\`\``;
}

export function cancelBackgroundTask(
  taskId: string,
): string {
  const task = backgroundTasks.get(taskId);
  if (!task) return `No background task found with id: ${taskId}`;
  if (task.status !== "running" || !task.proc) {
    return `Background task ${taskId} is not currently running.`;
  }

  task.status = "cancelled";
  task.output += `${task.output ? "\n" : ""}[Cancelled by user]`;
  task.updatedAt = Date.now();
  emitBackgroundTask(task);

  try {
    task.proc.kill("SIGTERM");
    setTimeout(() => {
      if (task.proc && task.status === "cancelled") {
        try {
          task.proc.kill("SIGKILL");
        } catch {}
      }
    }, 1500);
    return `Cancellation requested for background task ${taskId}.`;
  } catch (error) {
    task.status = "failed";
    task.output += `\n[Cancellation error: ${(error as Error).message}]`;
    task.updatedAt = Date.now();
    emitBackgroundTask(task);
    return `Failed to cancel background task ${taskId}: ${(error as Error).message}`;
  }
}

export function rerunBackgroundTask(
  taskId: string,
  outputChannel: vscode.OutputChannel,
): string {
  const task = backgroundTasks.get(taskId);
  if (!task) return `No background task found with id: ${taskId}`;
  if (task.status === "running") {
    return `Background task ${taskId} is still running. Cancel it before rerunning.`;
  }

  const nextTaskId = startBackgroundCommand(
    task.sessionId,
    task.cmd,
    task.cwd,
    outputChannel,
  );
  return `Reran background task ${taskId} as ${nextTaskId}: \`${task.cmd}\``;
}

export function removeBackgroundTasks(taskIds: string[]): number {
  let removed = 0;
  for (const taskId of taskIds) {
    if (backgroundTasks.delete(taskId)) {
      removed += 1;
    }
  }
  return removed;
}

/** Runs a shell command with streaming output to the output channel. */
export function runCommandWithStreaming(
  cmd: string,
  cwd: string,
  outputChannel: vscode.OutputChannel,
  timeoutMs = 120000,
): Promise<string> {
  return new Promise((resolve, reject) => {
    outputChannel.appendLine(`▶ Running: ${cmd}`);
    const proc = child_process.spawn("sh", ["-c", cmd], {
      cwd,
      env: { ...process.env, TERM: "dumb" },
    });

    let stdout = "";
    let stderr = "";
    const maxBuffer = 2 * 1024 * 1024; // 2MB

    proc.stdout?.on("data", (data: Buffer) => {
      const chunk = data.toString();
      if (stdout.length < maxBuffer) {
        stdout += chunk;
        outputChannel.append(chunk);
      }
    });

    proc.stderr?.on("data", (data: Buffer) => {
      const chunk = data.toString();
      if (stderr.length < maxBuffer) {
        stderr += chunk;
        outputChannel.append(chunk);
      }
    });

    const timeout = setTimeout(() => {
      proc.kill("SIGTERM");
      reject({
        message: `Command timed out after ${timeoutMs / 1000}s: ${cmd}`,
        stderr,
        stdout,
      });
    }, timeoutMs);

    proc.on("close", (code) => {
      clearTimeout(timeout);
      outputChannel.appendLine(`▶ Exit code: ${code}`);
      if (code === 0) {
        resolve(stdout);
      } else {
        reject({ message: `Exit code ${code}`, stderr, stdout });
      }
    });

    proc.on("error", (err) => {
      clearTimeout(timeout);
      reject({ message: err.message, stderr, stdout });
    });
  });
}

export async function executeToolCallWithHooks(
  config: vscode.WorkspaceConfiguration,
  outputChannel: vscode.OutputChannel,
  session: ChatSession,
  toolCall: ToolCall,
  terminalMgr?: TerminalManager,
  memoryMgr?: MemoryManager,
): Promise<string> {
  const result = await executeToolCall(
    config,
    outputChannel,
    session,
    toolCall,
    terminalMgr,
    memoryMgr,
  );
  void runHooks(config, outputChannel, "postToolUse", {
    tool: toolCall.type,
    file: toolCall.filePath,
  });
  return result;
}
