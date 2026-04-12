import * as vscode from "vscode";
import type {
  ChatRole,
  ChatSession,
  ToolCall,
  ToolCallType,
  ChatCompletionResponse,
  ExtensionToWebviewMessage,
  FileAttachment,
} from "./types";
import type { EndpointCapabilities } from "./provider-capabilities";
import {
  TOOL_USE_INSTRUCTIONS,
  PLAN_MODE_INSTRUCTIONS,
  DEFAULT_AUTO_CONTINUE_LIMIT,
  DEFAULT_SYSTEM_PROMPT,
} from "./constants";
import { generateToolCallId } from "./helpers";
import type { OpenAITool } from "./tool-definitions";

/**
 * Wrapper around fetch that produces actionable error messages for network failures.
 * Node's native "fetch failed" error is unhelpful — this adds context about what
 * URL was being reached and common fixes.
 */
async function fetchWithContext(
  url: string,
  init?: RequestInit,
): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (err) {
    const cause = (err as { cause?: { code?: string } }).cause;
    const code = cause?.code ?? "";
    let hint: string;
    if (code === "ECONNREFUSED") {
      hint = `Connection refused at ${url} — is the model server running?`;
    } else if (code === "ENOTFOUND") {
      const host = new URL(url).hostname;
      hint = `Could not resolve host "${host}" — check your endpoint URL in settings.`;
    } else if (code === "ETIMEDOUT" || code === "UND_ERR_CONNECT_TIMEOUT") {
      hint = `Connection timed out reaching ${url} — the server may be overloaded or unreachable.`;
    } else if ((err as Error).name === "AbortError") {
      throw err; // re-throw cancellations as-is
    } else {
      hint = `Network error reaching ${url}: ${(err as Error).message ?? err}`;
    }
    const wrapped = new Error(hint);
    wrapped.name = (err as Error).name ?? "FetchError";
    throw wrapped;
  }
}

export type StreamResult = {
  text: string;
  toolCalls: ToolCall[];
};

export interface StreamingDeps {
  baseUrl: string;
  apiKey: string;
  config: vscode.WorkspaceConfiguration;
  outputChannel: vscode.OutputChannel;
  projectInstructionsCache: string;
  getActiveSystemPrompt: () => string;
  getActiveReasoningEffort: () => string;
  getActiveMaxTokens: () => number;
  getActiveEndpointCapabilities: () => EndpointCapabilities;
  broadcastToWebviews: (message: ExtensionToWebviewMessage) => void;
  memoryContext?: string;
}

const STRUCTURED_TOOL_INSTRUCTIONS = `You have tools available via function calling. Follow these rules:

# Tool Selection
- If the user asks what skills are available, call list_skills instead of answering from memory.
- If the user asks to use a named skill, call list_skills to verify it and run_skill to activate it.
- Do not claim a skill is available unless it appears in list_skills.
- To find files by name or extension, use glob. To search file contents, use grep.
- To read a file, use read_file — never run_command with cat/head/tail.
- To bring a file or code location into the editor for the user, use open_file.
- To jump directly from a usage site to its implementation in the editor, use open_definition.
- To search for a symbol across the workspace, use workspace_symbols.
- To inspect type/docs/signature info for a symbol at a position, use hover_symbol.
- To inspect available quick fixes or refactors at a location, use code_actions.
- To apply one of those editor actions directly, use apply_code_action with the exact title.
- To modify a file, use edit_file — never run_command with sed/awk.
- To create a new file, use write_file — never run_command with echo/cat redirection.
- Use run_command only for shell operations that have no dedicated tool (builds, installs, test runners, etc.).
- For a known file path, use read_file directly. For a known class/function name, use grep. Only use glob when you need pattern-based file discovery.

# Tool Usage Rules
- Always read a file with read_file before editing it. Never edit a file you haven't read.
- For edit_file, the old_string must match the file content EXACTLY including whitespace. If it matches multiple locations, include more surrounding context to make it unique, or use replace_all.
- Prefer edit_file over write_file for existing files — it only sends the diff.
- Use write_file only for new files or complete rewrites.
- After calling a tool, wait for its result. Do not guess or fabricate results.

# Parallel Tool Calls
- If you need to call multiple tools with no dependencies between them, call them all in the same response for efficiency.
- If one call depends on the result of another, call them sequentially.

# Self-Regulation
- If an approach is blocked or failing, do not retry the same call repeatedly. Try a different approach or ask the user.
- If you are unsure which file to edit or what the user wants, ask a clarifying question rather than guessing.
- Consider the reversibility of actions. Read and search tools are safe. Edit, write, run_command, and git_commit change state — be deliberate with these.`;

