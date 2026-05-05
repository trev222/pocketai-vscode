const test = require("node:test");
const assert = require("node:assert/strict");

const {
  detectSkillPromptIntent,
  resolveSkillByIntent,
  formatSkillListMessage,
  formatSkillAvailabilityMessage,
} = require("../dist/harness/skills/intents.js");
const {
  activateSessionSkill,
  removeSessionSkill,
  clearSessionSkills,
  formatActiveSkillsStatus,
} = require("../dist/harness/skills/active.js");
const {
  inferBuiltinHarnessSkillFromPrompt,
  getBuiltinHarnessSkillBySlashCommand,
} = require("../dist/harness/skills/builtins.js");
const {
  applySkillIntentLocally,
} = require("../dist/harness/skills/workflows.js");
const {
  buildHarnessRuntimeHealth,
} = require("../dist/harness/runtime-health.js");
const {
  createEmptyHarnessSessionState,
  applyHarnessEventToSession,
  syncHarnessPendingState,
  clearPendingToolState,
  upsertBackgroundTask,
} = require("../dist/harness/state.js");
const {
  parseToolCalls,
  stripFabricatedResults,
  isInsidePath,
} = require("../dist/helpers.js");
const {
  classifyToolRisk,
  classifyShellCommandRisk,
  getToolApprovalDecision,
  shouldAutoExecuteTool,
} = require("../dist/harness/policy.js");
const {
  classifyHarnessError,
  canRecoverRepeatedToolLoop,
  canRecoverReadLoop,
  canCompactForContextRecovery,
  shouldSurfaceRetryErrorInTranscript,
} = require("../dist/harness/turn-policy.js");
const {
  getEndpointProviderKind,
  getEndpointCapabilities,
} = require("../dist/provider-capabilities.js");
const {
  buildCodexReasoningControlsState,
  buildProviderChatControlsState,
} = require("../dist/provider-chat-state.js");
const {
  serializeSessionForPersistence,
  restoreSessionFromPersistence,
  restorePersistedBackgroundTasks,
  deriveLastSelectedModel,
  getPreferredModelForNewSession,
} = require("../dist/session-persistence.js");
const {
  buildDoctorReport,
  findEndpointMatch,
  formatBackgroundTaskList,
  formatEndpointList,
  formatTrackedTasks,
  getSessionTitlesStatus,
  parseJobsCommandArg,
} = require("../dist/slash-command-utils.js");
const {
  buildSessionSummaries,
  hasSessionStarted,
  normalizeRenamedSessionTitle,
  resolveAutoSessionTitle,
  resolveRenamedSessionTitle,
  resolveSessionDeletion,
  resolveSidebarSessionId,
  sortSessionsByRecency,
} = require("../dist/session-workflows.js");
const {
  applyRefreshedModelsToSessions,
  buildConnectedSessionStatus,
  resolveActiveEndpointUrl,
  syncSessionsToActiveEndpoint,
} = require("../dist/endpoint-workflows.js");
const {
  buildClearedBackgroundTasksMessage,
  buildSessionExportFileName,
  buildSessionExportMarkdown,
  filterSessionSummariesByQuery,
  getFinishedBackgroundTaskIds,
  getInteractionModeStatus,
} = require("../dist/chat-workflows.js");
const {
  bindPanelToSession,
  getPanelsBoundToSession,
  rebindDeletedSessionPanels,
} = require("../dist/panel-session-workflows.js");
const {
  applyErroredToolCallResult,
  applyExecutedToolCallResult,
  applyRejectedToolCallResult,
  areToolCallsResolved,
  buildToolExecutionErrorMessage,
  findToolCallInTranscript,
  shouldContinueAfterToolResolution,
} = require("../dist/tool-approval-workflows.js");
const {
  buildCancelledLoopOutcome,
  buildFailedLoopOutcome,
  getPostLoopReadyStatus,
  shouldFinalizeCompletedLoop,
} = require("../dist/run-loop-workflows.js");
const {
  applySlashSkillShortcut,
  beginPromptTurn,
  buildTransientSystemPromptForPrompt,
  ensureSelectedModelForPrompt,
  NO_MODEL_SELECTED_STATUS,
  preparePromptForSend,
} = require("../dist/prompt-workflows.js");
const {
  applyClearSlashCommand,
  applyExplicitModeSlashCommand,
  applyModelSlashCommand,
  applyQuickModeSlashCommand,
  applySessionsSlashCommand,
  applyTodoSlashCommand,
  applyTokensSlashCommand,
  buildRefreshSlashStatus,
  buildSlashHelpContent,
  resolveEndpointSlashCommand,
  resolveJobsSlashCommand,
} = require("../dist/slash-command-workflows.js");
const {
  getPocketAiWorktreeRoot,
  normalizeWorktreeName,
  resolveWorktreeSlashCommand,
} = require("../dist/worktree-workflows.js");
const {
  buildBackgroundTaskRestoreSnapshots,
  resolveExistingSessionId,
  shouldPersistStartupState,
} = require("../dist/startup-workflows.js");
const {
  buildPocketAiRemoteEndpoint,
} = require("../dist/pocketai-remote-devices.js");
const {
  getOpenCodeGoChatModels,
  getOpenCodeGoHealthProbeInit,
  isOpenCodeGoEndpoint,
  normalizeEndpointInputUrl,
  toOpenCodeGoRequestModel,
} = require("../dist/opencode-go.js");
const {
  XAI_BASE_URL,
  getXAIProviderName,
  isXAIEndpoint,
  normalizeXAIBaseUrl,
} = require("../dist/xai.js");
const {
  getChatScript,
} = require("../dist/chat-script.js");

function createSession(overrides = {}) {
  return {
    id: "session-1",
    title: "PocketAI Code",
    transcript: [],
    selectedModel: "model-a",
    selectedReasoningEffort: "",
    selectedEndpoint: "http://127.0.0.1:39457",
    worktreeRoot: "",
    status: "Ready",
    updatedAt: Date.now(),
    busy: false,
    mode: "ask",
    checkpoints: [],
    cumulativeTokens: { prompt: 0, completion: 0 },
    activeSkills: [],
    harnessState: {
      pendingApprovals: [],
      pendingDiffs: [],
      todoItems: [],
      backgroundTasks: [],
    },
    ...overrides,
  };
}

function createEndpointManager(overrides = {}) {
  return {
    activeEndpointUrl: "http://127.0.0.1:39457",
    endpointHealthMap: new Map([
      [
        "http://127.0.0.1:39457",
        { healthy: true, error: undefined },
      ],
    ]),
    models: ["model-a"],
    getActiveEndpointCapabilities() {
      return {
        kind: "local-pocketai",
        supportsStructuredTools: true,
        supportsReasoningEffort: false,
        requiresBridgeBootstrap: false,
      };
    },
    ...overrides,
  };
}

test("detectSkillPromptIntent handles list, check, and activate prompts", () => {
  assert.deepEqual(detectSkillPromptIntent("what skills do you have?"), {
    type: "list-skills",
  });
  assert.deepEqual(detectSkillPromptIntent("is the debug skill available?"), {
    type: "check-skill",
    skillId: "debug",
  });
  assert.deepEqual(
    detectSkillPromptIntent("use the code review skill to inspect this diff"),
    {
      type: "activate-skill",
      skillId: "code-review",
      remainder: "inspect this diff",
    },
  );
});

test("resolveSkillByIntent matches ids and humanized names", () => {
  const skills = [
    {
      id: "code-review",
      name: "Code Review",
      description: "Review code",
      source: "builtin",
      prompt: "Review it",
    },
  ];

  assert.equal(resolveSkillByIntent(skills, "code-review")?.id, "code-review");
  assert.equal(resolveSkillByIntent(skills, "Code Review")?.id, "code-review");
  assert.equal(resolveSkillByIntent(skills, "code review")?.id, "code-review");
});

test("skill formatters separate builtin and workspace skills", () => {
  const skills = [
    {
      id: "debug",
      name: "Debug",
      description: "Find bugs",
      source: "builtin",
      prompt: "Debug carefully",
    },
    {
      id: "my-workflow",
      name: "My Workflow",
      description: "Workspace flow",
      source: "workspace",
      prompt: "Do the thing",
      path: "/tmp/SKILL.md",
    },
  ];

  const listMessage = formatSkillListMessage(skills);
  assert.match(listMessage, /PocketAI built-in skills:/);
  assert.match(listMessage, /Workspace skills:/);
  assert.match(
    formatSkillAvailabilityMessage(skills[1], "my-workflow"),
    /available as a PocketAI workspace skill/i,
  );
  assert.match(
    formatSkillAvailabilityMessage(undefined, "missing"),
    /is not available/i,
  );
});

