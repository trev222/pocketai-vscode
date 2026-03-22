import * as vscode from "vscode";
import * as child_process from "child_process";
import type { ChatSession, InteractionMode } from "./types";
import { normalizeBaseUrl } from "./helpers";
import type { SessionManager } from "./session-manager";
import type { EndpointManager } from "./endpoint-manager";
import type { MemoryManager } from "./memory-manager";
import type { StreamingDeps } from "./streaming";

export interface SlashCommandDeps {
  sessionMgr: SessionManager;
  endpointMgr: EndpointManager;
  memoryMgr?: MemoryManager;
  config: vscode.WorkspaceConfiguration;
  getStreamingDeps: () => StreamingDeps;
  estimateTokens: (session: ChatSession) => number;
  refreshModels: () => Promise<void>;
  postState: () => void;
  updateStatusBar: () => void;
  openForkedPanel: (forked: ReturnType<SessionManager["forkSession"]>) => void;
}

/**
 * Handles built-in slash commands like /clear, /model, /mode, /branch, etc.
 * Returns true if the command was handled, false if it should fall through
 * to skill commands or regular prompt processing.
 */
export async function handleSlashCommand(
  session: ChatSession,
  input: string,
  deps: SlashCommandDeps,
): Promise<boolean> {
  const parts = input.split(/\s+/);
  const cmd = parts[0].toLowerCase();
  const arg = parts.slice(1).join(" ").trim();

  switch (cmd) {
    case "/clear":
      session.transcript = [];
      session.status = "Cleared.";
      deps.sessionMgr.touchSession(session);
      await deps.sessionMgr.saveState();
      deps.postState();
      return true;

    case "/model":
      if (arg && deps.endpointMgr.models.includes(arg)) {
        session.selectedModel = arg;
        session.status = `Model switched to ${arg}`;
      } else {
        session.status = arg
          ? `Model "${arg}" not found. Available: ${deps.endpointMgr.models.join(", ")}`
          : `Available models: ${deps.endpointMgr.models.join(", ")}`;
      }
      deps.sessionMgr.touchSession(session);
      deps.updateStatusBar();
      await deps.sessionMgr.saveState();
      deps.postState();
      return true;

    case "/endpoint":
      if (arg) {
        const match = Array.from(
          deps.endpointMgr.endpointHealthMap.values(),
        ).find(
          (h) =>
            h.name.toLowerCase() === arg.toLowerCase() ||
            h.url === normalizeBaseUrl(arg),
        );
        if (match) {
          deps.endpointMgr.switchEndpoint(match.url);
          void deps.refreshModels();
          session.status = `Switched to endpoint: ${match.name}`;
        } else {
          session.status = `Endpoint "${arg}" not found.`;
        }
      } else {
        session.status = `Endpoints: ${Array.from(deps.endpointMgr.endpointHealthMap.values()).map((h) => h.name).join(", ")}`;
      }
      deps.sessionMgr.touchSession(session);
      await deps.sessionMgr.saveState();
      deps.postState();
      return true;

    case "/mode":
      if (arg === "ask" || arg === "auto" || arg === "plan") {
        session.mode = arg;
        const labels: Record<InteractionMode, string> = {
          ask: "Ask mode — I'll ask before making changes.",
          auto: "Auto mode — changes applied automatically.",
          plan: "Plan mode — I'll describe changes before making them.",
        };
        session.status = labels[arg];
      } else {
        session.status = `Usage: /mode <ask|auto|plan>`;
      }
      deps.sessionMgr.touchSession(session);
      await deps.sessionMgr.saveState();
      deps.postState();
      return true;

    case "/sessions":
      session.status = `Sessions: ${deps.sessionMgr.getSessionSummaries().map((s) => s.title).join(", ")}`;
      deps.postState();
      return true;

    case "/compact":
      await deps.sessionMgr.compactSession(
        session,
        deps.getStreamingDeps(),
        (s) => deps.estimateTokens(s),
        () => deps.postState(),
      );
      return true;

    case "/fork": {
      const forked = deps.sessionMgr.forkSession(session);
      deps.openForkedPanel(forked);
      session.status = `Forked → "${forked.title}"`;
      deps.sessionMgr.touchSession(session);
      await deps.sessionMgr.saveState();
      deps.postState();
      return true;
    }

    case "/branch": {
      const workspaceFolders = vscode.workspace.workspaceFolders;
      if (!workspaceFolders?.length) {
        session.status = "No workspace folder open.";
        deps.postState();
        return true;
      }
      const rootPath = workspaceFolders[0].uri.fsPath;
      try {
        if (!arg) {
          const current = child_process
            .execSync("git branch --show-current", { cwd: rootPath, encoding: "utf-8" })
            .trim();
          const branches = child_process
            .execSync("git branch --list", { cwd: rootPath, encoding: "utf-8" })
            .trim();
          session.status = `On branch: ${current}`;
          session.transcript.push({
            role: "tool",
            content: `Current branch: **${current}**\n\`\`\`\n${branches}\n\`\`\``,
          });
        } else if (arg.startsWith("-d ")) {
          const branchName = arg.slice(3).trim();
          child_process.execSync(`git branch -d ${branchName}`, { cwd: rootPath, encoding: "utf-8" });
          session.status = `Deleted branch: ${branchName}`;
        } else {
          try {
            child_process.execSync(`git checkout -b ${arg}`, { cwd: rootPath, encoding: "utf-8" });
            session.status = `Created and switched to branch: ${arg}`;
          } catch {
            child_process.execSync(`git checkout ${arg}`, { cwd: rootPath, encoding: "utf-8" });
            session.status = `Switched to branch: ${arg}`;
          }
        }
      } catch (e) {
        session.status = `Git error: ${(e as Error).message}`;
      }
      deps.sessionMgr.touchSession(session);
      await deps.sessionMgr.saveState();
      deps.postState();
      return true;
    }

    case "/tokens": {
      const cum = session.cumulativeTokens;
      const total = cum.prompt + cum.completion;
      session.status = total > 0
        ? `Session tokens — Prompt: ${cum.prompt.toLocaleString()}, Completion: ${cum.completion.toLocaleString()}, Total: ${total.toLocaleString()}`
        : "No tokens used yet in this session.";
      deps.postState();
      return true;
    }

    case "/remember": {
      if (!deps.memoryMgr) {
        session.status = "Memory system not available (no workspace).";
        deps.postState();
        return true;
      }
      if (!arg) {
        session.status = "Usage: /remember <something to remember>";
        deps.postState();
        return true;
      }
      deps.memoryMgr.upsert(
        "project",
        `note_${Date.now().toString(36)}`,
        "User-requested memory",
        arg,
      );
      session.status = "Remembered.";
      session.transcript.push({
        role: "tool",
        content: `Memory saved: "${arg}"`,
      });
      deps.sessionMgr.touchSession(session);
      await deps.sessionMgr.saveState();
      deps.postState();
      return true;
    }

    case "/memory": {
      if (!deps.memoryMgr) {
        session.status = "Memory system not available (no workspace).";
        deps.postState();
        return true;
      }
      if (arg === "clear") {
        deps.memoryMgr.clear();
        session.status = "All memories cleared.";
        deps.postState();
        return true;
      }
      const memories = arg
        ? deps.memoryMgr.search(arg)
        : deps.memoryMgr.getAll();
      if (memories.length === 0) {
        session.transcript.push({
          role: "tool",
          content: arg
            ? `No memories matching "${arg}".`
            : "No memories stored yet. Use /remember or let the assistant save memories during conversations.",
        });
      } else {
        const lines = memories.map(
          (m) => `- **${m.name}** [${m.type}]: ${m.content}`,
        );
        session.transcript.push({
          role: "tool",
          content: `Memories (${memories.length}):\n${lines.join("\n")}`,
        });
      }
      session.status = `${memories.length} memories found.`;
      deps.sessionMgr.touchSession(session);
      deps.postState();
      return true;
    }

    default:
      return false;
  }
}
