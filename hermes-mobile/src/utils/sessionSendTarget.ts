import type { HermesSession } from '../types/chat';
import type { ChatProjectState } from '../types/chatProject';
import { TELEGRAM_INBOX_SESSION_ID } from '../services/telegramInbox';
import {
  isAutomationProbeSession,
  isMobileChatSession,
  isTelegramSession,
  pickDefaultSession,
  sortSessionsByRecency,
} from './sessionSelection';
import { isAutomatedCronSession } from './sessionDisplay';
import { isMegaSessionSendBlocked } from './sessionTokenGuards';

/**
 * Sessions the phone must never stream into as the active chat target.
 * Cron / harness threads 404 or have zero user context — recovering into a
 * blank `history=0` session (titled from the follow-up) is the P0 continuity bug.
 */
export function isUnsendableChatSession(
  session: HermesSession | null | undefined,
): boolean {
  if (!session?.id?.trim()) {
    return true;
  }
  if (session.id === TELEGRAM_INBOX_SESSION_ID) {
    return false;
  }
  if (isAutomatedCronSession(session)) {
    return true;
  }
  if (isAutomationProbeSession(session)) {
    return true;
  }
  return false;
}

export function isSendableChatSession(
  session: HermesSession | null | undefined,
): boolean {
  if (!session?.id?.trim()) {
    return false;
  }
  if (isUnsendableChatSession(session)) {
    return false;
  }
  if (isMegaSessionSendBlocked(session)) {
    return false;
  }
  return true;
}

/**
 * After a sticky/target session 404s (deleted cron, gateway restart), prefer
 * resuming a real user-facing mobile thread over createSession(empty).
 */
export function pickResumeSessionAfterStaleTarget(input: {
  sessions: HermesSession[];
  staleSessionId?: string | null;
  rememberedSessionId?: string | null;
  projectState: ChatProjectState;
  removedSessionIds?: Iterable<string>;
}): HermesSession | null {
  const stale = input.staleSessionId?.trim() || null;
  const removed = new Set(
    [...(input.removedSessionIds ?? [])].map((id) => id.trim()).filter(Boolean),
  );
  if (stale) {
    removed.add(stale);
  }

  const candidates = input.sessions.filter(
    (session) =>
      !removed.has(session.id) &&
      isSendableChatSession(session) &&
      !isTelegramSession(session) &&
      session.id !== TELEGRAM_INBOX_SESSION_ID,
  );

  const remembered = input.rememberedSessionId?.trim();
  if (remembered) {
    const match = candidates.find((session) => session.id === remembered);
    if (match) {
      return match;
    }
  }

  const mobile = candidates.filter(isMobileChatSession);
  if (mobile.length > 0) {
    return sortSessionsByRecency(mobile)[0] ?? null;
  }

  const picked = pickDefaultSession(candidates, input.projectState);
  if (picked && isSendableChatSession(picked) && !isTelegramSession(picked)) {
    return picked;
  }

  return candidates.length > 0 ? sortSessionsByRecency(candidates)[0] ?? null : null;
}

export type StaleSessionRecoveryPlan =
  | { action: 'resume'; session: HermesSession }
  | { action: 'create_fresh' };

/**
 * Decide how to heal a missing/404 chat target.
 * Resume wins whenever a sendable mobile thread still exists on the Mac.
 */
export function planStaleSessionRecovery(input: {
  sessions: HermesSession[];
  staleSessionId?: string | null;
  rememberedSessionId?: string | null;
  projectState: ChatProjectState;
  removedSessionIds?: Iterable<string>;
}): StaleSessionRecoveryPlan {
  const resume = pickResumeSessionAfterStaleTarget(input);
  if (resume) {
    return { action: 'resume', session: resume };
  }
  return { action: 'create_fresh' };
}
