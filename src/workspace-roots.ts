import * as path from "path";
import * as vscode from "vscode";
import type { ChatSession } from "./types";
import { isInsidePath } from "./helpers";

export function getPrimaryWorkspaceRoot(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

export function getSessionWorkspaceRoot(session?: Pick<ChatSession, "worktreeRoot">): string | undefined {
  const rootPath = getPrimaryWorkspaceRoot();
  const worktreeRoot = session?.worktreeRoot?.trim();
  if (!rootPath) return worktreeRoot || undefined;
  if (!worktreeRoot) return rootPath;
  return isInsidePath(rootPath, worktreeRoot) ? path.resolve(worktreeRoot) : rootPath;
}
