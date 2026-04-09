import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { listBuiltinHarnessSkills } from "./builtins";

export type HarnessSkillDescriptor = {
  id: string;
  name: string;
  description: string;
  source: "builtin" | "workspace";
  prompt: string;
  path?: string;
};

export function listHarnessSkills(): HarnessSkillDescriptor[] {
  return [...listBuiltinSkills(), ...listWorkspaceSkills()];
}

export function getHarnessSkillById(skillId: string): HarnessSkillDescriptor | undefined {
  const normalized = normalizeSkillId(skillId);
  return listHarnessSkills().find((skill) => skill.id === normalized);
}

function listBuiltinSkills(): HarnessSkillDescriptor[] {
  return listBuiltinHarnessSkills().map((skill) => ({
    id: skill.id,
    name: skill.name,
    description: skill.description,
    source: "builtin",
    prompt: skill.prompt,
  }));
}

function listWorkspaceSkills(): HarnessSkillDescriptor[] {
  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
  if (!workspaceRoot) return [];

  const skillsRoot = path.join(workspaceRoot, ".pocketai", "skills");
  if (!fs.existsSync(skillsRoot)) return [];

  const skillFiles = new Set<string>();

  try {
    const entries = fs.readdirSync(skillsRoot, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const nestedSkillPath = path.join(skillsRoot, entry.name, "SKILL.md");
        if (fs.existsSync(nestedSkillPath)) {
          skillFiles.add(nestedSkillPath);
        }
        continue;
      }

      if (
        entry.isFile() &&
        entry.name.toLowerCase().endsWith(".md")
      ) {
        skillFiles.add(path.join(skillsRoot, entry.name));
      }
    }
  } catch {
    return [];
  }

  return Array.from(skillFiles)
    .map((filePath) => readWorkspaceSkill(filePath))
    .filter((skill): skill is HarnessSkillDescriptor => !!skill)
    .sort((a, b) => a.name.localeCompare(b.name));
}

function readWorkspaceSkill(filePath: string): HarnessSkillDescriptor | undefined {
  try {
    const prompt = fs.readFileSync(filePath, "utf-8").trim();
    if (!prompt) return undefined;

    const baseName = path.basename(path.dirname(filePath)) === "skills"
      ? path.basename(filePath, path.extname(filePath))
      : path.basename(path.dirname(filePath));
    const name = humanizeSkillName(baseName);

    return {
      id: normalizeSkillId(baseName),
      name,
      description: summarizeSkill(prompt),
      source: "workspace",
      prompt,
      path: filePath,
    };
  } catch {
    return undefined;
  }
}

function normalizeSkillId(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^\//, "")
    .replace(/\.md$/i, "")
    .replace(/\s+/g, "-");
}

function humanizeSkillName(value: string): string {
  return value
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function summarizeSkill(prompt: string): string {
  const cleaned = prompt.replace(/\s+/g, " ").trim();
  if (!cleaned) return "Reusable workflow.";
  const firstSentence = cleaned.split(/(?<=[.!?])\s+/)[0] || cleaned;
  return firstSentence.length > 140
    ? `${firstSentence.slice(0, 137).trimEnd()}...`
    : firstSentence;
}
