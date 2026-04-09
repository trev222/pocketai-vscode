import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import type { ChatSession, ToolCall } from "../../types";
import type { ToolLoopDeps } from "../../tool-loop";
import {
  executeGitDiffTool,
  executeGitStatusTool,
} from "../tools/core";
import { executeDiagnosticsTool } from "../tools/ide";

const MAX_SECTION_CHARS = 4500;
const MAX_DIFF_CHARS = 6000;
const MAX_ROOT_ENTRIES = 18;
const MAX_SNIPPET_LINES = 40;

export async function buildSkillPreflightContext(
  session: ChatSession,
  deps: ToolLoopDeps,
): Promise<string | undefined> {
  const activeSkillIds = new Set(session.activeSkills.map((skill) => skill.id));
  if (!activeSkillIds.size) return undefined;

  const sections: string[] = [];

  if (activeSkillIds.has("fix") || activeSkillIds.has("debug")) {
    const diagnostics = await executeDiagnosticsTool(createToolCall("diagnostics"));
    if (isUsefulPreflight(diagnostics)) {
      sections.push(
        formatPreflightSection(
          "Diagnostics Snapshot",
          truncatePreflight(diagnostics, MAX_SECTION_CHARS),
        ),
      );
    }
  }

  if (activeSkillIds.has("debug")) {
    const debugClues = extractDebugClues(session);
    if (debugClues) {
      sections.push(formatPreflightSection("Debug Clues", debugClues));
    }
  }

  if (activeSkillIds.has("review")) {
    const reviewSnapshot = await buildReviewSnapshot(session, deps);
    if (reviewSnapshot) {
      sections.push(formatPreflightSection("Review Snapshot", reviewSnapshot));
    }
  }

  if (activeSkillIds.has("init")) {
    const initSnapshot = await buildInitSnapshot();
    if (initSnapshot) {
      sections.push(formatPreflightSection("Project Snapshot", initSnapshot));
    }
  }

  if (!sections.length) return undefined;

  return [
    "[Skill Preflight]",
    "PocketAI gathered this context automatically before the first model turn. Use it as evidence, not as a substitute for additional tool use when deeper validation is needed.",
    ...sections,
  ].join("\n\n");
}

function createToolCall(type: ToolCall["type"], extras: Partial<ToolCall> = {}): ToolCall {
  return {
    id: `preflight-${type}`,
    type,
    filePath: "",
    status: "pending",
    ...extras,
  };
}

function isUsefulPreflight(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return false;
  return !/^No (diagnostics|errors or warnings)/i.test(trimmed);
}

function truncatePreflight(value: string, maxChars: number) {
  return value.length > maxChars
    ? `${value.slice(0, maxChars)}\n... [truncated]`
    : value;
}

function formatPreflightSection(title: string, content: string) {
  return `[${title}]\n${content}`;
}

async function buildReviewSnapshot(
  session: ChatSession,
  deps: ToolLoopDeps,
): Promise<string | undefined> {
  const status = await executeGitStatusTool(
    deps,
    session,
    createToolCall("git_status"),
  );
  const diff = await executeGitDiffTool(
    deps,
    session,
    createToolCall("git_diff"),
  );

  if (
    /Working tree clean\./.test(status) &&
    /No changes \(working tree and staging area are clean\)\./.test(diff)
  ) {
    return "Git working tree is clean. Review should focus on the files, code, or context the user provided rather than uncommitted diffs.";
  }

  const sections = [status.trim()];
  if (diff.trim()) {
    sections.push(truncatePreflight(diff.trim(), MAX_DIFF_CHARS));
  }
  return sections.join("\n\n");
}

async function buildInitSnapshot(): Promise<string | undefined> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders?.length) return undefined;

  const rootPath = workspaceFolders[0].uri.fsPath;
  const rootEntries = safeReadRootEntries(rootPath);
  const keyFiles = [
    "README.md",
    "package.json",
    "tsconfig.json",
    "pyproject.toml",
    "Cargo.toml",
    "go.mod",
    "requirements.txt",
    "pnpm-workspace.yaml",
  ];

  const snippets = keyFiles
    .map((fileName) => {
      const fullPath = path.join(rootPath, fileName);
      if (!fs.existsSync(fullPath)) return undefined;
      const snippet = readFileSnippet(fullPath, MAX_SNIPPET_LINES);
      if (!snippet) return undefined;
      return `[${fileName}]\n${snippet}`;
    })
    .filter((value): value is string => !!value)
    .slice(0, 3);

  return [
    rootEntries ? `[Workspace Root]\n${rootEntries}` : "",
    ...snippets,
  ].filter(Boolean).join("\n\n");
}

function safeReadRootEntries(rootPath: string) {
  try {
    const entries = fs.readdirSync(rootPath, { withFileTypes: true })
      .slice(0, MAX_ROOT_ENTRIES)
      .map((entry) => `${entry.isDirectory() ? "[dir]" : "[file]"} ${entry.name}`);
    return entries.join("\n");
  } catch {
    return "";
  }
}

function readFileSnippet(fullPath: string, maxLines: number) {
  try {
    const content = fs.readFileSync(fullPath, "utf-8");
    return content
      .split("\n")
      .slice(0, maxLines)
      .join("\n")
      .trim();
  } catch {
    return "";
  }
}

function extractDebugClues(session: ChatSession) {
  const lastUserEntry = [...session.transcript]
    .reverse()
    .find((entry) => entry.role === "user");
  if (!lastUserEntry) return "";

  const clues: string[] = [];
  const text = lastUserEntry.content || "";
  const errorLines = text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /\b(error|exception|traceback|failed|failure|crash)\b/i.test(line))
    .slice(0, 6);
  if (errorLines.length) {
    clues.push(`Error-like lines from the prompt:\n${errorLines.map((line) => `- ${line}`).join("\n")}`);
  }

  const commandMatches = Array.from(
    text.matchAll(/`([^`\n]{3,160})`/g),
  )
    .map((match) => match[1].trim())
    .filter((value) => /\s/.test(value))
    .slice(0, 3);
  if (commandMatches.length) {
    clues.push(`Potential reproduction commands or snippets:\n${commandMatches.map((line) => `- ${line}`).join("\n")}`);
  }

  const attachedFiles = lastUserEntry.files?.map((file) => file.name).slice(0, 5) || [];
  if (attachedFiles.length) {
    clues.push(`Attached files in the request:\n${attachedFiles.map((file) => `- ${file}`).join("\n")}`);
  }

  return clues.join("\n\n");
}
