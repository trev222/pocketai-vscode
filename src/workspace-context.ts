import * as os from "os";
import * as fs from "fs";
import * as child_process from "child_process";
import * as vscode from "vscode";
import type { ChatSession, ResourceWarning, RuntimeDiagnostics } from "./types";
import {
  DEFAULT_WORKSPACE_FILE_LIMIT,
  DEFAULT_CURRENT_FILE_CHAR_LIMIT,
  TOOL_USE_INSTRUCTIONS,
  EXCLUDED_DIRS_GLOB,
} from "./constants";

export async function buildWorkspaceContext(
  config: vscode.WorkspaceConfiguration,
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

  const roots = workspaceFolders.map((f) => f.name);
  const fileUris = await vscode.workspace.findFiles(
    "**/*",
    EXCLUDED_DIRS_GLOB,
    fileLimit,
  );
  const fileList = fileUris
    .map((uri) => vscode.workspace.asRelativePath(uri, false))
    .filter(Boolean)
    .sort();

  const sections = [
    "You are working inside the user's VS Code workspace.",
    roots.length ? `Workspace roots: ${roots.join(", ")}` : "",
    fileList.length
      ? `File tree (${fileList.length}${fileList.length === fileLimit ? "+" : ""} files):\n${fileList.map((f) => `- ${f}`).join("\n")}`
      : "",
  ];

  if (activeDoc) {
    const activePath =
      vscode.workspace.asRelativePath(activeDoc.uri, false) ??
      activeDoc.uri.fsPath;
    const selText = activeEditor?.selection
      ? activeDoc.getText(activeEditor.selection).trim()
      : "";
    sections.push(`Active file: ${activePath}`);
    if (selText) sections.push(`Selected text:\n${selText.slice(0, 3000)}`);
    const fullText = activeDoc.getText();
    const numbered = fullText
      .slice(0, charLimit)
      .split(/\r?\n/)
      .map((line, i) => `${String(i + 1).padStart(4)}: ${line}`)
      .join("\n");
    sections.push(
      `Active file contents:\n${numbered}${fullText.length > charLimit ? "\n... [truncated]" : ""}`,
    );
  }

  // Open editor tabs (excluding active file)
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
    sections.push(
      `Open editor tabs:\n${openTabs.map((f) => `- ${f}`).join("\n")}`,
    );
  }

  // Git branch and status
  if (config.get<boolean>("includeGitContext", true)) {
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
          gitSection.push(
            `Git status:\n${gitStatus.slice(0, 2000)}${gitStatus.length > 2000 ? "\n... [truncated]" : ""}`,
          );
        } else {
          gitSection.push("Git status: clean");
        }
        sections.push(gitSection.join("\n"));
      } catch {
        // Not a git repo or git not available
      }
    }
  }

  // VS Code diagnostics (errors and warnings)
  if (config.get<boolean>("includeDiagnostics", true)) {
    const allDiagnostics = vscode.languages.getDiagnostics();
    const issues: string[] = [];
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
          if (issues.length >= 20) break;
        }
      }
      if (issues.length >= 20) break;
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