test("active skill helpers stack, replace, trim, remove, and clear cleanly", () => {
  const session = createSession();
  const skills = [
    { id: "debug", name: "Debug", description: "Debug", prompt: "Debug it" },
    { id: "review", name: "Review", description: "Review", prompt: "Review it" },
    { id: "test", name: "Test", description: "Test", prompt: "Test it" },
    { id: "fix", name: "Fix", description: "Fix", prompt: "Fix it" },
    { id: "init", name: "Init", description: "Init", prompt: "Init it" },
  ];

  activateSessionSkill(session, skills[0], "focus on stack trace");
  assert.match(session.activeSkillInjection || "", /Focus: focus on stack trace/);
  activateSessionSkill(session, skills[1]);
  activateSessionSkill(session, skills[2]);
  activateSessionSkill(session, skills[3]);
  activateSessionSkill(session, skills[4]);

  assert.equal(session.activeSkills.length, 4);
  assert.equal(session.activeSkills[0].id, "review");
  assert.equal(session.activeSkills[3].id, "init");
  assert.match(session.activeSkillInjection || "", /\[Active Skills\]/);
  assert.doesNotMatch(session.activeSkillInjection || "", /Focus: focus on stack trace/);
  assert.match(formatActiveSkillsStatus(session.activeSkills), /skills active/i);

  activateSessionSkill(session, skills[4], "narrow it down");
  assert.equal(session.activeSkills[3].note, "narrow it down");

  removeSessionSkill(session, "test");
  assert.equal(session.activeSkills.some((skill) => skill.id === "test"), false);

  session.skillPreflightContext = "cached";
  clearSessionSkills(session);
  assert.deepEqual(session.activeSkills, []);
  assert.equal(session.activeSkillInjection, undefined);
  assert.equal(session.skillPreflightContext, undefined);
});

test("builtin skill auto-routing prefers the highest-priority matching skill", () => {
  assert.equal(
    inferBuiltinHarnessSkillFromPrompt("fix these diagnostics")?.id,
    "fix",
  );
  assert.equal(
    inferBuiltinHarnessSkillFromPrompt("please investigate why this is failing")?.id,
    "investigate",
  );
  assert.equal(
    inferBuiltinHarnessSkillFromPrompt("implement a new endpoint dropdown")?.id,
    "implement",
  );
  assert.equal(
    inferBuiltinHarnessSkillFromPrompt("fix these diagnostics", ["fix"])?.id,
    undefined,
  );
  assert.equal(getBuiltinHarnessSkillBySlashCommand("/review")?.id, "review");
});

test("skill intent workflow handles local responses, title updates, and prompt fallthrough", () => {
  const skills = [
    {
      id: "debug",
      name: "Debug",
      description: "Find the real bug.",
      source: "builtin",
      prompt: "Debug carefully.",
    },
    {
      id: "review",
      name: "Review",
      description: "Review the code.",
      source: "builtin",
      prompt: "Review carefully.",
    },
  ];

  const listSession = createSession({ title: "Chat 7", transcript: [] });
  const listResult = applySkillIntentLocally({
    session: listSession,
    intent: { type: "list-skills" },
    originalPrompt: "what skills do you have?",
    skills,
    fallbackTitleNumber: 7,
  });
  assert.deepEqual(listResult, { handled: true, titleChanged: true });
  assert.equal(listSession.status, "Ready");
  assert.equal(listSession.title, "what skills do you have?");
  assert.equal(listSession.transcript.length, 2);
  assert.match(listSession.transcript[1].content, /PocketAI built-in skills:/);

  const checkSession = createSession({
    title: "Existing title",
    transcript: [],
  });
  const checkResult = applySkillIntentLocally({
    session: checkSession,
    intent: { type: "check-skill", skillId: "debug" },
    originalPrompt: "is the debug skill available?",
    skills,
    fallbackTitleNumber: 4,
  });
  assert.deepEqual(checkResult, { handled: true, titleChanged: false });
  assert.equal(checkSession.title, "Existing title");
  assert.match(checkSession.transcript[1].content, /available as a PocketAI builtin skill/i);

  const missingSession = createSession({ title: "Chat 2", transcript: [] });
  const missingResult = applySkillIntentLocally({
    session: missingSession,
    intent: { type: "activate-skill", skillId: "missing", remainder: "" },
    originalPrompt: "use the missing skill",
    skills,
    fallbackTitleNumber: 2,
  });
  assert.deepEqual(missingResult, { handled: true, titleChanged: true });
  assert.equal(missingSession.transcript.length, 2);
  assert.match(missingSession.transcript[1].content, /is not available/i);

  const activateOnlySession = createSession({ transcript: [] });
  const activateOnlyResult = applySkillIntentLocally({
    session: activateOnlySession,
    intent: { type: "activate-skill", skillId: "debug", remainder: "" },
    originalPrompt: "use the debug skill",
    skills,
    fallbackTitleNumber: 1,
  });
  assert.deepEqual(activateOnlyResult, { handled: true, titleChanged: false });
  assert.equal(activateOnlySession.transcript.length, 0);
  assert.equal(activateOnlySession.activeSkills[0].id, "debug");
  assert.match(activateOnlySession.status, /Debug skill active/i);

  const activateWithRemainderSession = createSession({ transcript: [] });
  const activateWithRemainderResult = applySkillIntentLocally({
    session: activateWithRemainderSession,
    intent: {
      type: "activate-skill",
      skillId: "review",
      remainder: "inspect this diff",
    },
    originalPrompt: "use the review skill and inspect this diff",
    skills,
    fallbackTitleNumber: 3,
  });
  assert.deepEqual(activateWithRemainderResult, {
    handled: false,
    nextPrompt: "inspect this diff",
    titleChanged: false,
  });
  assert.equal(activateWithRemainderSession.transcript.length, 0);
  assert.equal(activateWithRemainderSession.activeSkills[0].id, "review");
});

test("runtime health reports warnings and errors with actionable next steps", () => {
  const session = createSession({
    harnessState: {
      pendingApprovals: [{ toolCallId: "t1", toolType: "edit_file", filePath: "a.ts" }],
      pendingDiffs: [],
      todoItems: [],
      backgroundTasks: [
        {
          id: "bg1",
          command: "npm test",
          status: "running",
          outputPreview: "",
          updatedAt: Date.now(),
        },
        {
          id: "bg2",
          command: "npm run lint",
          status: "interrupted",
          outputPreview: "",
          updatedAt: Date.now(),
        },
        {
          id: "bg3",
          command: "npm run build",
          status: "failed",
          outputPreview: "",
          updatedAt: Date.now(),
        },
      ],
    },
  });
  const endpointMgr = createEndpointManager({
    models: [],
    endpointHealthMap: new Map([
      [
        "http://127.0.0.1:39457",
        { healthy: false, error: "refused" },
      ],
    ]),
    getActiveEndpointCapabilities() {
      return {
        kind: "openai-compatible",
        supportsStructuredTools: false,
        supportsReasoningEffort: false,
        requiresBridgeBootstrap: false,
      };
    },
  });

  const health = buildHarnessRuntimeHealth({
    session,
    endpointMgr,
    estimatedTokens: 9000,
    contextWindowSize: 10000,
  });

  assert.equal(health.level, "error");
  assert.match(health.summary, /attention needed/i);
  assert(health.issues.some((issue) => /not healthy/i.test(issue)));
  assert(health.issues.some((issue) => /tool approval/i.test(issue)));
  assert(health.issues.some((issue) => /still running/i.test(issue)));
  assert(health.issues.some((issue) => /failed recently/i.test(issue)));
  assert(health.issues.some((issue) => /interrupted by reload/i.test(issue)));
  assert(health.suggestions.some((suggestion) => /Structured tool calling is unavailable/i.test(suggestion)));
  assert(health.actions.includes("refresh-models"));
  assert(health.actions.includes("compact"));
  assert(health.actions.includes("show-jobs"));
});

test("harness state sync rebuilds pending approvals, diffs, and latest todo list", () => {
  const session = createSession({
    transcript: [
      {
        role: "assistant",
        content: "Working on it",
        toolCalls: [
          {
            id: "edit-1",
            type: "edit_file",
            filePath: "src/app.ts",
            status: "pending",
          },
          {
            id: "read-1",
            type: "read_file",
            filePath: "src/app.ts",
            status: "pending",
          },
        ],
      },
      {
        role: "tool",
        content: "todos",
        toolCalls: [
          {
            id: "todo-old",
            type: "todo_write",
            filePath: "",
            status: "executed",
            todos: [
              { content: "old", status: "completed" },
            ],
          },
          {
            id: "todo-new",
            type: "todo_write",
            filePath: "",
            status: "executed",
            todos: [
              { content: "step one", status: "pending" },
              { content: "step two", status: "in_progress" },
              { content: "step three", status: "completed" },
              { content: "   ", status: "pending" },
            ],
          },
        ],
      },
    ],
  });

  syncHarnessPendingState(session);

  assert.deepEqual(session.harnessState.pendingApprovals, [
    { toolCallId: "edit-1", toolType: "edit_file", filePath: "src/app.ts" },
    { toolCallId: "read-1", toolType: "read_file", filePath: "src/app.ts" },
  ]);
  assert.deepEqual(session.harnessState.pendingDiffs, [
    { toolCallId: "edit-1", filePath: "src/app.ts" },
  ]);
  assert.deepEqual(session.harnessState.todoItems, [
    { content: "step one", status: "pending" },
    { content: "step two", status: "in_progress" },
    { content: "step three", status: "completed" },
  ]);
});

