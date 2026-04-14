import type {
  ChatSession,
  FileAttachment,
  ImageAttachment,
} from "./types";
import type { EndpointProviderKind } from "./provider-capabilities";
import { resolveAutoSessionTitle } from "./session-workflows";
import {
  activateSessionSkill,
  formatActiveSkillsStatus,
} from "./harness/skills/active";
import {
  getBuiltinHarnessSkillBySlashCommand,
  inferBuiltinHarnessSkillFromPrompt,
  type BuiltinHarnessSkill,
} from "./harness/skills/builtins";
import { detectSkillPromptIntent } from "./harness/skills/intents";
import type { HarnessSkillDescriptor } from "./harness/skills/registry";
import { applySkillIntentLocally } from "./harness/skills/workflows";

const NO_MODEL_SELECTED_STATUS =
  "No model selected. Click refresh or check your server.";

export function applySlashSkillShortcut(
  session: ChatSession,
  skill: BuiltinHarnessSkill,
  arg: string,
): {
  handled: boolean;
  nextPrompt?: string;
} {
  const trimmedArg = arg.trim();
  activateSessionSkill(session, skill, trimmedArg || undefined);
  if (!trimmedArg) {
    session.status = formatActiveSkillsStatus(session.activeSkills);
    return { handled: true };
  }

  return {
    handled: false,
    nextPrompt: trimmedArg,
  };
}

export function ensureSelectedModelForPrompt(
  session: ChatSession,
  preferredModel: string,
): boolean {
  if (session.selectedModel) {
    return true;
  }
  if (!preferredModel) {
    session.status = NO_MODEL_SELECTED_STATUS;
    return false;
  }

  session.selectedModel = preferredModel;
  return true;
}

export function beginPromptTurn(options: {
  session: ChatSession;
  rawPrompt: string;
  resolvedPrompt: string;
  fallbackTitleNumber: number;
  images?: ImageAttachment[];
  files?: FileAttachment[];
}): {
  titleChanged: boolean;
  needsSkillPreflight: boolean;
} {
  const userEntry = {
    role: "user" as const,
    content: options.resolvedPrompt,
    ...(options.images?.length ? { images: options.images } : {}),
    ...(options.files?.length ? { files: options.files } : {}),
  };
  options.session.transcript.push(userEntry);

  const nextTitle = resolveAutoSessionTitle(
    options.session.title,
    options.rawPrompt,
    options.fallbackTitleNumber,
  );
  if (nextTitle) {
    options.session.title = nextTitle;
  }

  const needsSkillPreflight = options.session.activeSkills.length > 0;
  options.session.busy = true;
  options.session.status = needsSkillPreflight
    ? "Preparing skill context..."
    : "Thinking...";

  return {
    titleChanged: !!nextTitle,
    needsSkillPreflight,
  };
}

export { NO_MODEL_SELECTED_STATUS };

export type PromptPreparationResult =
  | {
      kind: "handled";
      titleChanged: boolean;
    }
  | {
      kind: "blocked";
    }
  | {
      kind: "ready";
      prompt: string;
      transientSystemPrompt?: string;
    };

const LOCAL_CLOCK_VERIFICATION_COMMAND =
  "date '+%Y-%m-%d %H:%M:%S %Z (%A)'";

function buildBridgeToolDisciplinePrompt(
  prompt: string,
  providerKind?: EndpointProviderKind,
): string | undefined {
  if (providerKind !== "codex-bridge" && providerKind !== "claude-bridge") {
    return undefined;
  }

  const trimmed = prompt.trim();
  if (!trimmed) return undefined;

  const normalized = trimmed
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

  const hasUrl = /https?:\/\/\S+/i.test(trimmed);
  const mentionsRepoScope =
    /\b(repo|repository|workspace|folder|codebase|project|file|files|source|code)\b/i.test(trimmed);
  const asksToInspect =
    /\b(where|find|look|search|inspect|read|open|trace|show|check|scan|review|tell me where)\b/i.test(trimmed);
  const asksAboutCurrentFact =
    /\b(weather|forecast|temperature|time|date|day|latest|news|current|currently|right now|today)\b/i.test(trimmed);
  const asksAboutDocsOrPage =
    /\b(doc|docs|documentation|page|website|site|github)\b/i.test(trimmed);

  const shouldForceVerification =
    (mentionsRepoScope && asksToInspect) ||
    (hasUrl && (asksToInspect || asksAboutDocsOrPage)) ||
    asksAboutCurrentFact;

  if (!shouldForceVerification) {
    return undefined;
  }

  const instructions = [
    "[Bridge Tool Discipline]",
    "This request is running through a text-first bridge where PocketAI tools are the executable tool system.",
    "For this request, do not answer from memory or training alone.",
    "Before giving a substantive answer, you MUST emit an appropriate PocketAI tool call and wait for the tool result.",
    "If the user references a repo, workspace, folder, or file, prefer PocketAI repo/file tools such as @read_file, @grep, @glob, @list_files, @open_file, @go_to_definition, @find_references, @document_symbols, @diagnostics, or git tools when relevant.",
    "If the user references a specific URL or web page, prefer @web_fetch. If they need broader online lookup, prefer @web_search.",
    "Do not cite file paths, URLs, source locations, or current facts unless they came from a PocketAI tool result in this turn or earlier transcript results.",
  ];

  return instructions.join("\n");
}

