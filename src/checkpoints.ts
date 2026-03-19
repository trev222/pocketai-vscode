import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import type { ChatSession } from "./types";

export function createCheckpoint(session: ChatSession, filePaths: string[]) {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders?.length) return;
  const rootPath = workspaceFolders[0].uri.fsPath;

  const files = new Map<string, string>();
  for (const fp of filePaths) {
    const fullPath = path.resolve(rootPath, fp);
    if (!fullPath.startsWith(rootPath)) continue;
    try {
      files.set(fp, fs.readFileSync(fullPath, "utf-8"));
    } catch {}
  }

  session.checkpoints.push({
    timestamp: Date.now(),
    files,
    transcriptIndex: session.transcript.length,
  });

  // Limit to 50 checkpoints
  if (session.checkpoints.length > 50) {
    session.checkpoints = session.checkpoints.slice(-50);
  }
}

export async function rewindToCheckpoint(
  session: ChatSession,
  checkpointIndex: number,
  restoreCode: boolean,
  restoreConversation: boolean,
  outputChannel: vscode.OutputChannel,
): Promise<string> {
  const checkpoint = session.checkpoints[checkpointIndex];
  if (!checkpoint) {
    return "Invalid checkpoint.";
  }

  const workspaceFolders = vscode.workspace.workspaceFolders;
  const rootPath = workspaceFolders?.[0]?.uri.fsPath;

  if (restoreCode && rootPath) {
    for (const [fp, content] of checkpoint.files) {
      const fullPath = path.resolve(rootPath, fp);
      if (!fullPath.startsWith(rootPath)) continue;
      try {
        fs.writeFileSync(fullPath, content, "utf-8");
      } catch (e) {
        outputChannel.appendLine(`Rewind: failed to restore ${fp}: ${(e as Error).message}`);
      }
    }
  }

  if (restoreConversation) {
    session.transcript = session.transcript.slice(0, checkpoint.transcriptIndex);
  }

  // Remove checkpoints after the rewound one
  session.checkpoints = session.checkpoints.slice(0, checkpointIndex);
  return `Rewound to checkpoint from ${new Date(checkpoint.timestamp).toLocaleTimeString()}.`;
}
