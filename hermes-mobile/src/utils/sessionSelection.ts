import type { HermesSession } from '../types/chat';
import type { ChatProjectState } from '../types/chatProject';
import { buildTelegramInboxSession, TELEGRAM_INBOX_SESSION_ID } from '../services/telegramInbox';
import { isAutomationProbeText, isGatewaySmokeTestMessage } from './gatewaySmokeMessages';
import { parseGatewayTimestamp, sessionLastActiveValue } from './sessionDisplay';

export type SessionPickerSection = {
  key: string;
  title: string;
  data: HermesSession[];
};

export function buildSessionPickerSections(sessions: HermesSession[]): SessionPickerSection[] {
  const inbox = sessions.find((s) => s.id === TELEGRAM_INBOX_SESSION_ID);
  const threads = sortSessionsByRecency(
    sessions.filter(
      (s) =>
        s.id !== TELEGRAM_INBOX_SESSION_ID &&
        isUserFacingSession(s) &&
        !isAutomationProbeSession(s),
    ),
  );
  const smoke = sessions.filter(isAutomationProbeSession);

  const sections: SessionPickerSection[] = [];
  const threadList: HermesSession[] = [];
  if (inbox) {
    threadList.push(inbox);
  }
  threadList.push(...threads);
  if (threadList.length > 0) {
    sections.push({ key: 'threads', title: '', data: threadList });
  }
  if (smoke.length > 0) {
    sections.push({ key: 'smoke', title: 'Debug', data: smoke });
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

/** Session created by a non-interactive harness channel (API server or CLI). */
function isAutomationSourceSession(session: HermesSession): boolean {
  const source = session.source?.trim().toLowerCase() ?? '';
  if (source === 'api_server' || source === 'cli') {
    return true;
  }
  return /^api[-_]/i.test(session.id);
}

/**
 * Harness/automation probe session (guardrails "Reply with exactly: GUARDRAILS OK",
 * hostname/sysctl smoke, `api-…` ids). These get fresh ids every harness run, so
 * id-based dismissal can never keep them hidden — classify by source + content instead.
 * Genuine user chats keep normal previews and stay visible regardless of source.
 */
export function isAutomationProbeSession(session: HermesSession): boolean {
  if (isSmokeProbeSession(session)) {
    return true;
  }
  if (!isAutomationSourceSession(session) || isMobileChatSession(session)) {
    return false;
  }
  const title = session.title?.trim() ?? '';
  const preview = session.preview?.trim() ?? '';
  if (!title && !preview) {
    return false;
  }
  // Every present field must look like a probe — a real prompt in either keeps it visible.
  if (title && !isAutomationProbeText(title)) {
    return false;
  }
  if (preview && !isAutomationProbeText(preview)) {
    return false;
  }
  return true;
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

  const nonTelegram = sessions.filter(
    (s) =>
      !isTelegramSession(s) &&
      s.id !== TELEGRAM_INBOX_SESSION_ID &&
      !isSmokeProbeSession(s),
  );
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
    return 'Active Inbox';
  }
  if (isTelegramSession(session)) {
    return 'Active';
  }
  const source = session.source?.trim();
  if (!source) {
    return null;
  }
  return source.toUpperCase();
}
