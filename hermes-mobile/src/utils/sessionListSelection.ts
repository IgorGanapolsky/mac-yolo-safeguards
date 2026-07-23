import type { HermesSession } from '../types/chat';
import type { ChatProjectState } from '../types/chatProject';
import { shouldClearMissingCurrentSession } from './disconnectMessagePreserve';
import { pickSessionAfterComputerSwitch } from './profileSwitchSessionRestore';
import { pickDefaultSession } from './sessionSelection';
import { isSendableChatSession } from './sessionSendTarget';
import { isMegaSessionSendBlocked } from './sessionTokenGuards';

export type SessionListSelectionInput = {
  sessions: HermesSession[];
  projectState: ChatProjectState;
  currentSessionId?: string | null;
  /** User tapped a recent thread — must win over stale project bindings. */
  manualSelectSessionId?: string | null;
  /** Last selected session for the active saved computer/profile. */
  rememberedSessionId?: string | null;
  /**
   * Continuity handoff previousSessionId — true-resume when still sendable.
   * Never used when that id is mega-blocked (compose-first + inject instead).
   */
  continuityPreviousSessionId?: string | null;
  /**
   * True after intentional Choose-computer switch. Skips global continuity
   * previousSessionId (belongs to the other Mac) and always prefers this
   * machine's remembered / newest sendable thread.
   */
  machineSwitch?: boolean;
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

function findNonMegaSession(
  sessions: HermesSession[],
  sessionId: string | null | undefined,
): HermesSession | null {
  if (!sessionId) {
    return null;
  }
  const match = sessions.find((session) => session.id === sessionId) ?? null;
  if (!match || isMegaSessionSendBlocked(match) || !isSendableChatSession(match)) {
    return null;
  }
  return match;
}

/**
 * Pick the session to activate after listSessions completes.
 * Returns `undefined` when React state should not change (already on target).
 * Never auto-restores a hard-blocked mega session after clear/relaunch.
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
    continuityPreviousSessionId,
    machineSwitch,
    skipAutoSelect,
    selectLatest,
  } = input;

  // Computer switch: always resolve a target-Mac thread (or compose-first).
  // Never reuse continuity previousSessionId from the Mac we just left.
  if (machineSwitch && !manualSelectSessionId && !skipAutoSelect) {
    const switched = pickSessionAfterComputerSwitch({
      sessions,
      rememberedSessionId,
      projectState,
    });
    if (!switched) {
      return null;
    }
    return switched.id === currentSessionId ? undefined : switched;
  }

  if (manualSelectSessionId) {
    const manual = sessions.find((session) => session.id === manualSelectSessionId);
    if (manual) {
      // Recents hard-gate forces Start fresh; do not bind the mega id here either.
      if (isMegaSessionSendBlocked(manual)) {
        return currentSessionId ? null : undefined;
      }
      return manual.id === currentSessionId ? undefined : manual;
    }
    // User tapped a recent thread before listSessions finished — never resurrect project binding.
    return undefined;
  }

  if (currentSessionId) {
    const current = sessions.find((session) => session.id === currentSessionId);
    if (current) {
      // Hard-blocked mega only: never sticky-trap (Send-disabled + too-large banner).
      // Cron / other open stickies still keep so list filters don't bounce the user.
      if (!isMegaSessionSendBlocked(current)) {
        return undefined;
      }
      // mega: fall through to non-mega remembered/project/default or compose-first.
    }
  }

  // New chat / clear-all: never resurrect a thread from project bindings or recency.
  if (skipAutoSelect) {
    return currentSessionId ? null : undefined;
  }

  // Sticky session missing from an empty/incomplete reconnect list — keep it.
  // Clearing here wiped the transcript while refresh was a no-op (false disconnect).
  // Exception: never keep a sticky mega-blocked id when it vanished from the list.
  if (
    currentSessionId &&
    !shouldClearMissingCurrentSession({
      sessionsLength: sessions.length,
      currentSessionId,
      skipAutoSelect,
    })
  ) {
    // Still leave poison mega stickies that vanished from a non-empty list.
    const sticky = sessions.find((session) => session.id === currentSessionId);
    if (sticky && isMegaSessionSendBlocked(sticky)) {
      // fall through
    } else {
      return undefined;
    }
  }

  let nextSession: HermesSession | null = null;

  // Continuity true-resume: prefer prior handoff thread when still sendable.
  nextSession = findNonMegaSession(sessions, continuityPreviousSessionId);

  if (!nextSession) {
    nextSession = findNonMegaSession(sessions, rememberedSessionId);
  }

  if (projectState.activeProjectId) {
    const project = projectState.projects.find((p) => p.id === projectState.activeProjectId);
    const preferredId = project?.activeSessionId ?? project?.sessionIds[0];
    if (!nextSession) {
      nextSession = findNonMegaSession(sessions, preferredId);
    }
  }

  const leavingMegaSticky = Boolean(
    currentSessionId &&
      sessions.some(
        (session) =>
          session.id === currentSessionId && isMegaSessionSendBlocked(session),
      ),
  );

  if (!nextSession && sessions.length > 0) {
    // Also pick when abandoning a hard-blocked mega sticky (selectLatest may be false
    // on silent refresh — still must not leave the user Send-disabled).
    if (selectLatest || !currentSessionId || leavingMegaSticky) {
      const picked = pickDefaultSession(sessions, projectState) ?? sessions[0];
      nextSession = picked && !isMegaSessionSendBlocked(picked) ? picked : null;
      if (!nextSession) {
        nextSession =
          sessions.find((session) => !isMegaSessionSendBlocked(session)) ?? null;
      }
    }
  }

  if (!nextSession) {
    // Current id missing from a non-empty list → real delete; otherwise keep sticky.
    // Also open empty chat when every candidate is mega-blocked / leaving mega sticky.
    if (
      leavingMegaSticky ||
      (currentSessionId &&
        shouldClearMissingCurrentSession({
          sessionsLength: sessions.length,
          currentSessionId,
        }))
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
