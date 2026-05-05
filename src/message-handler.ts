import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import type {
  WebviewToExtensionMessage,
  ExtensionToWebviewMessage,
} from "./types";
import { resolveAtMentions } from "./at-mentions";
import { rewindToCheckpoint } from "./checkpoints";
import type { SessionManager } from "./session-manager";
import type { EndpointManager } from "./endpoint-manager";
import type { DiffViewer } from "./diff-viewer";
import { clearSessionSkills, removeSessionSkill } from "./harness/skills/active";
import {
  cancelBackgroundTask,
  removeBackgroundTasks,
  rerunBackgroundTask,
} from "./tool-executor";
import {
  buildClearedBackgroundTasksMessage,
  buildSessionExportFileName,
  buildSessionExportMarkdown,
  filterSessionSummariesByQuery,
  getFinishedBackgroundTaskIds,
  getInteractionModeStatus,
} from "./chat-workflows";
import { isInsidePath } from "./helpers";

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
    files?: import("./types").FileAttachment[],
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
  refreshModels: (sessionId?: string) => Promise<void>;
  selectEndpoint: (sessionId: string, endpointUrl: string) => Promise<void>;
  supportsReasoningEffort: (sessionId: string) => boolean;
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
          await deps.refreshModels(getSessionId());
          deps.postStateToWebview(webview, getSessionId());
          return;

        case "sendPrompt":
          await deps.sendPrompt(
            sessionId,
            message.prompt,
            message.images,
            message.files,
          );
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
          if (!deps.supportsReasoningEffort(sessionId)) {
            return;
          }
          deps.sessionMgr.setSessionReasoningEffort(
            session,
            message.reasoningEffort,
          );
          await deps.sessionMgr.saveState();
          deps.postState();
          return;
        }

        case "refreshModels":
          await deps.refreshModels(sessionId);
          deps.postState();
          return;

        case "useSelection":
          await deps.handleUseSelection(sessionId);
          return;

        case "clear": {
          const session = deps.sessionMgr.requireSession(sessionId);
          if (!session) return;
          session.transcript = [];
          clearSessionSkills(session);
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
          session.status = getInteractionModeStatus(session.mode);
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
          await deps.selectEndpoint(sessionId, message.endpointUrl);
          return;

        case "exportSession": {
          const session = deps.sessionMgr.requireSession(sessionId);
          if (!session) return;
          const md = buildSessionExportMarkdown(session.transcript);
          const uri = await vscode.window.showSaveDialog({
            defaultUri: vscode.Uri.file(
              buildSessionExportFileName(session.title),
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
          const query = message.query;
          if (!query.trim()) {
            deps.postState();
            return;
          }
          const filtered = filterSessionSummariesByQuery(
            query,
            deps.sessionMgr.getSessionSummaries(),
            deps.sessionMgr.sessions.values(),
          );
          webview.postMessage({
            type: "filteredSessions",
            sessions: filtered,
          } satisfies ExtensionToWebviewMessage);
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
          if (!isInsidePath(rootPath, absPath)) return;
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

        case "removeActiveSkill": {
          const session = deps.sessionMgr.requireSession(sessionId);
          if (!session || session.busy) return;
          removeSessionSkill(session, message.skillId);
          session.status = session.activeSkills.length
            ? "Updated active skills."
            : "No active skills.";
          deps.sessionMgr.touchSession(session);
          deps.postState();
          return;
        }

        case "clearActiveSkills": {
          const session = deps.sessionMgr.requireSession(sessionId);
          if (!session || session.busy) return;
          clearSessionSkills(session);
          session.status = "Cleared active skills.";
          deps.sessionMgr.touchSession(session);
          deps.postState();
          return;
        }

        case "cancelBackgroundTask": {
          const session = deps.sessionMgr.requireSession(sessionId);
          if (!session) return;
          const result = cancelBackgroundTask(message.taskId);
          session.transcript.push({
            role: "tool",
            content: result,
          });
          session.status = result;
          deps.sessionMgr.touchSession(session);
          await deps.sessionMgr.saveState();
          deps.postState();
          return;
        }

        case "rerunBackgroundTask": {
          const session = deps.sessionMgr.requireSession(sessionId);
          if (!session) return;
          const result = rerunBackgroundTask(
            message.taskId,
            deps.outputChannel,
          );
          session.transcript.push({
            role: "tool",
            content: result,
          });
          session.status = result;
          deps.sessionMgr.touchSession(session);
          await deps.sessionMgr.saveState();
          deps.postState();
          return;
        }

        case "clearBackgroundTasks": {
          const session = deps.sessionMgr.requireSession(sessionId);
          if (!session) return;
          const staleTaskIds = getFinishedBackgroundTaskIds(
            session.harnessState.backgroundTasks,
          );
          if (!staleTaskIds.length) {
            session.status = "No finished background commands to clear.";
            deps.postState();
            return;
          }
          removeBackgroundTasks(staleTaskIds);
          session.harnessState.backgroundTasks = session.harnessState.backgroundTasks.filter(
            (task) => task.status === "running",
          );
          const result = buildClearedBackgroundTasksMessage(staleTaskIds.length);
          session.transcript.push({
            role: "tool",
            content: result,
          });
          session.status = result;
          deps.sessionMgr.touchSession(session);
          await deps.sessionMgr.saveState();
          deps.postState();
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
