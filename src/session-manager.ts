import * as vscode from "vscode";
import type {
  ChatSession,
  InteractionMode,
  PersistedChatSession,
  PersistedState,
  SessionSummary,
  ChatRole,
} from "./types";
import {
  STORAGE_KEY,
  DEFAULT_STATUS,
  DEFAULT_MAX_TOKENS,
} from "./constants";
import { createId, formatTokenCount, isDefaultSessionTitle, summarizePrompt } from "./helpers";
import { streamResponse, buildMessages, type StreamingDeps } from "./streaming";

export class SessionManager {
  readonly sessions = new Map<string, ChatSession>();
  sidebarSessionId = "";
  nextSessionNumber = 1;

  constructor(private readonly context: vscode.ExtensionContext) {}

  restoreState() {
    const stored = this.context.workspaceState.get<PersistedState>(STORAGE_KEY);
    if (!stored) return;

    this.nextSessionNumber = Math.max(1, stored.nextSessionNumber || 1);
    this.sidebarSessionId = stored.sidebarSessionId || "";
    for (const session of stored.sessions ?? []) {
      this.sessions.set(session.id, {
        ...session,
        busy: false,
        checkpoints: [],
        cumulativeTokens: (session as ChatSession).cumulativeTokens ?? { prompt: 0, completion: 0 },
      });
    }
    if (!this.sessions.has(this.sidebarSessionId)) {
      this.sidebarSessionId = this.getMostRecentSession()?.id ?? "";
    }
  }

  async saveState() {
    const sessions: PersistedChatSession[] = Array.from(this.sessions.values()).map((s) => ({
      id: s.id,
      title: s.title,
      transcript: s.transcript.map((e) =>
        e.images?.length ? { ...e, images: e.images.map((img) => ({ ...img, data: "" })) } : e,
      ),
      selectedModel: s.selectedModel,
      selectedEndpoint: s.selectedEndpoint,
      status: s.status,
      updatedAt: s.updatedAt,
      mode: s.mode,
      cumulativeTokens: s.cumulativeTokens,
    }));

    await this.context.workspaceState.update(STORAGE_KEY, {
      sessions,
      sidebarSessionId: this.sidebarSessionId,
      nextSessionNumber: this.nextSessionNumber,
    } satisfies PersistedState);
  }

  createSession(
    models: string[],
    getConfiguredModel: () => string,
  ): ChatSession {
    const session: ChatSession = {
      id: createId(),
      title: `Chat ${this.nextSessionNumber}`,
      transcript: [],
      selectedModel: "",
      selectedEndpoint: "",
      status: DEFAULT_STATUS,
      updatedAt: Date.now(),
      busy: false,
      mode: "ask" as InteractionMode,
      checkpoints: [],
      cumulativeTokens: { prompt: 0, completion: 0 },
    };
    this.nextSessionNumber += 1;

    const configuredModel = getConfiguredModel();
    session.selectedModel = configuredModel || models[0] || "";
    if (models.length) {
      session.status = `Connected — ${models.length} model${models.length > 1 ? "s" : ""} available`;
    }

    this.sessions.set(session.id, session);
    void this.saveState();
    return session;
  }

