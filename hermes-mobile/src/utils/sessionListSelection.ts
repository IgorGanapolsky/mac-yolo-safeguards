import type { HermesSession } from '../types/chat';
import type { ChatProjectState } from '../types/chatProject';
import { pickDefaultSession } from './sessionSelection';

export type SessionListSelectionInput = {
  sessions: HermesSession[];
  projectState: ChatProjectState;
  currentSessionId?: string | null;
  /** User tapped a recent thread — must win over stale project bindings. */
  manualSelectSessionId?: string | null;
  skipAutoSelect?: boolean;
  selectLatest?: boolean;
};

/**
 * Pick the session to activate after listSessions completes.
 * Returns `undefined` when React state should not change (already on target).
 */
export function resolveSessionAfterListLoad(
  input: SessionListSelectionInput,
): HermesSession | null | undefined {
  const {
    sessions,
    projectState,
    currentSessionId,
    manualSelectSessionId,
    skipAutoSelect,
    selectLatest,
  } = input;

  if (manualSelectSessionId) {
    const manual = sessions.find((session) => session.id === manualSelectSessionId);
    if (manual) {
      return manual.id === currentSessionId ? undefined : manual;
    }
    // User tapped a recent thread before listSessions finished — never resurrect project binding.
    return undefined;
  }

  if (currentSessionId) {
    const current = sessions.find((session) => session.id === currentSessionId);
    if (current) {
      return undefined;
    }
  }

  // New chat / clear-all: never resurrect a thread from project bindings or recency.
  if (skipAutoSelect) {
    return currentSessionId ? null : undefined;
  }

  let nextSession: HermesSession | null = null;

  if (projectState.activeProjectId) {
    const project = projectState.projects.find((p) => p.id === projectState.activeProjectId);
    const preferredId = project?.activeSessionId ?? project?.sessionIds[0];
    if (preferredId) {
      nextSession = sessions.find((session) => session.id === preferredId) ?? null;
    }
  }

  if (!nextSession && sessions.length > 0) {
    if (selectLatest || !currentSessionId) {
      nextSession = pickDefaultSession(sessions, projectState) ?? sessions[0];
    }
  }

  if (!nextSession) {
    return currentSessionId ? null : undefined;
  }

  return nextSession.id === currentSessionId ? undefined : nextSession;
}
