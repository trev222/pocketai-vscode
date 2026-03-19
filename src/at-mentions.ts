import * as fs from "fs";
import * as path from "path";
import * as vscode from "vscode";
import { DEFAULT_CURRENT_FILE_CHAR_LIMIT, EXCLUDED_DIRS_GLOB } from "./constants";

let workspaceFileCache: string[] = [];
let workspaceFileCacheTime = 0;

export async function resolveAtMentions(
  query: string,
): Promise<Array<{ label: string; kind: "file" | "folder" }>> {
  if (Date.now() - workspaceFileCacheTime > 10000) {
    const uris = await vscode.workspace.findFiles(
      "**/*",
      EXCLUDED_DIRS_GLOB,
      500,
    );
    workspaceFileCache = uris
      .map((u) => vscode.workspace.asRelativePath(u, false))
      .sort();
    workspaceFileCacheTime = Date.now();
  }

  const lowerQuery = query.toLowerCase();
  const results: Array<{ label: string; kind: "file" | "folder" }> = [];
  const seen = new Set<string>();

  for (const fp of workspaceFileCache) {
    if (results.length >= 15) break;
    if (fp.toLowerCase().includes(lowerQuery)) {
      results.push({ label: fp, kind: "file" });
      const dir = path.dirname(fp);
      if (dir && dir !== "." && !seen.has(dir)) {
        seen.add(dir);
        results.push({ label: dir + "/", kind: "folder" });
      }
    }
  }

  return results;
}

export async function injectAtMentionContent(
  prompt: string,
  config: vscode.WorkspaceConfiguration,
): Promise<string> {
  const mentionRegex = /@([\w.\/\-]+(?::\d+(?:-\d+)?)?)/g;
  let match;
  let result = prompt;
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders?.length) return result;
  const rootPath = workspaceFolders[0].uri.fsPath;
  const charLimit = Math.max(
    2000,
    config.get<number>("currentFileCharLimit") ?? DEFAULT_CURRENT_FILE_CHAR_LIMIT,
  );

  const mentions: Array<{
    full: string;
    filePath: string;
    lineRange?: [number, number];
  }> = [];
  while ((match = mentionRegex.exec(prompt)) !== null) {
    const raw = match[1];
    const lineMatch = raw.match(/^(.+):(\d+)(?:-(\d+))?$/);
    if (lineMatch) {
      mentions.push({
        full: match[0],
        filePath: lineMatch[1],
        lineRange: [
          parseInt(lineMatch[2], 10),
          parseInt(lineMatch[3] || lineMatch[2], 10),
        ],
      });
    } else {
      mentions.push({ full: match[0], filePath: raw });
    }
  }

  for (const mention of mentions) {
    const fullPath = path.resolve(rootPath, mention.filePath);
    if (!fullPath.startsWith(rootPath)) continue;

    try {
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        const entries = fs.readdirSync(fullPath, { withFileTypes: true });
        const listing = entries
          .map((e) => `${e.isDirectory() ? "[dir] " : ""}${e.name}`)
          .join("\n");
        result = result
          .split(mention.full)
          .join(`\n[Contents of ${mention.filePath}/]\n${listing}\n`);
      } else {
        let content = fs.readFileSync(fullPath, "utf-8");
        if (mention.lineRange) {
          const lines = content.split("\n");
          const [start, end] = mention.lineRange;
          content = lines.slice(Math.max(0, start - 1), end).join("\n");
        }
        if (content.length > charLimit) {
          content = content.slice(0, charLimit) + "\n... [truncated]";
        }
        const ext = path.extname(mention.filePath).slice(1) || "text";
        result = result
          .split(mention.full)
          .join(
            `\n[Contents of ${mention.filePath}]\n\`\`\`${ext}\n${content}\n\`\`\`\n`,
          );
      }
    } catch {
      // Leave the mention as-is if file not found
    }
  }

  return result;
}