export function buildTransientSystemPromptForPrompt(
  prompt: string,
  providerKind?: EndpointProviderKind,
): string | undefined {
  const trimmed = prompt.trim();
  if (!trimmed) return undefined;

  const normalized = trimmed
    .toLowerCase()
    .replace(/[?!.,]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();

  const shouldVerifyLocally = [
    /^(?:what(?:'s| is)?\s+)?time(?:\s+is it)?(?:\s+right now)?$/,
    /^(?:tell me|can you tell me|could you tell me)\s+(?:the\s+)?time(?:\s+right now)?$/,
    /^(?:what(?:'s| is)?\s+)?(?:today'?s\s+)?date(?:\s+is it)?$/,
    /^(?:what(?:'s| is)?\s+)?what day is it(?:\s+today)?$/,
    /^(?:what(?:'s| is)?\s+)?day(?:\s+is it)?(?:\s+today)?$/,
    /^(?:tell me|can you tell me|could you tell me)\s+(?:today'?s\s+)?date$/,
  ].some((matcher) => matcher.test(normalized));

  const instructions: string[] = [];
  const bridgeToolPrompt = buildBridgeToolDisciplinePrompt(
    trimmed,
    providerKind,
  );
  if (bridgeToolPrompt) {
    instructions.push(bridgeToolPrompt);
  }

  if (shouldVerifyLocally) {
    instructions.push(
      [
        "[Verified Local Clock Request]",
        "The user is asking for the current local system time, date, or day.",
        "Before answering, you MUST verify it with a command and use that command output as the source of truth.",
        `First emit exactly this tool call and wait for the result: @run_command: ${LOCAL_CLOCK_VERIFICATION_COMMAND}`,
        "After the tool returns, answer the user's original request directly and concisely using the verified local result.",
      ].join("\n"),
    );
  }

  return instructions.length ? instructions.join("\n\n") : undefined;
}

export function preparePromptForSend(options: {
  session: ChatSession;
  prompt: string;
  availableSkills: HarnessSkillDescriptor[];
  preferredModel: string;
  fallbackTitleNumber: number;
  providerKind?: EndpointProviderKind;
}): PromptPreparationResult {
  let trimmed = options.prompt.trim();
  const transientSystemPrompt = buildTransientSystemPromptForPrompt(
    trimmed,
    options.providerKind,
  );

  if (trimmed.startsWith("/")) {
    const parts = trimmed.split(/\s+/);
    const cmd = parts[0].toLowerCase();
    const arg = parts.slice(1).join(" ").trim();
    const skillDef = getBuiltinHarnessSkillBySlashCommand(cmd);
    if (skillDef) {
      const shortcut = applySlashSkillShortcut(options.session, skillDef, arg);
      if (shortcut.handled) {
        return { kind: "handled", titleChanged: false };
      }
      trimmed = shortcut.nextPrompt ?? trimmed;
    }
  }

  const skillIntent = detectSkillPromptIntent(trimmed);
  if (skillIntent) {
    const skillIntentResult = applySkillIntentLocally({
      session: options.session,
      intent: skillIntent,
      originalPrompt: trimmed,
      skills: options.availableSkills,
      fallbackTitleNumber: options.fallbackTitleNumber,
    });
    if (skillIntentResult.handled) {
      return {
        kind: "handled",
        titleChanged: skillIntentResult.titleChanged,
      };
    }
    if (skillIntentResult.nextPrompt !== undefined) {
      trimmed = skillIntentResult.nextPrompt;
    }
  }

  if (!options.session.activeSkills.length && trimmed.length >= 8) {
    const inferredSkill = inferBuiltinHarnessSkillFromPrompt(trimmed);
    if (inferredSkill) {
      activateSessionSkill(options.session, inferredSkill);
    }
  }

  if (!ensureSelectedModelForPrompt(options.session, options.preferredModel)) {
    return { kind: "blocked" };
  }

  return {
    kind: "ready",
    prompt: trimmed,
    transientSystemPrompt,
  };
}
