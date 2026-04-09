import type { HarnessLoopSnapshot } from "./types";

export type HarnessErrorKind =
  | "context-pressure"
  | "transient"
  | "generic";

export type HarnessErrorClassification = {
  kind: HarnessErrorKind;
  message: string;
};

const CONTEXT_PATTERNS = [
  /maximum context/i,
  /context length/i,
  /context window/i,
  /too many tokens/i,
  /prompt is too long/i,
  /reduce (the )?length/i,
];

const TRANSIENT_PATTERNS = [
  /timed out/i,
  /\btimeout\b/i,
  /temporarily unavailable/i,
  /overloaded/i,
  /fetch failed/i,
  /econnreset/i,
  /socket hang up/i,
  /503/,
  /502/,
];

export function classifyHarnessError(error: unknown): HarnessErrorClassification {
  const message =
    error instanceof Error ? error.message : "Unknown harness error";

  if (CONTEXT_PATTERNS.some((pattern) => pattern.test(message))) {
    return { kind: "context-pressure", message };
  }

  if (TRANSIENT_PATTERNS.some((pattern) => pattern.test(message))) {
    return { kind: "transient", message };
  }

  return { kind: "generic", message };
}

export function canRecoverRepeatedToolLoop(loopState: HarnessLoopSnapshot) {
  return !loopState.repeatedToolRecoveryUsed;
}

export function canRecoverReadLoop(
  loopState: HarnessLoopSnapshot,
  filePath: string,
) {
  return !loopState.nudgedReadLoopFiles.has(filePath);
}

export function canCompactForContextRecovery(loopState: HarnessLoopSnapshot) {
  return loopState.contextCompactions < 2;
}
