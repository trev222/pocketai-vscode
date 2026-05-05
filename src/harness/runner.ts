import type { ChatSession, ToolCall } from "../types";
import { MAX_TOOL_TURNS } from "../constants";
import type { ToolLoopDeps } from "../tool-loop";
import { getSessionWorkspaceRoot } from "../workspace-roots";
import { createHarnessEvent, emitHarnessEvent } from "./events";
import { shouldAutoExecuteTool } from "./policy";
import { DefaultHarnessModelProvider } from "./provider";
import { DefaultHarnessToolRuntime } from "./runtime";
import {
  canCompactForContextRecovery,
  canRecoverReadLoop,
  canRecoverRepeatedToolLoop,
  classifyHarnessError,
  shouldSurfaceRetryErrorInTranscript,
} from "./turn-policy";
import { createHarnessToolRegistry } from "./tools/registry";
import type {
  HarnessAssistantTurn,
  HarnessLoopSnapshot,
  HarnessModelProvider,
  HarnessRunnerResult,
  HarnessToolRegistry,
  HarnessToolRuntime,
} from "./types";

export class HarnessRunner {
  private readonly registry: HarnessToolRegistry;
  private readonly provider: HarnessModelProvider;
  private readonly runtime: HarnessToolRuntime;
  private readonly loopState: HarnessLoopSnapshot = {
    previousToolKeys: new Set<string>(),
    fileReadCounts: new Map<string, number>(),
    nudgedReadLoopFiles: new Set<string>(),
    repeatedToolRecoveryUsed: false,
    contextCompactions: 0,
    consecutiveModelErrors: { count: 0, maxRetries: 3 },
    consecutiveToolFailures: { count: 0, maxRetries: 3 },
  };

  constructor(private readonly deps: ToolLoopDeps) {
    this.registry = createHarnessToolRegistry(deps);
    this.provider = new DefaultHarnessModelProvider(deps, this.registry);
    this.runtime = new DefaultHarnessToolRuntime(deps, this.registry);
  }

  async run(session: ChatSession): Promise<HarnessRunnerResult> {
    emitHarnessEvent(
      this.deps.onHarnessEvent,
      createHarnessEvent(session.id, "turn_started"),
    );

    const maxTokens = Math.max(
      128,
      this.deps.streamingDeps.getActiveMaxTokens(),
    );

    for (let turn = 0; turn < MAX_TOOL_TURNS; turn++) {
      if (this.deps.autoCompact) {
        await this.deps.autoCompact(session);
      }

      const workspaceContext = await this.deps.buildWorkspaceContext(session);
      let assistantTurn: HarnessAssistantTurn;

      try {
        assistantTurn = await this.provider.streamAssistantTurn(
          session,
          workspaceContext,
          maxTokens,
        );
        this.loopState.consecutiveModelErrors.count = 0;
      } catch (error) {
        if (await this.handleTurnError(session, error)) {
          continue;
        }
        emitHarnessEvent(
          this.deps.onHarnessEvent,
          createHarnessEvent(session.id, "turn_failed", {
            detail:
              error instanceof Error ? error.message : "Unknown harness error",
          }),
        );
        throw error;
      }

      if (assistantTurn.toolCalls.length === 0) {
        emitHarnessEvent(
          this.deps.onHarnessEvent,
          createHarnessEvent(session.id, "turn_completed", {
            detail: "completed",
          }),
        );
        return { stoppedBecause: "completed", turnsCompleted: turn + 1 };
      }

      emitHarnessEvent(
        this.deps.onHarnessEvent,
        createHarnessEvent(session.id, "tool_calls_detected", {
          detail: String(assistantTurn.toolCalls.length),
        }),
      );

      const lastEntry = session.transcript[session.transcript.length - 1];
      if (lastEntry) {
        lastEntry.toolCalls = assistantTurn.toolCalls;
      }

      const repeatedToolOutcome = this.detectRepeatedToolCalls(
        session,
        assistantTurn.toolCalls,
      );
      if (repeatedToolOutcome === "recover") {
        session.status = "Re-planning after repeated tool calls...";
        this.deps.postState();
        continue;
      }
      if (repeatedToolOutcome === "stop") {
        return { stoppedBecause: "loop_detected", turnsCompleted: turn + 1 };
      }

      const readLoopOutcome = this.detectReadLoop(session, assistantTurn.toolCalls);
      if (readLoopOutcome === "recover") {
        session.status = "Re-planning after repeated file reads...";
        this.deps.postState();
        continue;
      }
      if (readLoopOutcome === "stop") {
        return { stoppedBecause: "loop_detected", turnsCompleted: turn + 1 };
      }

      const anyToolFailed = await this.executeAutoApprovedToolCalls(
        session,
        assistantTurn.toolCalls,
      );

      if (assistantTurn.toolCalls.some((toolCall) => toolCall.status === "pending")) {
        this.showPendingApprovals(session, assistantTurn.toolCalls);
        this.deps.postState();
        return { stoppedBecause: "pending_approval", turnsCompleted: turn + 1 };
      }

      if (anyToolFailed) {
        this.loopState.consecutiveToolFailures.count++;
        if (
          this.loopState.consecutiveToolFailures.count >=
          this.loopState.consecutiveToolFailures.maxRetries
        ) {
          this.deps.outputChannel.appendLine(
            "⚠ Multiple tool failures detected, stopping loop.",
          );
          session.transcript.push({
            role: "tool",
            content:
              "Multiple tool failures occurred in a row. Stop retrying the same failing path and explain the blocker or choose a different strategy.",
          });
          emitHarnessEvent(
            this.deps.onHarnessEvent,
            createHarnessEvent(session.id, "turn_completed", {
              detail: "tool_failures",
            }),
          );
          return { stoppedBecause: "tool_failures", turnsCompleted: turn + 1 };
        }
      } else {
        this.loopState.consecutiveToolFailures.count = 0;
      }

      session.status = `Thinking... (turn ${turn + 1})`;
      this.deps.postState();
    }

    emitHarnessEvent(
      this.deps.onHarnessEvent,
      createHarnessEvent(session.id, "turn_completed", {
        detail: "max_turns",
      }),
    );
    return { stoppedBecause: "max_turns", turnsCompleted: MAX_TOOL_TURNS };
  }

