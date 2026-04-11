import * as vscode from "vscode";
import type {
  ChatSession,
  HarnessBackgroundTask,
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
import { createId, formatTokenCount } from "./helpers";
import { streamResponse, buildMessages, type StreamingDeps } from "./streaming";
import { createEmptyHarnessSessionState } from "./harness/state";
import {
  deriveLastSelectedModel,
  getPreferredModelForNewSession,
  restoreSessionFromPersistence,
  serializeSessionForPersistence,
} from "./session-persistence";
import {
  buildSessionSummaries,
  resolveAutoSessionTitle,
  resolveRenamedSessionTitle,
  resolveSessionDeletion,
  resolveSidebarSessionId,
  sortSessionsByRecency,
} from "./session-workflows";
import { buildConnectedSessionStatus } from "./endpoint-workflows";

export class SessionManager {
  readonly sessions = new Map<string, ChatSession>();
  sidebarSessionId = "";
  nextSessionNumber = 1;
  lastSelectedModel = "";

  constructor(private readonly context: vscode.ExtensionContext) {}

  restoreState() {
    const stored = this.context.workspaceState.get<PersistedState>(STORAGE_KEY);
    if (!stored) return false;

    let normalizedBackgroundTasks = false;
    this.nextSessionNumber = Math.max(1, stored.nextSessionNumber || 1);
    this.sidebarSessionId = stored.sidebarSessionId || "";
    this.lastSelectedModel = (stored.lastSelectedModel ?? "").trim();
    for (const storedSession of stored.sessions ?? []) {
      const restored = restoreSessionFromPersistence(storedSession);
      normalizedBackgroundTasks =
        normalizedBackgroundTasks || restored.hadRunningBackgroundTasks;
      this.sessions.set(restored.session.id, restored.session);
    }
    this.sidebarSessionId = resolveSidebarSessionId(
      this.sidebarSessionId,
      Array.from(this.sessions.values()),
    );
    this.lastSelectedModel = deriveLastSelectedModel(
      this.lastSelectedModel,
      this.getSessionsByRecency(),
    );
    return normalizedBackgroundTasks;
  }

  async saveState() {
    const sessions: PersistedChatSession[] = Array.from(this.sessions.values()).map(
      serializeSessionForPersistence,
    );

    await this.context.workspaceState.update(STORAGE_KEY, {
      sessions,
      sidebarSessionId: this.sidebarSessionId,
      nextSessionNumber: this.nextSessionNumber,
      lastSelectedModel: this.lastSelectedModel,
    } satisfies PersistedState);
  }

  createSession(models: string[]): ChatSession {
    const session: ChatSession = {
      id: createId(),
      title: `Chat ${this.nextSessionNumber}`,
      transcript: [],
      selectedModel: "",
      selectedReasoningEffort: "",
      selectedEndpoint: "",
      status: DEFAULT_STATUS,
      updatedAt: Date.now(),
      busy: false,
      mode: "ask" as InteractionMode,
      checkpoints: [],
      cumulativeTokens: { prompt: 0, completion: 0 },
      activeSkills: [],
      harnessState: createEmptyHarnessSessionState(),
    };
    this.nextSessionNumber += 1;

    session.selectedModel = this.getPreferredModel(models);
    if (models.length) {
      session.status = buildConnectedSessionStatus(models.length);
    }

    this.sessions.set(session.id, session);
    void this.saveState();
    return session;
  }

  deleteSession(sessionId: string, models: string[]): string | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) return undefined;

    session.currentRequest?.abort();
    this.sessions.delete(sessionId);

    if (!this.sessions.size) {
      const replacement = this.createSession(models);
      this.sidebarSessionId = replacement.id;
    }

    const deletion = resolveSessionDeletion(
      sessionId,
      this.sidebarSessionId,
      this.getSessionsByRecency(),
    );
    const fallbackId = deletion.fallbackSessionId ?? this.createSession(models).id;
    this.sidebarSessionId =
      deletion.nextSidebarSessionId || fallbackId;

    void this.saveState();
    return fallbackId;
  }

  setSessionModel(session: ChatSession, modelId: string) {
    const nextModel = modelId.trim();
    if (session.selectedModel === nextModel) {
      if (nextModel) this.lastSelectedModel = nextModel;
      return;
    }

    session.selectedModel = nextModel;
    session.selectedReasoningEffort = "";
    if (nextModel) this.lastSelectedModel = nextModel;
    this.touchSession(session);
  }

  setSessionReasoningEffort(session: ChatSession, reasoningEffort: string) {
    const nextEffort = reasoningEffort.trim();
    if (session.selectedReasoningEffort === nextEffort) return;
    session.selectedReasoningEffort = nextEffort;
    this.touchSession(session);
  }

  getPreferredModel(models: string[]): string {
    return getPreferredModelForNewSession(
      models,
      this.lastSelectedModel,
      this.getSessionsByRecency(),
    );
  }

  renameSession(sessionId: string, title: string): ChatSession | undefined {
    const session = this.sessions.get(sessionId);
    if (!session) return undefined;

    const nextTitle = resolveRenamedSessionTitle(session.title, title);
    if (!nextTitle) return session;

    session.title = nextTitle;
    this.touchSession(session);
    return session;
  }

  forkSession(session: ChatSession, forkAtIndex?: number): ChatSession {
    const index = forkAtIndex ?? session.transcript.length;
    const forkedTranscript = session.transcript.slice(0, index).map((e) => ({ ...e }));

    const forked: ChatSession = {
      id: createId(),
      title: `${session.title} (fork)`,
      transcript: forkedTranscript,
      selectedModel: session.selectedModel,
      selectedReasoningEffort: session.selectedReasoningEffort,
      selectedEndpoint: session.selectedEndpoint,
      status: "Forked session — ready.",
      updatedAt: Date.now(),
      busy: false,
      mode: session.mode,
      checkpoints: [],
      cumulativeTokens: { prompt: 0, completion: 0 },
      activeSkills: [],
      harnessState: createEmptyHarnessSessionState(),
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
    return buildSessionSummaries(this.getSessionsByRecency());
  }

  getMostRecentSession(): ChatSession | undefined {
    return this.getSessionsByRecency()[0];
  }

  touchSession(session: ChatSession) {
    session.updatedAt = Date.now();
  }

  requireSession(sessionId: string): ChatSession | undefined {
    return this.sessions.get(sessionId);
  }

  autoTitle(session: ChatSession, prompt: string) {
    const nextTitle = resolveAutoSessionTitle(
      session.title,
      prompt,
      this.nextSessionNumber - 1,
    );
    if (nextTitle) {
      session.title = nextTitle;
    }
  }

  private getSessionsByRecency(): ChatSession[] {
    return sortSessionsByRecency(Array.from(this.sessions.values()));
  }
}
