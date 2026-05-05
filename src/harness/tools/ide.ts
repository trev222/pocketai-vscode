import * as path from "path";
import * as vscode from "vscode";
import type { ToolCall } from "../../types";
import { isInsidePath } from "../../helpers";

const MAX_DIAGNOSTICS = 100;
const MAX_LOCATIONS = 25;
const MAX_SYMBOLS = 200;
const MAX_HOVER_BLOCKS = 10;
const MAX_CODE_ACTIONS = 25;

export async function executeDiagnosticsTool(toolCall: ToolCall): Promise<string> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders?.length) {
    return "No workspace folder is open.";
  }

  if (toolCall.filePath) {
    const target = await resolveWorkspaceDocument(toolCall.filePath);
    if (!target) {
      return `Could not open file: ${toolCall.filePath}`;
    }
    const diagnostics = vscode.languages.getDiagnostics(target.uri);
    return formatDiagnosticsForFile(target.uri, diagnostics);
  }

  const diagnostics = vscode.languages.getDiagnostics();
  if (!diagnostics.length) {
    return "No diagnostics are currently reported in the workspace.";
  }

  const lines: string[] = [];
  let total = 0;
  for (const [uri, entries] of diagnostics) {
    for (const diagnostic of entries) {
      if (!isRelevantSeverity(diagnostic.severity)) continue;
      lines.push(formatSingleDiagnostic(uri, diagnostic));
      total++;
      if (lines.length >= MAX_DIAGNOSTICS) break;
    }
    if (lines.length >= MAX_DIAGNOSTICS) break;
  }

  if (!lines.length) {
    return "No errors or warnings are currently reported in the workspace.";
  }

  const suffix =
    total > lines.length ? `\n... ${total - lines.length} more diagnostics not shown.` : "";
  return `Workspace diagnostics (${total}):\n${lines.join("\n")}${suffix}`;
}

export async function executeDefinitionTool(toolCall: ToolCall): Promise<string> {
  const target = await resolveWorkspaceDocument(toolCall.filePath);
  if (!target) {
    return `Could not open file: ${toolCall.filePath}`;
  }

  const position = createPosition(toolCall);
  if (!position) {
    return "go_to_definition requires line and character.";
  }

  const results = await vscode.commands.executeCommand<
    Array<vscode.Location | vscode.LocationLink>
  >(
    "vscode.executeDefinitionProvider",
    target.uri,
    position,
  );

  if (!results?.length) {
    return `No definition found at ${target.relativePath}:${position.line + 1}:${position.character}.`;
  }

  const lines = await formatLocations(results.slice(0, MAX_LOCATIONS));
  const suffix =
    results.length > MAX_LOCATIONS
      ? `\n... ${results.length - MAX_LOCATIONS} more definitions not shown.`
      : "";
  return `Definitions for ${target.relativePath}:${position.line + 1}:${position.character}:\n${lines.join("\n")}${suffix}`;
}

export async function executeOpenFileTool(toolCall: ToolCall): Promise<string> {
  const target = await resolveWorkspaceDocument(toolCall.filePath);
  if (!target) {
    return `Could not open file: ${toolCall.filePath}`;
  }

  const position = createOpenFilePosition(toolCall);
  const selection = position
    ? new vscode.Range(position, position)
    : undefined;
  const editor = await vscode.window.showTextDocument(target.document, {
    preview: false,
    preserveFocus: false,
    selection,
  });

  if (selection) {
    editor.revealRange(
      selection,
      vscode.TextEditorRevealType.InCenterIfOutsideViewport,
    );
  }

  return position
    ? `Opened ${target.relativePath} in the editor at ${position.line + 1}:${position.character}.`
    : `Opened ${target.relativePath} in the editor.`;
}