  deleteSession(sessionId: string, models: string[], getConfiguredModel: () => string): string | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) return undefined;

    session.currentRequest?.abort();
    this.sessions.delete(sessionId);

    if (!this.sessions.size) {
      const replacement = this.createSession(models, getConfiguredModel);
      this.sidebarSessionId = replacement.id;
    }

    const fallbackId = this.getMostRecentSession()?.id ?? this.createSession(models, getConfiguredModel).id;
    if (this.sidebarSessionId === sessionId) {
      this.sidebarSessionId = fallbackId;
    }

    void this.saveState();
    return fallbackId;
  }

  forkSession(session: ChatSession, forkAtIndex?: number): ChatSession {
    const index = forkAtIndex ?? session.transcript.length;
    const forkedTranscript = session.transcript.slice(0, index).map((e) => ({ ...e }));

    const forked: ChatSession = {
      id: createId(),
      title: `${session.title} (fork)`,
      transcript: forkedTranscript,
      selectedModel: session.selectedModel,
      selectedEndpoint: session.selectedEndpoint,
      status: "Forked session — ready.",
      updatedAt: Date.now(),
      busy: false,
      mode: session.mode,
      checkpoints: [],
      cumulativeTokens: { prompt: 0, completion: 0 },
    };

    this.sessions.set(forked.id, forked);
    return forked;
  }

  async compactSession(
    session: ChatSession,
    streamingDeps: StreamingDeps,
    estimateTokens: (session: ChatSession) => number,
    postState: () => void,
  ) {
    const conversationEntries = session.transcript.filter(
      (e) => e.role === "user" || e.role === "assistant",
    );
    if (conversationEntries.length <= 4) {
      session.status = "Not enough messages to compact.";
      postState();
      return;
    }

    const keepCount = 4;
    let splitIndex = session.transcript.length;
    let counted = 0;
    for (let i = session.transcript.length - 1; i >= 0; i--) {
      const role = session.transcript[i].role;
      if (role === "user" || role === "assistant") {
        counted++;
        if (counted >= keepCount) {
          splitIndex = i;
          break;
        }
      }
    }
    const toSummarize = session.transcript.slice(0, splitIndex);
    const toKeep = session.transcript.slice(splitIndex);

    if (!toSummarize.length) {
      session.status = "Not enough older messages to compact.";
      postState();
      return;
    }

    const tokensBefore = estimateTokens(session);
    session.busy = true;
    session.status = "Compacting...";
    postState();

    try {
      const summaryPrompt = toSummarize
        .filter((e) => e.role !== "system")
        .map((e) => `${e.role}: ${e.content}`)
        .join("\n\n");

      const maxTokens = Math.max(128, streamingDeps.getActiveMaxTokens());
      const messages: Array<{ role: ChatRole; content: string }> = [
        {
          role: "system",
          content:
            "Summarize the following conversation into a concise bullet list. Include key decisions, code changes, file paths, and current state. Be specific enough that the conversation could continue from this summary.",
        },
        { role: "user", content: summaryPrompt },
      ];

      session.currentRequest = new AbortController();
      const summary = await streamResponse(session, messages, maxTokens, streamingDeps);

      session.transcript = [
        { role: "system", content: `[Compacted conversation summary]\n${summary}` },
        ...toKeep,
      ];

      const tokensAfter = estimateTokens(session);
      const freed = Math.max(0, tokensBefore - tokensAfter);
      session.status = `Compacted: ~${formatTokenCount(freed)} tokens freed.`;
    } catch (error) {
      session.status = `Compact failed: ${error instanceof Error ? error.message : "Unknown error"}`;
    } finally {
      session.busy = false;
      session.currentRequest = undefined;
      this.touchSession(session);
      await this.saveState();
      postState();
    }
  }

  getSessionSummaries(): SessionSummary[] {
    return Array.from(this.sessions.values())
      .map((s) => ({ id: s.id, title: s.title, updatedAt: s.updatedAt }))
      .sort((a, b) => b.updatedAt - a.updatedAt);
  }

  getMostRecentSession(): ChatSession | undefined {
    return Array.from(this.sessions.values()).sort(
      (a, b) => b.updatedAt - a.updatedAt,
    )[0];
  }

  touchSession(session: ChatSession) {
    session.updatedAt = Date.now();
  }

  requireSession(sessionId: string): ChatSession | undefined {
    return this.sessions.get(sessionId);
  }

  autoTitle(session: ChatSession, prompt: string) {
    if (isDefaultSessionTitle(session.title)) {
      session.title = summarizePrompt(prompt, this.nextSessionNumber - 1);
    }
  }
}
