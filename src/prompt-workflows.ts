import type {
  ChatSession,
  FileAttachment,
  ImageAttachment,
} from "./types";
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
    };

export function preparePromptForSend(options: {
  session: ChatSession;
  prompt: string;
  availableSkills: HarnessSkillDescriptor[];
  preferredModel: string;
  fallbackTitleNumber: number;
}): PromptPreparationResult {
  let trimmed = options.prompt.trim();

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
  };
}
