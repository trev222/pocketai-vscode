import type { ChatEntry, ChatSession, ToolCall } from "../types";
import type { ToolLoopDeps } from "../tool-loop";
import { HarnessRunner } from "./runner";

const MAX_SUBAGENT_DEPTH = 1;

export async function executeTaskTool(
  deps: ToolLoopDeps,
  session: ChatSession,
  toolCall: ToolCall,
): Promise<string> {
  const taskPrompt = toolCall.taskPrompt?.trim() || toolCall.query?.trim() || "";
  if (!taskPrompt) {
    return "No subagent task prompt was provided.";
  }

  const parentDepth = session.subagentDepth ?? 0;
  if (parentDepth >= MAX_SUBAGENT_DEPTH) {
    return "Subagent nesting limit reached. Handle this task directly instead of delegating again.";
  }

  const name = (toolCall.subagentName || "subagent").trim() || "subagent";
  const childSession = createSubagentSession(session, name, taskPrompt);
  const childDeps = createSubagentDeps(deps);

  deps.outputChannel.appendLine(
    `Starting read-only subagent "${name}" for session ${session.id}`,
  );

  const runner = new HarnessRunner(childDeps);
  const result = await runner.run(childSession);
  const report = formatSubagentReport(name, childSession.transcript, result.stoppedBecause);
  deps.outputChannel.appendLine(
    `Subagent "${name}" finished: ${result.stoppedBecause}`,
  );
  return report;
}

function createSubagentSession(
  parent: ChatSession,
  name: string,
  taskPrompt: string,
): ChatSession {
  return {
    ...parent,
    id: `${parent.id}:subagent:${Date.now().toString(36)}`,
    title: `${parent.title} / ${name}`,
    transcript: [
      {
        role: "user",
        content: [
          `You are a read-only PocketAI subagent named "${name}".`,
          "Investigate the focused task below and return a concise report for the parent agent.",
          "You may inspect code, search files, read diagnostics, and compare git status/diff.",
          "Do not edit files, write memory, run shell commands, commit, or delegate to another subagent.",
          "Include concrete file references when useful. If blocked, say exactly what is missing.",
          "",
          taskPrompt,
        ].join("\n"),
      },
    ],
    status: `Subagent ${name} running...`,
    busy: true,
    mode: "auto",
    currentRequest: parent.currentRequest,
    checkpoints: [],
    lastTokenUsage: undefined,
    activeSkills: [...parent.activeSkills],
    harnessState: {
      pendingApprovals: [],
      pendingDiffs: [],
      todoItems: [],
      backgroundTasks: [],
    },
    subagentDepth: (parent.subagentDepth ?? 0) + 1,
    subagentReadonly: true,
  };
}

function createSubagentDeps(deps: ToolLoopDeps): ToolLoopDeps {
  return {
    ...deps,
    postState: () => {
      deps.postState();
    },
    onHarnessEvent: undefined,
    inlineDiffMgr: undefined,
    streamingDeps: {
      ...deps.streamingDeps,
      broadcastToWebviews: () => {},
    },
  };
}

function formatSubagentReport(
  name: string,
  transcript: ChatEntry[],
  stoppedBecause: string,
): string {
  const assistantMessages = transcript
    .filter((entry) => entry.role === "assistant" && entry.content.trim())
    .map((entry) => entry.content.trim());
  const finalText = assistantMessages.at(-1) || "Subagent finished without a written report.";
  const compactText =
    finalText.length > 8000
      ? `${finalText.slice(0, 8000).trimEnd()}\n\n[Subagent report truncated.]`
      : finalText;
  return [
    `Subagent "${name}" finished (${stoppedBecause}).`,
    "",
    compactText,
  ].join("\n");
}
