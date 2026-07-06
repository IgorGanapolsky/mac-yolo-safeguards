import type { HermesSession } from '../types/chat';
import type { ChatProjectState } from '../types/chatProject';
import { pickDefaultSession } from './sessionSelection';
import { isAutomatedCronSession } from './sessionDisplay';

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

  let nextSession: HermesSession | null = null;

  // Never AUTO-open an automated scheduled/cron session — it's not a user
  // conversation. An overnight cron run is often the newest session, which
  // otherwise hijacks resume/reconnect and shows an empty "Good morning"
  // instead of the user's last real chat. Manual taps still open cron threads.
  const conversational = sessions.filter((session) => !isAutomatedCronSession(session));

  if (rememberedSessionId) {
    nextSession = conversational.find((session) => session.id === rememberedSessionId) ?? null;
  }

  if (projectState.activeProjectId) {
    const project = projectState.projects.find((p) => p.id === projectState.activeProjectId);
    const preferredId = project?.activeSessionId ?? project?.sessionIds[0];
    if (!nextSession && preferredId) {
      nextSession = conversational.find((session) => session.id === preferredId) ?? null;
    }
  }

  if (!nextSession && conversational.length > 0) {
    if (selectLatest || !currentSessionId) {
      nextSession = pickDefaultSession(conversational, projectState) ?? conversational[0];
    }
  }

  if (!nextSession) {
    return currentSessionId ? null : undefined;
  }

  return nextSession.id === currentSessionId ? undefined : nextSession;
}
