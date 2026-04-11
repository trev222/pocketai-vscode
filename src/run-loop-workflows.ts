import type { ChatEntry } from "./types";

export function buildCancelledLoopOutcome(): {
  status: string;
  transcriptEntry: ChatEntry;
} {
  return {
    status: "Cancelled.",
    transcriptEntry: {
      role: "assistant",
      content: "_Request cancelled._",
    },
  };
}

export function buildFailedLoopOutcome(error: unknown): {
  status: string;
  transcriptEntry: ChatEntry;
} {
  const message = error instanceof Error ? error.message : "Request failed.";
  return {
    status: message,
    transcriptEntry: {
      role: "assistant",
      content: `**Error:** ${message}`,
    },
  };
}

export function getPostLoopReadyStatus(stoppedBecause?: string): string | undefined {
  return stoppedBecause !== "pending_approval" ? "Ready" : undefined;
}

export function shouldFinalizeCompletedLoop(stoppedBecause?: string): boolean {
  return stoppedBecause !== "pending_approval";
}