export async function executeOpenDefinitionTool(toolCall: ToolCall): Promise<string> {
  const target = await resolveWorkspaceDocument(toolCall.filePath);
  if (!target) {
    return `Could not open file: ${toolCall.filePath}`;
  }

  const position = createPosition(toolCall);
  if (!position) {
    return "open_definition requires line and character.";
  }

  const results = await vscode.commands.executeCommand<
    Array<vscode.Location | vscode.LocationLink>
  >(
    "vscode.executeDefinitionProvider",
    target.uri,
    position,
  );

  if (!results?.length) {
    return `No definition found at ${target.relativePath}:${position.line + 1}:${position.character}.`;
  }

  const first = results[0];
  const targetUri = isLocationLink(first) ? first.targetUri : first.uri;
  const targetRange = isLocationLink(first)
    ? (first.targetSelectionRange ?? first.targetRange)
    : first.range;
  const document = await vscode.workspace.openTextDocument(targetUri);
  const editor = await vscode.window.showTextDocument(document, {
    preview: false,
    preserveFocus: false,
    selection: targetRange,
  });
  editor.revealRange(
    targetRange,
    vscode.TextEditorRevealType.InCenterIfOutsideViewport,
  );

  return `Opened definition at ${formatUriForDisplay(targetUri)}:${targetRange.start.line + 1}:${targetRange.start.character}.`;
}

export async function executeWorkspaceSymbolsTool(toolCall: ToolCall): Promise<string> {
  const query = toolCall.query?.trim() || "";
  if (!query) {
    return "workspace_symbols requires a query.";
  }

  const results = await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
    "vscode.executeWorkspaceSymbolProvider",
    query,
  );

  if (!results?.length) {
    return `No workspace symbols matched "${query}".`;
  }

  const visible = results.slice(0, MAX_SYMBOLS);
  const lines = visible.map((symbol) => formatSymbolInformation(symbol));
  const suffix =
    results.length > visible.length
      ? `\n... ${results.length - visible.length} more symbols not shown.`
      : "";
  return `Workspace symbols matching "${query}" (${results.length}):\n${lines.join("\n")}${suffix}`;
}

export async function executeHoverSymbolTool(toolCall: ToolCall): Promise<string> {
  const target = await resolveWorkspaceDocument(toolCall.filePath);
  if (!target) {
    return `Could not open file: ${toolCall.filePath}`;
  }

  const position = createPosition(toolCall);
  if (!position) {
    return "hover_symbol requires line and character.";
  }

  const results = await vscode.commands.executeCommand<vscode.Hover[]>(
    "vscode.executeHoverProvider",
    target.uri,
    position,
  );

  if (!results?.length) {
    return `No hover information found at ${target.relativePath}:${position.line + 1}:${position.character}.`;
  }

  const blocks = results
    .flatMap((hover) => hover.contents.map(formatHoverContent))
    .map((block) => block.trim())
    .filter(Boolean);

  if (!blocks.length) {
    return `Hover provider returned no readable content for ${target.relativePath}:${position.line + 1}:${position.character}.`;
  }

  const visible = blocks.slice(0, MAX_HOVER_BLOCKS);
  const suffix =
    blocks.length > visible.length
      ? `\n\n... ${blocks.length - visible.length} more hover block${blocks.length - visible.length === 1 ? "" : "s"} not shown.`
      : "";
  return `Hover info for ${target.relativePath}:${position.line + 1}:${position.character}:\n\n${visible.join("\n\n---\n\n")}${suffix}`;
}

export async function executeCodeActionsTool(toolCall: ToolCall): Promise<string> {
  const target = await resolveWorkspaceDocument(toolCall.filePath);
  if (!target) {
    return `Could not open file: ${toolCall.filePath}`;
  }

  const position = createPosition(toolCall);
  if (!position) {
    return "code_actions requires line and character.";
  }

  const range = new vscode.Range(position, position);
  const results = await vscode.commands.executeCommand<
    Array<vscode.Command | vscode.CodeAction>
  >(
    "vscode.executeCodeActionProvider",
    target.uri,
    range,
  );

  if (!results?.length) {
    return `No code actions found at ${target.relativePath}:${position.line + 1}:${position.character}.`;
  }

  const visible = results.slice(0, MAX_CODE_ACTIONS);
  const lines = visible.map((action) => formatCodeAction(action));
  const suffix =
    results.length > visible.length
      ? `\n... ${results.length - visible.length} more code actions not shown.`
      : "";
  return `Code actions for ${target.relativePath}:${position.line + 1}:${position.character}:\n${lines.join("\n")}${suffix}`;
}