test("harness events and task upserts keep session state tidy", () => {
  const session = createSession({
    transcript: [
      {
        role: "assistant",
        content: "",
        toolCalls: [
          {
            id: "edit-2",
            type: "edit_file",
            filePath: "src/file.ts",
            status: "pending",
          },
        ],
      },
    ],
    harnessState: createEmptyHarnessSessionState(),
  });

  applyHarnessEventToSession(session, {
    type: "tool_call_pending_approval",
    sessionId: session.id,
    toolCallId: "edit-2",
    detail: "edit_file",
  });
  applyHarnessEventToSession(session, {
    type: "diff_ready",
    sessionId: session.id,
    toolCallId: "edit-2",
    detail: "src/file.ts",
  });

  assert.equal(session.harnessState.pendingApprovals.length, 1);
  assert.equal(session.harnessState.pendingDiffs.length, 1);

  clearPendingToolState(session, "edit-2");
  assert.equal(session.harnessState.pendingApprovals.length, 0);
  assert.equal(session.harnessState.pendingDiffs.length, 0);

  upsertBackgroundTask(session, {
    id: "bg-old",
    command: "npm run lint",
    status: "completed",
    outputPreview: "",
    updatedAt: 10,
  });
  upsertBackgroundTask(session, {
    id: "bg-new",
    command: "npm test",
    status: "running",
    outputPreview: "",
    updatedAt: 20,
  });
  upsertBackgroundTask(session, {
    id: "bg-old",
    command: "npm run lint --fix",
    status: "failed",
    outputPreview: "oops",
    updatedAt: 30,
  });

  assert.deepEqual(
    session.harnessState.backgroundTasks.map((task) => task.id),
    ["bg-old", "bg-new"],
  );
  assert.equal(session.harnessState.backgroundTasks[0].command, "npm run lint --fix");
  assert.equal(session.harnessState.backgroundTasks[0].status, "failed");
});

test("parseToolCalls understands newer IDE and editor-action tools", () => {
  const calls = parseToolCalls(`
@open_file: src/app.ts --line 12 --char 4
@workspace_symbols: HeaderBar
@hover_symbol: src/app.ts --line 14 --char 2
@code_actions: src/app.ts --line 18 --char 1
@apply_code_action: src/app.ts --line 18 --char 1 --title Add missing import
@run_command: --background npm test
@grep: pocketai --glob *.ts --output files_with_matches --context 2 -i
@todo_write: one | two | three
`);

  assert.equal(calls.length, 8);
  assert.deepEqual(
    calls.map((call) => call.type),
    [
      "open_file",
      "workspace_symbols",
      "hover_symbol",
      "code_actions",
      "apply_code_action",
      "run_command",
      "grep",
      "todo_write",
    ],
  );

  assert.equal(calls[0].filePath, "src/app.ts");
  assert.equal(calls[0].line, 12);
  assert.equal(calls[0].character, 4);
  assert.equal(calls[1].query, "HeaderBar");
  assert.equal(calls[4].actionTitle, "Add missing import");
  assert.equal(calls[5].background, true);
  assert.equal(calls[5].command, "npm test");
  assert.equal(calls[6].pattern, "pocketai");
  assert.equal(calls[6].glob, "*.ts");
  assert.equal(calls[6].outputMode, "files_with_matches");
  assert.equal(calls[6].contextLines, 2);
  assert.equal(calls[6].caseInsensitive, true);
  assert.deepEqual(
    calls[7].todos,
    [
      { content: "one", status: "pending" },
      { content: "two", status: "pending" },
      { content: "three", status: "pending" },
    ],
  );
});

test("stripFabricatedResults removes fake tool calls and fabricated dialogue", () => {
  const stripped = stripFabricatedResults(`
Real answer
@delete_file: src/nope.ts
@rename_file: src/a.ts src/b.ts
Assistant: and then everything worked
`);

  assert.equal(stripped, "Real answer");
});

test("policy helpers classify risk and approvals conservatively", () => {
  assert.equal(classifyToolRisk("read_file"), "safe");
  assert.equal(classifyToolRisk("run_command"), "caution");
  assert.equal(classifyToolRisk("git_commit"), "destructive");
  assert.equal(classifyToolRisk("memory_write"), "caution");
  assert.equal(classifyToolRisk("mcp__foo", true), "external");

  const safeRead = { type: "read_file", filePath: "src/a.ts" };
  const commandCall = { type: "run_command", filePath: "", command: "npm test" };
  const destructiveCommandCall = {
    type: "run_command",
    filePath: "",
    command: "rm -rf dist",
  };
  const commitCall = {
    type: "git_commit",
    filePath: "",
    commitMessage: "test",
  };
  const memoryWriteCall = {
    type: "memory_write",
    filePath: "",
    memoryType: "project",
    memoryName: "decision",
    memoryContent: "Use safe defaults",
  };
  const codeActionCall = {
    type: "apply_code_action",
    filePath: "src/a.ts",
    line: 1,
    character: 0,
    actionTitle: "Fix issue",
  };

  assert.equal(getToolApprovalDecision("ask", safeRead), "auto-execute");
  assert.equal(getToolApprovalDecision("ask", commandCall), "requires-approval");
  assert.equal(classifyShellCommandRisk("npm test"), "safe");
  assert.equal(classifyShellCommandRisk("npm install left-pad"), "network");
  assert.equal(classifyShellCommandRisk("rm -rf dist"), "destructive");
  assert.equal(classifyShellCommandRisk("npm run dev"), "long-running");
  assert.equal(
    getToolApprovalDecision("ask", codeActionCall, { approvalPolicy: "mode-auto" }),
    "requires-approval",
  );
  assert.equal(
    getToolApprovalDecision("auto", codeActionCall, { approvalPolicy: "mode-auto" }),
    "auto-execute",
  );
  assert.equal(shouldAutoExecuteTool("auto", commandCall), true);
  assert.equal(shouldAutoExecuteTool("auto", destructiveCommandCall), false);
  assert.equal(
    shouldAutoExecuteTool("auto", commitCall, { approvalPolicy: "always-ask" }),
    false,
  );
  assert.equal(
    shouldAutoExecuteTool("auto", memoryWriteCall, { approvalPolicy: "always-ask" }),
    false,
  );
  assert.equal(shouldAutoExecuteTool("ask", commandCall), false);
});

test("isInsidePath rejects sibling paths with shared prefixes", () => {
  assert.equal(isInsidePath("/tmp/repo", "/tmp/repo/src/index.ts"), true);
  assert.equal(isInsidePath("/tmp/repo", "/tmp/repo"), true);
  assert.equal(isInsidePath("/tmp/repo", "/tmp/repo-other/secret.ts"), false);
  assert.equal(isInsidePath("/tmp/repo", "/tmp/repo/../repo-other/secret.ts"), false);
});

test("bridge tool shim extracts PocketAI tool envelopes", async () => {
  const {
    buildStructuredToolBridgeInstructions,
    extractStructuredToolCalls,
    toOpenAiToolCalls,
  } = await import("../scripts/bridge-tool-shim.mjs");

  const instructions = buildStructuredToolBridgeInstructions([
    {
      type: "function",
      function: {
        name: "read_file",
        description: "Read a file.",
        parameters: { type: "object", properties: { path: { type: "string" } } },
      },
    },
  ]);
  assert.match(instructions, /PocketAI Structured Tool Bridge/);
  assert.match(instructions, /read_file/);

  const extracted = extractStructuredToolCalls(`
Checking first.
<POCKETAI_TOOL_CALLS>{"tool_calls":[{"name":"read_file","arguments":{"path":"src/index.ts"}}]}</POCKETAI_TOOL_CALLS>
`);
  assert.equal(extracted.text, "Checking first.");
  assert.deepEqual(extracted.toolCalls, [
    { name: "read_file", arguments: { path: "src/index.ts" } },
  ]);

  const openAiCalls = toOpenAiToolCalls(extracted.toolCalls, () => "call_test");
  assert.deepEqual(openAiCalls, [
    {
      id: "call_test",
      type: "function",
      function: {
        name: "read_file",
        arguments: "{\"path\":\"src/index.ts\"}",
      },
    },
  ]);
});

test("turn policy classifies errors and recovery limits correctly", () => {
  assert.deepEqual(
    classifyHarnessError(new Error("Maximum context length exceeded")),
    {
      kind: "context-pressure",
      message: "Maximum context length exceeded",
    },
  );
  assert.deepEqual(
    classifyHarnessError(new Error("503 temporarily unavailable")),
    {
      kind: "transient",
      message: "503 temporarily unavailable",
    },
  );
  assert.deepEqual(
    classifyHarnessError(new Error("something else")),
    {
      kind: "generic",
      message: "something else",
    },
  );

  const baseLoopState = {
    previousToolKeys: new Set(),
    fileReadCounts: new Map(),
    nudgedReadLoopFiles: new Set(),
    repeatedToolRecoveryUsed: false,
    contextCompactions: 0,
    consecutiveModelErrors: { count: 0, maxRetries: 1 },
    consecutiveToolFailures: { count: 0, maxRetries: 1 },
  };

  assert.equal(canRecoverRepeatedToolLoop(baseLoopState), true);
  assert.equal(canRecoverReadLoop(baseLoopState, "src/a.ts"), true);
  assert.equal(canCompactForContextRecovery(baseLoopState), true);

  baseLoopState.repeatedToolRecoveryUsed = true;
  baseLoopState.nudgedReadLoopFiles.add("src/a.ts");
  baseLoopState.contextCompactions = 2;

  assert.equal(canRecoverRepeatedToolLoop(baseLoopState), false);
  assert.equal(canRecoverReadLoop(baseLoopState, "src/a.ts"), false);
  assert.equal(canCompactForContextRecovery(baseLoopState), false);
  assert.equal(
    shouldSurfaceRetryErrorInTranscript({
      kind: "transient",
      message: "fetch failed",
    }),
    false,
  );
  assert.equal(
    shouldSurfaceRetryErrorInTranscript({
      kind: "generic",
      message: "something else",
    }),
    true,
  );
});