  private async handleTurnError(
    session: ChatSession,
    error: unknown,
  ): Promise<boolean> {
    const classification = classifyHarnessError(error);

    if (
      classification.kind === "context-pressure" &&
      this.deps.autoCompact &&
      canCompactForContextRecovery(this.loopState)
    ) {
      this.loopState.contextCompactions++;
      this.deps.outputChannel.appendLine(
        `⚠ Context pressure detected, compacting and retrying: ${classification.message}`,
      );
      session.transcript.push({
        role: "tool",
        content: `[Context pressure detected: ${classification.message}. Compacting conversation and retrying.]`,
      });
      session.status = "Compacting context and retrying...";
      this.deps.postState();
      await this.deps.autoCompact(session);
      return true;
    }

    this.loopState.consecutiveModelErrors.count++;
    const message = classification.message;

    if (
      this.loopState.consecutiveModelErrors.count >=
      this.loopState.consecutiveModelErrors.maxRetries
    ) {
      this.deps.outputChannel.appendLine(
        `✗ Tool loop failed after ${this.loopState.consecutiveModelErrors.maxRetries} retries: ${message}`,
      );
      return false;
    }

    this.deps.outputChannel.appendLine(
      `⚠ Tool loop error (attempt ${this.loopState.consecutiveModelErrors.count}/${this.loopState.consecutiveModelErrors.maxRetries}): ${message}`,
    );

    if (
      session.transcript.length > 0 &&
      shouldSurfaceRetryErrorInTranscript(classification)
    ) {
      session.transcript.push({
        role: "tool",
        content: `[Error: ${message}. Retrying...]`,
      });
    }

    session.status =
      classification.kind === "transient"
        ? "Retrying after transient model/server issue..."
        : "Retrying...";
    this.deps.postState();
    return true;
  }

  private detectRepeatedToolCalls(
    session: ChatSession,
    toolCalls: ToolCall[],
  ): "continue" | "recover" | "stop" {
    const toolKey = toolCalls
      .map(
        (toolCall) =>
          `${toolCall.type}:${toolCall.filePath}:${toolCall.query || toolCall.pattern || toolCall.url || ""}`,
      )
      .join("|");

    if (this.loopState.previousToolKeys.has(toolKey)) {
      if (canRecoverRepeatedToolLoop(this.loopState)) {
        this.loopState.repeatedToolRecoveryUsed = true;
        this.loopState.previousToolKeys.clear();
        session.transcript.push({
          role: "tool",
          content:
            "Loop warning: you repeated the same tool calls. Re-plan from what you already learned, choose a different tool, or ask the user for clarification.",
        });
        this.deps.outputChannel.appendLine(
          "⚠ Loop detected — same tool calls repeated, issuing a recovery nudge.",
        );
        return "recover";
      }
      this.deps.outputChannel.appendLine(
        "⚠ Loop detected — same tool calls repeated, stopping.",
      );
      session.transcript.push({
        role: "tool",
        content:
          "Loop detected: you are repeating the same tool calls. Try a different approach or explain the issue to the user.",
      });
      emitHarnessEvent(
        this.deps.onHarnessEvent,
        createHarnessEvent(session.id, "turn_completed", {
          detail: "loop_detected",
        }),
      );
      return "stop";
    }

    this.loopState.previousToolKeys.add(toolKey);
    return "continue";
  }

