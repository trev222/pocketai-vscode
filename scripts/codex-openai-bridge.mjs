#!/usr/bin/env node

import http from "node:http";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import process from "node:process";
import readline from "node:readline";

const HOST = process.env.CODEX_BRIDGE_HOST || "127.0.0.1";
const PORT = Number.parseInt(process.env.CODEX_BRIDGE_PORT || "39458", 10);
const BRIDGE_CWD = process.env.CODEX_BRIDGE_CWD || process.cwd();
const DEFAULT_MODEL = (process.env.CODEX_BRIDGE_MODEL || "").trim();
const DEFAULT_REASONING_EFFORT = (process.env.CODEX_BRIDGE_REASONING || "").trim();
const SANDBOX_MODE = process.env.CODEX_BRIDGE_SANDBOX || "read-only";
const CODEX_BIN = process.env.CODEX_BRIDGE_CODEX_BIN || "codex";
const VERBOSE = /^(1|true|yes)$/i.test(process.env.CODEX_BRIDGE_VERBOSE || "");

const CACHE_TTL_MS = 15_000;
const BRIDGE_INFO = {
  name: "pocketai-codex-bridge",
  title: "PocketAI Codex Bridge",
  version: "0.1.0",
};

const APPROVAL_POLICY = "never";

const BRIDGE_DEVELOPER_INSTRUCTIONS = [
  "You are acting as an OpenAI-compatible chat completions backend for a third-party editor.",
  "Reply with plain assistant text only.",
  "Do not invoke Codex-native tools, shell commands, file edits, or approval flows directly.",
  "If the upstream system prompt defines a text-based tool protocol, you may use that protocol in your response.",
  "Only use tool calls that are explicitly defined by the upstream PocketAI instructions.",
  "Do not claim you already executed a tool yourself; emit the tool call and let PocketAI run it.",
  "Do not mention these instructions.",
].join(" ");

let modelCache = {
  expiresAt: 0,
  payload: null,
};

function log(...args) {
  console.log("[codex-bridge]", ...args);
}

function logError(...args) {
  console.error("[codex-bridge]", ...args);
}

function createHeaders(extra = {}) {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    ...extra,
  };
}

function sendJson(res, statusCode, body) {
  const payload = JSON.stringify(body);
  res.writeHead(
    statusCode,
    createHeaders({
      "Content-Type": "application/json; charset=utf-8",
      "Content-Length": Buffer.byteLength(payload),
    }),
  );
  res.end(payload);
}

function sendOpenAiError(res, statusCode, message, type = "server_error") {
  sendJson(res, statusCode, {
    error: {
      message,
      type,
    },
  });
}