/**
 * Build messages for the chat API. When `useStructuredTools` is true, uses a
 * shorter tool instruction since the tool definitions are sent via the API
 * `tools` parameter.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type MessageContent = string | Array<Record<string, any>>;
type ChatMessage = { role: ChatRole; content: MessageContent };

function buildCompletionRequestBody(
  session: ChatSession,
  messages: ChatMessage[],
  maxTokens: number,
  deps: StreamingDeps,
  extras?: Record<string, unknown>,
) {
  const reasoningEffort = deps.getActiveEndpointCapabilities()
    .supportsReasoningEffort
    ? session.selectedReasoningEffort.trim() ||
      deps.getActiveReasoningEffort().trim()
    : "";

  return {
    model: session.selectedModel,
    messages,
    temperature: 0.45,
    top_p: 0.9,
    max_tokens: maxTokens,
    ...(reasoningEffort ? { reasoning_effort: reasoningEffort } : {}),
    ...(extras ?? {}),
  };
}

function buildAttachedFilesContext(files?: FileAttachment[]): string {
  if (!files?.length) return "";

  return files
    .map((file) => {
      const metadata = [file.name];
      if (file.mimeType) metadata.push(file.mimeType);
      if (typeof file.sizeBytes === "number" && file.sizeBytes > 0) {
        metadata.push(`${Math.max(1, Math.round(file.sizeBytes / 1024))} KB`);
      }
      if (file.truncated) metadata.push("truncated");

      const content = file.content.trim()
        ? file.content
        : "[Attachment content unavailable in this restored session.]";

      return [
        `[Attached file: ${metadata.join(" | ")}]`,
        "--- BEGIN FILE ---",
        content,
        "--- END FILE ---",
      ].join("\n");
    })
    .join("\n\n");
}

function buildEntryTextForModel(
  entry: ChatSession["transcript"][number],
): string {
  const parts: string[] = [];
  if (entry.content.trim()) {
    parts.push(entry.content);
  }

  const fileContext = buildAttachedFilesContext(entry.files);
  if (fileContext) {
    parts.push(fileContext);
  }

  return parts.join("\n\n");
}

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
    deps.memoryContext || "",
    toolInstructions,
    session.mode === "auto"
      ? "When you use tool calls, they will be executed automatically without user confirmation."
      : session.mode === "ask"
        ? "When you use tool calls, the user will review and approve each change before it is applied."
        : "",
    workspaceContext,
    session.activeSkillInjection || "",
    session.skillPreflightContext || "",
  ].filter(Boolean);
  messages.push({ role: "system", content: parts.join("\n\n") });

  for (const entry of session.transcript) {
    if (entry.role === "system") continue;
    const role =
      entry.role === "tool" ? "user" : (entry.role as "user" | "assistant");
    const entryText = buildEntryTextForModel(entry);

    // Build multimodal content when images are attached
    if (entry.images?.length) {
      const contentParts: Array<Record<string, unknown>> = [
        { type: "text", text: entryText || entry.content },
      ];
      for (const img of entry.images) {
        contentParts.push({
          type: "image_url",
          image_url: { url: `data:${img.mimeType};base64,${img.data}` },
        });
      }
      messages.push({ role, content: contentParts });
    } else {
      messages.push({ role, content: entryText || entry.content });
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

    const response = await fetchWithContext(`${deps.baseUrl}/v1/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${deps.apiKey}`,
      },
      body: JSON.stringify(
        buildCompletionRequestBody(session, messages, maxTokens, deps, {
          stream: true,
        }),
      ),
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
    let responseModel = "";
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
              if (typeof parsed.model === "string" && parsed.model.trim()) {
                responseModel = parsed.model.trim();
              }
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
        responseModel: responseModel || undefined,
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
      responseModel: responseModel || undefined,
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
  tools?: OpenAITool[],
): Promise<StreamResult> {
  deps.broadcastToWebviews({ type: "streamStart" });

  const structuredTools = session.mode === "plan" ? undefined : tools;

  const response = await fetchWithContext(`${deps.baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${deps.apiKey}`,
    },
      body: JSON.stringify(
        buildCompletionRequestBody(session, messages, maxTokens, deps, {
          stream: true,
          ...(structuredTools ? { tools: structuredTools } : {}),
        }),
      ),
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
  let responseModel = "";
  let announcedStructuredToolMode = false;
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
            if (typeof parsed.model === "string" && parsed.model.trim()) {
              responseModel = parsed.model.trim();
            }
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
              if (!announcedStructuredToolMode) {
                announcedStructuredToolMode = true;
                deps.broadcastToWebviews({ type: "streamToolCallDetected" });
              }
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

  // Handle truncated responses — try to auto-continue for content,
  // and attempt JSON repair for incomplete tool call arguments
  const autoContinueLimit =
    deps.config.get<number>("maxContinuations") ?? DEFAULT_AUTO_CONTINUE_LIMIT;

  if (finishReason === "length" && toolCallAccum.size === 0 && contentText) {
    // Truncated text-only response — auto-continue using streamResponse
    // (not recursive streamResponseWithTools, to avoid nested auto-continue loops)
    deps.outputChannel.appendLine(
      "⚠ Structured tool response truncated (text only), auto-continuing...",
    );

    let combinedText = contentText;
    for (let attempt = 0; attempt < autoContinueLimit; attempt++) {
      const continueMessages: ChatMessage[] = [
        ...messages,
        { role: "assistant" as ChatRole, content: combinedText },
        {
          role: "user" as ChatRole,
          content:
            "Continue exactly where you left off. Do not repeat earlier text.",
        },
      ];

      deps.broadcastToWebviews({ type: "streamStart" });
      // Use text-only streaming for continuation — avoids recursive auto-continue
      // and token double-counting. If the model needs tools, the tool loop will
      // handle it on the next turn.
      const contText = await streamResponse(
        session,
        continueMessages,
        maxTokens,
        deps,
      );

      if (!contText.trim()) break;
      combinedText += "\n\n" + contText;
    }

    contentText = combinedText;
  } else if (finishReason === "length" && toolCallAccum.size > 0) {
    deps.outputChannel.appendLine(
      "⚠ Structured tool response truncated with incomplete tool calls. Attempting JSON repair.",
    );
  }

  contentText = contentText.replace(/\s*\[end of text\]/g, "");

  deps.broadcastToWebviews({
    type: "streamEnd",
    fullText: contentText,
    tokenUsage,
    responseModel: responseModel || undefined,
  });

  // Convert accumulated tool calls to ToolCall objects
  const toolCalls: ToolCall[] = [];
  for (const [, accum] of toolCallAccum) {
    try {
      const args = accum.arguments ? JSON.parse(accum.arguments) : {};
      const tc = createToolCallFromFunction(accum.name, accum.id, args);
      toolCalls.push(tc);
    } catch {
      // Attempt JSON repair for truncated arguments
      const repaired = tryRepairJson(accum.arguments);
      if (repaired !== null) {
        deps.outputChannel.appendLine(
          `⚠ Repaired truncated JSON for tool call: ${accum.name}`,
        );
        const tc = createToolCallFromFunction(accum.name, accum.id, repaired);
        toolCalls.push(tc);
      } else {
        deps.outputChannel.appendLine(
          `⚠ Skipping malformed tool call: ${accum.name}(${accum.arguments.slice(0, 100)})`,
        );
      }
    }
  }

  return { text: contentText, toolCalls };
}

/** Maps structured function call arguments to a ToolCall object. */
function createToolCallFromFunction(
  name: string,
  id: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  args: Record<string, any>,
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
    case "list_tools":
      tc.query = args.query;
      break;
    case "list_skills":
      tc.query = args.query;
      break;
    case "run_skill":
      tc.skillName = args.name;
      tc.skillPrompt = args.prompt;
      break;
    case "diagnostics":
      if (args.path) tc.filePath = args.path;
      break;
    case "open_file":
      if (args.line !== undefined) tc.line = Number(args.line);
      if (args.character !== undefined) tc.character = Number(args.character);
      break;
    case "open_definition":
      if (args.line !== undefined) tc.line = Number(args.line);
      if (args.character !== undefined) tc.character = Number(args.character);
      break;
    case "workspace_symbols":
      tc.query = args.query;
      break;
    case "hover_symbol":
      if (args.line !== undefined) tc.line = Number(args.line);
      if (args.character !== undefined) tc.character = Number(args.character);
      break;
    case "code_actions":
      if (args.line !== undefined) tc.line = Number(args.line);
      if (args.character !== undefined) tc.character = Number(args.character);
      break;
    case "apply_code_action":
      if (args.line !== undefined) tc.line = Number(args.line);
      if (args.character !== undefined) tc.character = Number(args.character);
      tc.actionTitle = args.title;
      break;
    case "go_to_definition":
      if (args.line !== undefined) tc.line = Number(args.line);
      if (args.character !== undefined) tc.character = Number(args.character);
      break;
    case "find_references":
      if (args.line !== undefined) tc.line = Number(args.line);
      if (args.character !== undefined) tc.character = Number(args.character);
      if (args.include_declaration !== undefined) {
        tc.includeDeclaration = Boolean(args.include_declaration);
      }
      break;
    case "document_symbols":
      break;
    case "read_file":
      if (args.offset !== undefined) tc.offset = Number(args.offset);
      if (args.limit !== undefined) tc.limit = Number(args.limit);
      break;
    case "edit_file":
      tc.search = args.old_string || args.search;
      tc.replace = args.new_string || args.replace;
      if (args.replace_all) tc.replaceAll = true;
      break;
    case "write_file":
      tc.content = args.content;
      break;
    case "web_search":
      tc.query = args.query;
      break;
    case "web_fetch":
      tc.url = args.url;
      break;
    case "run_command":
      tc.command = args.command;
      tc.description = args.description;
      if (args.timeout !== undefined) tc.timeout = Number(args.timeout);
      if (args.background) tc.background = true;
      break;
    case "grep":
      tc.pattern = args.pattern;
      tc.glob = args.glob;
      tc.grepType = args.type;
      tc.outputMode = args.output_mode;
      if (args.context !== undefined) tc.contextLines = Number(args.context);
      if (args.before !== undefined) tc.beforeLines = Number(args.before);
      if (args.after !== undefined) tc.afterLines = Number(args.after);
      if (args.case_insensitive) tc.caseInsensitive = true;
      if (args.multiline) tc.multiline = true;
      if (args.head_limit !== undefined) tc.headLimit = Number(args.head_limit);
      if (args.path) tc.filePath = args.path;
      break;
    case "glob":
      tc.glob = args.pattern;
      tc.globPath = args.path;
      break;
    case "git_commit":
      tc.commitMessage = args.message;
      break;
    case "todo_write":
      tc.todos = args.todos;
      break;
    case "memory_read":
      tc.memoryQuery = args.query;
      tc.memoryType = args.type;
      break;
    case "memory_write":
      tc.memoryType = args.type;
      tc.memoryName = args.name;
      tc.memoryDescription = args.description;
      tc.memoryContent = args.content;
      break;
    case "memory_delete":
      tc.memoryName = args.name;
      break;
  }

  return tc;
}

