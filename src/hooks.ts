import * as child_process from "child_process";
import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import type { HookEvent } from "./types";
import { shellEscape } from "./helpers";

export async function runHooks(
  config: vscode.WorkspaceConfiguration,
  outputChannel: vscode.OutputChannel,
  event: HookEvent,
  variables: Record<string, string>,
): Promise<void> {
  const hooks = config.get<Record<string, string[]>>("hooks") ?? {};
  const commands = hooks[event] ?? [];

  // Also check workspace-level .pocketai.hooks.json
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (workspaceFolders?.length) {
    const hookFile = path.join(workspaceFolders[0].uri.fsPath, ".pocketai.hooks.json");
    try {
      const raw = fs.readFileSync(hookFile, "utf-8");
      const wsHooks = JSON.parse(raw) as Record<string, string[]>;
      commands.push(...(wsHooks[event] ?? []));
    } catch {}
  }

  if (!commands.length) return;

  const rootPath = workspaceFolders?.[0]?.uri.fsPath ?? process.cwd();
  // Safe variable allowlist
  const safeVars: Record<string, string> = {
    file: variables.file ?? "",
    tool: variables.tool ?? "",
    workspaceRoot: rootPath,
  };

  for (const cmd of commands) {
    let resolvedCmd = cmd;
    for (const [key, value] of Object.entries(safeVars)) {
      const escaped = shellEscape(value);
      resolvedCmd = resolvedCmd.replace(new RegExp(`\\$\\{${key}\\}`, "g"), escaped);
    }

    try {
      child_process.execSync(resolvedCmd, {
        cwd: rootPath,
        encoding: "utf-8",
        timeout: 30000,
        maxBuffer: 1024 * 1024,
      });
    } catch (e) {
      const err = e as { stderr?: string; message: string };
      const msg = err.stderr || err.message;
      outputChannel.appendLine(`Hook [${event}] failed: ${msg}`);
      if (event.startsWith("pre")) {
        throw new Error(`Hook blocked: ${msg.slice(0, 200)}`);
      }
    }
  }
}
