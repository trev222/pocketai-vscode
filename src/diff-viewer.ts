import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import type { ChatSession, ToolCall } from "./types";
import { isInsidePath } from "./helpers";
import { getSessionWorkspaceRoot } from "./workspace-roots";

export class DiffViewer {
  private diffContentProvider?: vscode.Disposable;
  private diffContents = new Map<string, string>();

  constructor(private readonly context: vscode.ExtensionContext) {}

  private ensureDiffProvider() {
    if (this.diffContentProvider) return;
    const owner = this;
    const provider = new (class implements vscode.TextDocumentContentProvider {
      provideTextDocumentContent(uri: vscode.Uri): string {
        return owner.diffContents.get(uri.path) ?? "";
      }
    })();
    this.diffContentProvider = vscode.workspace.registerTextDocumentContentProvider(
      "pocketai-diff",
      provider,
    );
    this.context.subscriptions.push(this.diffContentProvider);
  }

  async openDiffForToolCall(
    session: ChatSession,
    toolCallId: string,
    outputChannel: vscode.OutputChannel,
  ) {
    this.ensureDiffProvider();

    let targetTc: ToolCall | undefined;
    for (const entry of session.transcript) {
      if (!entry.toolCalls) continue;
      for (const tc of entry.toolCalls) {
        if (tc.id === toolCallId && tc.type === "edit_file") {
          targetTc = tc;
          break;
        }
      }
      if (targetTc) break;
    }
    if (!targetTc) return;

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders?.length) return;
    const rootPath = getSessionWorkspaceRoot(session) || workspaceFolders[0].uri.fsPath;
    const fullPath = path.resolve(rootPath, targetTc.filePath);
    if (!isInsidePath(rootPath, fullPath)) return;

    try {
      const original = fs.readFileSync(fullPath, "utf-8");
      const modified = targetTc.search
        ? original.replace(targetTc.search, targetTc.replace || "")
        : original;

      if (this.diffContents.size > 20) {
        const keys = Array.from(this.diffContents.keys());
        for (let i = 0; i < keys.length - 20; i++) {
          this.diffContents.delete(keys[i]);
        }
      }
      const diffId = `diff_${Date.now()}`;
      this.diffContents.set(`/original/${diffId}`, original);
      this.diffContents.set(`/modified/${diffId}`, modified);

      const originalUri = vscode.Uri.parse(
        `pocketai-diff:/original/${diffId}`,
      );
      const modifiedUri = vscode.Uri.parse(
        `pocketai-diff:/modified/${diffId}`,
      );
      await vscode.commands.executeCommand(
        "vscode.diff",
        originalUri,
        modifiedUri,
        `Edit: ${targetTc.filePath}`,
      );
    } catch (e) {
      outputChannel.appendLine(`Diff error: ${(e as Error).message}`);
    }
  }
}
