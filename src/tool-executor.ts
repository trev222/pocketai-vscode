import * as fs from "fs";
import * as path from "path";
import * as child_process from "child_process";
import * as vscode from "vscode";
import type { ToolCall, ToolCallType, ChatSession } from "./types";
import { formatFileSize } from "./helpers";
import { checkPermissionRules } from "./permissions";
import { runHooks } from "./hooks";
import { createCheckpoint } from "./checkpoints";
import { EXCLUDED_DIRS, EXCLUDED_DIRS_GLOB } from "./constants";
import type { TerminalManager } from "./terminal-manager";

/** Returns the primary argument for a tool call (used for permission checks). */
function getToolArg(tc: ToolCall): string {
  const argByType: Partial<Record<ToolCallType, string>> = {
    web_search: tc.query || "",
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
): Promise<string> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders?.length) {
    return "Error: No workspace folder open.";
  }

  const rootPath = workspaceFolders[0].uri.fsPath;
  const fullPath = path.resolve(rootPath, toolCall.filePath);

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

  // Security: ensure the path is within the workspace
  if (!fullPath.startsWith(rootPath)) {
    return "Error: Path is outside the workspace.";
  }

  switch (toolCall.type) {
    case "read_file": {
      try {
        const content = fs.readFileSync(fullPath, "utf-8");
        const lines = content.split("\n");
        const TRUNCATE_THRESHOLD = 500;
        const HEAD_LINES = 200;
        const TAIL_LINES = 200;

        let numbered: string;
        if (lines.length > TRUNCATE_THRESHOLD) {
          const head = lines
            .slice(0, HEAD_LINES)
            .map((line, i) => `${String(i + 1).padStart(4)}: ${line}`)
            .join("\n");
          const tail = lines
            .slice(-TAIL_LINES)
            .map((line, i) => `${String(lines.length - TAIL_LINES + i + 1).padStart(4)}: ${line}`)
            .join("\n");
          const truncated = lines.length - HEAD_LINES - TAIL_LINES;
          numbered = `${head}\n\n... [${truncated} lines truncated] ...\n\n${tail}`;
        } else {
          numbered = lines
            .map((line, i) => `${String(i + 1).padStart(4)}: ${line}`)
            .join("\n");
        }
        return `Contents of \`${toolCall.filePath}\` (${lines.length} lines):\n\`\`\`\n${numbered}\n\`\`\``;
      } catch (e) {
        return `Error reading file: ${(e as Error).message}`;
      }
    }

    case "edit_file": {
      try {
        const content = fs.readFileSync(fullPath, "utf-8");
        if (!toolCall.search || !content.includes(toolCall.search)) {
          const lines = content.split("\n");
          const snippet = lines.slice(0, Math.min(20, lines.length)).join("\n");
          return `Error: Search text not found in \`${toolCall.filePath}\`.\n\nSearched for:\n\`\`\`\n${toolCall.search}\n\`\`\`\n\nFirst ${Math.min(20, lines.length)} lines of file:\n\`\`\`\n${snippet}\n\`\`\`\n\nTip: Re-read the file to get its current contents before editing.`;
        }
        // Uniqueness check: ensure the search text appears exactly once
        const occurrences = content.split(toolCall.search).length - 1;
        if (occurrences > 1) {
          return `Error: Search text matches ${occurrences} locations in \`${toolCall.filePath}\`. Include more surrounding context in the SEARCH block to uniquely identify the edit location.`;
        }
        createCheckpoint(session, [toolCall.filePath]);
        const newContent = content.replace(toolCall.search, toolCall.replace || "");
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

    case "create_file": {
      try {
        createCheckpoint(session, [toolCall.filePath]);
        const dir = path.dirname(fullPath);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(fullPath, toolCall.content || "", "utf-8");
        void runHooks(config, outputChannel, "postCreate", {
          file: toolCall.filePath,
          tool: "create_file",
        });
        return `Successfully created \`${toolCall.filePath}\`.`;
      } catch (e) {
        return `Error creating file: ${(e as Error).message}`;
      }
    }

    case "web_search": {
      try {
        const query = toolCall.query || "";
        const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
        const response = await fetch(url, {
          headers: { "User-Agent": "PocketAI/1.0" },
        });
        const html = await response.text();

        const results: string[] = [];
        const resultRegex =
          /<a rel="nofollow" class="result__a" href="[^"]*"[^>]*>(.+?)<\/a>[\s\S]*?<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
        let m;
        while ((m = resultRegex.exec(html)) !== null && results.length < 5) {
          const title = m[1].replace(/<[^>]+>/g, "").trim();
          const snippet = m[2].replace(/<[^>]+>/g, "").trim();
          if (title && snippet) {
            results.push(`**${title}**\n${snippet}`);
          }
        }

        if (results.length === 0) {
          const snippetRegex = /<a class="result__snippet"[^>]*>([\s\S]*?)<\/a>/g;
          while ((m = snippetRegex.exec(html)) !== null && results.length < 5) {
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

    case "run_command": {
      const cmd = toolCall.command || "";
      if (!cmd) return "Error: No command provided.";

      // Check background task status
      if (cmd.startsWith("bg_status ")) {
        const taskId = cmd.slice(10).trim();
        return checkBackgroundTask(taskId);
      }

      if (toolCall.background) {
        const taskId = `bg_${Date.now().toString(36)}`;
        const task = runCommandInBackground(cmd, rootPath, outputChannel, taskId);
        backgroundTasks.set(taskId, task);
        return `Command started in background (id: ${taskId}): \`${cmd}\`\nUse @run_command: bg_status ${taskId} to check status.`;
      }

      // Use integrated terminal when available and enabled
      const useTerminal = config.get<boolean>("useIntegratedTerminal", true) && terminalMgr;
      if (useTerminal) {
        try {
          const { output: termOutput, exitCode } = await terminalMgr.executeCommand(cmd, rootPath);
          const output = termOutput.length > 10000
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
        const result = await runCommandWithStreaming(cmd, rootPath, outputChannel);
        const output =
          result.length > 10000
            ? result.slice(0, 10000) + "\n... [truncated]"
            : result;
        return `Command: \`${cmd}\`\n\`\`\`\n${output}\n\`\`\``;
      } catch (e) {
        const err = e as { stderr?: string; stdout?: string; message: string };
        const output = (err.stderr || err.stdout || err.message).slice(0, 10000);
        return `Command failed: \`${cmd}\`\n\`\`\`\n${output}\n\`\`\``;
      }
    }

    case "grep": {
      const pattern = toolCall.pattern || "";
      if (!pattern) return "Error: No search pattern provided.";
      try {
        const args = ["--color=never", "-n", "-r", "--max-count=100"];
        if (toolCall.glob) {
          args.push("--include", toolCall.glob);
        } else {
          for (const dir of EXCLUDED_DIRS) {
            args.push(`--exclude-dir=${dir}`);
          }
        }
        args.push("-E", pattern, ".");
        const result = child_process.execFileSync("grep", args, {
          cwd: rootPath,
          encoding: "utf-8",
          timeout: 15000,
          maxBuffer: 512 * 1024,
        });
        const lines = result.trim().split("\n");
        const truncated = lines.length > 100;
        const output = lines.slice(0, 100).join("\n");
        return `Search results for \`${pattern}\`${toolCall.glob ? ` (glob: ${toolCall.glob})` : ""} — ${Math.min(lines.length, 100)} matches${truncated ? " [truncated]" : ""}:\n\`\`\`\n${output}\n\`\`\``;
      } catch (e) {
        const err = e as { status?: number; stdout?: string; stderr?: string; message: string };
        if (err.status === 1) {
          return `No matches found for pattern \`${pattern}\`${toolCall.glob ? ` in ${toolCall.glob}` : ""}.`;
        }
        return `Error searching: ${err.stderr || err.message}`;
      }
    }

    case "glob": {
      const globPattern = toolCall.glob || "";
      if (!globPattern) return "Error: No glob pattern provided.";
      try {
        const uris = await vscode.workspace.findFiles(
          globPattern,
          EXCLUDED_DIRS_GLOB,
          200,
        );
        if (uris.length === 0) {
          return `No files found matching \`${globPattern}\`.`;
        }
        const files = uris
          .map((u) => vscode.workspace.asRelativePath(u, false))
          .sort();
        return `Files matching \`${globPattern}\` (${files.length} results${files.length === 200 ? ", truncated" : ""}):\n${files.map((f) => `- ${f}`).join("\n")}`;
      } catch (e) {
        return `Error finding files: ${(e as Error).message}`;
      }
    }

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

    case "git_diff": {
      try {
        const result = child_process.execSync("git diff", {
          cwd: rootPath,
          encoding: "utf-8",
          timeout: 10000,
          maxBuffer: 512 * 1024,
        });
        if (!result.trim()) {
          const staged = child_process.execSync("git diff --cached", {
            cwd: rootPath,
            encoding: "utf-8",
            timeout: 10000,
            maxBuffer: 512 * 1024,
          });
          if (!staged.trim()) return "No changes (working tree and staging area are clean).";
          const output = staged.length > 5000 ? staged.slice(0, 5000) + "\n... [truncated]" : staged;
          return `Staged changes:\n\`\`\`diff\n${output}\n\`\`\``;
        }
        const output = result.length > 5000 ? result.slice(0, 5000) + "\n... [truncated]" : result;
        return `Unstaged changes:\n\`\`\`diff\n${output}\n\`\`\``;
      } catch (e) {
        return `Error running git diff: ${(e as Error).message}`;
      }
    }

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
        const err = e as { stderr?: string; stdout?: string; message: string };
        return `Git commit failed:\n\`\`\`\n${err.stderr || err.stdout || err.message}\n\`\`\``;
      }
    }

    default:
      return "Unknown tool type.";
  }
}

/** Background task tracking. */
type BackgroundTask = {
  cmd: string;
  status: "running" | "completed" | "failed";
  output: string;
  exitCode?: number;
};

const backgroundTasks = new Map<string, BackgroundTask>();

function runCommandInBackground(
  cmd: string,
  cwd: string,
  outputChannel: vscode.OutputChannel,
  taskId: string,
): BackgroundTask {
  const task: BackgroundTask = { cmd, status: "running", output: "" };

  outputChannel.appendLine(`▶ [${taskId}] Background: ${cmd}`);
  const proc = child_process.spawn("sh", ["-c", cmd], {
    cwd,
    env: { ...process.env, TERM: "dumb" },
  });

  proc.stdout?.on("data", (data: Buffer) => {
    const chunk = data.toString();
    task.output += chunk;
    outputChannel.append(chunk);
  });

  proc.stderr?.on("data", (data: Buffer) => {
    const chunk = data.toString();
    task.output += chunk;
    outputChannel.append(chunk);
  });

  proc.on("close", (code) => {
    task.exitCode = code ?? 1;
    task.status = code === 0 ? "completed" : "failed";
    outputChannel.appendLine(`▶ [${taskId}] Exit code: ${code}`);
    void vscode.window.showInformationMessage(
      `Background command ${task.status}: ${cmd.slice(0, 50)}`,
    );
  });

  proc.on("error", (err) => {
    task.status = "failed";
    task.output += `\nError: ${err.message}`;
  });

  return task;
}

/** Check status of a background task. */
export function checkBackgroundTask(taskId: string): string {
  const task = backgroundTasks.get(taskId);
  if (!task) return `No background task found with id: ${taskId}`;

  const output = task.output.length > 5000
    ? task.output.slice(-5000) + "\n... [showing last 5000 chars]"
    : task.output;

  return `Background task ${taskId} (${task.status}):\nCommand: \`${task.cmd}\`${task.exitCode !== undefined ? `\nExit code: ${task.exitCode}` : ""}\n\`\`\`\n${output}\n\`\`\``;
}

/** Runs a shell command with streaming output to the output channel. */
function runCommandWithStreaming(
  cmd: string,
  cwd: string,
  outputChannel: vscode.OutputChannel,
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
      reject({ message: `Command timed out after 120s: ${cmd}`, stderr, stdout });
    }, 120000);

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
): Promise<string> {
  const result = await executeToolCall(config, outputChannel, session, toolCall, terminalMgr);
  void runHooks(config, outputChannel, "postToolUse", {
    tool: toolCall.type,
    file: toolCall.filePath,
  });
  return result;
}
