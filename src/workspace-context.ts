import * as os from "os";
import * as fs from "fs";
import * as child_process from "child_process";
import * as vscode from "vscode";
import type { ChatSession, ResourceWarning, RuntimeDiagnostics } from "./types";
import {
  DEFAULT_WORKSPACE_FILE_LIMIT,
  DEFAULT_CURRENT_FILE_CHAR_LIMIT,
  DEFAULT_CONTEXT_WINDOW_SIZE,
  TOOL_USE_INSTRUCTIONS,
  EXCLUDED_DIRS_GLOB,
} from "./constants";

/**
 * Rough token estimate: ~4 chars per token for English/code.
 * Used for budget-aware context building.
 */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export async function buildWorkspaceContext(
  config: vscode.WorkspaceConfiguration,
  session?: ChatSession,
): Promise<string> {
  const workspaceFolders = vscode.workspace.workspaceFolders ?? [];
  const activeEditor = vscode.window.activeTextEditor;
  const activeDoc = activeEditor?.document;
  const fileLimit = Math.max(
    25,
    config.get<number>("workspaceFileLimit") ?? DEFAULT_WORKSPACE_FILE_LIMIT,
  );
  const charLimit = Math.max(
    2000,
    config.get<number>("currentFileCharLimit") ?? DEFAULT_CURRENT_FILE_CHAR_LIMIT,
  );

  if (!config.get<boolean>("includeWorkspaceContext", true)) return "";

  // Token budget: reserve a portion of the context window for workspace context.
  // As the conversation grows, shrink the workspace context to leave room.
  const contextWindowSize =
    config.get<number>("contextWindowSize") ?? DEFAULT_CONTEXT_WINDOW_SIZE;
  const maxWorkspaceTokens = Math.floor(contextWindowSize * 0.25); // 25% of context window
  let transcriptTokens = 0;
  if (session) {
    for (const entry of session.transcript) {
      transcriptTokens += estimateTokens(entry.content);
    }
  }
  // Remaining budget for workspace context (minimum 500 tokens)
  const tokenBudget = Math.max(500, maxWorkspaceTokens - Math.floor(transcriptTokens * 0.1));
  let usedTokens = 0;

  const roots = workspaceFolders.map((f) => f.name);

  const sections: string[] = [];

  const header = "You are working inside the user's VS Code workspace.";
  sections.push(header);
  usedTokens += estimateTokens(header);

  if (roots.length) {
    const rootsLine = `Workspace roots: ${roots.join(", ")}`;
    sections.push(rootsLine);
    usedTokens += estimateTokens(rootsLine);
  }

  // File tree — adaptive: shrink file count when budget is tight
  const adaptiveFileLimit = usedTokens > tokenBudget * 0.5
    ? Math.min(fileLimit, 50)
    : fileLimit;
  const fileUris = await vscode.workspace.findFiles(
    "**/*",
    EXCLUDED_DIRS_GLOB,
    adaptiveFileLimit,
  );
  const fileList = fileUris
    .map((uri) => vscode.workspace.asRelativePath(uri, false))
    .filter(Boolean)
    .sort();

  if (fileList.length) {
    const fileTree = `File tree (${fileList.length}${fileList.length === adaptiveFileLimit ? "+" : ""} files):\n${fileList.map((f) => `- ${f}`).join("\n")}`;
    const fileTreeTokens = estimateTokens(fileTree);
    if (usedTokens + fileTreeTokens < tokenBudget) {
      sections.push(fileTree);
      usedTokens += fileTreeTokens;
    } else {
      // Truncate file list to fit budget
      const maxFiles = Math.max(10, Math.floor((tokenBudget - usedTokens) / 15));
      const truncatedList = fileList.slice(0, maxFiles);
      const truncatedTree = `File tree (${truncatedList.length} of ${fileList.length} files):\n${truncatedList.map((f) => `- ${f}`).join("\n")}\n... [${fileList.length - truncatedList.length} more files]`;
      sections.push(truncatedTree);
      usedTokens += estimateTokens(truncatedTree);
    }
  }

  if (activeDoc) {
    const activePath =
      vscode.workspace.asRelativePath(activeDoc.uri, false) ??
      activeDoc.uri.fsPath;
    const selText = activeEditor?.selection
      ? activeDoc.getText(activeEditor.selection).trim()
      : "";
    sections.push(`Active file: ${activePath}`);
    usedTokens += estimateTokens(`Active file: ${activePath}`);

    if (selText) {
      const selSlice = selText.slice(0, 3000);
      const selSection = `Selected text:\n${selSlice}`;
      usedTokens += estimateTokens(selSection);
      sections.push(selSection);
    }

    // Active file contents — adaptive char limit based on remaining budget
    const remainingBudgetChars = Math.max(1000, (tokenBudget - usedTokens) * 4);
    const adaptiveCharLimit = Math.min(charLimit, remainingBudgetChars);

    const fullText = activeDoc.getText();
    const numbered = fullText
      .slice(0, adaptiveCharLimit)
      .split(/\r?\n/)
      .map((line, i) => `${String(i + 1).padStart(4)}: ${line}`)
      .join("\n");
    const activeFileSection = `Active file contents:\n${numbered}${fullText.length > adaptiveCharLimit ? "\n... [truncated]" : ""}`;
    sections.push(activeFileSection);
    usedTokens += estimateTokens(activeFileSection);
  }

  // Open editor tabs (excluding active file) — only if budget allows
  if (usedTokens < tokenBudget * 0.85) {
    const activeRelPath = activeDoc
      ? vscode.workspace.asRelativePath(activeDoc.uri, false)
      : "";
    const openTabs: string[] = [];
    for (const group of vscode.window.tabGroups.all) {
      for (const tab of group.tabs) {
        if (tab.input && (tab.input as { uri?: vscode.Uri }).uri) {
          const uri = (tab.input as { uri: vscode.Uri }).uri;
          const relPath = vscode.workspace.asRelativePath(uri, false);
          if (relPath && relPath !== activeRelPath && !openTabs.includes(relPath)) {
            openTabs.push(relPath);
          }
        }
      }
    }
    if (openTabs.length) {
      const tabSection = `Open editor tabs:\n${openTabs.map((f) => `- ${f}`).join("\n")}`;
      sections.push(tabSection);
      usedTokens += estimateTokens(tabSection);
    }
  }

  // Git branch and status — only if budget allows
  if (config.get<boolean>("includeGitContext", true) && usedTokens < tokenBudget * 0.9) {
    const rootPath = workspaceFolders[0]?.uri.fsPath;
    if (rootPath) {
      try {
        const branch = child_process
          .execSync("git branch --show-current", {
            cwd: rootPath,
            encoding: "utf-8",
            timeout: 5000,
          })
          .trim();
        const gitStatus = child_process
          .execSync("git status --short", {
            cwd: rootPath,
            encoding: "utf-8",
            timeout: 5000,
          })
          .trim();
        const gitSection = [`Git branch: ${branch || "(detached HEAD)"}`];
        if (gitStatus) {
          const statusLimit = Math.min(2000, (tokenBudget - usedTokens) * 4);
          gitSection.push(
            `Git status:\n${gitStatus.slice(0, statusLimit)}${gitStatus.length > statusLimit ? "\n... [truncated]" : ""}`,
          );
        } else {
          gitSection.push("Git status: clean");
        }
        const gitText = gitSection.join("\n");
        sections.push(gitText);
        usedTokens += estimateTokens(gitText);
      } catch {
        // Not a git repo or git not available
      }
    }
  }

  // VS Code diagnostics (errors and warnings) — only if budget allows
  if (config.get<boolean>("includeDiagnostics", true) && usedTokens < tokenBudget * 0.95) {
    const allDiagnostics = vscode.languages.getDiagnostics();
    const issues: string[] = [];
    const maxIssues = usedTokens > tokenBudget * 0.8 ? 10 : 20;
    for (const [uri, diagnostics] of allDiagnostics) {
      const relPath = vscode.workspace.asRelativePath(uri, false);
      for (const d of diagnostics) {
        if (
          d.severity === vscode.DiagnosticSeverity.Error ||
          d.severity === vscode.DiagnosticSeverity.Warning
        ) {
          const severity =
            d.severity === vscode.DiagnosticSeverity.Error
              ? "error"
              : "warning";
          issues.push(
            `- ${relPath}:${d.range.start.line + 1} ${severity}: ${d.message.slice(0, 200)}`,
          );
          if (issues.length >= maxIssues) break;
        }
      }
      if (issues.length >= maxIssues) break;
    }
    if (issues.length) {
      sections.push(`VS Code diagnostics:\n${issues.join("\n")}`);
    }
  }

  return sections.filter(Boolean).join("\n\n");
}

