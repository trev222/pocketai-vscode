import * as path from "path";
import type { ChatEntry, ChatSession } from "./types";
import { isInsidePath } from "./helpers";

export type WorktreeSlashOutcome =
  | { kind: "status"; status: string; transcriptEntry: ChatEntry }
  | { kind: "exit"; status: string }
  | { kind: "error"; status: string }
  | {
      kind: "enter";
      name: string;
      branchName: string;
      worktreeRoot: string;
      exists: boolean;
      status: string;
      transcriptEntry: ChatEntry;
    };

export function normalizeWorktreeName(input: string): string {
  return input
    .trim()
    .replace(/^enter\s+/i, "")
    .replace(/^create\s+/i, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

export function getPocketAiWorktreeRoot(workspaceRoot: string, name: string): string {
  return path.join(workspaceRoot, ".pocketai", "worktrees", name);
}

export function resolveWorktreeSlashCommand(options: {
  session: Pick<ChatSession, "worktreeRoot">;
  arg: string;
  workspaceRoot: string;
  pathExists: (targetPath: string) => boolean;
}): WorktreeSlashOutcome {
  const arg = options.arg.trim();
  const activeRoot = options.session.worktreeRoot?.trim() || "";

  if (!arg || arg === "status" || arg === "list") {
    const content = activeRoot
      ? `Active worktree: \`${path.relative(options.workspaceRoot, activeRoot) || activeRoot}\``
      : "No active worktree for this chat. Tools are using the main workspace root.";
    return {
      kind: "status",
      status: activeRoot ? "Worktree mode active." : "Using main workspace.",
      transcriptEntry: { role: "tool", content },
    };
  }

  if (arg === "exit" || arg === "leave") {
    return {
      kind: "exit",
      status: activeRoot
        ? "Exited worktree mode for this chat."
        : "Already using the main workspace.",
    };
  }

  const name = normalizeWorktreeName(arg);
  if (!name) {
    return {
      kind: "error",
      status: "Usage: /worktree <name|status|exit>",
    };
  }

  const worktreeRoot = getPocketAiWorktreeRoot(options.workspaceRoot, name);
  if (!isInsidePath(options.workspaceRoot, worktreeRoot)) {
    return {
      kind: "error",
      status: "Worktree path must stay inside the workspace.",
    };
  }

  const branchName = `pocketai/${name}`;
  const exists = options.pathExists(worktreeRoot);
  return {
    kind: "enter",
    name,
    branchName,
    worktreeRoot,
    exists,
    status: exists
      ? `Entered existing worktree: ${name}`
      : `Created and entered worktree: ${name}`,
    transcriptEntry: {
      role: "tool",
      content: `Worktree active for this chat:\n- Name: \`${name}\`\n- Branch: \`${branchName}\`\n- Path: \`${path.relative(options.workspaceRoot, worktreeRoot)}\``,
    },
  };
}