test("provider capabilities and chat controls honor provider kind and codex reasoning", () => {
  assert.equal(
    getEndpointProviderKind("http://127.0.0.1:39457/"),
    "local-pocketai",
  );
  assert.equal(
    getEndpointProviderKind("http://127.0.0.1:39458"),
    "codex-bridge",
  );
  assert.equal(
    getEndpointProviderKind("http://127.0.0.1:39460"),
    "claude-bridge",
  );
  assert.equal(
    getEndpointProviderKind("https://example.com/v1"),
    "openai-compatible",
  );
  assert.equal(
    getEndpointProviderKind("https://opencode.ai/zen/go"),
    "openai-compatible",
  );

  assert.deepEqual(
    getEndpointCapabilities("http://127.0.0.1:39458"),
    {
      kind: "codex-bridge",
      supportsStructuredTools: true,
      supportsReasoningEffort: true,
      requiresBridgeBootstrap: true,
      usesReportedUsageForContext: false,
    },
  );
  assert.deepEqual(
    getEndpointCapabilities("http://127.0.0.1:39460"),
    {
      kind: "claude-bridge",
      supportsStructuredTools: true,
      supportsReasoningEffort: false,
      requiresBridgeBootstrap: true,
      usesReportedUsageForContext: false,
    },
  );
  assert.deepEqual(
    getEndpointCapabilities("https://example.com/v1", {
      structuredToolsEnabled: false,
    }),
    {
      kind: "openai-compatible",
      supportsStructuredTools: false,
      supportsReasoningEffort: false,
      requiresBridgeBootstrap: false,
      usesReportedUsageForContext: true,
    },
  );
  assert.deepEqual(
    getEndpointCapabilities("https://opencode.ai/zen/go"),
    {
      kind: "openai-compatible",
      supportsStructuredTools: true,
      supportsReasoningEffort: false,
      requiresBridgeBootstrap: false,
      usesReportedUsageForContext: false,
    },
  );

  const codexState = {
    models: [
      {
        id: "gpt-5.4",
        isDefault: true,
        supportedReasoningEfforts: [
          { reasoningEffort: "low", description: "Fast" },
          { reasoningEffort: "high", description: "Thorough" },
        ],
      },
      {
        id: "gpt-5.4-mini",
        isDefault: false,
        supportedReasoningEfforts: [
          { reasoningEffort: "low", description: "Fast" },
        ],
      },
    ],
  };

  assert.deepEqual(
    buildCodexReasoningControlsState({
      selectedModel: "gpt-5.4",
      selectedReasoningEffort: "high",
      codexState,
    }),
    {
      selectedReasoningEffort: "high",
      reasoningOptions: ["low", "high"],
    },
  );
  assert.deepEqual(
    buildCodexReasoningControlsState({
      selectedModel: "gpt-5.4-mini",
      selectedReasoningEffort: "high",
      codexState,
    }),
    {
      selectedReasoningEffort: "",
      reasoningOptions: ["low"],
    },
  );

  const localSession = createSession({
    selectedModel: "qwen",
    selectedReasoningEffort: "high",
  });
  assert.deepEqual(
    buildProviderChatControlsState({
      endpointUrl: "http://127.0.0.1:39457",
      availableModels: ["qwen"],
      session: localSession,
    }),
    {
      models: ["qwen"],
      selectedModel: "qwen",
      providerKind: "local-pocketai",
      selectedReasoningEffort: "",
      showReasoningControl: false,
      reasoningOptions: [],
    },
  );

  const codexSession = createSession({
    selectedModel: "gpt-5.4",
    selectedReasoningEffort: "high",
  });
  assert.deepEqual(
    buildProviderChatControlsState({
      endpointUrl: "http://127.0.0.1:39458",
      availableModels: ["gpt-5.4", "gpt-5.4-mini"],
      session: codexSession,
      codexState,
    }),
    {
      models: ["gpt-5.4", "gpt-5.4-mini"],
      selectedModel: "gpt-5.4",
      providerKind: "codex-bridge",
      selectedReasoningEffort: "high",
      showReasoningControl: true,
      reasoningOptions: ["low", "high"],
    },
  );
});

test("session persistence strips large payloads and restores interrupted jobs safely", () => {
  const session = createSession({
    worktreeRoot: "/tmp/project/.pocketai/worktrees/feature-a",
    transcript: [
      {
        role: "user",
        content: "hello",
        images: [{ data: "base64data", mimeType: "image/png" }],
        files: [
          {
            name: "big.txt",
            mimeType: "text/plain",
            content: "raw file contents",
            sizeBytes: 17,
          },
        ],
      },
    ],
    harnessState: {
      pendingApprovals: [],
      pendingDiffs: [],
      todoItems: [],
      backgroundTasks: [
        {
          id: "bg-running",
          command: "npm test",
          status: "running",
          outputPreview: "still going",
          updatedAt: 1,
          cwd: "/tmp/project",
        },
        {
          id: "bg-complete",
          command: "npm run build",
          status: "completed",
          outputPreview: "x".repeat(5005),
          updatedAt: 2,
        },
      ],
    },
  });

  const persisted = serializeSessionForPersistence(session);
  assert.equal(persisted.transcript[0].images[0].data, "");
  assert.equal(persisted.transcript[0].files[0].content, "");
  assert.equal(persisted.worktreeRoot, "/tmp/project/.pocketai/worktrees/feature-a");
  assert.equal(persisted.backgroundTasks[1].outputPreview.length, 4000);

  const restored = restoreSessionFromPersistence(persisted);
  assert.equal(restored.hadRunningBackgroundTasks, true);
  assert.equal(restored.session.busy, false);
  assert.equal(restored.session.worktreeRoot, "/tmp/project/.pocketai/worktrees/feature-a");
  assert.equal(restored.session.activeSkills.length, 0);
  assert.equal(restored.session.harnessState.backgroundTasks[1].status, "interrupted");
  assert.match(
    restored.session.harnessState.backgroundTasks[1].outputPreview,
    /\[Interrupted after PocketAI reload\]/,
  );
  assert.equal(
    restored.session.harnessState.backgroundTasks[1].cwd,
    "/tmp/project",
  );
});

test("restorePersistedBackgroundTasks filters invalid items and keeps newest 20", () => {
  const tasks = Array.from({ length: 25 }, (_, index) => ({
    id: `task-${index}`,
    command: index === 3 ? "" : `cmd-${index}`,
    status: "completed",
    outputPreview: `out-${index}`,
    updatedAt: index,
  }));

  const restored = restorePersistedBackgroundTasks(tasks);
  assert.equal(restored.length, 20);
  assert.equal(restored[0].id, "task-24");
  assert.equal(restored.at(-1).id, "task-5");
  assert.equal(restored.some((task) => task.id === "task-3"), false);
});

test("session persistence helpers derive last model and preferred model consistently", () => {
  const sessions = [
    createSession({ selectedModel: "model-old", updatedAt: 10 }),
    createSession({ selectedModel: "model-new", updatedAt: 20 }),
    createSession({ selectedModel: "", updatedAt: 30 }),
  ];

  assert.equal(deriveLastSelectedModel("saved-model", sessions), "saved-model");
  assert.equal(deriveLastSelectedModel("", sessions), "model-new");
  assert.equal(
    getPreferredModelForNewSession(["saved-model", "fallback"], "saved-model", sessions),
    "saved-model",
  );
  assert.equal(
    getPreferredModelForNewSession(["model-new", "fallback"], "", sessions),
    "model-new",
  );
  assert.equal(
    getPreferredModelForNewSession(["fallback-a", "fallback-b"], "", sessions),
    "fallback-a",
  );
});

