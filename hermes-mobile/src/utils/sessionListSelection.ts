import type { HermesSession } from '../types/chat';
import type { ChatProjectState } from '../types/chatProject';
import { pickDefaultSession } from './sessionSelection';
import { isMegaSessionSendBlocked } from './sessionTokenGuards';

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

/** Sessions at BLOCK (≥800k) trap the composer — never auto-restore them. */
function isSendableSession(session: HermesSession | null | undefined): session is HermesSession {
  return Boolean(session) && !isMegaSessionSendBlocked(session);
}

function findById(sessions: HermesSession[], id: string | null | undefined): HermesSession | null {
  if (!id) {
    return null;
  }
  return sessions.find((session) => session.id === id) ?? null;
}

function firstSendableAmong(sessions: HermesSession[]): HermesSession | null {
  for (const session of sessions) {
    if (isSendableSession(session)) {
      return session;
    }
  }
  return null;
}

/**
 * Pick the session to activate after listSessions completes.
 * Returns `undefined` when React state should not change (already on target).
 * Returns `null` to clear current session (New chat) — including when the active
 * or remembered thread is mega-session hard-blocked (≥800k tokens).
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
    const manual = findById(sessions, manualSelectSessionId);
    if (manual) {
      // Never land a list-refresh on a hard-blocked mega thread (composer dead).
      if (!isSendableSession(manual)) {
        return currentSessionId ? null : undefined;
      }
      return manual.id === currentSessionId ? undefined : manual;
    }
    // User tapped a recent thread before listSessions finished — never resurrect project binding.
    return undefined;
  }

  if (currentSessionId) {
    const current = findById(sessions, currentSessionId);
    if (current) {
      // Already trapped on a BLOCK session (e.g. cold restore of "make money today"):
      // clear to New chat so the composer is sendable again.
      if (!isSendableSession(current)) {
        return null;
      }
      return undefined;
    }
  }

  // New chat / clear-all: never resurrect a thread from project bindings or recency.
  if (skipAutoSelect) {
    return currentSessionId ? null : undefined;
  }

  let nextSession: HermesSession | null = null;

  if (rememberedSessionId) {
    const remembered = findById(sessions, rememberedSessionId);
    if (isSendableSession(remembered)) {
      nextSession = remembered;
    }
    // Remembered mega BLOCK or missing → leave null and try project / default.
  }

  if (!nextSession && projectState.activeProjectId) {
    const project = projectState.projects.find((p) => p.id === projectState.activeProjectId);
    const preferredId = project?.activeSessionId ?? project?.sessionIds[0];
    const preferred = findById(sessions, preferredId);
    if (isSendableSession(preferred)) {
      nextSession = preferred;
    }
    // Preferred mega or missing → leave null (preserve prior "vanished → clear" behavior
    // unless selectLatest / no current triggers default below).
  }

  if (!nextSession && sessions.length > 0) {
    if (selectLatest || !currentSessionId) {
      const picked = pickDefaultSession(sessions, projectState) ?? sessions[0] ?? null;
      nextSession = isSendableSession(picked) ? picked : firstSendableAmong(sessions);
    }
  }

  if (!nextSession) {
    return currentSessionId ? null : undefined;
  }

  return nextSession.id === currentSessionId ? undefined : nextSession;
}