export async function executeApplyCodeActionTool(toolCall: ToolCall): Promise<string> {
  const target = await resolveWorkspaceDocument(toolCall.filePath);
  if (!target) {
    return `Could not open file: ${toolCall.filePath}`;
  }

  const position = createPosition(toolCall);
  if (!position) {
    return "apply_code_action requires line and character.";
  }

  const actionTitle = toolCall.actionTitle?.trim();
  if (!actionTitle) {
    return "apply_code_action requires a title. Use code_actions first to inspect available actions.";
  }

  const actions = await getCodeActionsAtPosition(target.uri, position);
  if (!actions.length) {
    return `No code actions found at ${target.relativePath}:${position.line + 1}:${position.character}.`;
  }

  const match = actions.find((action) => action.title === actionTitle);
  if (!match) {
    return `No code action titled "${actionTitle}" was found at ${target.relativePath}:${position.line + 1}:${position.character}.`;
  }

  if (match.disabled) {
    return `Code action "${actionTitle}" is currently disabled: ${match.disabled.reason}`;
  }

  let appliedEditEntries = 0;
  if (match.edit) {
    appliedEditEntries = Array.from(match.edit.entries()).length;
    const applied = await vscode.workspace.applyEdit(match.edit);
    if (!applied) {
      return `Failed to apply code action "${actionTitle}".`;
    }
  }

  if (match.command) {
    await vscode.commands.executeCommand(
      match.command.command,
      ...(match.command.arguments ?? []),
    );
  }

  if (!match.edit && !match.command) {
    return `Code action "${actionTitle}" has no executable edit or command.`;
  }

  const effect = [
    appliedEditEntries
      ? `applied ${appliedEditEntries} workspace edit${appliedEditEntries === 1 ? "" : "s"}`
      : "",
    match.command ? `ran command ${match.command.command}` : "",
  ]
    .filter(Boolean)
    .join(" and ");

  return `Applied code action "${actionTitle}" at ${target.relativePath}:${position.line + 1}:${position.character}${effect ? ` (${effect})` : ""}.`;
}

export async function executeReferencesTool(toolCall: ToolCall): Promise<string> {
  const target = await resolveWorkspaceDocument(toolCall.filePath);
  if (!target) {
    return `Could not open file: ${toolCall.filePath}`;
  }

  const position = createPosition(toolCall);
  if (!position) {
    return "find_references requires line and character.";
  }

  const results = await vscode.commands.executeCommand<vscode.Location[]>(
    "vscode.executeReferenceProvider",
    target.uri,
    position,
  );

  if (!results?.length) {
    return `No references found at ${target.relativePath}:${position.line + 1}:${position.character}.`;
  }

  const declarationUri = target.uri.toString();
  const declarationLine = position.line;
  const filtered = results.filter((location) => {
    if (toolCall.includeDeclaration !== false) return true;
    return !(
      location.uri.toString() === declarationUri &&
      location.range.start.line === declarationLine
    );
  });

  if (!filtered.length) {
    return `Only the declaration was found for ${target.relativePath}:${position.line + 1}:${position.character}.`;
  }

  const lines = await formatLocations(filtered.slice(0, MAX_LOCATIONS));
  const suffix =
    filtered.length > MAX_LOCATIONS
      ? `\n... ${filtered.length - MAX_LOCATIONS} more references not shown.`
      : "";
  return `References for ${target.relativePath}:${position.line + 1}:${position.character}:\n${lines.join("\n")}${suffix}`;
}