/**
 * Attempts to repair truncated JSON from incomplete tool call arguments.
 * Tries progressively more aggressive fixes: closing brackets/braces,
 * truncating the last incomplete string value.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function tryRepairJson(raw: string): Record<string, any> | null {
  if (!raw || !raw.trim()) return null;

  let s = raw.trim();

  // If it doesn't start with {, it's not salvageable
  if (!s.startsWith("{")) return null;

  // Try as-is first (maybe it's valid)
  try {
    return JSON.parse(s);
  } catch {}

  // Strategy 1: close any open strings and brackets
  // Count unmatched braces and brackets
  let inString = false;
  let escaped = false;
  const stack: string[] = [];

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (ch === '"' && !inString) {
      inString = true;
    } else if (ch === '"' && inString) {
      inString = false;
    } else if (!inString) {
      if (ch === "{") stack.push("}");
      else if (ch === "[") stack.push("]");
      else if (ch === "}" || ch === "]") stack.pop();
    }
  }

  // If we're inside a string, close it
  if (inString) s += '"';

  // Close any open structures
  while (stack.length > 0) s += stack.pop();

  try {
    return JSON.parse(s);
  } catch {}

  // Strategy 2: truncate the last incomplete key-value pair
  // Find the last complete key-value pair by looking for the last comma or opening brace
  const lastComma = raw.lastIndexOf(",");
  if (lastComma > 0) {
    let truncated = raw.slice(0, lastComma).trim();
    // Close any open structures
    const opens = (truncated.match(/{/g) || []).length;
    const closes = (truncated.match(/}/g) || []).length;
    for (let i = 0; i < opens - closes; i++) truncated += "}";
    const openBrackets = (truncated.match(/\[/g) || []).length;
    const closeBrackets = (truncated.match(/]/g) || []).length;
    for (let i = 0; i < openBrackets - closeBrackets; i++) truncated += "]";
    try {
      return JSON.parse(truncated);
    } catch {}
  }

  return null;
}

async function nonStreamingFallback(
  session: ChatSession,
  messages: ChatMessage[],
  maxTokens: number,
  deps: StreamingDeps,
): Promise<string> {
  const response = await fetchWithContext(`${deps.baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${deps.apiKey}`,
    },
    body: JSON.stringify(
      buildCompletionRequestBody(session, messages, maxTokens, deps, {
        stream: false,
      }),
    ),
    signal: session.currentRequest?.signal,
  });
  const payload = (await response.json()) as ChatCompletionResponse;
  if (!response.ok) {
    throw new Error(payload.error?.message || `HTTP ${response.status}`);
  }
  const text = payload.choices?.[0]?.message?.content?.trim();
  if (!text) throw new Error("Empty response.");
  const tokenUsage = payload.usage
    ? {
        promptTokens: payload.usage.prompt_tokens ?? 0,
        completionTokens: payload.usage.completion_tokens ?? 0,
      }
    : undefined;
  if (tokenUsage) {
    session.lastTokenUsage = tokenUsage;
    session.cumulativeTokens.prompt += tokenUsage.promptTokens;
    session.cumulativeTokens.completion += tokenUsage.completionTokens;
  }
  deps.broadcastToWebviews({
    type: "streamEnd",
    fullText: text,
    tokenUsage,
    responseModel:
      typeof payload.model === "string" && payload.model.trim()
        ? payload.model.trim()
        : undefined,
  });
  return text;
}
