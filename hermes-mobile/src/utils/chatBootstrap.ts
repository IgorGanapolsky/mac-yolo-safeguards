import type { HermesSession } from '../types/chat';
import { isMobileChatSession, isSmokeProbeSession, sortSessionsByRecency } from './sessionSelection';

/** Title for auto-created mobile chat sessions (zero manual session picker). */
export function buildMobileChatSessionTitle(): string {
  return `Hermes Mobile — ${new Date().toLocaleString([], {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })}`;
}

/** Pick an existing mobile session or signal that the app should create one. */
export function resolveMobileChatBootstrap(
  sessions: HermesSession[],
): { mode: 'use'; session: HermesSession } | { mode: 'create' } {
  const mobileSessions = sortSessionsByRecency(
    sessions.filter((session) => isMobileChatSession(session) && !isSmokeProbeSession(session)),
  );
  if (mobileSessions.length > 0) {
    return { mode: 'use', session: mobileSessions[0] };
  }

  // Phone chat should not open random CLI/Telegram gateway history — create a mobile session.
  return { mode: 'create' };
}
