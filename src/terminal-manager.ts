import * as vscode from "vscode";

/**
 * Manages a dedicated VS Code integrated terminal for PocketAI command execution.
 * Uses the Terminal Shell Integration API (VS Code 1.93+) to run commands and
 * capture output directly, falling back to child_process when unavailable.
 */
export class TerminalManager {
  private terminal?: vscode.Terminal;
  private outputChannel: vscode.OutputChannel;
  private disposables: vscode.Disposable[] = [];

  constructor(outputChannel: vscode.OutputChannel) {
    this.outputChannel = outputChannel;

    // Clean up if terminal is closed by user
    this.disposables.push(
      vscode.window.onDidCloseTerminal((t) => {
        if (t === this.terminal) {
          this.terminal = undefined;
        }
      }),
    );
  }

  private ensureTerminal(): vscode.Terminal {
    if (this.terminal && this.isTerminalAlive()) {
      return this.terminal;
    }
    this.terminal = vscode.window.createTerminal({
      name: "PocketAI",
      hideFromUser: false,
    });
    return this.terminal;
  }

  private isTerminalAlive(): boolean {
    if (!this.terminal) return false;
    return this.terminal.exitStatus === undefined;
  }

  /**
   * Execute a command in the integrated terminal and capture output.
   * Uses Shell Integration API when available, falls back to sendText.
   * Returns the command output as a string.
   */
  async executeCommand(
    cmd: string,
    cwd: string,
    timeout = 120000,
    options?: { reveal?: boolean },
  ): Promise<{ output: string; exitCode: number | undefined }> {
    const terminal = this.ensureTerminal();
    if (options?.reveal) {
      terminal.show(true);
    }

    const shellIntegration = terminal.shellIntegration;
    if (shellIntegration) {
      return this.executeWithShellIntegration(shellIntegration, cmd, cwd, timeout);
    }

    // Fallback: wait briefly for shell integration to become available
    const integration = await this.waitForShellIntegration(terminal, 3000);
    if (integration) {
      return this.executeWithShellIntegration(integration, cmd, cwd, timeout);
    }

    if (!options?.reveal) {
      throw new Error(
        "Shell integration is unavailable for hidden terminal execution.",
      );
    }

    // Final fallback: just send text and return a notice
    this.outputChannel.appendLine(
      `▶ Terminal (no shell integration): ${cmd}`,
    );
    terminal.sendText(`cd ${this.shellEscape(cwd)} && ${cmd}`, true);
    return {
      output:
        "Command sent to terminal. Shell integration not available — output cannot be captured. Check the terminal panel for results.",
      exitCode: undefined,
    };
  }

  private async executeWithShellIntegration(
    shellIntegration: vscode.TerminalShellIntegration,
    cmd: string,
    cwd: string,
    timeout: number,
  ): Promise<{ output: string; exitCode: number | undefined }> {
    this.outputChannel.appendLine(`▶ Terminal: ${cmd}`);

    const fullCmd = `cd ${this.shellEscape(cwd)} && ${cmd}`;
    const execution = shellIntegration.executeCommand(fullCmd);

    let output = "";
    const maxBuffer = 2 * 1024 * 1024; // 2MB

    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutHandle = setTimeout(
        () => reject(new Error(`Command timed out after ${timeout / 1000}s`)),
        timeout,
      );
    });

    try {
      const readPromise = (async () => {
        const stream = execution.read();
        for await (const data of stream) {
          if (output.length < maxBuffer) {
            output += data;
            this.outputChannel.append(data);
          }
        }
      })();

      await Promise.race([readPromise, timeoutPromise]);
    } catch (e) {
      const message = (e as Error)?.message || "Unknown error";
      if (message.includes("timed out")) {
        output += `\n[Command timed out after ${timeout / 1000}s]`;
      } else {
        output += `\n[Error: ${message}]`;
      }
    } finally {
      if (timeoutHandle !== undefined) clearTimeout(timeoutHandle);
    }

    // Strip ANSI escape codes
    output = this.stripAnsi(output);

    // exitCode is a Thenable on VS Code 1.93+; fall back gracefully
    let exitCode: number | undefined;
    try {
      const rawExitCode = (execution as { exitCode?: number | Thenable<number | undefined> }).exitCode;
      if (rawExitCode !== undefined) {
        exitCode = typeof rawExitCode === "number"
          ? rawExitCode
          : await Promise.resolve(rawExitCode);
      }
    } catch {
      // exitCode not available on this VS Code version
    }

    this.outputChannel.appendLine(
      `▶ Terminal exit: ${exitCode ?? "unknown"}`,
    );

    return { output: output.trim(), exitCode };
  }

  private waitForShellIntegration(
    terminal: vscode.Terminal,
    timeoutMs: number,
  ): Promise<vscode.TerminalShellIntegration | undefined> {
    if (terminal.shellIntegration) {
      return Promise.resolve(terminal.shellIntegration);
    }

    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        disposable.dispose();
        resolve(undefined);
      }, timeoutMs);

      const disposable = vscode.window.onDidChangeTerminalShellIntegration(
        (e) => {
          if (e.terminal === terminal) {
            clearTimeout(timeout);
            disposable.dispose();
            resolve(e.shellIntegration);
          }
        },
      );
    });
  }

  private shellEscape(s: string): string {
    return `'${s.replace(/'/g, "'\\''")}'`;
  }

  private stripAnsi(s: string): string {
    // eslint-disable-next-line no-control-regex
    return s.replace(/\x1B\[[0-9;]*[a-zA-Z]/g, "");
  }

  show() {
    this.terminal?.show();
  }

  dispose() {
    this.terminal?.dispose();
    for (const d of this.disposables) d.dispose();
  }
}