export function buildDiagnostics(
  baseUrl: string,
  statusSummary: string,
  models: string[],
): RuntimeDiagnostics {
  const totalMemoryBytes = os.totalmem();
  const totalMemoryGB = +(totalMemoryBytes / 1024 ** 3).toFixed(1);

  let freeMemoryGB = +(os.freemem() / 1024 ** 3).toFixed(1);
  try {
    if (process.platform === "darwin") {
      const child_process = require("child_process");
      const vmstat = child_process.execSync("vm_stat", { encoding: "utf-8" });
      const pageSize = parseInt(
        vmstat.match(/page size of (\d+)/)?.[1] || "16384",
        10,
      );
      const free = parseInt(
        vmstat.match(/Pages free:\s+(\d+)/)?.[1] || "0",
        10,
      );
      const inactive = parseInt(
        vmstat.match(/Pages inactive:\s+(\d+)/)?.[1] || "0",
        10,
      );
      const purgeable = parseInt(
        vmstat.match(/Pages purgeable:\s+(\d+)/)?.[1] || "0",
        10,
      );
      freeMemoryGB = +(
        ((free + inactive + purgeable) * pageSize) /
        1024 ** 3
      ).toFixed(1);
    }
  } catch {}

  const warnings: ResourceWarning[] = [];

  if (freeMemoryGB < 2) {
    warnings.push({
      type: "memory",
      message: `Low available RAM: ${freeMemoryGB} GB of ${totalMemoryGB} GB. Local models may not run properly.`,
    });
  } else if (totalMemoryGB < 8) {
    warnings.push({
      type: "memory",
      message: `${totalMemoryGB} GB total RAM. Larger models may require 8+ GB.`,
    });
  }

  try {
    const stats = fs.statfsSync(os.homedir());
    const freeStorageBytes = stats.bavail * stats.bsize;
    const freeStorageGB = +(freeStorageBytes / 1024 ** 3).toFixed(1);
    if (freeStorageGB < 5) {
      warnings.push({
        type: "storage",
        message: `Low disk space: ${freeStorageGB} GB free. Models need several GB for download + runtime.`,
      });
    }
  } catch {}

  return {
    baseUrl,
    statusSummary,
    detectedModelIds: models,
    totalMemoryGB,
    freeMemoryGB,
    resourceWarnings: warnings,
  };
}

export function estimateSessionTokens(
  session: ChatSession,
  config: vscode.WorkspaceConfiguration,
  projectInstructionsCache: string,
  activeSystemPrompt: string,
): number {
  if (session.lastTokenUsage) {
    return (
      session.lastTokenUsage.promptTokens +
      session.lastTokenUsage.completionTokens
    );
  }

  let charCount = projectInstructionsCache.length;
  charCount += (
    activeSystemPrompt ||
    "You are PocketAI, a concise and helpful coding assistant inside VS Code."
  ).length;
  charCount += TOOL_USE_INSTRUCTIONS.length;
  for (const entry of session.transcript) {
    charCount += entry.content.length;
  }
  if (config.get<boolean>("includeWorkspaceContext", true)) {
    const charLimit =
      config.get<number>("currentFileCharLimit") ??
      DEFAULT_CURRENT_FILE_CHAR_LIMIT;
    const fileCount = Math.min(
      config.get<number>("workspaceFileLimit") ?? DEFAULT_WORKSPACE_FILE_LIMIT,
      200,
    );
    charCount += fileCount * 50 + charLimit;
  }
  return Math.ceil(charCount / 4);
}
