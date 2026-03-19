import * as vscode from "vscode";
import type {
  ChatRole,
  ChatSession,
  ToolCall,
  ToolCallType,
  ChatCompletionResponse,
  ExtensionToWebviewMessage,
} from "./types";
import {
  TOOL_USE_INSTRUCTIONS,
  PLAN_MODE_INSTRUCTIONS,
  DEFAULT_AUTO_CONTINUE_LIMIT,
  DEFAULT_SYSTEM_PROMPT,
} from "./constants";
import { generateToolCallId } from "./helpers";
import { TOOL_DEFINITIONS } from "./tool-definitions";

export type StreamResult = {
  text: string;
  toolCalls: ToolCall[];
};

export interface StreamingDeps {
  baseUrl: string;
  config: vscode.WorkspaceConfiguration;
  outputChannel: vscode.OutputChannel;
  projectInstructionsCache: string;
  getActiveSystemPrompt: () => string;
  getActiveMaxTokens: () => number;
  broadcastToWebviews: (message: ExtensionToWebviewMessage) => void;
}

const STRUCTURED_TOOL_INSTRUCTIONS =
  "You have tools available for reading and modifying files, searching code, running commands, and using git. Use them by calling the appropriate function. Always read a file before editing it. For edits, the search text must match exactly and appear only once in the file.";

/**
 * Build messages for the chat API. When `useStructuredTools` is true, uses a
 * shorter tool instruction since the tool definitions are sent via the API
 * `tools` parameter.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MessageContent = string | Array<Record<string, any>>;
type ChatMessage = { role: ChatRole; content: MessageContent };

export function buildMessages(
  session: ChatSession,
  workspaceContext: string,
  deps: StreamingDeps,
  useStructuredTools = false,
): ChatMessage[] {
  const messages: ChatMessage[] = [];
  const systemPrompt = deps.getActiveSystemPrompt();

  const toolInstructions =
    session.mode === "plan"
      ? PLAN_MODE_INSTRUCTIONS
      : useStructuredTools
        ? STRUCTURED_TOOL_INSTRUCTIONS
        : TOOL_USE_INSTRUCTIONS;

  const parts = [
    deps.projectInstructionsCache
      ? `[Project Instructions]\n${deps.projectInstructionsCache}`
      : "",
    systemPrompt || DEFAULT_SYSTEM_PROMPT,
    toolInstructions,
    session.mode === "auto"
      ? "When you use tool calls, they will be executed automatically without user confirmation."
      : session.mode === "ask"
        ? "When you use tool calls, the user will review and approve each change before it is applied."
        : "",
    workspaceContext,
    session.activeSkillInjection
      ? `[Active Skill]\n${session.activeSkillInjection}`
      : "",
  ].filter(Boolean);
  messages.push({ role: "system", content: parts.join("\n\n") });

  for (const entry of session.transcript) {
    if (entry.role === "system") continue;
    const role =
      entry.role === "tool" ? "user" : (entry.role as "user" | "assistant");

    // Build multimodal content when images are attached
    if (entry.images?.length) {
      const contentParts: Array<Record<string, unknown>> = [
        { type: "text", text: entry.content },
      ];
      for (const img of entry.images) {
        contentParts.push({
          type: "image_url",
          image_url: { url: `data:${img.mimeType};base64,${img.data}` },
        });
      }
      messages.push({ role, content: contentParts });
    } else {
      messages.push({ role, content: entry.content });
    }
  }
  return messages;
}

export async function streamResponse(
  session: ChatSession,
  messages: ChatMessage[],
  maxTokens: number,
  deps: StreamingDeps,
): Promise<string> {
  let combinedText = "";

  const autoContinueLimit =
    deps.config.get<number>("maxContinuations") ?? DEFAULT_AUTO_CONTINUE_LIMIT;

  for (let attempt = 0; attempt <= autoContinueLimit; attempt++) {
    deps.broadcastToWebviews({ type: "streamStart" });

    const response = await fetch(`${deps.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: "Bearer local-pocketai",
      },
      body: JSON.stringify({
        model: session.selectedModel,
        messages,
        temperature: 0.45,
        top_p: 0.9,
        max_tokens: maxTokens,
        stream: true,
      }),
      signal: session.currentRequest?.signal,
    });

    if (!response.ok) {
      let errorMsg = `HTTP ${response.status}`;
      try {
        const errBody = (await response.json()) as ChatCompletionResponse;
        if (errBody.error?.message) errorMsg = errBody.error.message;
      } catch {}
      throw new Error(errorMsg);
    }

    let chunkText = "";
    let finishReason = "";
    let usageData:
      | { prompt_tokens?: number; completion_tokens?: number }
      | undefined;

    if (response.body) {
      const decoder = new TextDecoder();
      let buffer = "";

      try {
        const body = response.body as unknown as {
          getReader(): ReadableStreamDefaultReader<Uint8Array>;
        };
        const streamReader = body.getReader();

        while (true) {
          const { done, value } = await streamReader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith("data: ")) continue;
            const data = trimmed.slice(6);
            if (data === "[DONE]") {
              finishReason = "stop";
              continue;
            }

            try {
              const parsed = JSON.parse(data);
              const delta = parsed.choices?.[0]?.delta?.content;
              const reason = parsed.choices?.[0]?.finish_reason;
              if (parsed.usage) usageData = parsed.usage;
              if (reason) finishReason = reason;
              if (delta) {
                chunkText += delta;
                deps.broadcastToWebviews({ type: "streamChunk", text: delta });
              }
            } catch {}
          }
        }
      } catch (e) {
        if (!chunkText) {
          deps.broadcastToWebviews({ type: "streamEnd", fullText: "" });
          return await nonStreamingFallback(session, messages, maxTokens, deps);
        }
      }
    } else {
      return await nonStreamingFallback(session, messages, maxTokens, deps);
    }

    const tokenUsage = usageData
      ? {
          promptTokens: usageData.prompt_tokens ?? 0,
          completionTokens: usageData.completion_tokens ?? 0,
        }
      : undefined;

    if (tokenUsage) {
      session.lastTokenUsage = tokenUsage;
      session.cumulativeTokens.prompt += tokenUsage.promptTokens;
      session.cumulativeTokens.completion += tokenUsage.completionTokens;
    }

    if (!chunkText.trim()) {
      deps.broadcastToWebviews({
        type: "streamEnd",
        fullText: combinedText,
        tokenUsage,
      });
      if (!combinedText) throw new Error("PocketAI returned an empty response.");
      return combinedText;
    }

    chunkText = chunkText.replace(/\s*\[end of text\]/g, "");
    combinedText = combinedText
      ? `${combinedText}\n\n${chunkText}`
      : chunkText;
    deps.broadcastToWebviews({
      type: "streamEnd",
      fullText: combinedText,
      tokenUsage,
    });

    const likelyTruncated = finishReason === "length";

    if (!likelyTruncated || attempt === autoContinueLimit) {
      return combinedText;
    }

    messages = [
      ...messages,
      { role: "assistant" as ChatRole, content: combinedText },
      {
        role: "user" as ChatRole,
        content:
          "Continue exactly where you left off. Do not repeat earlier text.",
      },
    ];
    session.status = "Continuing...";
  }

  return combinedText;
}

type RawToolCallDelta = {
  index: number;
  id?: string;
  type?: string;
  function?: { name?: string; arguments?: string };
};

/**
 * Streams a response with structured tool calling support.
 * When the model responds with tool_calls instead of content, they are
 * parsed and returned as ToolCall objects.
 */
