import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { matchGlob } from "./helpers";

export function checkPermissionRules(
  config: vscode.WorkspaceConfiguration,
  toolType: string,
  toolArg: string,
): "allow" | "deny" | "default" {
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

  const matchRule = (rule: string): boolean => {
    const ruleMatch = rule.match(/^(\w+)\((.+)\)$/);
    if (!ruleMatch) return false;
    const [, ruleType, rulePattern] = ruleMatch;
    if (ruleType !== toolType) return false;
    return matchGlob(rulePattern, toolArg);
  };

  // Deny takes precedence
  for (const rule of denyRules) {
    if (matchRule(rule)) return "deny";
  }
  for (const rule of allowRules) {
    if (matchRule(rule)) return "allow";
  }
  return "default";
}
