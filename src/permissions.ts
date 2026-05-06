import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { classifyShellCommandRisk } from "./harness/policy";
import {
  evaluatePermissionRules,
  type PermissionDecision,
} from "./permission-workflows";

export function checkPermissionRules(
  config: vscode.WorkspaceConfiguration,
  toolType: string,
  toolArg: string,
): PermissionDecision {
  const permissions = config.get<{ allow?: string[]; deny?: string[] }>("permissions") ?? {};
  const denyRules = permissions.deny ?? [];
  const allowRules = permissions.allow ?? [];

  // Also check workspace-level .pocketai.permissions.json
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (workspaceFolders?.length) {
    const permFile = path.join(workspaceFolders[0].uri.fsPath, ".pocketai.permissions.json");
    try {
      const raw = fs.readFileSync(permFile, "utf-8");
      const wsPerms = JSON.parse(raw) as { allow?: string[]; deny?: string[] };
      denyRules.push(...(wsPerms.deny ?? []));
      allowRules.push(...(wsPerms.allow ?? []));
    } catch {}
  }

  return evaluatePermissionRules(allowRules, denyRules, {
    toolType,
    toolArg,
    commandRisk:
      toolType === "run_command"
        ? classifyShellCommandRisk(toolArg)
        : undefined,
  });
}
