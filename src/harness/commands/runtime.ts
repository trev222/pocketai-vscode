import * as child_process from "child_process";
import * as vscode from "vscode";
import type {
  HarnessBackgroundTask,
  HarnessBackgroundTaskStatus,
} from "../../types";

type CommandTask = {
  id: string;
  sessionId: string;
  cmd: string;
  cwd: string;
  proc?: child_process.ChildProcess;
  kind?: "foreground" | "background";
  startedAt?: number;
  completedAt?: number;
  status: HarnessBackgroundTaskStatus;
  output: string;
  exitCode?: number;
  updatedAt: number;
};

const MAX_COMMAND_TASKS = 100;
const commandTasks = new Map<string, CommandTask>();
const commandTaskListeners = new Set<(task: CommandTaskSnapshot) => void>();

export type CommandTaskSnapshot = HarnessBackgroundTask & {
  sessionId: string;
};

function pruneCommandTasks() {
  if (commandTasks.size <= MAX_COMMAND_TASKS) return;
  const keys = Array.from(commandTasks.keys());
  for (let i = 0; i < keys.length - MAX_COMMAND_TASKS; i++) {
    const task = commandTasks.get(keys[i]);
    if (task && task.status !== "running") {
      commandTasks.delete(keys[i]);
    }
  }
}

function emitCommandTask(task: CommandTask) {
  const snapshot = toCommandTaskSnapshot(task);
  for (const listener of commandTaskListeners) {
    listener(snapshot);
  }
}

function toCommandTaskSnapshot(task: CommandTask): CommandTaskSnapshot {
  return {
    id: task.id,
    sessionId: task.sessionId,
    command: task.cmd,
    kind: task.kind ?? "background",
    status: task.status,
    outputPreview:
      task.output.length > 2000 ? task.output.slice(-2000) : task.output,
    exitCode: task.exitCode,
    startedAt: task.startedAt,
    completedAt: task.completedAt,
    updatedAt: task.updatedAt,
    cwd: task.cwd,
  };
}

export function restoreCommandTaskSnapshots(
  tasks: CommandTaskSnapshot[],
) {
  for (const snapshot of tasks) {
    const status =
      snapshot.status === "running" ? "interrupted" : snapshot.status;
    const restored: CommandTask = {
      id: snapshot.id,
      sessionId: snapshot.sessionId,
      cmd: snapshot.command,
      cwd: snapshot.cwd || vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || "",
      kind: snapshot.kind ?? "background",
      status,
      output: snapshot.outputPreview || "",
      exitCode: snapshot.exitCode,
      startedAt: snapshot.startedAt,
      completedAt: snapshot.completedAt,
      updatedAt: snapshot.updatedAt,
    };

    commandTasks.set(restored.id, restored);
  }
  pruneCommandTasks();
}

export function subscribeToCommandTasks(
  listener: (task: CommandTaskSnapshot) => void,
): vscode.Disposable {
  commandTaskListeners.add(listener);
  return new vscode.Disposable(() => {
    commandTaskListeners.delete(listener);
  });
}

function runCommandInBackground(
  sessionId: string,
  cmd: string,
  cwd: string,
  outputChannel: vscode.OutputChannel,
  taskId: string,
): CommandTask {
  const task: CommandTask = {
    id: taskId,
    sessionId,
    cmd,
    cwd,
    kind: "background",
    status: "running",
    output: "",
    startedAt: Date.now(),
    updatedAt: Date.now(),
  };

  outputChannel.appendLine(`▶ [${taskId}] Background: ${cmd}`);
  emitCommandTask(task);
  const proc = child_process.spawn("sh", ["-c", cmd], {
    cwd,
    env: { ...process.env, TERM: "dumb" },
  });
  task.proc = proc;

  proc.stdout?.on("data", (data: Buffer) => {
    const chunk = data.toString();
    task.output += chunk;
    task.updatedAt = Date.now();
    outputChannel.append(chunk);
    emitCommandTask(task);
  });

  proc.stderr?.on("data", (data: Buffer) => {
    const chunk = data.toString();
    task.output += chunk;
    task.updatedAt = Date.now();
    outputChannel.append(chunk);
    emitCommandTask(task);
  });

  proc.on("close", (code) => {
    if (task.status === "cancelled") {
      task.exitCode = code ?? 130;
      task.completedAt = Date.now();
      task.updatedAt = Date.now();
      outputChannel.appendLine(`▶ [${taskId}] Cancelled`);
      pruneCommandTasks();
      emitCommandTask(task);
      return;
    }
    task.exitCode = code ?? 1;
    task.status = code === 0 ? "completed" : "failed";
    task.completedAt = Date.now();
    task.updatedAt = Date.now();
    outputChannel.appendLine(`▶ [${taskId}] Exit code: ${code}`);
    pruneCommandTasks();
    emitCommandTask(task);
    void vscode.window.showInformationMessage(
      `Background command ${task.status}: ${cmd.slice(0, 50)}`,
    );
  });

  proc.on("error", (err) => {
    task.status = "failed";
    task.output += `\nError: ${err.message}`;
    task.completedAt = Date.now();
    task.updatedAt = Date.now();
    emitCommandTask(task);
  });

  return task;
}

