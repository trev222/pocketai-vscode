import * as vscode from "vscode";
import * as child_process from "child_process";
import type { ChatSession, InteractionMode } from "./types";
import { normalizeBaseUrl } from "./helpers";
import type { SessionManager } from "./session-manager";
import type { EndpointManager } from "./endpoint-manager";
import type { MemoryManager } from "./memory-manager";
import type { StreamingDeps } from "./streaming";
import {
  cancelBackgroundTask,
  checkBackgroundTask,
  removeBackgroundTasks,
  rerunBackgroundTask,
} from "./tool-executor";
import { clearSessionSkills } from "./harness/skills/active";
import { formatSkillListMessage } from "./harness/skills/intents";
import { listBuiltinHarnessSkills } from "./harness/skills/builtins";
import { listHarnessSkills } from "./harness/skills/registry";
import { buildHarnessRuntimeHealth } from "./harness/runtime-health";
import { syncHarnessPendingState } from "./harness/state";

export interface SlashCommandDeps {
  sessionMgr: SessionManager;
  endpointMgr: EndpointManager;
  memoryMgr?: MemoryManager;
  config: vscode.WorkspaceConfiguration;
  outputChannel: vscode.OutputChannel;
  getStreamingDeps: () => StreamingDeps;
  estimateTokens: (session: ChatSession) => number;
  refreshModels: () => Promise<void>;
  selectEndpoint: (endpointUrl: string) => Promise<void>;
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
    case "/help":
    case "/commands": {
      const commandLines = [
        "- `/ask`, `/auto`, `/plan` — switch chat mode quickly",
        "- `/mode <ask|auto|plan>` — switch chat mode explicitly",
        "- `/model [name]` — list models or switch the current chat model",
        "- `/endpoint [name|url]` — list endpoints or switch the active endpoint",
        "- `/skills [query]` — list skills, optionally filtered",
        "- `/tasks` or `/todo` — show the current tracked task list",
        "- `/jobs` — show tracked background commands",
        "- `/jobs cancel <taskId>` — cancel a background command",
        "- `/refresh` — refresh models for the active endpoint",
        "- `/status` or `/doctor` — show harness and endpoint health",
        "- `/compact` — compact the current chat context",
        "- `/tokens` — show token usage for this chat",
        "- `/sessions` — list saved chat sessions",
        "- `/fork` — fork the current chat into a new one",
        "- `/branch [name]` — inspect or switch git branches",
        "- `/memory [query|clear]` — inspect or clear saved memory",
        "- `/remember <text>` — save a memory",
        "- `/clear` — clear this chat",
      ];
      const skillLines = listBuiltinHarnessSkills().map(
        (skill) => `- \`${skill.slashCommand}\` — ${skill.description}`,
      );

      session.transcript.push({
        role: "tool",
        content: [
          "PocketAI slash commands:",
          commandLines.join("\n"),
          "",
          "Skill shortcuts:",
          skillLines.join("\n"),
        ].join("\n"),
      });
      session.status = "Slash command reference ready.";
      deps.sessionMgr.touchSession(session);
      await deps.sessionMgr.saveState();
      deps.postState();
      return true;
    }

    case "/ask":
    case "/auto":
    case "/plan": {
      const mode = cmd.slice(1) as InteractionMode;
      session.mode = mode;
      const labels: Record<InteractionMode, string> = {
        ask: "Ask mode — I'll ask before making changes.",
        auto: "Auto mode — changes applied automatically.",
        plan: "Plan mode — I'll describe changes before making them.",
      };
      session.status = labels[mode];
      deps.sessionMgr.touchSession(session);
      await deps.sessionMgr.saveState();
      deps.postState();
      return true;
    }

    case "/clear":
      session.transcript = [];
      clearSessionSkills(session);
      session.status = "Cleared.";
      deps.sessionMgr.touchSession(session);
      await deps.sessionMgr.saveState();
      deps.postState();
      return true;

