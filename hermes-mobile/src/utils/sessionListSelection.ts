import type { HermesSession } from '../types/chat';
import type { ChatProjectState } from '../types/chatProject';
import { shouldClearMissingCurrentSession } from './disconnectMessagePreserve';
import { pickDefaultSession } from './sessionSelection';
import { isUnsendableChatSession } from './sessionSendTarget';
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

/**
 * Guarantee the actively-open session survives a Threads-list display filter
 * (hide cron, hide automation, dismissed ids). Those filters are recents-list
 * preferences, not a statement that the open thread stopped existing — but
 * `resolveSessionAfterListLoad` treats "current id missing from `sessions`" as
 * "the thread is gone" and falls back to remembered/project/latest selection.
 * Without this, any refresh (reconnect, transport switch) that re-applies
 * "hide cron after Clear all" drops the open cron/scheduled-job thread from
 * the filtered list, and the user is silently bounced to a different thread —
 * indistinguishable from their messages having been erased.
 */
export function ensureCurrentSessionSelectable(
  filteredSessions: HermesSession[],
  allSessions: HermesSession[],
  currentSessionId: string | null | undefined,
): HermesSession[] {
  if (!currentSessionId || filteredSessions.some((session) => session.id === currentSessionId)) {
    return filteredSessions;
  }
  const openSession = allSessions.find((session) => session.id === currentSessionId);
  return openSession ? [openSession, ...filteredSessions] : filteredSessions;
}

/**
 * Sessions safe to open for reading after reconnect/remount.
 * Mega-blocked threads ARE restorable (user can read; Send still hard-gates
 * Start fresh). Cron / automation stickies stay excluded.
 */
export function findReadableSession(
  sessions: HermesSession[],
  sessionId: string | null | undefined,
): HermesSession | null {
  if (!sessionId) {
    return null;
  }
  const match = sessions.find((session) => session.id === sessionId) ?? null;
  if (!match || isUnsendableChatSession(match)) {
    return null;
  }
  return match;
}

/** Prefer a non-mega thread when inventing a default; fall back to any readable. */
function findPreferredDefaultSession(
  sessions: HermesSession[],
  projectState: ChatProjectState,
): HermesSession | null {
  const picked = pickDefaultSession(sessions, projectState) ?? sessions[0] ?? null;
  if (picked && !isUnsendableChatSession(picked) && !isMegaSessionSendBlocked(picked)) {
    return picked;
  }
  const nonMega = sessions.find(
    (session) => !isUnsendableChatSession(session) && !isMegaSessionSendBlocked(session),
  );
  if (nonMega) {
    return nonMega;
  }
  return sessions.find((session) => !isUnsendableChatSession(session)) ?? null;
}

/**
 * Pick the session to activate after listSessions completes.
 * Returns `undefined` when React state should not change (already on target).
 *
 * Remembered last-session (incl. mega-blocked) restores for reading after
 * reconnect/remount. Send remains blocked by mega send gates + banner.
 * Cron/automation stickies never auto-bind.
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
    const manual = findReadableSession(sessions, manualSelectSessionId);
    if (manual) {
      return manual.id === currentSessionId ? undefined : manual;
    }
    // User tapped a recent thread before listSessions finished — never resurrect project binding.
    return undefined;
  }

  if (currentSessionId) {
    const current = sessions.find((session) => session.id === currentSessionId);
    if (current) {
      // Keep the open thread (banner / Start fresh handle mega UX).
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

  // Prefer the last open thread on this Mac — including mega (read + Start fresh CTA).
  nextSession = findReadableSession(sessions, rememberedSessionId);

  if (projectState.activeProjectId) {
    const project = projectState.projects.find((p) => p.id === projectState.activeProjectId);
    const preferredId = project?.activeSessionId ?? project?.sessionIds[0];
    if (!nextSession) {
      nextSession = findReadableSession(sessions, preferredId);
    }
  }

  if (!nextSession && sessions.length > 0) {
    if (selectLatest || !currentSessionId) {
      nextSession = findPreferredDefaultSession(sessions, projectState);
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
    if (selectLatest || !currentSessionId) {
      return null;
    }
    return undefined;
  }

  return nextSession.id === currentSessionId ? undefined : nextSession;
}
