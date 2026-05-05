const TOOL_CALL_START = "<POCKETAI_TOOL_CALLS>";
const TOOL_CALL_END = "</POCKETAI_TOOL_CALLS>";

export function buildStructuredToolBridgeInstructions(tools) {
  if (!Array.isArray(tools) || tools.length === 0) return "";

  const compactTools = tools
    .map((tool) => {
      const fn = tool?.function || {};
      return {
        name: String(fn.name || "").trim(),
        description: String(fn.description || "").trim(),
        parameters: fn.parameters || { type: "object", properties: {} },
      };
    })
    .filter((tool) => tool.name);

  if (!compactTools.length) return "";

  return [
    "[PocketAI Structured Tool Bridge]",
    "The editor provided OpenAI-compatible tools, but this bridge cannot invoke native function calls directly.",
    "If a tool is needed, do not write prose or text-based @tool syntax.",
    `Instead emit exactly one JSON envelope using ${TOOL_CALL_START} and ${TOOL_CALL_END}.`,
    "Envelope shape:",
    `${TOOL_CALL_START}{"tool_calls":[{"name":"tool_name","arguments":{"arg":"value"}}]}${TOOL_CALL_END}`,
    "Only use tool names from this list:",
    JSON.stringify(compactTools),
    "After emitting the envelope, stop. PocketAI will execute the tool and continue the turn.",
  ].join("\n");
}

export function extractStructuredToolCalls(text) {
  const rawText = String(text || "");
  const start = rawText.indexOf(TOOL_CALL_START);
  const end = rawText.indexOf(TOOL_CALL_END, start + TOOL_CALL_START.length);
  if (start < 0 || end < 0) {
    return { text: rawText, toolCalls: [] };
  }

  const before = rawText.slice(0, start).trim();
  const after = rawText.slice(end + TOOL_CALL_END.length).trim();
  const payloadText = rawText.slice(start + TOOL_CALL_START.length, end).trim();

  let payload;
  try {
    payload = JSON.parse(payloadText);
  } catch {
    return { text: rawText, toolCalls: [] };
  }

  const rawCalls = Array.isArray(payload)
    ? payload
    : Array.isArray(payload?.tool_calls)
      ? payload.tool_calls
      : [];

  const toolCalls = rawCalls
    .map((call) => {
      const name = String(call?.name || call?.function?.name || "").trim();
      const args =
        call?.arguments && typeof call.arguments === "object"
          ? call.arguments
          : call?.function?.arguments && typeof call.function.arguments === "object"
            ? call.function.arguments
            : {};
      return name ? { name, arguments: args } : undefined;
    })
    .filter(Boolean);

  return {
    text: [before, after].filter(Boolean).join("\n\n"),
    toolCalls,
  };
}

export function toOpenAiToolCalls(toolCalls, createId) {
  return toolCalls.map((toolCall) => ({
    id: createId(),
    type: "function",
    function: {
      name: toolCall.name,
      arguments: JSON.stringify(toolCall.arguments || {}),
    },
  }));
}
