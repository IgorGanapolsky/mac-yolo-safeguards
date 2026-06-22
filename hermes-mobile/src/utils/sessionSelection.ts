import type { HermesSession } from '../types/chat';
import type { ChatProjectState } from '../types/chatProject';
import { buildTelegramInboxSession, TELEGRAM_INBOX_SESSION_ID } from '../services/telegramInbox';
import { isGatewaySmokeTestMessage } from './gatewaySmokeMessages';
import { parseGatewayTimestamp, sessionLastActiveValue } from './sessionDisplay';

export type SessionPickerSection = {
  key: string;
  title: string;
  data: HermesSession[];
};

export function buildSessionPickerSections(sessions: HermesSession[]): SessionPickerSection[] {
  const inbox = sessions.find((s) => s.id === TELEGRAM_INBOX_SESSION_ID);
  const telegram = sortSessionsByRecency(sessions.filter(isTelegramSession));
  const others = sortSessionsByRecency(
    sessions.filter(
      (s) =>
        s.id !== TELEGRAM_INBOX_SESSION_ID &&
        !isTelegramSession(s) &&
        isUserFacingSession(s) &&
        !isSmokeProbeSession(s),
    ),
  );
  const smoke = sessions.filter(isSmokeProbeSession);

  const sections: SessionPickerSection[] = [];
  if (inbox) {
    sections.push({ key: 'telegram-inbox', title: 'Telegram overview', data: [inbox] });
  }
  if (telegram.length > 0) {
    sections.push({ key: 'telegram-threads', title: 'Telegram threads', data: telegram });
  }
  if (others.length > 0) {
    sections.push({ key: 'chat', title: 'Chat sessions', data: others });
  }
  if (smoke.length > 0) {
    sections.push({ key: 'smoke', title: 'Smoke / debug', data: smoke });
  }
  return sections;
}

export function isSmokeProbeSession(session: HermesSession): boolean {
  const haystack = `${session.title ?? ''} ${session.preview ?? ''}`.trim();
  if (!haystack) {
    return false;
  }
  return isGatewaySmokeTestMessage(haystack);
}

export function isUserFacingSession(session: HermesSession): boolean {
  if (session.id === buildTelegramInboxSession().id) {
    return true;
  }
  return !isSmokeProbeSession(session);
}

export function partitionSessionsForPicker(sessions: HermesSession[]): {
  userFacing: HermesSession[];
  smoke: HermesSession[];
} {
  const userFacing: HermesSession[] = [];
  const smoke: HermesSession[] = [];
  for (const session of sessions) {
    if (isSmokeProbeSession(session)) {
      smoke.push(session);
    } else {
      userFacing.push(session);
    }
  }
  return { userFacing, smoke };
}

/** Sessions created from Hermes Mobile (not CLI/Telegram smoke probes). */
export function isMobileChatSession(session: HermesSession): boolean {
  const haystack = `${session.title ?? ''} ${session.source ?? ''}`.toLowerCase();
  return haystack.includes('hermes mobile') || haystack.includes('mobile session');
}

export function pickPrimaryTelegramSession(sessions: HermesSession[]): HermesSession | null {
  const telegramSessions = sortSessionsByRecency(sessions.filter(isTelegramSession));
  return telegramSessions[0] ?? null;
}

export function isTelegramSession(session: HermesSession | null | undefined): boolean {
  if (!session) {
    return false;
  }
  if (session.id === '__telegram_inbox__') {
    return false;
  }
  const source = session.source?.toLowerCase() ?? '';
  return source.includes('telegram');
}

export function sessionLastActiveMs(session: HermesSession): number {
  const date = parseGatewayTimestamp(sessionLastActiveValue(session));
  return date?.getTime() ?? 0;
}

export function sortSessionsByRecency(sessions: HermesSession[]): HermesSession[] {
  return [...sessions].sort((a, b) => sessionLastActiveMs(b) - sessionLastActiveMs(a));
}

export function sortSessionsForPicker(
  sessions: HermesSession[],
  projectState: ChatProjectState,
): HermesSession[] {
  const projectId = projectState.activeProjectId;
  const boundIds = new Set(
    projectId
      ? (projectState.projects.find((p) => p.id === projectId)?.sessionIds ?? [])
      : [],
  );

  return sortSessionsByRecency(sessions).sort((a, b) => {
    const aMobile = isMobileChatSession(a) ? 1 : 0;
    const bMobile = isMobileChatSession(b) ? 1 : 0;
    if (aMobile !== bMobile) return bMobile - aMobile;

    const aSmoke = isSmokeProbeSession(a) ? 1 : 0;
    const bSmoke = isSmokeProbeSession(b) ? 1 : 0;
    if (aSmoke !== bSmoke) return aSmoke - bSmoke;

    const aTelegram = isTelegramSession(a) ? 1 : 0;
    const bTelegram = isTelegramSession(b) ? 1 : 0;
    if (aTelegram !== bTelegram) return bTelegram - aTelegram;

    const aBound = boundIds.has(a.id) ? 1 : 0;
    const bBound = boundIds.has(b.id) ? 1 : 0;
    if (aBound !== bBound) return bBound - aBound;

    return sessionLastActiveMs(b) - sessionLastActiveMs(a);
  });
}

export function pickDefaultSession(
  sessions: HermesSession[],
  projectState: ChatProjectState,
): HermesSession | null {
  if (sessions.length === 0) {
    return null;
  }

  if (projectState.activeProjectId) {
    const project = projectState.projects.find((p) => p.id === projectState.activeProjectId);
    const preferredId = project?.activeSessionId ?? project?.sessionIds[0];
    if (preferredId) {
      const bound = sessions.find((s) => s.id === preferredId);
      if (bound && isUserFacingSession(bound)) {
        return bound;
      }
    }
  }

  const nonTelegram = sessions.filter((s) => !isTelegramSession(s) && !isSmokeProbeSession(s));
  const mobileSessions = nonTelegram.filter(isMobileChatSession);
  if (mobileSessions.length > 0) {
    return sortSessionsByRecency(mobileSessions)[0];
  }
  if (nonTelegram.length > 0) {
    return sortSessionsByRecency(nonTelegram)[0];
  }

  const primaryTelegram = pickPrimaryTelegramSession(sessions);
  if (primaryTelegram) {
    return primaryTelegram;
  }

  const nonSmoke = sessions.filter(isUserFacingSession);
  return nonSmoke.length > 0 ? sortSessionsByRecency(nonSmoke)[0] : null;
}

export function sessionSourceLabel(session: HermesSession): string | null {
  if (session.id === '__telegram_inbox__') {
    return 'Telegram Inbox';
  }
  if (isTelegramSession(session)) {
    return 'Telegram';
  }
  const source = session.source?.trim();
  if (!source) {
    return null;
  }
  return source.toUpperCase();
}
