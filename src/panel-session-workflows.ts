export function bindPanelToSession<K>(
  bindings: Map<K, string>,
  panel: K,
  sessionId: string,
  existingSessionIds: Iterable<string>,
): boolean {
  const validSessionIds = new Set(existingSessionIds);
  if (!validSessionIds.has(sessionId)) {
    return false;
  }

  bindings.set(panel, sessionId);
  return true;
}

export function rebindDeletedSessionPanels<K>(
  bindings: Map<K, string>,
  deletedSessionId: string,
  fallbackSessionId: string,
): K[] {
  const reboundPanels: K[] = [];
  for (const [panel, sessionId] of bindings.entries()) {
    if (sessionId !== deletedSessionId) continue;
    bindings.set(panel, fallbackSessionId);
    reboundPanels.push(panel);
  }
  return reboundPanels;
}

export function getPanelsBoundToSession<K>(
  bindings: Map<K, string>,
  sessionId: string,
): K[] {
  const panels: K[] = [];
  for (const [panel, boundSessionId] of bindings.entries()) {
    if (boundSessionId === sessionId) {
      panels.push(panel);
    }
  }
  return panels;
}
