import type { HermesSession } from '../types/chat';
import type { ChatProjectState } from '../types/chatProject';
import { shouldClearMissingCurrentSession } from './disconnectMessagePreserve';
import { pickDefaultSession } from './sessionSelection';

export type SessionListSelectionInput = {
  sessions: HermesSession[];
  projectState: ChatProjectState;
  currentSessionId?: string | null;
  /** User tapped a recent thread — must win over stale project bindings. */
  manualSelectSessionId?: string | null;
  /** Last selected session for the active saved computer/profile. */
  rememberedSessionId?: string | null;
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
    rememberedSessionId,
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

  // Sticky session missing from an empty/incomplete reconnect list — keep it.
  // Clearing here wiped the transcript while refresh was a no-op (false disconnect).
  if (
    currentSessionId &&
    !shouldClearMissingCurrentSession({
      sessionsLength: sessions.length,
      currentSessionId,
      skipAutoSelect,
    })
  ) {
    return undefined;
  }

  let nextSession: HermesSession | null = null;

  if (rememberedSessionId) {
    nextSession = sessions.find((session) => session.id === rememberedSessionId) ?? null;
  }

  if (projectState.activeProjectId) {
    const project = projectState.projects.find((p) => p.id === projectState.activeProjectId);
    const preferredId = project?.activeSessionId ?? project?.sessionIds[0];
    if (!nextSession && preferredId) {
      nextSession = sessions.find((session) => session.id === preferredId) ?? null;
    }
  }

  if (!nextSession && sessions.length > 0) {
    if (selectLatest || !currentSessionId) {
      nextSession = pickDefaultSession(sessions, projectState) ?? sessions[0];
    }
  }

  if (!nextSession) {
    // Current id missing from a non-empty list → real delete; otherwise keep sticky.
    if (
      currentSessionId &&
      shouldClearMissingCurrentSession({
        sessionsLength: sessions.length,
        currentSessionId,
      })
    ) {
      return null;
    }
    return undefined;
  }

  return nextSession.id === currentSessionId ? undefined : nextSession;
}