export async function executeDocumentSymbolsTool(toolCall: ToolCall): Promise<string> {
  const target = await resolveWorkspaceDocument(toolCall.filePath);
  if (!target) {
    return `Could not open file: ${toolCall.filePath}`;
  }

  const results = await vscode.commands.executeCommand<
    Array<vscode.DocumentSymbol | vscode.SymbolInformation>
  >(
    "vscode.executeDocumentSymbolProvider",
    target.uri,
  );

  if (!results?.length) {
    return `No document symbols found in ${target.relativePath}.`;
  }

  const lines = isDocumentSymbolArray(results)
    ? flattenDocumentSymbols(results)
    : (results as vscode.SymbolInformation[]).map((symbol) =>
        formatSymbolInformation(symbol),
      );

  const visible = lines.slice(0, MAX_SYMBOLS);
  const suffix =
    lines.length > MAX_SYMBOLS
      ? `\n... ${lines.length - MAX_SYMBOLS} more symbols not shown.`
      : "";
  return `Document symbols in ${target.relativePath}:\n${visible.join("\n")}${suffix}`;
}

async function resolveWorkspaceDocument(filePath: string): Promise<{
  uri: vscode.Uri;
  document: vscode.TextDocument;
  relativePath: string;
} | undefined> {
  const workspaceFolders = vscode.workspace.workspaceFolders;
  if (!workspaceFolders?.length) return undefined;

  const rootPath = workspaceFolders[0].uri.fsPath;
  const fullPath = path.resolve(rootPath, filePath);
  if (!isInsidePath(rootPath, fullPath)) return undefined;

  try {
    const uri = vscode.Uri.file(fullPath);
    const document = await vscode.workspace.openTextDocument(uri);
    return {
      uri,
      document,
      relativePath: vscode.workspace.asRelativePath(uri, false),
    };
  } catch {
    return undefined;
  }
}

function createPosition(toolCall: ToolCall): vscode.Position | undefined {
  if (toolCall.line === undefined || toolCall.character === undefined) {
    return undefined;
  }
  return new vscode.Position(
    Math.max(0, toolCall.line - 1),
    Math.max(0, toolCall.character),
  );
}

function createOpenFilePosition(toolCall: ToolCall): vscode.Position | undefined {
  if (toolCall.line === undefined) {
    return undefined;
  }
  return new vscode.Position(
    Math.max(0, toolCall.line - 1),
    Math.max(0, toolCall.character ?? 0),
  );
}

function isRelevantSeverity(severity: vscode.DiagnosticSeverity): boolean {
  return (
    severity === vscode.DiagnosticSeverity.Error ||
    severity === vscode.DiagnosticSeverity.Warning
  );
}

function formatDiagnosticsForFile(
  uri: vscode.Uri,
  diagnostics: readonly vscode.Diagnostic[],
): string {
  const relevant = diagnostics.filter((diagnostic) =>
    isRelevantSeverity(diagnostic.severity),
  );
  if (!relevant.length) {
    return `No errors or warnings are currently reported for ${vscode.workspace.asRelativePath(uri, false)}.`;
  }

  return `Diagnostics for ${vscode.workspace.asRelativePath(uri, false)} (${relevant.length}):\n${relevant
    .slice(0, MAX_DIAGNOSTICS)
    .map((diagnostic) => formatSingleDiagnostic(uri, diagnostic))
    .join("\n")}`;
}

function formatSingleDiagnostic(
  uri: vscode.Uri,
  diagnostic: vscode.Diagnostic,
): string {
  const line = diagnostic.range.start.line + 1;
  const character = diagnostic.range.start.character;
  const severity =
    diagnostic.severity === vscode.DiagnosticSeverity.Error
      ? "error"
      : "warning";
  return `- ${vscode.workspace.asRelativePath(uri, false)}:${line}:${character} ${severity}: ${diagnostic.message}`;
}

