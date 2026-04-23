import * as vscode from "vscode";
import * as child_process from "child_process";
import type { ChatSession, InteractionMode } from "./types";
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
import { formatSkillListMessage } from "./harness/skills/intents";
import { listBuiltinHarnessSkills } from "./harness/skills/builtins";
import { listHarnessSkills } from "./harness/skills/registry";
import { buildHarnessRuntimeHealth } from "./harness/runtime-health";
import { syncHarnessPendingState } from "./harness/state";
import {
  buildDoctorReport,
} from "./slash-command-utils";
import {
  applyClearSlashCommand,
  applyExplicitModeSlashCommand,
  applyModelSlashCommand,
  applyQuickModeSlashCommand,
  applySessionsSlashCommand,
  applyTodoSlashCommand,
  applyTokensSlashCommand,
  buildRefreshSlashStatus,
  buildSlashHelpContent,
  resolveEndpointSlashCommand,
  resolveJobsSlashCommand,
} from "./slash-command-workflows";

export interface SlashCommandDeps {
  sessionMgr: SessionManager;
  endpointMgr: EndpointManager;
  memoryMgr?: MemoryManager;
  config: vscode.WorkspaceConfiguration;
  outputChannel: vscode.OutputChannel;
  getStreamingDeps: (session: ChatSession) => StreamingDeps;
  estimateTokens: (session: ChatSession) => number;
  refreshModels: (endpointUrl?: string) => Promise<void>;
  selectEndpoint: (sessionId: string, endpointUrl: string) => Promise<void>;
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
      const skillLines = listBuiltinHarnessSkills().map(
        (skill) => `- \`${skill.slashCommand}\` — ${skill.description}`,
      );

      session.transcript.push({
        role: "tool",
        content: buildSlashHelpContent(skillLines),
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
      applyQuickModeSlashCommand(session, mode);
      deps.sessionMgr.touchSession(session);
      await deps.sessionMgr.saveState();
      deps.postState();
      return true;
    }

    case "/clear":
      applyClearSlashCommand(session);
      deps.sessionMgr.touchSession(session);
      await deps.sessionMgr.saveState();
      deps.postState();
      return true;

    case "/model":
      applyModelSlashCommand({
        session,
        arg,
        availableModels: deps.endpointMgr.getEndpointModels(
          session.selectedEndpoint,
        ),
        setSessionModel: (modelId) => deps.sessionMgr.setSessionModel(session, modelId),
      });
      deps.sessionMgr.touchSession(session);
      deps.updateStatusBar();
      await deps.sessionMgr.saveState();
      deps.postState();
      return true;

    case "/endpoint":
      {
        const endpointOutcome = resolveEndpointSlashCommand({
          arg,
          endpoints: Array.from(deps.endpointMgr.endpointHealthMap.values()),
          activeUrl: deps.endpointMgr.getResolvedEndpointUrl(
            session.selectedEndpoint,
          ),
        });
        if (endpointOutcome.kind === "switch") {
          await deps.selectEndpoint(session.id, endpointOutcome.endpointUrl);
          session.transcript.push(endpointOutcome.transcriptEntry);
          session.status = endpointOutcome.status;
        } else if (endpointOutcome.kind === "list") {
          session.transcript.push(endpointOutcome.transcriptEntry);
          session.status = endpointOutcome.status;
        } else {
          session.status = endpointOutcome.status;
        }
      }
      deps.sessionMgr.touchSession(session);
      await deps.sessionMgr.saveState();
      deps.postState();
      return true;

    case "/mode":
      applyExplicitModeSlashCommand(session, arg);
      deps.sessionMgr.touchSession(session);
      await deps.sessionMgr.saveState();
      deps.postState();
      return true;

    case "/sessions":
      applySessionsSlashCommand(
        session,
        deps.sessionMgr.getSessionSummaries().map((s) => s.title),
      );
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
        deps.getStreamingDeps(session),
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
      applyTokensSlashCommand(session);
      deps.postState();
      return true;
    }

