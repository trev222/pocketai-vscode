import type { ChatSession, SessionActiveSkill } from "../../types";
import type { HarnessSkillDescriptor } from "./registry";

const MAX_ACTIVE_SKILLS = 4;

type ActivatableSkill = Pick<
  SessionActiveSkill,
  "id" | "name" | "description" | "prompt"
> & {
  source?: SessionActiveSkill["source"];
};

export function activateSessionSkill(
  session: ChatSession,
  skill: HarnessSkillDescriptor | ActivatableSkill,
  note?: string,
) {
  const existingSkill = session.activeSkills.find((item) => item.id === skill.id);
  const normalizedNote = normalizeSkillNote(note);
  const nextSkill: SessionActiveSkill = {
    id: skill.id,
    name: skill.name,
    description: skill.description,
    source: skill.source ?? "builtin",
    prompt: skill.prompt,
    note: normalizedNote ?? existingSkill?.note,
  };

  const withoutCurrent = session.activeSkills.filter(
    (item) => item.id !== skill.id,
  );
  session.activeSkills = [...withoutCurrent, nextSkill].slice(-MAX_ACTIVE_SKILLS);
  session.activeSkillInjection = buildActiveSkillInjection(session.activeSkills);
}

export function removeSessionSkill(session: ChatSession, skillId: string) {
  session.activeSkills = session.activeSkills.filter((item) => item.id !== skillId);
  session.activeSkillInjection = buildActiveSkillInjection(session.activeSkills);
}

export function clearSessionSkills(session: ChatSession) {
  session.activeSkills = [];
  session.activeSkillInjection = undefined;
  session.skillPreflightContext = undefined;
}

export function formatActiveSkillsStatus(
  activeSkills: Array<Pick<SessionActiveSkill, "name">>,
): string {
  if (!activeSkills.length) {
    return "No active skills.";
  }
  if (activeSkills.length === 1) {
    return `${activeSkills[0].name} skill active — type your prompt.`;
  }
  const names = activeSkills.map((skill) => skill.name);
  const label =
    names.length === 2
      ? `${names[0]} + ${names[1]}`
      : `${names.slice(0, -1).join(", ")} + ${names[names.length - 1]}`;
  return `${label} skills active — type your prompt.`;
}

function normalizeSkillNote(note?: string) {
  const normalized = note?.trim().replace(/\s+/g, " ");
  return normalized ? normalized.slice(0, 160) : undefined;
}

function buildActiveSkillInjection(activeSkills: SessionActiveSkill[]) {
  if (!activeSkills.length) return undefined;

  const header = [
    "[Active Skills]",
    "These PocketAI skills are active for this request. Follow them together.",
    "If guidance overlaps, use the most recently activated skill as the current emphasis while still honoring earlier constraints.",
  ].join("\n");

  const skillBlocks = activeSkills.map((skill, index) => {
    const noteLine = skill.note ? `Focus: ${skill.note}\n` : "";
    return [
      `${index + 1}. ${skill.name} [${skill.id}, ${skill.source}]`,
      `${skill.description}`,
      `${noteLine}Instructions: ${skill.prompt}`,
    ].join("\n");
  });

  return [header, ...skillBlocks].join("\n\n");
}