async function formatLocations(
  locations: Array<vscode.Location | vscode.LocationLink>,
): Promise<string[]> {
  const lines: string[] = [];
  for (const location of locations) {
    const targetUri = isLocationLink(location) ? location.targetUri : location.uri;
    const range = isLocationLink(location)
      ? (location.targetSelectionRange ?? location.targetRange)
      : location.range;
    const relativePath = vscode.workspace.asRelativePath(targetUri, false);
    const lineText = await getLinePreview(targetUri, range.start.line);
    lines.push(
      `- ${relativePath}:${range.start.line + 1}:${range.start.character}${lineText ? ` — ${lineText}` : ""}`,
    );
  }
  return lines;
}

async function getLinePreview(
  uri: vscode.Uri,
  line: number,
): Promise<string> {
  try {
    const document = await vscode.workspace.openTextDocument(uri);
    return document.lineAt(line).text.trim();
  } catch {
    return "";
  }
}

function isLocationLink(
  value: vscode.Location | vscode.LocationLink,
): value is vscode.LocationLink {
  return "targetUri" in value;
}

function formatUriForDisplay(uri: vscode.Uri): string {
  const relative = vscode.workspace.asRelativePath(uri, false);
  return relative || uri.fsPath || uri.toString();
}

function formatCodeAction(action: vscode.Command | vscode.CodeAction): string {
  if ("edit" in action || "kind" in action || "diagnostics" in action) {
    const codeAction = action as vscode.CodeAction;
    const kind = codeAction.kind?.value ? ` [${codeAction.kind.value}]` : "";
    const disabled = codeAction.disabled ? ` (disabled: ${codeAction.disabled.reason})` : "";
    return `- ${codeAction.title}${kind}${disabled}`;
  }

  const command = action as vscode.Command;
  return `- ${command.title}${command.command ? ` [command: ${command.command}]` : ""}`;
}

async function getCodeActionsAtPosition(
  uri: vscode.Uri,
  position: vscode.Position,
): Promise<vscode.CodeAction[]> {
  const range = new vscode.Range(position, position);
  const results = await vscode.commands.executeCommand<
    Array<vscode.Command | vscode.CodeAction>
  >(
    "vscode.executeCodeActionProvider",
    uri,
    range,
  );

  return (results || []).filter(
    (action): action is vscode.CodeAction =>
      "title" in action && ("edit" in action || "kind" in action || "diagnostics" in action),
  );
}

function formatHoverContent(
  content: vscode.MarkdownString | vscode.MarkedString,
): string {
  if (typeof content === "string") {
    return content;
  }

  if (content instanceof vscode.MarkdownString) {
    return content.value;
  }

  return "value" in content
    ? `\`\`\`${content.language || ""}\n${content.value}\n\`\`\``
    : "";
}

function isDocumentSymbolArray(
  symbols: Array<vscode.DocumentSymbol | vscode.SymbolInformation>,
): symbols is vscode.DocumentSymbol[] {
  return symbols.length > 0 && "children" in symbols[0];
}

function flattenDocumentSymbols(
  symbols: vscode.DocumentSymbol[],
  depth = 0,
  lines: string[] = [],
): string[] {
  for (const symbol of symbols) {
    lines.push(
      `${"  ".repeat(depth)}- ${symbol.name} [${formatSymbolKind(symbol.kind)}] @ line ${symbol.selectionRange.start.line + 1}`,
    );
    if (symbol.children.length) {
      flattenDocumentSymbols(symbol.children, depth + 1, lines);
    }
  }
  return lines;
}

function formatSymbolInformation(symbol: vscode.SymbolInformation): string {
  return `- ${symbol.name} [${formatSymbolKind(symbol.kind)}] @ ${vscode.workspace.asRelativePath(symbol.location.uri, false)}:${symbol.location.range.start.line + 1}`;
}

function formatSymbolKind(kind: vscode.SymbolKind): string {
  return vscode.SymbolKind[kind] || "Symbol";
}