    case "/refresh": {
      await deps.refreshModels(session.selectedEndpoint);
      const endpoint = deps.endpointMgr.getEndpointConfig(session.selectedEndpoint);
      session.status = buildRefreshSlashStatus(
        endpoint.name,
        deps.endpointMgr.getEndpointModels(session.selectedEndpoint).length,
      );
      deps.sessionMgr.touchSession(session);
      await deps.sessionMgr.saveState();
      deps.postState();
      return true;
    }

    case "/tasks":
    case "/todo": {
      syncHarnessPendingState(session);
      const todoItems = session.harnessState.todoItems || [];
      if (!applyTodoSlashCommand(session, todoItems).handled) {
        deps.postState();
        return true;
      }
      deps.sessionMgr.touchSession(session);
      await deps.sessionMgr.saveState();
      deps.postState();
      return true;
    }

    case "/jobs":
    case "/bg": {
      const backgroundTasks = session.harnessState.backgroundTasks || [];
      const jobsOutcome = resolveJobsSlashCommand(arg, backgroundTasks);

      if (jobsOutcome.kind === "clear-none" || jobsOutcome.kind === "none") {
        session.status = jobsOutcome.status;
        deps.postState();
        return true;
      }

      if (jobsOutcome.kind === "clear") {
        removeBackgroundTasks(jobsOutcome.staleTaskIds);
        session.harnessState.backgroundTasks = jobsOutcome.remainingTasks;
        session.transcript.push(jobsOutcome.transcriptEntry);
        session.status = jobsOutcome.status;
        deps.sessionMgr.touchSession(session);
        await deps.sessionMgr.saveState();
        deps.postState();
        return true;
      }

      if (jobsOutcome.kind === "rerun") {
        const result = rerunBackgroundTask(jobsOutcome.taskId, deps.outputChannel);
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

      if (jobsOutcome.kind === "cancel") {
        const result = cancelBackgroundTask(jobsOutcome.taskId);
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

      if (jobsOutcome.kind === "details") {
        const result = checkBackgroundTask(jobsOutcome.taskId);
        session.transcript.push({
          role: "tool",
          content: result,
        });
        session.status = jobsOutcome.status;
        deps.sessionMgr.touchSession(session);
        await deps.sessionMgr.saveState();
        deps.postState();
        return true;
      }

      session.transcript.push(jobsOutcome.transcriptEntry);
      session.status = jobsOutcome.status;
      deps.sessionMgr.touchSession(session);
      await deps.sessionMgr.saveState();
      deps.postState();
      return true;
    }

    case "/doctor":
    case "/status": {
      syncHarnessPendingState(session);
      const endpointUrl = deps.endpointMgr.getResolvedEndpointUrl(
        session.selectedEndpoint,
      );
      const endpoint = deps.endpointMgr.getEndpointConfig(endpointUrl);
      const capabilities = deps.endpointMgr.getEndpointCapabilities(endpointUrl);
      const health = deps.endpointMgr.endpointHealthMap.get(
        endpointUrl,
      );
      const availableModels = deps.endpointMgr.getEndpointModels(endpointUrl);
      const todoItems = session.harnessState.todoItems || [];
      const pendingApprovals = session.harnessState.pendingApprovals || [];
      const backgroundTasks = session.harnessState.backgroundTasks || [];
      const activeSkills = session.activeSkills || [];
      const estimatedTokens = deps.estimateTokens(session);
      const contextWindowSize = deps.config.get<number>("contextWindowSize") ?? 32000;
      const runtimeHealth = buildHarnessRuntimeHealth({
        session,
        endpointMgr: deps.endpointMgr,
        endpointUrl,
        availableModels,
        estimatedTokens,
        contextWindowSize,
      });

      session.transcript.push({
        role: "tool",
        content: buildDoctorReport({
          endpointName: endpoint.name || "Unknown",
          endpointUrl: endpoint.url || endpointUrl,
          providerKind: capabilities.kind,
          healthy: !!health?.healthy,
          selectedModel: session.selectedModel,
          mode: session.mode,
          supportsStructuredTools: capabilities.supportsStructuredTools,
          supportsReasoningEffort: capabilities.supportsReasoningEffort,
          activeSkills,
          todoItems,
          pendingApprovalCount: pendingApprovals.length,
          backgroundTaskCount: backgroundTasks.length,
          estimatedTokens,
          contextWindowSize,
          runtimeHealth,
        }),
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
