import {
  buildMessages,
  streamResponse,
  streamResponseWithTools,
} from "../streaming";
import type { ChatSession } from "../types";
import {
  parseToolCalls,
  stripFabricatedResults,
} from "../helpers";
import type { ToolLoopDeps } from "../tool-loop";
import { getEndpointCapabilities } from "../provider-capabilities";
import { createHarnessEvent, emitHarnessEvent } from "./events";
import type {
  HarnessAssistantTurn,
  HarnessModelProvider,
  HarnessToolRegistry,
} from "./types";

export class DefaultHarnessModelProvider implements HarnessModelProvider {
  constructor(
    private readonly deps: ToolLoopDeps,
    private readonly registry: HarnessToolRegistry,
  ) {}

  shouldUseStructuredTools(): boolean {
    return getEndpointCapabilities(this.deps.streamingDeps.baseUrl, {
      structuredToolsEnabled:
        this.deps.config.get<boolean>("useStructuredTools", true),
    }).supportsStructuredTools;
  }

  async streamAssistantTurn(
    session: ChatSession,
    workspaceContext: string,
    maxTokens: number,
  ): Promise<HarnessAssistantTurn> {
    const skillContext = this.buildSkillContext();
    const enrichedWorkspaceContext = skillContext
      ? `${workspaceContext}\n\n${skillContext}`
      : workspaceContext;

    if (this.shouldUseStructuredTools()) {
      const currentMessages = buildMessages(
        session,
        enrichedWorkspaceContext,
        this.deps.streamingDeps,
        true,
      );
      const result = await streamResponseWithTools(
        session,
        currentMessages,
        maxTokens,
        this.deps.streamingDeps,
        this.registry.getStructuredToolDefinitions(),
      );
      const cleanedText = stripFabricatedResults(
        result.text.replace(/\s*\[end of text\]/g, ""),
      );

      if (cleanedText) {
        session.transcript.push({ role: "assistant", content: cleanedText });
        emitHarnessEvent(
          this.deps.onHarnessEvent,
          createHarnessEvent(session.id, "assistant_message_completed"),
        );
      }

      const toolCalls =
        result.toolCalls.length > 0
          ? result.toolCalls
          : parseToolCalls(cleanedText);

      if (!cleanedText && toolCalls.length > 0) {
        const summary = toolCalls
          .map(
            (toolCall) =>
              `${toolCall.type}(${toolCall.filePath || toolCall.pattern || toolCall.glob || toolCall.query || toolCall.command || toolCall.url || ""})`,
          )
          .join(", ");
        session.transcript.push({
          role: "assistant",
          content: `[Calling tools: ${summary}]`,
        });
        emitHarnessEvent(
          this.deps.onHarnessEvent,
          createHarnessEvent(session.id, "assistant_message_completed", {
            detail: "tool_summary_placeholder",
          }),
        );
      }

      return { cleanedText, toolCalls };
    }

    const currentMessages = buildMessages(
      session,
      enrichedWorkspaceContext,
      this.deps.streamingDeps,
    );
    const text = await streamResponse(
      session,
      currentMessages,
      maxTokens,
      this.deps.streamingDeps,
    );
    const cleanedText = stripFabricatedResults(
      text.replace(/\s*\[end of text\]/g, ""),
    );
    session.transcript.push({ role: "assistant", content: cleanedText });
    emitHarnessEvent(
      this.deps.onHarnessEvent,
      createHarnessEvent(session.id, "assistant_message_completed"),
    );

    return {
      cleanedText,
      toolCalls: parseToolCalls(cleanedText),
    };
  }

  private buildSkillContext(): string {
    const skills = this.registry.listSkills().slice(0, 12);
    if (!skills.length) {
      return [
        "[PocketAI Skills]",
        "No PocketAI skills are currently registered.",
        "If the user asks about available skills, use list_skills instead of answering from memory.",
      ].join("\n");
    }

    const lines = skills.map(
      (skill) => `- ${skill.id} [${skill.source}]: ${skill.description}`,
    );
    return [
      "[PocketAI Skills]",
      "These are the PocketAI skills available for this request. Treat this list as authoritative for skill availability inside PocketAI.",
      "If the user asks what skills are available, call list_skills.",
      "If the user asks to use a named skill, verify it with list_skills and activate it with run_skill.",
      ...lines,
    ].join("\n");
  }
}
