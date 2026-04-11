import type { ChatSession } from "../../types";
import { resolveAutoSessionTitle } from "../../session-workflows";
import {
  formatActiveSkillsStatus,
  activateSessionSkill,
} from "./active";
import {
  formatSkillAvailabilityMessage,
  formatSkillListMessage,
  resolveSkillByIntent,
  type SkillPromptIntent,
} from "./intents";
import type { HarnessSkillDescriptor } from "./registry";

export type SkillIntentWorkflowResult = {
  handled: boolean;
  nextPrompt?: string;
  titleChanged: boolean;
};

export function applySkillIntentLocally(options: {
  session: ChatSession;
  intent: SkillPromptIntent | undefined;
  originalPrompt: string;
  skills: HarnessSkillDescriptor[];
  fallbackTitleNumber: number;
}): SkillIntentWorkflowResult {
  const { session, intent, originalPrompt, skills, fallbackTitleNumber } = options;
  if (!intent) {
    return { handled: false, titleChanged: false };
  }

  if (intent.type === "list-skills") {
    return applyLocalSkillResponse(
      session,
      originalPrompt,
      formatSkillListMessage(skills),
      fallbackTitleNumber,
    );
  }

  if (intent.type === "check-skill") {
    const skill = resolveSkillByIntent(skills, intent.skillId);
    return applyLocalSkillResponse(
      session,
      originalPrompt,
      formatSkillAvailabilityMessage(skill, intent.skillId),
      fallbackTitleNumber,
    );
  }

  if (intent.type === "activate-skill") {
    const skill = resolveSkillByIntent(skills, intent.skillId);
    if (!skill) {
      return applyLocalSkillResponse(
        session,
        originalPrompt,
        formatSkillAvailabilityMessage(undefined, intent.skillId),
        fallbackTitleNumber,
      );
    }

    activateSessionSkill(session, skill, intent.remainder || undefined);
    if (!intent.remainder) {
      session.status = formatActiveSkillsStatus(session.activeSkills);
      return { handled: true, titleChanged: false };
    }

    return {
      handled: false,
      nextPrompt: intent.remainder,
      titleChanged: false,
    };
  }

  return { handled: false, titleChanged: false };
}

function applyLocalSkillResponse(
  session: ChatSession,
  originalPrompt: string,
  response: string,
  fallbackTitleNumber: number,
): SkillIntentWorkflowResult {
  session.transcript.push({ role: "user", content: originalPrompt });
  session.transcript.push({ role: "assistant", content: response });
  session.status = "Ready";

  const nextTitle = resolveAutoSessionTitle(
    session.title,
    originalPrompt,
    fallbackTitleNumber,
  );
  if (nextTitle) {
    session.title = nextTitle;
  }

  return {
    handled: true,
    titleChanged: !!nextTitle,
  };
}
