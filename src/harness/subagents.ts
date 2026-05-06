import type { ChatEntry, ChatSession, ToolCall } from "../types";
import type { ToolLoopDeps } from "../tool-loop";
import { upsertSubagentTask } from "./state";
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
  const mode = toolCall.subagentMode === "write" ? "write" : "readonly";
  const allowedPaths = sanitizeAllowedPaths(toolCall.subagentAllowedPaths);
  if (mode === "write" && allowedPaths.length === 0) {
    return "Write-capable subagents require explicit allowed_paths ownership. Use readonly mode or provide the files/directories this subagent owns.";
  }

  const taskId = toolCall.id || `${session.id}:subagent:${Date.now().toString(36)}`;
  upsertSubagentTask(session, {
    id: taskId,
    name,
    prompt: taskPrompt,
    mode,
    status: "running",
    allowedPaths,
    resultPreview: "",
    updatedAt: Date.now(),
  });
  deps.postState();

  const childSession = createSubagentSession(session, name, taskPrompt, mode, allowedPaths);
  const childDeps = createSubagentDeps(deps);

  deps.outputChannel.appendLine(
    `Starting ${mode} subagent "${name}" for session ${session.id}`,
  );

  try {
    const runner = new HarnessRunner(childDeps);
    const result = await runner.run(childSession);
    const report = formatSubagentReport(name, childSession.transcript, result.stoppedBecause);
    upsertSubagentTask(session, {
      id: taskId,
      name,
      prompt: taskPrompt,
      mode,
      status: "completed",
      allowedPaths,
      resultPreview: report,
      updatedAt: Date.now(),
    });
    deps.postState();
    deps.outputChannel.appendLine(
      `Subagent "${name}" finished: ${result.stoppedBecause}`,
    );
    return report;
  } catch (error) {
    const message = `Subagent "${name}" failed: ${(error as Error).message}`;
    upsertSubagentTask(session, {
      id: taskId,
      name,
      prompt: taskPrompt,
      mode,
      status: "failed",
      allowedPaths,
      resultPreview: message,
      updatedAt: Date.now(),
    });
    deps.postState();
    throw error;
  }
}

function createSubagentSession(
  parent: ChatSession,
  name: string,
  taskPrompt: string,
  mode: "readonly" | "write",
  allowedPaths: string[],
): ChatSession {
  const writeInstructions = mode === "write"
    ? [
        `You may edit only these owned paths: ${allowedPaths.join(", ")}.`,
        "Do not modify files outside those paths. Do not run shell commands, write memory, commit, or delegate to another subagent.",
      ]
    : [
        "You may inspect code, search files, read diagnostics, and compare git status/diff.",
        "Do not edit files, write memory, run shell commands, commit, or delegate to another subagent.",
      ];

  return {
    ...parent,
    id: `${parent.id}:subagent:${Date.now().toString(36)}`,
    title: `${parent.title} / ${name}`,
    transcript: [
      {
        role: "user",
        content: [
          `You are a ${mode} PocketAI subagent named "${name}".`,
          "Investigate the focused task below and return a concise report for the parent agent.",
          ...writeInstructions,
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
      changeSets: [],
      todoItems: [],
      backgroundTasks: [],
      subagentTasks: [],
    },
    subagentDepth: (parent.subagentDepth ?? 0) + 1,
    subagentReadonly: mode !== "write",
    subagentAllowedPaths: allowedPaths,
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

function sanitizeAllowedPaths(paths: string[] | undefined): string[] {
  if (!Array.isArray(paths)) return [];
  return paths
    .map((item) => String(item || "").trim().replace(/\\/g, "/"))
    .filter((item) => item && !item.startsWith("/") && !item.startsWith(".."))
    .slice(0, 12);
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