test("slash command helpers parse jobs subcommands and format core reports", () => {
  assert.deepEqual(parseJobsCommandArg(""), { type: "list" });
  assert.deepEqual(parseJobsCommandArg("clear"), { type: "clear" });
  assert.deepEqual(parseJobsCommandArg("cancel bg_123"), {
    type: "cancel",
    taskId: "bg_123",
  });
  assert.deepEqual(parseJobsCommandArg("rerun bg_456"), {
    type: "rerun",
    taskId: "bg_456",
  });
  assert.deepEqual(parseJobsCommandArg("bg_789"), {
    type: "details",
    taskId: "bg_789",
  });

  const endpoints = [
    {
      name: "Local PocketAI",
      url: "http://127.0.0.1:39457",
      healthy: true,
      lastChecked: 1,
    },
    {
      name: "Codex Bridge",
      url: "http://127.0.0.1:39458",
      healthy: false,
      lastChecked: 2,
    },
  ];
  assert.equal(findEndpointMatch(endpoints, "codex bridge")?.url, "http://127.0.0.1:39458");
  assert.equal(findEndpointMatch(endpoints, "http://127.0.0.1:39457/")?.name, "Local PocketAI");
  assert.equal(findEndpointMatch(endpoints, "missing"), undefined);

  const endpointList = formatEndpointList(endpoints, "http://127.0.0.1:39458");
  assert.match(endpointList, /\* \*\*Codex Bridge\*\*/);
  assert.match(endpointList, /Local PocketAI/);

  const taskList = formatTrackedTasks([
    { content: "pending item", status: "pending" },
    { content: "active item", status: "in_progress" },
    { content: "done item", status: "completed" },
  ]);
  assert.match(taskList, /\[ \] pending item/);
  assert.match(taskList, /\[~\] active item/);
  assert.match(taskList, /\[x\] done item/);

  const backgroundList = formatBackgroundTaskList([
    { id: "bg1", command: "npm test", status: "running" },
    { id: "bg2", command: "npm run build", status: "failed" },
  ]);
  assert.match(backgroundList, /Background commands:/);
  assert.match(backgroundList, /`bg1` \[running\] `npm test`/);
  assert.match(backgroundList, /\/jobs clear/);

  const doctorReport = buildDoctorReport({
    endpointName: "Codex Bridge",
    endpointUrl: "http://127.0.0.1:39458",
    providerKind: "codex-bridge",
    healthy: false,
    selectedModel: "gpt-5.4",
    mode: "auto",
    supportsStructuredTools: false,
    supportsReasoningEffort: true,
    activeSkills: [{ id: "debug", name: "Debug" }],
    todoItems: [{ content: "check issue", status: "in_progress" }],
    pendingApprovalCount: 2,
    backgroundTaskCount: 3,
    estimatedTokens: 12345,
    contextWindowSize: 32000,
    runtimeHealth: {
      level: "warning",
      summary: "Harness has pending work.",
      issues: ["2 approvals waiting."],
      suggestions: ["Review the approval cards."],
      actions: ["show-jobs"],
    },
  });
  assert.match(doctorReport, /PocketAI doctor:/);
  assert.match(doctorReport, /Provider: `codex-bridge`/);
  assert.match(doctorReport, /Active skills: Debug/);
  assert.match(doctorReport, /Suggested next actions:/);

  assert.equal(getSessionTitlesStatus(["Chat 1", "Chat 2"]), "Sessions: Chat 1, Chat 2");
});

test("worktree workflow helpers resolve status, enter, and exit actions", () => {
  assert.equal(normalizeWorktreeName("enter feature/payment flow"), "feature-payment-flow");
  assert.equal(
    getPocketAiWorktreeRoot("/tmp/repo", "feature-a"),
    "/tmp/repo/.pocketai/worktrees/feature-a",
  );

  const status = resolveWorktreeSlashCommand({
    session: createSession(),
    arg: "",
    workspaceRoot: "/tmp/repo",
    pathExists: () => false,
  });
  assert.equal(status.kind, "status");
  assert.match(status.transcriptEntry.content, /No active worktree/);

  const enter = resolveWorktreeSlashCommand({
    session: createSession(),
    arg: "feature-a",
    workspaceRoot: "/tmp/repo",
    pathExists: () => false,
  });
  assert.equal(enter.kind, "enter");
  assert.equal(enter.name, "feature-a");
  assert.equal(enter.branchName, "pocketai/feature-a");
  assert.equal(enter.worktreeRoot, "/tmp/repo/.pocketai/worktrees/feature-a");
  assert.equal(enter.exists, false);

  const exit = resolveWorktreeSlashCommand({
    session: createSession({ worktreeRoot: "/tmp/repo/.pocketai/worktrees/feature-a" }),
    arg: "exit",
    workspaceRoot: "/tmp/repo",
    pathExists: () => true,
  });
  assert.equal(exit.kind, "exit");
  assert.match(exit.status, /Exited worktree mode/);
});

test("session workflow helpers normalize titles and auto-title only default chats", () => {
  assert.equal(
    normalizeRenamedSessionTitle("   My    renamed   chat   "),
    "My renamed chat",
  );
  assert.equal(
    resolveRenamedSessionTitle("Chat 4", "   Chat    4   "),
    undefined,
  );
  assert.equal(
    resolveRenamedSessionTitle("Chat 4", "  Feature   planning  "),
    "Feature planning",
  );

  assert.equal(
    resolveAutoSessionTitle("Chat 7", "Implement a compact harness panel for jobs", 7),
    "Implement a compact harness pane...",
  );
  assert.equal(
    resolveAutoSessionTitle("PocketAI Code", "Implement a compact harness panel for jobs", 7),
    "Implement a compact harness pane...",
  );
  assert.equal(
    resolveAutoSessionTitle("Codex migration notes", "Implement a compact harness panel", 7),
    undefined,
  );
});

test("session workflow helpers keep sidebar and deletion fallback aligned to recency", () => {
  const sessions = [
    { id: "older", updatedAt: 10, title: "Older", transcript: [{ role: "user", content: "older" }] },
    { id: "newer", updatedAt: 30, title: "Newer", transcript: [{ role: "user", content: "newer" }] },
    { id: "middle", updatedAt: 20, title: "Middle", transcript: [{ role: "user", content: "middle" }] },
  ];

  assert.deepEqual(
    sortSessionsByRecency(sessions).map((session) => session.id),
    ["newer", "middle", "older"],
  );
  assert.deepEqual(
    buildSessionSummaries(sessions).map((session) => session.id),
    ["newer", "middle", "older"],
  );
  assert.equal(resolveSidebarSessionId("missing", sessions), "newer");
  assert.equal(resolveSidebarSessionId("middle", sessions), "middle");

  assert.deepEqual(
    resolveSessionDeletion("newer", "newer", sessions.filter((session) => session.id !== "newer")),
    {
      fallbackSessionId: "middle",
      nextSidebarSessionId: "middle",
    },
  );
  assert.deepEqual(
    resolveSessionDeletion("newer", "older", sessions.filter((session) => session.id !== "newer")),
    {
      fallbackSessionId: "middle",
      nextSidebarSessionId: "older",
    },
  );
});

test("session workflow helpers treat empty drafts as not started", () => {
  assert.equal(hasSessionStarted([]), false);
  assert.equal(
    hasSessionStarted([{ role: "assistant", content: "hello" }]),
    false,
  );
  assert.equal(
    hasSessionStarted([{ role: "user", content: "hello" }]),
    true,
  );
  assert.deepEqual(
    buildSessionSummaries([
      { id: "draft", title: "PocketAI Code", updatedAt: 20, transcript: [] },
      { id: "started", title: "Started", updatedAt: 10, transcript: [{ role: "user", content: "hi" }] },
    ]).map((session) => session.id),
    ["started"],
  );
});

test("endpoint workflow helpers resolve active endpoint and sync sessions cleanly", () => {
  const endpoints = [
    { name: "Local PocketAI", url: "http://127.0.0.1:39457/" },
    { name: "Codex Bridge", url: "http://127.0.0.1:39458/" },
  ];

  assert.equal(
    resolveActiveEndpointUrl({
      endpoints,
      currentActiveEndpointUrl: "http://127.0.0.1:39458",
      storedActiveEndpointUrl: "http://127.0.0.1:39457",
      fallbackUrl: "http://fallback",
    }),
    "http://127.0.0.1:39458",
  );
  assert.equal(
    resolveActiveEndpointUrl({
      endpoints,
      currentActiveEndpointUrl: "http://missing",
      storedActiveEndpointUrl: "http://127.0.0.1:39457/",
      fallbackUrl: "http://fallback",
    }),
    "http://127.0.0.1:39457",
  );
  assert.equal(
    resolveActiveEndpointUrl({
      endpoints: [],
      currentActiveEndpointUrl: "",
      storedActiveEndpointUrl: "",
      fallbackUrl: "http://fallback/",
    }),
    "http://fallback",
  );

  const sessions = [
    { selectedEndpoint: "http://127.0.0.1:39457" },
    { selectedEndpoint: "" },
  ];
  assert.equal(
    syncSessionsToActiveEndpoint(sessions, "http://127.0.0.1:39458"),
    true,
  );
  assert.deepEqual(
    sessions.map((session) => session.selectedEndpoint),
    ["http://127.0.0.1:39458", "http://127.0.0.1:39458"],
  );
  assert.equal(
    syncSessionsToActiveEndpoint(sessions, "http://127.0.0.1:39458"),
    false,
  );
});

test("endpoint workflow helpers reset invalid model state and preserve valid selections", () => {
  const sessions = [
    {
      selectedModel: "missing-model",
      selectedReasoningEffort: "high",
      status: "Old status",
    },
    {
      selectedModel: "gpt-5.4",
      selectedReasoningEffort: "medium",
      status: "Stale",
    },
    {
      selectedModel: "",
      selectedReasoningEffort: "",
      status: "Empty",
    },
  ];

  assert.equal(buildConnectedSessionStatus(2), "Connected — 2 models available");
  assert.equal(buildConnectedSessionStatus(0), "Server reachable, but no models found.");

  assert.equal(
    applyRefreshedModelsToSessions(
      sessions,
      ["gpt-5.4", "gpt-5.4-mini"],
      () => "gpt-5.4-mini",
    ),
    true,
  );
  assert.deepEqual(sessions, [
    {
      selectedModel: "gpt-5.4-mini",
      selectedReasoningEffort: "",
      status: "Connected — 2 models available",
    },
    {
      selectedModel: "gpt-5.4",
      selectedReasoningEffort: "medium",
      status: "Connected — 2 models available",
    },
    {
      selectedModel: "gpt-5.4-mini",
      selectedReasoningEffort: "",
      status: "Connected — 2 models available",
    },
  ]);

  assert.equal(
    applyRefreshedModelsToSessions(
      sessions,
      ["gpt-5.4", "gpt-5.4-mini"],
      () => "gpt-5.4-mini",
    ),
    false,
  );
});

