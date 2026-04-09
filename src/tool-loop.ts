import * as vscode from "vscode";
import type { ChatSession } from "./types";
import { type StreamingDeps } from "./streaming";
import type { McpManager } from "./mcp-client";
import type { InlineDiffManager } from "./inline-diff";
import type { TerminalManager } from "./terminal-manager";
import type { MemoryManager } from "./memory-manager";
import { HarnessRunner } from "./harness/runner";
import type { HarnessEvent, HarnessRunnerResult } from "./harness/types";

export interface ToolLoopDeps {
  config: vscode.WorkspaceConfiguration;
  outputChannel: vscode.OutputChannel;
  streamingDeps: StreamingDeps;
  buildWorkspaceContext: (session?: ChatSession) => Promise<string>;
  postState: () => void;
  autoCompact?: (session: ChatSession) => Promise<void>;
  mcpManager?: McpManager;
  inlineDiffMgr?: InlineDiffManager;
  terminalMgr?: TerminalManager;
  memoryMgr?: MemoryManager;
  onHarnessEvent?: (event: HarnessEvent) => void;
}

/**
 * Runs the tool-call loop: streams a response, parses tool calls, executes
 * auto-approved ones, and loops until no more tool calls or a pending approval
 * is needed. Used by both sendPrompt and continueAfterToolResults.
 *
 * When `pocketai.useStructuredTools` is enabled, sends OpenAI-format tool
 * definitions and parses structured tool_calls from the response. Otherwise
 * falls back to text-based @tool_name parsing.
 */
export async function runToolLoop(
  session: ChatSession,
  deps: ToolLoopDeps,
): Promise<HarnessRunnerResult> {
  const runner = new HarnessRunner(deps);
  return runner.run(session);
}
