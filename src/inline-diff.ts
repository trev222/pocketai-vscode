import * as vscode from "vscode";
import * as path from "path";
import type { ToolCall } from "./types";

/**
 * Manages inline diff decorations and CodeLens for pending edit_file tool calls.
 * Shows accept/reject lenses directly in the editor for pending changes.
 */
export class InlineDiffManager {
  private pendingDiffs = new Map<
    string,
    {
      toolCallId: string;
      filePath: string;
      editor: vscode.TextEditor;
      removedDecoration: vscode.TextEditorDecorationType;
      addedDecoration: vscode.TextEditorDecorationType;
      originalRange: vscode.Range;
      search: string;
      replace: string;
    }
  >();

  private codeLensProvider: InlineDiffCodeLensProvider;
  private codeLensDisposable?: vscode.Disposable;

  // Callbacks set by the extension
  onAccept?: (toolCallId: string) => void;
  onReject?: (toolCallId: string) => void;

  constructor(private readonly context: vscode.ExtensionContext) {
    this.codeLensProvider = new InlineDiffCodeLensProvider(this);

    // Register commands
    context.subscriptions.push(
      vscode.commands.registerCommand(
        "pocketai.acceptInlineChange",
        (toolCallId: string) => {
          this.onAccept?.(toolCallId);
          this.clearChange(toolCallId);
        },
      ),
    );
    context.subscriptions.push(
      vscode.commands.registerCommand(
        "pocketai.rejectInlineChange",
        (toolCallId: string) => {
          this.onReject?.(toolCallId);
          this.clearChange(toolCallId);
        },
      ),
    );
    context.subscriptions.push(
      vscode.commands.registerCommand(
        "pocketai.acceptAllInlineChanges",
        () => {
          for (const id of Array.from(this.pendingDiffs.keys())) {
            this.onAccept?.(id);
          }
          this.clearAll();
        },
      ),
    );
    context.subscriptions.push(
      vscode.commands.registerCommand(
        "pocketai.rejectAllInlineChanges",
        () => {
          for (const id of Array.from(this.pendingDiffs.keys())) {
            this.onReject?.(id);
          }
          this.clearAll();
        },
      ),
    );
  }

  /**
   * Show inline diff decorations for a pending edit_file tool call.
   * Opens the file, highlights the affected region, and adds CodeLens.
   */
  async showInlineDiff(tc: ToolCall): Promise<void> {
    if (tc.type !== "edit_file" || !tc.search) return;

    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (!workspaceFolders?.length) return;

    const rootPath = workspaceFolders[0].uri.fsPath;
    const fullPath = path.resolve(rootPath, tc.filePath);
    if (!fullPath.startsWith(rootPath)) return;

    try {
      // Open the file first so we read the in-editor buffer (may have unsaved changes)
      const doc = await vscode.workspace.openTextDocument(
        vscode.Uri.file(fullPath),
      );
      const content = doc.getText();
      const searchIdx = content.indexOf(tc.search);
      if (searchIdx === -1) return;

      // Calculate line range for the search text
      const beforeSearch = content.substring(0, searchIdx);
      const startLine = beforeSearch.split("\n").length - 1;
      const searchLines = tc.search.split("\n");
      const endLine = startLine + searchLines.length - 1;

      const editor = await vscode.window.showTextDocument(doc, {
        preserveFocus: true,
        preview: false,
      });

      // Create decoration types
      const removedDecoration = vscode.window.createTextEditorDecorationType({
        backgroundColor: new vscode.ThemeColor(
          "diffEditor.removedLineBackground",
        ),
        isWholeLine: true,
        overviewRulerColor: new vscode.ThemeColor(
          "editorOverviewRuler.deletedForeground",
        ),
        overviewRulerLane: vscode.OverviewRulerLane.Full,
      });

      const replaceText = tc.replace || "";
      const replaceLines = replaceText.split("\n");
      const addedDecoration = vscode.window.createTextEditorDecorationType({
        after: {
          contentText: replaceLines.length <= 3
            ? `  \u2192 ${replaceLines.join(" \\n ")}`
            : `  \u2192 [${replaceLines.length} lines]`,
          color: new vscode.ThemeColor("editorGhostText.foreground"),
          fontStyle: "italic",
        },
        isWholeLine: false,
      });

      // Apply decorations
      const range = new vscode.Range(
        new vscode.Position(startLine, 0),
        new vscode.Position(
          endLine,
          searchLines[searchLines.length - 1].length,
        ),
      );

      const removedRanges: vscode.Range[] = [];
      for (let i = startLine; i <= endLine; i++) {
        removedRanges.push(
          new vscode.Range(
            new vscode.Position(i, 0),
            new vscode.Position(i, doc.lineAt(i).text.length),
          ),
        );
      }
      editor.setDecorations(removedDecoration, removedRanges);

      // Show the ghost text hint on the last removed line
      editor.setDecorations(addedDecoration, [
        {
          range: new vscode.Range(
            new vscode.Position(endLine, doc.lineAt(endLine).text.length),
            new vscode.Position(endLine, doc.lineAt(endLine).text.length),
          ),
        },
      ]);

      // Scroll to the change
      editor.revealRange(range, vscode.TextEditorRevealType.InCenter);

      // Register CodeLens if not already registered
      if (!this.codeLensDisposable) {
        this.codeLensDisposable = vscode.languages.registerCodeLensProvider(
          { pattern: "**/*" },
          this.codeLensProvider,
        );
        this.context.subscriptions.push(this.codeLensDisposable);
      }

      this.pendingDiffs.set(tc.id, {
        toolCallId: tc.id,
        filePath: fullPath,
        editor,
        removedDecoration,
        addedDecoration,
        originalRange: range,
        search: tc.search,
        replace: tc.replace || "",
      });

      // Trigger CodeLens refresh
      this.codeLensProvider.refresh();
    } catch (e) {
      // Silently fail — the chat UI still has approve/reject buttons
    }
  }

