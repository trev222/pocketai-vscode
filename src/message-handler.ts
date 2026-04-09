import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import type {
  InteractionMode,
  WebviewToExtensionMessage,
  ExtensionToWebviewMessage,
} from "./types";
import { resolveAtMentions } from "./at-mentions";
import { rewindToCheckpoint } from "./checkpoints";
import type { SessionManager } from "./session-manager";
import type { EndpointManager } from "./endpoint-manager";
import type { DiffViewer } from "./diff-viewer";

export interface MessageHandlerDeps {
  sessionMgr: SessionManager;
  endpointMgr: EndpointManager;
  diffViewer: DiffViewer;
  outputChannel: vscode.OutputChannel;
  webviews: Set<vscode.Webview>;
  sendPrompt: (
    sessionId: string,
    prompt: string,
    images?: import("./types").ImageAttachment[],
  ) => Promise<void>;
  handleUseSelection: (sessionId: string) => Promise<void>;
  handleToolApproval: (
    sessionId: string,
    toolCallId: string,
    approved: boolean,
  ) => Promise<void>;
  handleBatchToolApproval: (
    sessionId: string,
    approved: boolean,
  ) => Promise<void>;
  refreshModels: () => Promise<void>;
  selectEndpoint: (endpointUrl: string) => Promise<void>;
  postState: () => void;
  postStateToWebview: (webview: vscode.Webview, sessionId: string) => void;
  openForkedPanel: (forked: ReturnType<SessionManager["forkSession"]>) => void;
  renameSession: (sessionId: string, title: string) => Promise<void>;
}

/**
 * Wires up the message handler for a chat webview panel.
 * Handles all WebviewToExtensionMessage types from the chat UI.
 */
