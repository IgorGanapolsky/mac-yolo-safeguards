import type { HermesSession } from '../types/chat';
import { titleFromFirstPrompt } from './sessionDisplay';
import { isMegaSessionSendBlocked } from './sessionTokenGuards';

function normalizeTitle(title: string): string {
  return title
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .replace(/[.!?…]+$/u, '');
}

function sessionActivityMs(session: HermesSession): number {
  const candidates = [
    session.last_active_at,
    session.last_active,
    session.created_at,
    session.started_at,
  ];
  for (const value of candidates) {
    if (value == null || value === '') {
      continue;
    }
    if (typeof value === 'number') {
      const ms = value < 1e12 ? value * 1000 : value;
      if (Number.isFinite(ms)) {
        return ms;
      }
      continue;
    }
    const parsed = Date.parse(String(value));
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }
  return 0;
}

/**
 * Find an existing session whose title matches the first-prompt title derived
 * from `promptText`. Used when the user starts a "new chat" but re-sends the
 * same opening line — resume the prior thread instead of creating a duplicate
 * that collides on the gateway's globally-unique title constraint.
 */
export function findResumableSessionByPromptTitle(
  sessions: HermesSession[],
  promptText: string,
): HermesSession | null {
  const derived = titleFromFirstPrompt(promptText);
  if (!derived) {
    return null;
  }
  const target = normalizeTitle(derived);
  const matches = sessions.filter((session) => {
    // Never resume a hard-blocked mega thread — that re-traps "New chat" on poison.
    if (isMegaSessionSendBlocked(session)) {
      return false;
    }
    const title = session.title?.trim();
    if (!title) {
      return false;
    }
    return normalizeTitle(title) === target;
  });
  if (matches.length === 0) {
    return null;
  }
  return matches.reduce((best, candidate) =>
    sessionActivityMs(candidate) > sessionActivityMs(best) ? candidate : best,
  );
}