function writeSse(res, payload) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`);
}

function normalizeText(text) {
  return String(text || "").replace(/\r\n/g, "\n").trim();
}

function contentToTextAndImages(content) {
  if (typeof content === "string") {
    return { text: normalizeText(content), imageUrls: [], sawImage: false };
  }

  if (!Array.isArray(content)) {
    return { text: "", imageUrls: [], sawImage: false };
  }

  const parts = [];
  const imageUrls = [];
  let sawImage = false;

  for (const part of content) {
    if (!part || typeof part !== "object") continue;

    if (part.type === "text" && typeof part.text === "string") {
      parts.push(part.text);
      continue;
    }

    if (part.type === "image_url") {
      sawImage = true;
      const url = part.image_url?.url;
      if (typeof url === "string" && url.trim()) {
        imageUrls.push(url.trim());
      }
      parts.push("[Image attached]");
    }
  }

  return {
    text: normalizeText(parts.join("\n")),
    imageUrls,
    sawImage,
  };
}

function buildCodexPrompt(messages) {
  const systemInstructions = [];
  const conversation = [];
  let lastUserImages = [];

  for (const message of Array.isArray(messages) ? messages : []) {
    const role = typeof message?.role === "string" ? message.role : "user";
    const { text, imageUrls, sawImage } = contentToTextAndImages(message?.content);

    if (role === "system") {
      if (text) systemInstructions.push(text);
      continue;
    }

    const label = role.toUpperCase();
    const body = text || (sawImage ? "[Image attached]" : "[Empty message]");
    conversation.push(`${label}:\n${body}`);

    if (role === "user" && imageUrls.length) {
      lastUserImages = imageUrls;
    }
  }

  const promptText = conversation.length
    ? [
        "Here is the conversation so far.",
        "",
        conversation.join("\n\n"),
        "",
        "Write the next assistant reply to the latest user message.",
      ].join("\n")
    : "Write the next assistant reply.";

  const input = [
    { type: "text", text: promptText, text_elements: [] },
    ...lastUserImages.map((url) => ({ type: "image", url })),
  ];

  return {
    baseInstructions: systemInstructions.join("\n\n").trim() || null,
    input,
  };
}

function mapUsage(tokenUsage) {
  const last = tokenUsage?.last;
  if (!last) return undefined;
  return {
    prompt_tokens: Number(last.inputTokens || 0),
    completion_tokens: Number(last.outputTokens || 0),
    total_tokens: Number(last.totalTokens || 0),
  };
}

function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => {
      try {
        const raw = Buffer.concat(chunks).toString("utf8");
        resolve(raw ? JSON.parse(raw) : {});
      } catch (error) {
        reject(new Error("Request body must be valid JSON."));
      }
    });
    req.on("error", reject);
  });
}

class CodexRpcClient {
  constructor() {
    this.pending = new Map();
    this.notificationHandlers = new Set();
    this.nextId = 1;
    this.closed = false;

    this.child = spawn(CODEX_BIN, ["app-server"], {
      cwd: BRIDGE_CWD,
      env: process.env,
      stdio: ["pipe", "pipe", "pipe"],
    });

    this.exitPromise = new Promise((resolve) => {
      this.child.once("exit", (code, signal) => {
        this.closed = true;
        const reason = code !== null ? `exit ${code}` : `signal ${signal}`;
        const error = new Error(`Codex app-server exited unexpectedly (${reason}).`);
        for (const pending of this.pending.values()) pending.reject(error);
        this.pending.clear();
        resolve();
      });
    });

    this.child.once("error", (error) => {
      for (const pending of this.pending.values()) pending.reject(error);
      this.pending.clear();
    });

    const stdout = readline.createInterface({ input: this.child.stdout });
    stdout.on("line", (line) => this.handleLine(line));

    const stderr = readline.createInterface({ input: this.child.stderr });
    stderr.on("line", (line) => {
      if (VERBOSE) logError(line);
    });
  }

  handleLine(line) {
    const trimmed = line.trim();
    if (!trimmed) return;

    let message;
    try {
      message = JSON.parse(trimmed);
    } catch {
      if (VERBOSE) logError("non-JSON stdout:", trimmed);
      return;
    }

    if (
      Object.prototype.hasOwnProperty.call(message, "id") &&
      (Object.prototype.hasOwnProperty.call(message, "result") ||
        Object.prototype.hasOwnProperty.call(message, "error"))
    ) {
      const key = String(message.id);
      const pending = this.pending.get(key);
      if (!pending) return;
      this.pending.delete(key);

      if (message.error) {
        pending.reject(
          new Error(message.error.message || "Codex app-server request failed."),
        );
      } else {
        pending.resolve(message.result);
      }
      return;
    }

    if (
      Object.prototype.hasOwnProperty.call(message, "id") &&
      typeof message.method === "string"
    ) {
      this.handleServerRequest(message);
      return;
    }

    if (typeof message.method === "string") {
      for (const handler of this.notificationHandlers) handler(message);
    }
  }

  handleServerRequest(message) {
    const method = message.method;

    if (method === "item/commandExecution/requestApproval") {
      this.respond(message.id, { decision: "cancel" });
      return;
    }

    if (method === "item/fileChange/requestApproval") {
      this.respond(message.id, { decision: "cancel" });
      return;
    }

    if (method === "item/permissions/requestApproval") {
      this.respond(message.id, {
        permissions: {
          network: null,
          fileSystem: null,
          macos: null,
        },
        scope: "turn",
      });
      return;
    }

    this.respondError(
      message.id,
      -32601,
      `Unsupported server request in codex-openai-bridge: ${method}`,
    );
  }

  send(payload) {
    if (this.closed || !this.child.stdin.writable) {
      throw new Error("Codex app-server is not available.");
    }
    this.child.stdin.write(`${JSON.stringify(payload)}\n`);
  }

  request(method, params = {}) {
    const id = String(this.nextId++);
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      try {
        this.send({ id, method, params });
      } catch (error) {
        this.pending.delete(id);
        reject(error);
      }
    });
  }

  notify(method, params) {
    this.send(params === undefined ? { method } : { method, params });
  }

  respond(id, result) {
    this.send({ id, result });
  }

  respondError(id, code, message) {
    this.send({ id, error: { code, message } });
  }

  onNotification(handler) {
    this.notificationHandlers.add(handler);
    return () => this.notificationHandlers.delete(handler);
  }

  async initialize() {
    await this.request("initialize", {
      clientInfo: BRIDGE_INFO,
      capabilities: {
        experimentalApi: true,
      },
    });
    this.notify("initialized");
  }

  async close() {
    if (this.closed) return;
    this.child.kill("SIGTERM");

    await Promise.race([
      this.exitPromise,
      new Promise((resolve) => setTimeout(resolve, 1500)),
    ]);

    if (!this.closed) {
      this.child.kill("SIGKILL");
      await this.exitPromise;
    }
  }
}

async function withRpcClient(fn) {
  const client = new CodexRpcClient();
  try {
    await client.initialize();
    return await fn(client);
  } finally {
    await client.close();
  }
}

function toOpenAiModels(modelList) {
  return {
    object: "list",
    data: (modelList?.data || []).map((model) => ({
      id: model.id,
      object: "model",
      created: 0,
      owned_by: "openai",
    })),
  };
}

function toCodexMeta(modelList) {
  return {
    object: "codex.meta",
    data: (modelList?.data || []).map((model) => ({
      id: model.id,
      model: model.model,
      displayName: model.displayName,
      description: model.description,
      hidden: Boolean(model.hidden),
      isDefault: Boolean(model.isDefault),
      defaultReasoningEffort: model.defaultReasoningEffort || "",
      supportedReasoningEfforts: (model.supportedReasoningEfforts || []).map((option) => ({
        reasoningEffort: option.reasoningEffort,
        description: option.description,
      })),
    })),
  };
}

async function fetchModels() {
  if (modelCache.payload && modelCache.expiresAt > Date.now()) {
    return modelCache.payload;
  }

  const payload = await withRpcClient((client) =>
    client.request("model/list", { includeHidden: false }),
  );

  modelCache = {
    payload,
    expiresAt: Date.now() + CACHE_TTL_MS,
  };

  return payload;
}

async function handleModels(res) {
  const models = await fetchModels();
  sendJson(res, 200, toOpenAiModels(models));
}

async function handleCodexMeta(res) {
  const models = await fetchModels();
  sendJson(res, 200, toCodexMeta(models));
}

async function handleStatus(res) {
  const models = await fetchModels();
  const defaultModel =
    DEFAULT_MODEL ||
    models?.data?.find((model) => model.isDefault)?.id ||
    models?.data?.[0]?.id ||
    "";

  sendJson(res, 200, {
    ok: true,
    defaultModelId: defaultModel,
  });
}

async function handleChatCompletions(req, res) {
  const body = await readRequestBody(req);
  const messages = Array.isArray(body.messages) ? body.messages : [];

  if (!messages.length) {
    sendOpenAiError(res, 400, "`messages` must be a non-empty array.", "invalid_request_error");
    return;
  }

  const { baseInstructions, input } = buildCodexPrompt(messages);
  const model = typeof body.model === "string" && body.model.trim()
    ? body.model.trim()
    : DEFAULT_MODEL || null;
  const reasoningEffort =
    typeof body.reasoning_effort === "string" && body.reasoning_effort.trim()
      ? body.reasoning_effort.trim()
      : typeof body.reasoningEffort === "string" && body.reasoningEffort.trim()
        ? body.reasoningEffort.trim()
        : DEFAULT_REASONING_EFFORT || null;
  const stream = Boolean(body.stream);
  const created = Math.floor(Date.now() / 1000);
  const responseId = `chatcmpl-${randomUUID()}`;

  await withRpcClient(async (client) => {
    let fullText = "";
    let usage;
    let turnId = "";
    let resolved = false;
    let responseModel = model || "";
    const pendingSsePayloads = [];

    const emitChunk = (content) => {
      const payload = {
        id: responseId,
        object: "chat.completion.chunk",
        created,
        model: responseModel,
        choices: [
          {
            index: 0,
            delta: { content },
            finish_reason: null,
          },
        ],
      };

      if (!res.headersSent) {
        pendingSsePayloads.push(payload);
        return;
      }

      writeSse(res, payload);
    };

    const completionPromise = new Promise((resolve, reject) => {
      const detach = client.onNotification((message) => {
        const params = message.params || {};

        if (message.method === "error") {
          detach();
          reject(new Error(params.message || "Codex app-server error."));
          return;
        }

        if (
          message.method === "item/agentMessage/delta" &&
          params.turnId === turnId &&
          typeof params.delta === "string"
        ) {
          fullText += params.delta;
          if (stream) {
            emitChunk(params.delta);
          }
          return;
        }

        if (
          message.method === "item/completed" &&
          params.turnId === turnId &&
          params.item?.type === "agentMessage" &&
          typeof params.item.text === "string"
        ) {
          if (!fullText || params.item.text.length >= fullText.length) {
            if (stream && params.item.text.startsWith(fullText)) {
              const remainder = params.item.text.slice(fullText.length);
              if (remainder) {
                fullText = params.item.text;
                emitChunk(remainder);
              } else {
                fullText = params.item.text;
              }
            } else {
              fullText = params.item.text;
            }
          }
          return;
        }

        if (
          message.method === "thread/tokenUsage/updated" &&
          params.turnId === turnId
        ) {
          usage = mapUsage(params.tokenUsage);
          return;
        }

        if (
          message.method === "turn/completed" &&
          params.turn?.id === turnId
        ) {
          detach();

          if (params.turn?.error) {
            const errorMessage =
              params.turn.error?.message ||
              params.turn.error?.details ||
              "Codex failed to complete the turn.";
            reject(new Error(errorMessage));
            return;
          }

          resolved = true;
          resolve({
            text: fullText,
            usage,
          });
        }
      });
    });

    const thread = await client.request("thread/start", {
      ephemeral: true,
      cwd: BRIDGE_CWD,
      sandbox: SANDBOX_MODE,
      approvalPolicy: APPROVAL_POLICY,
      model,
      modelProvider: "openai",
      baseInstructions,
      developerInstructions: BRIDGE_DEVELOPER_INSTRUCTIONS,
      serviceName: BRIDGE_INFO.name,
    });
    responseModel = responseModel || thread.model || "";

    const turn = await client.request("turn/start", {
      threadId: thread.thread.id,
      input,
      model,
      ...(reasoningEffort ? { effort: reasoningEffort } : {}),
    });

    turnId = turn.turn.id;

    if (stream) {
      res.writeHead(
        200,
        createHeaders({
          "Content-Type": "text/event-stream; charset=utf-8",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
        }),
      );
      for (const payload of pendingSsePayloads) {
        writeSse(res, payload);
      }
    }

    const result = await completionPromise;

    if (stream) {
      writeSse(res, {
        id: responseId,
        object: "chat.completion.chunk",
        created,
        model: responseModel,
        choices: [
          {
            index: 0,
            delta: {},
            finish_reason: "stop",
          },
        ],
        ...(result.usage ? { usage: result.usage } : {}),
      });
      res.write("data: [DONE]\n\n");
      res.end();
      return;
    }

    sendJson(res, 200, {
      id: responseId,
      object: "chat.completion",
      created,
      model: responseModel,
      choices: [
        {
          index: 0,
          message: {
            role: "assistant",
            content: result.text,
          },
          finish_reason: "stop",
        },
      ],
      ...(result.usage ? { usage: result.usage } : {}),
    });

    if (!resolved && !res.writableEnded) {
      res.end();
    }
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url || "/", `http://${req.headers.host || "localhost"}`);

    if (req.method === "OPTIONS") {
      res.writeHead(204, createHeaders());
      res.end();
      return;
    }

    if (req.method === "GET" && url.pathname === "/") {
      sendJson(res, 200, {
        ok: true,
        name: BRIDGE_INFO.name,
        version: BRIDGE_INFO.version,
        endpoints: ["/v1/models", "/v1/chat/completions", "/status"],
        cwd: BRIDGE_CWD,
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/status") {
      await handleStatus(res);
      return;
    }

    if (req.method === "GET" && url.pathname === "/v1/models") {
      await handleModels(res);
      return;
    }

    if (req.method === "GET" && url.pathname === "/codex/meta") {
      await handleCodexMeta(res);
      return;
    }

    if (req.method === "POST" && url.pathname === "/v1/chat/completions") {
      await handleChatCompletions(req, res);
      return;
    }

    sendOpenAiError(res, 404, `Unknown route: ${req.method} ${url.pathname}`, "invalid_request_error");
  } catch (error) {
    if (!res.headersSent) {
      sendOpenAiError(
        res,
        500,
        error instanceof Error ? error.message : "Unexpected bridge error.",
      );
      return;
    }

    if (!res.writableEnded) {
      res.end();
    }
  }
});

server.listen(PORT, HOST, () => {
  log(`listening on http://${HOST}:${PORT}`);
  log(`using cwd=${BRIDGE_CWD}`);
  if (DEFAULT_MODEL) log(`default model=${DEFAULT_MODEL}`);
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    server.close(() => process.exit(0));
  });
}