test("chat workflow helpers share mode labels, export formatting, search, and task clearing", () => {
  assert.equal(
    getInteractionModeStatus("ask"),
    "Ask mode — I'll ask before making changes.",
  );
  assert.equal(
    getInteractionModeStatus("auto"),
    "Auto mode — changes applied automatically.",
  );
  assert.equal(
    buildSessionExportFileName("Chat: Review / Fix"),
    "Chat__Review___Fix.md",
  );
  assert.match(
    buildSessionExportMarkdown([
      { role: "system", content: "ignored" },
      { role: "user", content: "Hello" },
      { role: "assistant", content: "Hi there" },
    ]),
    /## You[\s\S]*Hello[\s\S]*## PocketAI[\s\S]*Hi there/,
  );

  const summaries = [
    { id: "s1", title: "Review auth flow", updatedAt: 2 },
    { id: "s2", title: "Bug hunt", updatedAt: 1 },
  ];
  const sessions = [
    {
      id: "s1",
      transcript: [{ role: "assistant", content: "All good here" }],
    },
    {
      id: "s2",
      transcript: [{ role: "user", content: "Need help with auth token bug" }],
    },
  ];
  assert.deepEqual(
    filterSessionSummariesByQuery("auth", summaries, sessions).map((session) => session.id),
    ["s1", "s2"],
  );
  assert.deepEqual(
    filterSessionSummariesByQuery("missing", summaries, sessions),
    [],
  );

  const finishedIds = getFinishedBackgroundTaskIds([
    { id: "bg1", status: "running" },
    { id: "bg2", status: "completed" },
    { id: "bg3", status: "failed" },
  ]);
  assert.deepEqual(finishedIds, ["bg2", "bg3"]);
  assert.equal(
    buildClearedBackgroundTasksMessage(2),
    "Cleared 2 finished background commands.",
  );
});

test("panel session workflow helpers bind, rebind, and query panel mappings", () => {
  const bindings = new Map([
    ["panel-a", "session-1"],
    ["panel-b", "session-2"],
  ]);

  assert.equal(
    bindPanelToSession(bindings, "panel-c", "missing", ["session-1", "session-2"]),
    false,
  );
  assert.equal(
    bindPanelToSession(bindings, "panel-c", "session-2", ["session-1", "session-2"]),
    true,
  );
  assert.deepEqual(
    getPanelsBoundToSession(bindings, "session-2"),
    ["panel-b", "panel-c"],
  );
  assert.deepEqual(
    rebindDeletedSessionPanels(bindings, "session-2", "session-3"),
    ["panel-b", "panel-c"],
  );
  assert.deepEqual(
    Array.from(bindings.entries()),
    [
      ["panel-a", "session-1"],
      ["panel-b", "session-3"],
      ["panel-c", "session-3"],
    ],
  );
});

test("tool approval workflow helpers resolve transcript entries and status transitions", () => {
  const transcript = [
    {
      role: "assistant",
      content: "Working",
      toolCalls: [
        {
          id: "tc-1",
          type: "edit_file",
          filePath: "src/app.ts",
          status: "pending",
        },
        {
          id: "tc-2",
          type: "read_file",
          filePath: "src/app.ts",
          status: "executed",
        },
      ],
    },
  ];

  const resolved = findToolCallInTranscript(transcript, "tc-1");
  assert.equal(resolved.toolCall.id, "tc-1");
  assert.equal(findToolCallInTranscript(transcript, "missing"), undefined);
  assert.equal(areToolCallsResolved(transcript[0].toolCalls), false);

  applyExecutedToolCallResult(resolved.toolCall, transcript, "done");
  assert.equal(resolved.toolCall.status, "executed");
  assert.equal(transcript.at(-1).content, "done");

  const erroredTool = {
    id: "tc-3",
    type: "write_file",
    filePath: "src/app.ts",
    status: "approved",
  };
  applyErroredToolCallResult(erroredTool, transcript, new Error("boom"));
  assert.equal(erroredTool.status, "error");
  assert.equal(erroredTool.result, "Tool execution error: boom");

  const rejectedTool = {
    id: "tc-4",
    type: "edit_file",
    filePath: "src/app.ts",
    status: "pending",
  };
  applyRejectedToolCallResult(rejectedTool, transcript);
  assert.equal(rejectedTool.status, "rejected");
  assert.equal(rejectedTool.result, "Edit rejected by user.");
  assert.equal(buildToolExecutionErrorMessage("oops"), "Tool execution error.");
  assert.equal(
    areToolCallsResolved([
      { id: "a", type: "read_file", filePath: "", status: "executed" },
      { id: "b", type: "edit_file", filePath: "", status: "rejected" },
      { id: "c", type: "write_file", filePath: "", status: "error" },
    ]),
    true,
  );
  assert.equal(
    shouldContinueAfterToolResolution(
      [
        { id: "a", type: "read_file", filePath: "", status: "executed" },
      ],
      false,
    ),
    true,
  );
  assert.equal(
    shouldContinueAfterToolResolution(
      [
        { id: "a", type: "read_file", filePath: "", status: "pending" },
      ],
      false,
    ),
    false,
  );
});

test("run loop workflow helpers share cancellation and failure outcomes", () => {
  assert.deepEqual(buildCancelledLoopOutcome(), {
    status: "Cancelled.",
    transcriptEntry: {
      role: "assistant",
      content: "_Request cancelled._",
    },
  });
  assert.deepEqual(buildFailedLoopOutcome(new Error("bad request")), {
    status: "bad request",
    transcriptEntry: {
      role: "assistant",
      content: "**Error:** bad request",
    },
  });
  assert.equal(getPostLoopReadyStatus("done"), "Ready");
  assert.equal(getPostLoopReadyStatus("pending_approval"), undefined);
  assert.equal(shouldFinalizeCompletedLoop("done"), true);
  assert.equal(shouldFinalizeCompletedLoop("pending_approval"), false);
});

test("prompt workflow helpers cover slash skill shortcuts, model fallback, and turn start", () => {
  const debugSkill = {
    id: "debug",
    slashCommand: "/debug",
    name: "Debug",
    description: "Find the real bug.",
    prompt: "Debug carefully.",
  };

  const shortcutOnlySession = createSession({ transcript: [] });
  const shortcutOnlyResult = applySlashSkillShortcut(
    shortcutOnlySession,
    debugSkill,
    "",
  );
  assert.deepEqual(shortcutOnlyResult, { handled: true });
  assert.equal(shortcutOnlySession.activeSkills[0].id, "debug");
  assert.match(shortcutOnlySession.status, /Debug skill active/i);

  const shortcutWithPromptSession = createSession({ transcript: [] });
  const shortcutWithPromptResult = applySlashSkillShortcut(
    shortcutWithPromptSession,
    debugSkill,
    "inspect this stack trace",
  );
  assert.deepEqual(shortcutWithPromptResult, {
    handled: false,
    nextPrompt: "inspect this stack trace",
  });
  assert.equal(shortcutWithPromptSession.activeSkills[0].note, "inspect this stack trace");

  const modelSession = createSession({ selectedModel: "" });
  assert.equal(ensureSelectedModelForPrompt(modelSession, "gpt-5.4"), true);
  assert.equal(modelSession.selectedModel, "gpt-5.4");

  const missingModelSession = createSession({ selectedModel: "" });
  assert.equal(ensureSelectedModelForPrompt(missingModelSession, ""), false);
  assert.equal(missingModelSession.status, NO_MODEL_SELECTED_STATUS);

  const turnSession = createSession({
    title: "Chat 5",
    selectedModel: "gpt-5.4",
    activeSkills: [{ id: "debug", name: "Debug", description: "Debug", source: "builtin", prompt: "Debug carefully." }],
  });
  const turnStart = beginPromptTurn({
    session: turnSession,
    rawPrompt: "Investigate this failure",
    resolvedPrompt: "Investigate this failure in `src/app.ts`",
    fallbackTitleNumber: 5,
    images: [{ data: "abc", mimeType: "image/png" }],
    files: [{ name: "error.log", mimeType: "text/plain", content: "boom", sizeBytes: 4 }],
  });
  assert.deepEqual(turnStart, { titleChanged: true, needsSkillPreflight: true });
  assert.equal(turnSession.title, "Investigate this failure");
  assert.equal(turnSession.busy, true);
  assert.equal(turnSession.status, "Preparing skill context...");
  assert.equal(turnSession.transcript.length, 1);
  assert.equal(turnSession.transcript[0].content, "Investigate this failure in `src/app.ts`");
  assert.equal(turnSession.transcript[0].images.length, 1);
  assert.equal(turnSession.transcript[0].files.length, 1);

  const plainTurnSession = createSession({
    title: "Existing title",
    selectedModel: "gpt-5.4",
    activeSkills: [],
  });
  const plainTurn = beginPromptTurn({
    session: plainTurnSession,
    rawPrompt: "Hello there",
    resolvedPrompt: "Hello there",
    fallbackTitleNumber: 8,
  });
  assert.deepEqual(plainTurn, { titleChanged: false, needsSkillPreflight: false });
  assert.equal(plainTurnSession.status, "Thinking...");
  assert.equal(plainTurnSession.title, "Existing title");
});

