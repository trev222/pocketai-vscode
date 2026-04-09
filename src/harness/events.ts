import type { HarnessEvent, HarnessEventType } from "./types";

export type HarnessEventSink = (event: HarnessEvent) => void;

export function emitHarnessEvent(
  sink: HarnessEventSink | undefined,
  event: HarnessEvent,
) {
  sink?.(event);
}

export function createHarnessEvent(
  sessionId: string,
  type: HarnessEventType,
  extras: Omit<HarnessEvent, "sessionId" | "type"> = {},
): HarnessEvent {
  return {
    sessionId,
    type,
    ...extras,
  };
}