export async function streamResponseWithTools(
  session: ChatSession,
  messages: ChatMessage[],
  maxTokens: number,
  deps: StreamingDeps,
  extraTools?: import("./tool-definitions").OpenAITool[],
): Promise<StreamResult> {
  deps.broadcastToWebviews({ type: "streamStart" });

  const baseTools = session.mode === "plan" ? undefined : TOOL_DEFINITIONS;
  const tools = baseTools && extraTools?.length
    ? [...baseTools, ...extraTools]
    : baseTools;

  const response = await fetch(`${deps.baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer local-pocketai",
    },
    body: JSON.stringify({
      model: session.selectedModel,
      messages,
      temperature: 0.45,
      top_p: 0.9,
      max_tokens: maxTokens,
      stream: true,
      ...(tools ? { tools } : {}),
    }),
    signal: session.currentRequest?.signal,
  });

  if (!response.ok) {
    let errorMsg = `HTTP ${response.status}`;
    try {
      const errBody = (await response.json()) as ChatCompletionResponse;
      if (errBody.error?.message) errorMsg = errBody.error.message;
    } catch {}
    throw new Error(errorMsg);
  }

  let contentText = "";
  let finishReason = "";
  const toolCallAccum = new Map<
    number,
    { id: string; name: string; arguments: string }
  >();
  let usageData:
    | { prompt_tokens?: number; completion_tokens?: number }
    | undefined;

  if (response.body) {
    const decoder = new TextDecoder();
    let buffer = "";

    try {
      const body = response.body as unknown as {
        getReader(): ReadableStreamDefaultReader<Uint8Array>;
      };
      const streamReader = body.getReader();

      while (true) {
        const { done, value } = await streamReader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith("data: ")) continue;
          const data = trimmed.slice(6);
          if (data === "[DONE]") {
            finishReason = finishReason || "stop";
            continue;
          }

          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta;
            const reason = parsed.choices?.[0]?.finish_reason;
            if (parsed.usage) usageData = parsed.usage;
            if (reason) finishReason = reason;

            // Accumulate content text
            if (delta?.content) {
              contentText += delta.content;
              deps.broadcastToWebviews({
                type: "streamChunk",
                text: delta.content,
              });
            }

            // Accumulate tool_calls deltas
            if (delta?.tool_calls) {
              for (const tc of delta.tool_calls as RawToolCallDelta[]) {
                const idx = tc.index;
                if (!toolCallAccum.has(idx)) {
                  toolCallAccum.set(idx, {
                    id: tc.id || "",
                    name: tc.function?.name || "",
                    arguments: "",
                  });
                }
                const accum = toolCallAccum.get(idx)!;
                if (tc.id) accum.id = tc.id;
                if (tc.function?.name) accum.name = tc.function.name;
                if (tc.function?.arguments) {
                  accum.arguments += tc.function.arguments;
                }
              }
            }
          } catch {}
        }
      }
    } catch (e) {
      // If we got nothing at all, fall back
      if (!contentText && toolCallAccum.size === 0) {
        deps.broadcastToWebviews({ type: "streamEnd", fullText: "" });
        const text = await nonStreamingFallback(
          session,
          messages,
          maxTokens,
          deps,
        );
        return { text, toolCalls: [] };
      }
    }
  } else {
    const text = await nonStreamingFallback(
      session,
      messages,
      maxTokens,
      deps,
    );
    return { text, toolCalls: [] };
  }

  const tokenUsage = usageData
    ? {
        promptTokens: usageData.prompt_tokens ?? 0,
        completionTokens: usageData.completion_tokens ?? 0,
      }
    : undefined;

  if (tokenUsage) {
    session.lastTokenUsage = tokenUsage;
    session.cumulativeTokens.prompt += tokenUsage.promptTokens;
    session.cumulativeTokens.completion += tokenUsage.completionTokens;
  }

  // Warn if response was truncated — tool call arguments may be incomplete
  if (finishReason === "length") {
    deps.outputChannel.appendLine(
      "⚠ Structured tool response was truncated (finish_reason=length). Tool calls may be incomplete.",
    );
  }

  contentText = contentText.replace(/\s*\[end of text\]/g, "");

  deps.broadcastToWebviews({
    type: "streamEnd",
    fullText: contentText,
    tokenUsage,
  });

  // Convert accumulated tool calls to ToolCall objects
  const toolCalls: ToolCall[] = [];
  for (const [, accum] of toolCallAccum) {
    try {
      const args = accum.arguments ? JSON.parse(accum.arguments) : {};
      const tc = createToolCallFromFunction(accum.name, accum.id, args);
      toolCalls.push(tc);
    } catch {
      deps.outputChannel.appendLine(
        `⚠ Skipping malformed tool call: ${accum.name}(${accum.arguments.slice(0, 100)})`,
      );
    }
  }

  return { text: contentText, toolCalls };
}

/** Maps structured function call arguments to a ToolCall object. */
function createToolCallFromFunction(
  name: string,
  id: string,
  args: Record<string, string>,
): ToolCall {
  const type = name as ToolCallType;
  const tc: ToolCall = {
    id: id || generateToolCallId(),
    type,
    filePath: args.path || "",
    status: "pending",
  };

  // MCP tools: store the raw args for the MCP manager to use
  if (name.startsWith("mcp__")) {
    (tc as { mcpArgs?: Record<string, unknown> }).mcpArgs = args;
    return tc;
  }

  switch (type) {
    case "edit_file":
      tc.search = args.search;
      tc.replace = args.replace;
      break;
    case "create_file":
      tc.content = args.content;
      break;
    case "web_search":
      tc.query = args.query;
      break;
    case "run_command":
      tc.command = args.command;
      if (args.background) tc.background = true;
      break;
    case "grep":
      tc.pattern = args.pattern;
      tc.glob = args.glob;
      break;
    case "glob":
      tc.glob = args.pattern;
      break;
    case "git_commit":
      tc.commitMessage = args.message;
      break;
  }

  return tc;
}

async function nonStreamingFallback(
  session: ChatSession,
  messages: ChatMessage[],
  maxTokens: number,
  deps: StreamingDeps,
): Promise<string> {
  const response = await fetch(`${deps.baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer local-pocketai",
    },
    body: JSON.stringify({
      model: session.selectedModel,
      messages,
      temperature: 0.45,
      top_p: 0.9,
      max_tokens: maxTokens,
      stream: false,
    }),
    signal: session.currentRequest?.signal,
  });
  const payload = (await response.json()) as ChatCompletionResponse;
  if (!response.ok) {
    throw new Error(payload.error?.message || `HTTP ${response.status}`);
  }
  const text = payload.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("Empty response.");
  deps.broadcastToWebviews({ type: "streamEnd", fullText: text });
  return text;
}
