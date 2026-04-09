import type { ChatSession, ToolCall } from "../types";
import type { ToolLoopDeps } from "../tool-loop";
import { executeToolCallWithHooks } from "../tool-executor";
import { createHarnessEvent, emitHarnessEvent } from "./events";
import type { HarnessToolRegistry, HarnessToolRuntime } from "./types";

export class DefaultHarnessToolRuntime implements HarnessToolRuntime {
  constructor(
    private readonly deps: ToolLoopDeps,
    private readonly registry: HarnessToolRegistry,
  ) {}

  async execute(session: ChatSession, toolCall: ToolCall): Promise<string> {
    emitHarnessEvent(
      this.deps.onHarnessEvent,
      createHarnessEvent(session.id, "tool_call_started", {
        toolCallId: toolCall.id,
        detail: toolCall.type,
      }),
    );

    try {
      const result = await this.executeUnchecked(session, toolCall);
      emitHarnessEvent(
        this.deps.onHarnessEvent,
        createHarnessEvent(session.id, "tool_call_completed", {
          toolCallId: toolCall.id,
          detail: toolCall.type,
        }),
      );
      return result;
    } catch (error) {
      emitHarnessEvent(
        this.deps.onHarnessEvent,
        createHarnessEvent(session.id, "tool_call_failed", {
          toolCallId: toolCall.id,
          detail:
            error instanceof Error ? error.message : "Tool execution failed.",
        }),
      );
      throw error;
    }
  }

  private async executeUnchecked(
    session: ChatSession,
    toolCall: ToolCall,
  ): Promise<string> {
    const descriptor = this.registry.getToolDescriptor(toolCall.type);
    if (descriptor?.execute) {
      return descriptor.execute({
        session,
        toolCall,
        registry: this.registry,
      });
    }

    const isMcp = descriptor?.source === "mcp";
    if (isMcp) {
      const args = (toolCall as { mcpArgs?: Record<string, unknown> }).mcpArgs ?? {};
      return this.deps.mcpManager!.executeTool(toolCall.type, args);
    }

    return executeToolCallWithHooks(
      this.deps.config,
      this.deps.outputChannel,
      session,
      toolCall,
      this.deps.terminalMgr,
      this.deps.memoryMgr,
    );
  }
}