  private detectReadLoop(
    session: ChatSession,
    toolCalls: ToolCall[],
  ): "continue" | "recover" | "stop" {
    for (const toolCall of toolCalls) {
      if (toolCall.type === "read_file") {
        const count =
          (this.loopState.fileReadCounts.get(toolCall.filePath) ?? 0) + 1;
        this.loopState.fileReadCounts.set(toolCall.filePath, count);

        if (count > 3) {
          if (canRecoverReadLoop(this.loopState, toolCall.filePath)) {
            this.loopState.nudgedReadLoopFiles.add(toolCall.filePath);
            this.loopState.fileReadCounts.set(toolCall.filePath, 0);
            session.transcript.push({
              role: "tool",
              content: `Loop warning: you have re-read ${toolCall.filePath} several times without changing strategy. Summarize what you learned, read a different file, or explain the blocker.`,
            });
            this.deps.outputChannel.appendLine(
              `⚠ Loop detected — ${toolCall.filePath} read repeatedly, issuing a recovery nudge.`,
            );
            return "recover";
          }
          this.deps.outputChannel.appendLine(
            `⚠ Loop detected — ${toolCall.filePath} read ${count} times without an edit.`,
          );
          session.transcript.push({
            role: "tool",
            content: `Loop detected: you have read ${toolCall.filePath} ${count} times without editing it. Try a different approach.`,
          });
          emitHarnessEvent(
            this.deps.onHarnessEvent,
            createHarnessEvent(session.id, "turn_completed", {
              detail: "loop_detected",
            }),
          );
          return "stop";
        }
      } else if (
        toolCall.type === "edit_file" ||
        toolCall.type === "write_file"
      ) {
        this.loopState.fileReadCounts.delete(toolCall.filePath);
        this.loopState.nudgedReadLoopFiles.delete(toolCall.filePath);
      }
    }

    return "continue";
  }

  private async executeAutoApprovedToolCalls(
    session: ChatSession,
    toolCalls: ToolCall[],
  ): Promise<boolean> {
    let anyToolFailed = false;

    for (const toolCall of toolCalls) {
      const descriptor = this.registry.getToolDescriptor(toolCall.type);
      if (!shouldAutoExecuteTool(session.mode, toolCall, descriptor)) {
        continue;
      }

      toolCall.status = "approved";

      try {
        toolCall.result = await this.runtime.execute(session, toolCall);
      } catch (error) {
        toolCall.result = `Tool execution error: ${(error as Error).message}`;
        anyToolFailed = true;
      }

      toolCall.status = "executed";
      session.transcript.push({
        role: "tool",
        content: toolCall.result ?? "",
      });
    }

    return anyToolFailed;
  }

  private showPendingApprovals(
    session: ChatSession,
    toolCalls: ToolCall[],
  ) {
    for (const toolCall of toolCalls) {
      if (toolCall.status !== "pending") {
        continue;
      }
      const descriptor = this.registry.getToolDescriptor(toolCall.type);
      emitHarnessEvent(
        this.deps.onHarnessEvent,
        createHarnessEvent(session.id, "tool_call_pending_approval", {
          toolCallId: toolCall.id,
          detail: toolCall.type,
        }),
      );
      if (descriptor?.previewKind === "inline-diff") {
        emitHarnessEvent(
          this.deps.onHarnessEvent,
          createHarnessEvent(session.id, "diff_ready", {
            toolCallId: toolCall.id,
            detail: toolCall.filePath,
          }),
        );
        if (this.deps.inlineDiffMgr) {
          void this.deps.inlineDiffMgr.showInlineDiff(
            toolCall,
            getSessionWorkspaceRoot(session),
          );
        }
      }
    }
  }
}