test("prompt workflow helper composes slash skill, local skill intent, auto-route, and model fallback", () => {
  const skills = [
    {
      id: "debug",
      name: "Debug",
      description: "Find the real bug.",
      source: "builtin",
      prompt: "Debug carefully.",
    },
    {
      id: "review",
      name: "Review",
      description: "Review the code.",
      source: "builtin",
      prompt: "Review carefully.",
    },
  ];

  const slashSkillSession = createSession({ selectedModel: "", activeSkills: [] });
  const slashSkillResult = preparePromptForSend({
    session: slashSkillSession,
    prompt: "/debug inspect this crash",
    availableSkills: skills,
    preferredModel: "gpt-5.4",
    fallbackTitleNumber: 1,
  });
  assert.equal(slashSkillResult.kind, "ready");
  assert.equal(slashSkillResult.prompt, "inspect this crash");
  assert.equal(slashSkillResult.transientSystemPrompt, undefined);
  assert.equal(slashSkillSession.selectedModel, "gpt-5.4");
  assert.equal(slashSkillSession.activeSkills[0].id, "debug");

  const localIntentSession = createSession({ title: "Chat 2", selectedModel: "" });
  const localIntentResult = preparePromptForSend({
    session: localIntentSession,
    prompt: "what skills do you have?",
    availableSkills: skills,
    preferredModel: "gpt-5.4",
    fallbackTitleNumber: 2,
  });
  assert.deepEqual(localIntentResult, {
    kind: "handled",
    titleChanged: true,
  });
  assert.equal(localIntentSession.transcript.length, 2);
  assert.equal(localIntentSession.selectedModel, "");

  const autoRouteSession = createSession({ selectedModel: "", activeSkills: [] });
  const autoRouteResult = preparePromptForSend({
    session: autoRouteSession,
    prompt: "please investigate why this is failing",
    availableSkills: skills,
    preferredModel: "gpt-5.4-mini",
    fallbackTitleNumber: 3,
  });
  assert.equal(autoRouteResult.kind, "ready");
  assert.equal(autoRouteResult.prompt, "please investigate why this is failing");
  assert.equal(autoRouteResult.transientSystemPrompt, undefined);
  assert.equal(autoRouteSession.selectedModel, "gpt-5.4-mini");
  assert.equal(autoRouteSession.activeSkills[0].id, "investigate");

  const blockedSession = createSession({ selectedModel: "", activeSkills: [] });
  const blockedResult = preparePromptForSend({
    session: blockedSession,
    prompt: "implement a new button",
    availableSkills: skills,
    preferredModel: "",
    fallbackTitleNumber: 4,
  });
  assert.deepEqual(blockedResult, { kind: "blocked" });
  assert.equal(blockedSession.status, NO_MODEL_SELECTED_STATUS);

  const clockPromptResult = preparePromptForSend({
    session: createSession({ selectedModel: "", activeSkills: [] }),
    prompt: "what time is it",
    availableSkills: skills,
    preferredModel: "gpt-5.4",
    fallbackTitleNumber: 5,
  });
  assert.equal(clockPromptResult.kind, "ready");
  assert.match(clockPromptResult.transientSystemPrompt || "", /@run_command:\s+date /);

  const bridgeRepoPromptResult = preparePromptForSend({
    session: createSession({ selectedModel: "", activeSkills: [] }),
    prompt: "in this repo can you tell me where claude has the cool action words that show when loading?",
    availableSkills: skills,
    preferredModel: "gpt-5.4",
    fallbackTitleNumber: 6,
    providerKind: "codex-bridge",
  });
  assert.equal(bridgeRepoPromptResult.kind, "ready");
  assert.match(
    bridgeRepoPromptResult.transientSystemPrompt || "",
    /Bridge Tool Discipline/,
  );
  assert.match(
    bridgeRepoPromptResult.transientSystemPrompt || "",
    /MUST emit an appropriate PocketAI tool call/i,
  );
});

test("prompt workflow helper only injects local clock verification for narrow local time/date prompts", () => {
  assert.match(
    buildTransientSystemPromptForPrompt("what time is it") || "",
    /Verified Local Clock Request/,
  );
  assert.match(
    buildTransientSystemPromptForPrompt("what's today's date?") || "",
    /@run_command:\s+date /,
  );
  assert.equal(
    buildTransientSystemPromptForPrompt("what time is it in tokyo"),
    undefined,
  );
  assert.equal(
    buildTransientSystemPromptForPrompt("convert 4pm tokyo to new york time"),
    undefined,
  );
  assert.match(
    buildTransientSystemPromptForPrompt(
      "look in this repo and tell me where the loading spinner words are",
      "claude-bridge",
    ) || "",
    /Bridge Tool Discipline/,
  );
  assert.equal(
    buildTransientSystemPromptForPrompt(
      "look in this repo and tell me where the loading spinner words are",
      "local-pocketai",
    ),
    undefined,
  );
});

test("slash command workflow helpers handle common command flows and effects", () => {
  const session = createSession({
    mode: "ask",
    transcript: [{ role: "assistant", content: "Existing" }],
    cumulativeTokens: { prompt: 1200, completion: 34 },
    harnessState: {
      pendingApprovals: [],
      pendingDiffs: [],
      todoItems: [
        { content: "check endpoint", status: "in_progress" },
      ],
      backgroundTasks: [
        {
          id: "bg-running",
          command: "npm test",
          status: "running",
          outputPreview: "",
          updatedAt: 1,
        },
        {
          id: "bg-done",
          command: "npm run build",
          status: "completed",
          outputPreview: "ok",
          updatedAt: 2,
        },
      ],
    },
    activeSkills: [
      {
        id: "debug",
        name: "Debug",
        description: "Find bugs",
        source: "builtin",
        prompt: "Debug carefully.",
      },
    ],
  });

  assert.match(buildSlashHelpContent(["- `/debug` — Debug bugs"]), /PocketAI slash commands:/);
  assert.match(buildSlashHelpContent(["- `/debug` — Debug bugs"]), /Skill shortcuts:/);

  applyQuickModeSlashCommand(session, "auto");
  assert.equal(session.mode, "auto");
  assert.match(session.status, /Auto mode/);

  assert.equal(applyExplicitModeSlashCommand(session, "plan"), true);
  assert.equal(session.mode, "plan");
  assert.equal(applyExplicitModeSlashCommand(session, "weird"), false);
  assert.equal(session.status, "Usage: /mode <ask|auto|plan>");

  const modelChanges = [];
  assert.deepEqual(
    applyModelSlashCommand({
      session,
      arg: "gpt-5.4",
      availableModels: ["gpt-5.4", "gpt-5.4-mini"],
      setSessionModel: (modelId) => {
        modelChanges.push(modelId);
        session.selectedModel = modelId;
      },
    }),
    { changedModel: true },
  );
  assert.equal(session.status, "Model switched to gpt-5.4");
  assert.deepEqual(modelChanges, ["gpt-5.4"]);
  assert.deepEqual(
    applyModelSlashCommand({
      session,
      arg: "",
      availableModels: ["gpt-5.4", "gpt-5.4-mini"],
      setSessionModel: () => {},
    }),
    { changedModel: false },
  );
  assert.match(session.status, /Available models:/);

  const endpoints = [
    {
      name: "Local PocketAI",
      url: "http://127.0.0.1:39457",
      healthy: true,
      lastChecked: 1,
    },
    {
      name: "Codex Bridge",
      url: "http://127.0.0.1:39458",
      healthy: true,
      lastChecked: 2,
    },
  ];
  assert.deepEqual(
    resolveEndpointSlashCommand({
      arg: "Codex Bridge",
      endpoints,
      activeUrl: "http://127.0.0.1:39457",
    }),
    {
      kind: "switch",
      endpointUrl: "http://127.0.0.1:39458",
      transcriptEntry: {
        role: "tool",
        content: "Switched endpoint to **Codex Bridge** (`http://127.0.0.1:39458`).",
      },
      status: "Endpoint switch requested: Codex Bridge",
    },
  );
  assert.equal(
    resolveEndpointSlashCommand({
      arg: "missing",
      endpoints,
      activeUrl: "http://127.0.0.1:39457",
    }).kind,
    "missing",
  );

  applySessionsSlashCommand(session, ["Chat 1", "Chat 2"]);
  assert.equal(session.status, "Sessions: Chat 1, Chat 2");

  applyTokensSlashCommand(session);
  assert.match(session.status, /Session tokens/);
  assert.equal(buildRefreshSlashStatus("Codex Bridge", 0), "Refreshed Codex Bridge, but no models were found.");
  assert.equal(buildRefreshSlashStatus("Codex Bridge", 2), "Refreshed models for Codex Bridge.");

  const todoOutcome = applyTodoSlashCommand(session, session.harnessState.todoItems);
  assert.deepEqual(todoOutcome, { handled: true });
  assert.match(session.transcript.at(-1).content, /Tracked tasks:/);
  const emptyTodoSession = createSession();
  assert.deepEqual(applyTodoSlashCommand(emptyTodoSession, []), { handled: false });
  assert.equal(emptyTodoSession.status, "No tracked tasks yet.");

  const jobsList = resolveJobsSlashCommand("", session.harnessState.backgroundTasks);
  assert.equal(jobsList.kind, "list");
  assert.match(jobsList.transcriptEntry.content, /Background commands:/);
  const jobsClear = resolveJobsSlashCommand("clear", session.harnessState.backgroundTasks);
  assert.deepEqual(jobsClear, {
    kind: "clear",
    staleTaskIds: ["bg-done"],
    remainingTasks: [
      {
        id: "bg-running",
        command: "npm test",
        status: "running",
        outputPreview: "",
        updatedAt: 1,
      },
    ],
    transcriptEntry: {
      role: "tool",
      content: "Cleared 1 finished background command.",
    },
    status: "Cleared 1 finished background command.",
  });
  assert.deepEqual(resolveJobsSlashCommand("cancel bg-running", session.harnessState.backgroundTasks), {
    kind: "cancel",
    taskId: "bg-running",
  });
  assert.deepEqual(resolveJobsSlashCommand("rerun bg-done", session.harnessState.backgroundTasks), {
    kind: "rerun",
    taskId: "bg-done",
  });
  assert.deepEqual(resolveJobsSlashCommand("bg-running", session.harnessState.backgroundTasks), {
    kind: "details",
    taskId: "bg-running",
    status: "Background task details: bg-running",
  });

  applyClearSlashCommand(session);
  assert.equal(session.transcript.length, 0);
  assert.equal(session.activeSkills.length, 0);
  assert.equal(session.status, "Cleared.");
});