    case "/model":
      if (arg && deps.endpointMgr.models.includes(arg)) {
        deps.sessionMgr.setSessionModel(session, arg);
        session.status = `Model switched to ${arg}`;
      } else {
        session.status = arg
          ? `Model "${arg}" not found. Available: ${deps.endpointMgr.models.join(", ")}`
          : `Available models: ${deps.endpointMgr.models.join(", ")}`;
        deps.sessionMgr.touchSession(session);
      }
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
          await deps.selectEndpoint(match.url);
          session.transcript.push({
            role: "tool",
            content: `Switched endpoint to **${match.name}** (\`${match.url}\`).`,
          });
          session.status = `Endpoint switch requested: ${match.name}`;
        } else {
          session.status = `Endpoint "${arg}" not found.`;
        }
      } else {
        const endpoints = Array.from(deps.endpointMgr.endpointHealthMap.values());
        const activeUrl = deps.endpointMgr.activeEndpointUrl;
        session.transcript.push({
          role: "tool",
          content: `Available endpoints:\n${endpoints
            .map((endpoint) => {
              const marker = endpoint.url === activeUrl ? "*" : "-";
              const health = endpoint.healthy ? "healthy" : "unreachable";
              return `${marker} **${endpoint.name}** — \`${endpoint.url}\` (${health})`;
            })
            .join("\n")}`,
        });
        session.status = `${endpoints.length} endpoint${endpoints.length === 1 ? "" : "s"} available.`;
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

    case "/skills": {
      const normalizedQuery = arg.trim().toLowerCase();
      const skills = listHarnessSkills().filter((skill) => {
        if (!normalizedQuery) return true;
        return (
          skill.id.includes(normalizedQuery) ||
          skill.name.toLowerCase().includes(normalizedQuery) ||
          skill.description.toLowerCase().includes(normalizedQuery)
        );
      });

      session.transcript.push({
        role: "tool",
        content: formatSkillListMessage(skills),
      });
      session.status = normalizedQuery
        ? `${skills.length} skill match${skills.length === 1 ? "" : "es"} for "${arg}".`
        : `${skills.length} skill${skills.length === 1 ? "" : "s"} available.`;
      deps.sessionMgr.touchSession(session);
      await deps.sessionMgr.saveState();
      deps.postState();
      return true;
    }

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

    case "/refresh": {
      await deps.refreshModels();
      session.status = deps.endpointMgr.models.length
        ? `Refreshed models for ${deps.endpointMgr.getActiveEndpointConfig().name}.`
        : `Refreshed ${deps.endpointMgr.getActiveEndpointConfig().name}, but no models were found.`;
      deps.sessionMgr.touchSession(session);
      await deps.sessionMgr.saveState();
      deps.postState();
      return true;
    }

    case "/tasks":
    case "/todo": {
      syncHarnessPendingState(session);
      const todoItems = session.harnessState.todoItems || [];
      if (!todoItems.length) {
        session.status = "No tracked tasks yet.";
        deps.postState();
        return true;
      }

      const lines = todoItems.map((todo, index) => {
        const icon =
          todo.status === "completed"
            ? "[x]"
            : todo.status === "in_progress"
              ? "[~]"
              : "[ ]";
        return `${index + 1}. ${icon} ${todo.content}`;
      });

      session.transcript.push({
        role: "tool",
        content: `Tracked tasks:\n${lines.join("\n")}`,
      });
      session.status = `${todoItems.length} tracked task${todoItems.length === 1 ? "" : "s"}.`;
      deps.sessionMgr.touchSession(session);
      await deps.sessionMgr.saveState();
      deps.postState();
      return true;
    }

    case "/jobs":
    case "/bg": {
      const backgroundTasks = session.harnessState.backgroundTasks || [];
      if (/^(?:clear|clean|prune)$/i.test(arg.trim())) {
        const staleTaskIds = backgroundTasks
          .filter((task) => task.status !== "running")
          .map((task) => task.id);
        if (!staleTaskIds.length) {
          session.status = "No finished background commands to clear.";
          deps.postState();
          return true;
        }
        removeBackgroundTasks(staleTaskIds);
        session.harnessState.backgroundTasks = backgroundTasks.filter(
          (task) => task.status === "running",
        );
        session.transcript.push({
          role: "tool",
          content: `Cleared ${staleTaskIds.length} finished background command${staleTaskIds.length === 1 ? "" : "s"}.`,
        });
        session.status = `Cleared ${staleTaskIds.length} finished background command${staleTaskIds.length === 1 ? "" : "s"}.`;
        deps.sessionMgr.touchSession(session);
        await deps.sessionMgr.saveState();
        deps.postState();
        return true;
      }

      const rerunMatch = arg.match(/^(?:rerun|retry|restart)\s+(.+)$/i);
      if (rerunMatch) {
        const taskId = rerunMatch[1].trim();
        const result = rerunBackgroundTask(taskId, deps.outputChannel);
        session.transcript.push({
          role: "tool",
          content: result,
        });
        session.status = result;
        deps.sessionMgr.touchSession(session);
        await deps.sessionMgr.saveState();
        deps.postState();
        return true;
      }

      const cancelMatch = arg.match(/^(?:cancel|stop|kill)\s+(.+)$/i);
      if (cancelMatch) {
        const taskId = cancelMatch[1].trim();
        const result = cancelBackgroundTask(taskId);
        session.transcript.push({
          role: "tool",
          content: result,
        });
        session.status = result;
        deps.sessionMgr.touchSession(session);
        await deps.sessionMgr.saveState();
        deps.postState();
        return true;
      }

      if (arg) {
        const taskId = arg.trim();
        const result = checkBackgroundTask(taskId);
        session.transcript.push({
          role: "tool",
          content: result,
        });
        session.status = `Background task details: ${taskId}`;
        deps.sessionMgr.touchSession(session);
        await deps.sessionMgr.saveState();
        deps.postState();
        return true;
      }

      if (!backgroundTasks.length) {
        session.status = "No background commands tracked in this chat.";
        deps.postState();
        return true;
      }

      session.transcript.push({
        role: "tool",
        content: [
          "Background commands:",
          backgroundTasks
            .map(
              (task) =>
                `- \`${task.id}\` [${task.status}] \`${task.command}\``,
            )
            .join("\n"),
          "",
          "Use `/jobs <taskId>` to inspect output, `/jobs cancel <taskId>` to stop a running job, `/jobs rerun <taskId>` to relaunch a finished one, or `/jobs clear` to remove finished jobs from this chat.",
        ].join("\n"),
      });
      session.status = `${backgroundTasks.length} background command${backgroundTasks.length === 1 ? "" : "s"} tracked.`;
      deps.sessionMgr.touchSession(session);
      await deps.sessionMgr.saveState();
      deps.postState();
      return true;
    }

    case "/doctor":
    case "/status": {
      syncHarnessPendingState(session);
      const endpoint = deps.endpointMgr.getActiveEndpointConfig();
      const capabilities = deps.endpointMgr.getActiveEndpointCapabilities();
      const health = deps.endpointMgr.endpointHealthMap.get(
        deps.endpointMgr.activeEndpointUrl,
      );
      const todoItems = session.harnessState.todoItems || [];
      const pendingApprovals = session.harnessState.pendingApprovals || [];
      const backgroundTasks = session.harnessState.backgroundTasks || [];
      const activeSkills = session.activeSkills || [];
      const estimatedTokens = deps.estimateTokens(session);
      const contextWindowSize = deps.config.get<number>("contextWindowSize") ?? 32000;
      const runtimeHealth = buildHarnessRuntimeHealth({
        session,
        endpointMgr: deps.endpointMgr,
        estimatedTokens,
        contextWindowSize,
      });

      const lines = [
        `- Endpoint: **${endpoint.name || "Unknown"}**`,
        `- URL: \`${endpoint.url || deps.endpointMgr.baseUrl}\``,
        `- Provider: \`${capabilities.kind}\``,
        `- Healthy: ${health?.healthy ? "yes" : "no"}`,
        `- Model: \`${session.selectedModel || "(auto)"}\``,
        `- Mode: \`${session.mode}\``,
        `- Structured tools: ${capabilities.supportsStructuredTools ? "enabled" : "disabled"}`,
        `- Reasoning support: ${capabilities.supportsReasoningEffort ? "yes" : "no"}`,
        `- Active skills: ${activeSkills.length ? activeSkills.map((skill) => skill.name).join(", ") : "none"}`,
        `- Tracked tasks: ${todoItems.length}`,
        `- Pending approvals: ${pendingApprovals.length}`,
        `- Background commands: ${backgroundTasks.length}`,
        `- Estimated context tokens: ${estimatedTokens.toLocaleString()} / ${contextWindowSize.toLocaleString()}`,
        `- Health summary: ${runtimeHealth.summary}`,
      ];

      session.transcript.push({
        role: "tool",
        content: [
          "PocketAI doctor:",
          lines.join("\n"),
          "",
          "Issues:",
          runtimeHealth.issues.length
            ? runtimeHealth.issues.map((issue) => `- ${issue}`).join("\n")
            : "- None detected.",
          "",
          "Suggested next actions:",
          runtimeHealth.suggestions.length
            ? runtimeHealth.suggestions.map((suggestion) => `- ${suggestion}`).join("\n")
            : "- No action needed right now.",
        ].join("\n"),
      });
      session.status = "Doctor report ready.";
      deps.sessionMgr.touchSession(session);
      await deps.sessionMgr.saveState();
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