  clearChange(toolCallId: string) {
    const diff = this.pendingDiffs.get(toolCallId);
    if (!diff) return;

    diff.removedDecoration.dispose();
    diff.addedDecoration.dispose();
    this.pendingDiffs.delete(toolCallId);
    this.codeLensProvider.refresh();
  }

  clearAll() {
    for (const diff of this.pendingDiffs.values()) {
      diff.removedDecoration.dispose();
      diff.addedDecoration.dispose();
    }
    this.pendingDiffs.clear();
    this.codeLensProvider.refresh();
  }

  getPendingDiffs() {
    return this.pendingDiffs;
  }

  dispose() {
    this.clearAll();
    this.codeLensDisposable?.dispose();
  }
}

class InlineDiffCodeLensProvider implements vscode.CodeLensProvider {
  private _onDidChangeCodeLenses = new vscode.EventEmitter<void>();
  readonly onDidChangeCodeLenses = this._onDidChangeCodeLenses.event;

  constructor(private readonly manager: InlineDiffManager) {}

  refresh() {
    this._onDidChangeCodeLenses.fire();
  }

  provideCodeLenses(
    document: vscode.TextDocument,
  ): vscode.CodeLens[] {
    const lenses: vscode.CodeLens[] = [];

    for (const [id, diff] of this.manager.getPendingDiffs()) {
      if (diff.filePath !== document.uri.fsPath) continue;

      const range = diff.originalRange;

      lenses.push(
        new vscode.CodeLens(range, {
          title: "\u2713 Accept Change",
          command: "pocketai.acceptInlineChange",
          arguments: [id],
        }),
      );

      lenses.push(
        new vscode.CodeLens(range, {
          title: "\u2717 Reject Change",
          command: "pocketai.rejectInlineChange",
          arguments: [id],
        }),
      );
    }

    // Add "Accept All" / "Reject All" if multiple diffs
    if (this.manager.getPendingDiffs().size > 1) {
      const firstDiff = Array.from(this.manager.getPendingDiffs().values()).find(
        (d) => d.filePath === document.uri.fsPath,
      );
      if (firstDiff) {
        lenses.push(
          new vscode.CodeLens(firstDiff.originalRange, {
            title: "\u2713\u2713 Accept All Changes",
            command: "pocketai.acceptAllInlineChanges",
            arguments: [],
          }),
        );
        lenses.push(
          new vscode.CodeLens(firstDiff.originalRange, {
            title: "\u2717\u2717 Reject All Changes",
            command: "pocketai.rejectAllInlineChanges",
            arguments: [],
          }),
        );
      }
    }

    return lenses;
  }
}
