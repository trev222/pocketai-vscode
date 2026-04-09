import type { HarnessSkillDescriptor } from "./registry";

export type SkillPromptIntent =
  | { type: "list-skills" }
  | { type: "check-skill"; skillId: string }
  | { type: "activate-skill"; skillId: string; remainder: string };

export function detectSkillPromptIntent(
  prompt: string,
): SkillPromptIntent | undefined {
  const trimmed = prompt.trim();
  if (!trimmed) return undefined;

  if (
    /^(what|which|show|list)\b[\s\S]*\bskills?\b.*\??$/i.test(trimmed) ||
    /^skills\??$/i.test(trimmed)
  ) {
    return { type: "list-skills" };
  }

  const checkMatch = trimmed.match(
    /^(?:is|do you have|do we have)\s+(?:the\s+)?["']?([\w\s/-]+?)["']?\s+skill\s+available\??$/i,
  );
  if (checkMatch) {
    return {
      type: "check-skill",
      skillId: normalizeSkillLookup(checkMatch[1]),
    };
  }

  const activateMatch = trimmed.match(
    /^(?:please\s+)?(?:use|activate)\s+(?:the\s+)?["']?([\w\s/-]+?)["']?\s+skill\b(?:[\s,:-]*(.*))?$/i,
  );
  if (activateMatch) {
    const remainder = (activateMatch[2] || "")
      .replace(/^(?:to|for|and)\s+/i, "")
      .trim();
    return {
      type: "activate-skill",
      skillId: normalizeSkillLookup(activateMatch[1]),
      remainder,
    };
  }

  return undefined;
}

export function resolveSkillByIntent(
  skills: HarnessSkillDescriptor[],
  skillId: string,
): HarnessSkillDescriptor | undefined {
  const normalized = normalizeSkillLookup(skillId);
  return skills.find((skill) => {
    const candidates = [
      skill.id,
      skill.name,
      skill.id.replace(/-/g, " "),
      skill.name.replace(/\s+/g, "-"),
    ];
    return candidates.some(
      (candidate) => normalizeSkillLookup(candidate) === normalized,
    );
  });
}

export function formatSkillListMessage(
  skills: HarnessSkillDescriptor[],
): string {
  if (!skills.length) {
    return "No PocketAI skills are currently available in this workspace.";
  }

  const builtin = skills.filter((skill) => skill.source === "builtin");
  const workspace = skills.filter((skill) => skill.source === "workspace");
  const sections: string[] = [];

  if (builtin.length) {
    sections.push(
      `PocketAI built-in skills:\n${builtin
        .map((skill) => `- ${skill.id}: ${skill.description}`)
        .join("\n")}`,
    );
  }

  if (workspace.length) {
    sections.push(
      `Workspace skills:\n${workspace
        .map((skill) => `- ${skill.id}: ${skill.description}`)
        .join("\n")}`,
    );
  }

  return sections.join("\n\n");
}

export function formatSkillAvailabilityMessage(
  skill: HarnessSkillDescriptor | undefined,
  requestedSkillId: string,
): string {
  if (!skill) {
    return `No, the PocketAI skill "${requestedSkillId}" is not available in this workspace. Use "what skills do you have?" to see the current list.`;
  }

  return `Yes. "${skill.id}" is available as a PocketAI ${skill.source} skill.\n\n${skill.description}`;
}

function normalizeSkillLookup(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^\/+/, "")
    .replace(/\s+/g, "-");
}