export function startBackgroundCommand(
  sessionId: string,
  cmd: string,
  cwd: string,
  outputChannel: vscode.OutputChannel,
) {
  const taskId = `bg_${Date.now().toString(36)}`;
  const task = runCommandInBackground(sessionId, cmd, cwd, outputChannel, taskId);
  commandTasks.set(taskId, task);
  return taskId;
}

export function checkCommandTask(taskId: string): string {
  const task = commandTasks.get(taskId);
  if (!task) return `No background task found with id: ${taskId}`;

  const output =
    task.output.length > 5000
      ? task.output.slice(-5000) + "\n... [showing last 5000 chars]"
      : task.output;

  const note =
    task.status === "interrupted"
      ? "\nNote: This task was still running before PocketAI reloaded, so it is preserved as interrupted history."
      : "";

  return `Background task ${taskId} (${task.status}):\nCommand: \`${task.cmd}\`${task.cwd ? `\nCwd: \`${task.cwd}\`` : ""}${task.exitCode !== undefined ? `\nExit code: ${task.exitCode}` : ""}${note}\n\`\`\`\n${output}\n\`\`\``;
}

export function cancelCommandTask(
  taskId: string,
): string {
  const task = commandTasks.get(taskId);
  if (!task) return `No background task found with id: ${taskId}`;
  if (task.status !== "running" || !task.proc) {
    return `Background task ${taskId} is not currently running.`;
  }

  task.status = "cancelled";
  task.output += `${task.output ? "\n" : ""}[Cancelled by user]`;
  task.updatedAt = Date.now();
  emitCommandTask(task);

  try {
    task.proc.kill("SIGTERM");
    setTimeout(() => {
      if (task.proc && task.status === "cancelled") {
        try {
          task.proc.kill("SIGKILL");
        } catch {}
      }
    }, 1500);
    return `Cancellation requested for background task ${taskId}.`;
  } catch (error) {
    task.status = "failed";
    task.output += `\n[Cancellation error: ${(error as Error).message}]`;
    task.updatedAt = Date.now();
    emitCommandTask(task);
    return `Failed to cancel background task ${taskId}: ${(error as Error).message}`;
  }
}

export function rerunCommandTask(
  taskId: string,
  outputChannel: vscode.OutputChannel,
): string {
  const task = commandTasks.get(taskId);
  if (!task) return `No background task found with id: ${taskId}`;
  if (task.status === "running") {
    return `Background task ${taskId} is still running. Cancel it before rerunning.`;
  }

  const nextTaskId = startBackgroundCommand(
    task.sessionId,
    task.cmd,
    task.cwd,
    outputChannel,
  );
  return `Reran background task ${taskId} as ${nextTaskId}: \`${task.cmd}\``;
}

export function removeCommandTasks(taskIds: string[]): number {
  let removed = 0;
  for (const taskId of taskIds) {
    if (commandTasks.delete(taskId)) {
      removed += 1;
    }
  }
  return removed;
}

export function runCommandWithStreaming(
  cmd: string,
  cwd: string,
  outputChannel: vscode.OutputChannel,
  timeoutMs = 120000,
): Promise<string> {
  return new Promise((resolve, reject) => {
    outputChannel.appendLine(`▶ Running: ${cmd}`);
    const proc = child_process.spawn("sh", ["-c", cmd], {
      cwd,
      env: { ...process.env, TERM: "dumb" },
    });

    let stdout = "";
    let stderr = "";
    const maxBuffer = 2 * 1024 * 1024;

    proc.stdout?.on("data", (data: Buffer) => {
      const chunk = data.toString();
      if (stdout.length < maxBuffer) {
        stdout += chunk;
        outputChannel.append(chunk);
      }
    });

    proc.stderr?.on("data", (data: Buffer) => {
      const chunk = data.toString();
      if (stderr.length < maxBuffer) {
        stderr += chunk;
        outputChannel.append(chunk);
      }
    });

    const timeout = setTimeout(() => {
      proc.kill("SIGTERM");
      reject({
        message: `Command timed out after ${timeoutMs / 1000}s: ${cmd}`,
        stderr,
        stdout,
      });
    }, timeoutMs);

    proc.on("close", (code) => {
      clearTimeout(timeout);
      outputChannel.appendLine(`▶ Exit code: ${code}`);
      if (code === 0) {
        resolve(stdout);
      } else {
        reject({ message: `Exit code ${code}`, stderr, stdout });
      }
    });

    proc.on("error", (err) => {
      clearTimeout(timeout);
      reject({ message: err.message, stderr, stdout });
    });
  });
}