export function setupChatMessageHandler(
  webview: vscode.Webview,
  getSessionId: () => string,
  switchSession: (id: string) => void,
  newSession: () => string,
  deleteSession: (id: string) => void,
  deps: MessageHandlerDeps,
) {
  webview.onDidReceiveMessage(async (message: WebviewToExtensionMessage) => {
    try {
      const sessionId = getSessionId();
      switch (message.type) {
        case "ready":
          await deps.refreshModels();
          deps.postStateToWebview(webview, getSessionId());
          return;

        case "sendPrompt":
          await deps.sendPrompt(sessionId, message.prompt, message.images);
          return;

        case "selectModel": {
          const session = deps.sessionMgr.requireSession(sessionId);
          if (!session) return;
          deps.sessionMgr.setSessionModel(session, message.modelId);
          await deps.sessionMgr.saveState();
          deps.postState();
          return;
        }

        case "selectReasoningEffort": {
          const session = deps.sessionMgr.requireSession(sessionId);
          if (!session) return;
          deps.sessionMgr.setSessionReasoningEffort(
            session,
            message.reasoningEffort,
          );
          await deps.sessionMgr.saveState();
          deps.postState();
          return;
        }

        case "refreshModels":
          await deps.refreshModels();
          deps.postState();
          return;

        case "useSelection":
          await deps.handleUseSelection(sessionId);
          return;

        case "clear": {
          const session = deps.sessionMgr.requireSession(sessionId);
          if (!session) return;
          session.transcript = [];
          session.status = "Cleared.";
          deps.sessionMgr.touchSession(session);
          await deps.sessionMgr.saveState();
          deps.postState();
          return;
        }

        case "newSession":
          newSession();
          return;

        case "switchSession":
          switchSession(message.sessionId);
          return;

        case "renameSession":
          await deps.renameSession(message.sessionId, message.title);
          return;

        case "deleteSession":
          deleteSession(message.sessionId);
          return;

        case "setMode": {
          const session = deps.sessionMgr.requireSession(sessionId);
          if (!session) return;
          session.mode = message.mode;
          const modeLabels: Record<InteractionMode, string> = {
            ask: "Ask mode — I'll ask before making changes.",
            auto: "Auto mode — changes applied automatically.",
            plan: "Plan mode — I'll describe changes before making them.",
          };
          session.status = modeLabels[session.mode];
          deps.sessionMgr.touchSession(session);
          await deps.sessionMgr.saveState();
          deps.postState();
          return;
        }

        case "approveToolCall":
          await deps.handleToolApproval(sessionId, message.toolCallId, true);
          return;

        case "rejectToolCall":
          await deps.handleToolApproval(sessionId, message.toolCallId, false);
          return;

        case "approveAllToolCalls":
          await deps.handleBatchToolApproval(sessionId, true);
          return;

        case "rejectAllToolCalls":
          await deps.handleBatchToolApproval(sessionId, false);
          return;

        case "cancelRequest": {
          const session = deps.sessionMgr.requireSession(sessionId);
          if (!session) return;
          session.currentRequest?.abort();
          return;
        }

        case "selectEndpoint":
          await deps.selectEndpoint(message.endpointUrl);
          return;

        case "exportSession": {
          const session = deps.sessionMgr.requireSession(sessionId);
          if (!session) return;
          const md = session.transcript
            .filter((e) => e.role === "user" || e.role === "assistant")
            .map(
              (e) =>
                `## ${e.role === "user" ? "You" : "PocketAI"}\n\n${e.content}\n`,
            )
            .join("\n");
          const uri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file(
              `${session.title.replace(/[^a-zA-Z0-9]/g, "_")}.md`,
            ),
            filters: { Markdown: ["md"] },
          });
          if (uri) {
            fs.writeFileSync(uri.fsPath, md, "utf-8");
            void vscode.window.showInformationMessage(
              `Exported to ${uri.fsPath}`,
            );
          }
          return;
        }

        case "searchSessions": {
          const query = message.query.toLowerCase();
          if (!query) {
            deps.postState();
            return;
          }
          const filtered = deps.sessionMgr
            .getSessionSummaries()
            .filter((s) => {
              if (s.title.toLowerCase().includes(query)) return true;
              const sess = deps.sessionMgr.sessions.get(s.id);
              return sess?.transcript.some((e) =>
                e.content.toLowerCase().includes(query),
              );
            });
          for (const wv of deps.webviews) {
            wv.postMessage({
              type: "filteredSessions",
              sessions: filtered,
            } satisfies ExtensionToWebviewMessage);
          }
          return;
        }

        case "rewindToCheckpoint": {
          const session = deps.sessionMgr.requireSession(sessionId);
          if (!session) return;
          const status = await rewindToCheckpoint(
            session,
            message.checkpointIndex,
            message.restoreCode,
            message.restoreConversation,
            deps.outputChannel,
          );
          session.status = status;
          deps.sessionMgr.touchSession(session);
          await deps.sessionMgr.saveState();
          deps.postState();
          return;
        }

        case "forkFromMessage": {
          const session = deps.sessionMgr.requireSession(sessionId);
          if (!session) return;
          const forked = deps.sessionMgr.forkSession(
            session,
            message.messageIndex,
          );
          deps.openForkedPanel(forked);
          session.status = `Forked → "${forked.title}"`;
          deps.sessionMgr.touchSession(session);
          await deps.sessionMgr.saveState();
          deps.postState();
          return;
        }

        case "resolveAtMention": {
          const suggestions = await resolveAtMentions(message.query);
          webview.postMessage({
            type: "atMentionResults",
            suggestions,
          } satisfies ExtensionToWebviewMessage);
          return;
        }

        case "openDiff": {
          const session = deps.sessionMgr.requireSession(sessionId);
          if (!session) return;
          await deps.diffViewer.openDiffForToolCall(
            session,
            message.toolCallId,
            deps.outputChannel,
          );
          return;
        }

        case "openFile": {
          const workspaceFolders = vscode.workspace.workspaceFolders;
          if (!workspaceFolders?.length) return;
          const rootPath = workspaceFolders[0].uri.fsPath;
          const filePath = message.filePath as string;
          const absPath = path.resolve(rootPath, filePath);
          if (!absPath.startsWith(rootPath)) return;
          try {
            const doc = await vscode.workspace.openTextDocument(
              vscode.Uri.file(absPath),
            );
            await vscode.window.showTextDocument(doc);
          } catch {
            void vscode.window.showWarningMessage(
              `Could not open file: ${filePath}`,
            );
          }
          return;
        }

        case "openExternal": {
          const url = message.url as string;
          if (url) {
            void vscode.env.openExternal(vscode.Uri.parse(url));
          }
          return;
        }
      }
    } catch (err) {
      deps.outputChannel.appendLine(
        `✗ Message handler error: ${(err as Error).message}`,
      );
      vscode.window.showErrorMessage(
        `PocketAI: ${(err as Error).message}`,
      );
    }
  });
}