test("startup workflow helpers compose restored sessions, endpoint normalization, and persistence needs", () => {
  const persistedSessions = [
    {
      id: "session-a",
      title: "Chat 1",
      transcript: [],
      selectedModel: "missing-model",
      selectedReasoningEffort: "high",
      selectedEndpoint: "http://old-endpoint",
      status: "Old",
      updatedAt: 10,
      mode: "ask",
      cumulativeTokens: { prompt: 0, completion: 0 },
      backgroundTasks: [
        {
          id: "bg-1",
          command: "npm test",
          status: "running",
          outputPreview: "running",
          updatedAt: 5,
          cwd: "/tmp/project",
        },
      ],
    },
    {
      id: "session-b",
      title: "Chat 2",
      transcript: [],
      selectedModel: "gpt-5.4",
      selectedReasoningEffort: "",
      selectedEndpoint: "",
      status: "Old",
      updatedAt: 20,
      mode: "ask",
      cumulativeTokens: { prompt: 0, completion: 0 },
      backgroundTasks: [],
    },
  ];

  const restoredSessions = persistedSessions.map((persisted) =>
    restoreSessionFromPersistence(persisted).session,
  );
  const restoreSnapshots = buildBackgroundTaskRestoreSnapshots(restoredSessions);
  assert.deepEqual(restoreSnapshots, [
    {
      id: "bg-1",
      sessionId: "session-a",
      command: "npm test",
      status: "interrupted",
      outputPreview: "[Interrupted after PocketAI reload]\nrunning",
      exitCode: undefined,
      updatedAt: 5,
      cwd: "/tmp/project",
    },
  ]);

  const activeEndpointUrl = resolveActiveEndpointUrl({
    endpoints: [
      { name: "Local PocketAI", url: "http://127.0.0.1:39457/" },
      { name: "Codex Bridge", url: "http://127.0.0.1:39458/" },
    ],
    currentActiveEndpointUrl: "",
    storedActiveEndpointUrl: "http://127.0.0.1:39458/",
    fallbackUrl: "http://127.0.0.1:39457",
  });
  assert.equal(activeEndpointUrl, "http://127.0.0.1:39458");

  assert.equal(
    syncSessionsToActiveEndpoint(restoredSessions, activeEndpointUrl),
    true,
  );
  assert.equal(
    applyRefreshedModelsToSessions(restoredSessions, ["gpt-5.4", "gpt-5.4-mini"], () => "gpt-5.4-mini"),
    true,
  );
  assert.deepEqual(
    restoredSessions.map((session) => ({
      id: session.id,
      selectedEndpoint: session.selectedEndpoint,
      selectedModel: session.selectedModel,
      selectedReasoningEffort: session.selectedReasoningEffort,
      status: session.status,
    })),
    [
      {
        id: "session-a",
        selectedEndpoint: "http://127.0.0.1:39458",
        selectedModel: "gpt-5.4-mini",
        selectedReasoningEffort: "",
        status: "Connected — 2 models available",
      },
      {
        id: "session-b",
        selectedEndpoint: "http://127.0.0.1:39458",
        selectedModel: "gpt-5.4",
        selectedReasoningEffort: "",
        status: "Connected — 2 models available",
      },
    ],
  );

  assert.equal(
    shouldPersistStartupState({
      createdInitialSession: false,
      normalizedRestoredTasks: true,
      endpointSelectionsSynced: true,
    }),
    true,
  );
  assert.equal(
    shouldPersistStartupState({
      createdInitialSession: false,
      normalizedRestoredTasks: false,
      endpointSelectionsSynced: false,
    }),
    false,
  );
  assert.equal(
    resolveExistingSessionId("missing", restoredSessions.map((session) => session.id), "session-b"),
    "session-b",
  );
});

test("remote PocketAI device endpoints are built as managed in-memory endpoints", () => {
  const endpoint = buildPocketAiRemoteEndpoint({
    id: "device-1",
    name: "Office Mac",
    subdomain: "office-mac",
    url: "https://office-mac.pocketaihub.com/",
    apiKey: "secret-key",
    localPort: 39457,
    status: "active",
    lastSeenAt: null,
  });

  assert.deepEqual(endpoint, {
    name: "Office Mac · office-mac",
    url: "https://office-mac.pocketaihub.com",
    apiKey: "secret-key",
    managed: true,
    managedSource: "pocketai-remote-device",
    deviceId: "device-1",
    subdomain: "office-mac",
    remoteUrl: "https://office-mac.pocketaihub.com",
  });

  assert.equal(
    buildPocketAiRemoteEndpoint({
      id: "device-2",
      name: "No Auth",
      subdomain: "no-auth",
      url: "https://no-auth.pocketaihub.com",
      apiKey: "",
      localPort: 39457,
      status: "active",
      lastSeenAt: null,
    }),
    null,
  );
});

test("OpenCode Go helpers normalize endpoint URLs and expose chat-compatible models", () => {
  assert.equal(
    normalizeEndpointInputUrl("https://opencode.ai/zen/go/v1/chat/completions"),
    "https://opencode.ai/zen/go",
  );
  assert.equal(
    normalizeEndpointInputUrl("https://opencode.ai/zen/go/v1"),
    "https://opencode.ai/zen/go",
  );
  assert.equal(isOpenCodeGoEndpoint("https://opencode.ai/zen/go"), true);
  assert.equal(isOpenCodeGoEndpoint("https://example.com/v1"), false);
  assert.deepEqual(getOpenCodeGoChatModels(), [
    "opencode-go/glm-5",
    "opencode-go/glm-5.1",
    "opencode-go/kimi-k2.5",
    "opencode-go/mimo-v2-pro",
    "opencode-go/mimo-v2-omni",
  ]);
  assert.equal(
    toOpenCodeGoRequestModel(
      "opencode-go/glm-5.1",
      "https://opencode.ai/zen/go",
    ),
    "glm-5.1",
  );
  assert.equal(
    toOpenCodeGoRequestModel(
      "opencode-go/glm-5.1",
      "http://127.0.0.1:39457",
    ),
    "opencode-go/glm-5.1",
  );
  assert.deepEqual(getOpenCodeGoHealthProbeInit("test-key"), {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer test-key",
    },
    body: "{}",
  });
});

test("xAI helpers normalize Grok endpoints and provide a friendly default name", () => {
  assert.equal(XAI_BASE_URL, "https://api.x.ai");
  assert.equal(isXAIEndpoint("https://api.x.ai/v1"), true);
  assert.equal(isXAIEndpoint("https://us-east-1.api.x.ai/v1/chat/completions"), true);
  assert.equal(isXAIEndpoint("https://example.com/v1"), false);
  assert.equal(normalizeXAIBaseUrl("https://api.x.ai/v1"), "https://api.x.ai");
  assert.equal(
    normalizeXAIBaseUrl("https://api.x.ai/v1/chat/completions"),
    "https://api.x.ai",
  );
  assert.equal(
    normalizeXAIBaseUrl("https://us-east-1.api.x.ai/v1/models"),
    "https://us-east-1.api.x.ai",
  );
  assert.equal(
    normalizeEndpointInputUrl("https://api.x.ai/v1/chat/completions"),
    "https://api.x.ai",
  );
  assert.equal(getXAIProviderName(""), "Grok (xAI)");
  assert.equal(getXAIProviderName("https://api.x.ai/v1"), "Grok (xAI)");
  assert.equal(getXAIProviderName("My Grok"), "My Grok");
});

test("chat webview script emits valid JavaScript", () => {
  assert.doesNotThrow(() => {
    new Function(getChatScript("brand://icon"));
  });
});
