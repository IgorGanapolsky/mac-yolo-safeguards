import type { HermesSession } from '../types/chat';
import type { SessionContinuityHandoff } from './sessionContinuityHandoff';
import { isSendableChatSession } from './sessionSendTarget';
import { isMegaSessionSendBlocked } from './sessionTokenGuards';

/**
 * Product law (2026-07-23): "Continuing from last session" must never trap the
 * user on a hard-blocked mega thread (Send disabled + "too large" banner only).
 *
 * - If handoff.previousSessionId still exists and is sendable → true resume.
 * - If previous is mega/missing → compose-first + system_prompt inject (caller).
 * - Never return a mega-blocked session id as a resume target.
 */

export type ContinuityResumeDecision =
  | { action: 'resume_session'; session: HermesSession }
  | { action: 'compose_fresh_with_inject'; reason: 'mega_previous' | 'missing_previous' | 'no_previous_id' }
  | { action: 'none' };

export function findSendableSessionById(
  sessions: HermesSession[],
  sessionId: string | null | undefined,
): HermesSession | null {
  const id = sessionId?.trim();
  if (!id) {
    return null;
  }
  const match = sessions.find((session) => session.id === id) ?? null;
  if (!match || !isSendableChatSession(match)) {
    return null;
  }
  return match;
}

/**
 * Decide how continuity should bind after session list load / Start fresh.
 * Pure — no I/O. Callers inject handoff into system_prompt when composing fresh.
 */
export function resolveContinuityResumeDecision(input: {
  handoff: SessionContinuityHandoff | null | undefined;
  sessions: HermesSession[];
}): ContinuityResumeDecision {
  if (!input.handoff) {
    return { action: 'none' };
  }
  const prevId = input.handoff.previousSessionId?.trim();
  if (!prevId) {
    return { action: 'compose_fresh_with_inject', reason: 'no_previous_id' };
  }
  const match = input.sessions.find((session) => session.id === prevId);
  if (!match) {
    return { action: 'compose_fresh_with_inject', reason: 'missing_previous' };
  }
  if (isMegaSessionSendBlocked(match) || !isSendableChatSession(match)) {
    return { action: 'compose_fresh_with_inject', reason: 'mega_previous' };
  }
  return { action: 'resume_session', session: match };
}

/** True when the open thread is poison and continuity should leave it. */
export function shouldLeaveMegaSessionForContinuity(
  session: HermesSession | null | undefined,
): boolean {
  return isMegaSessionSendBlocked(session);
}
