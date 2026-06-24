import { coerceMessageId } from '../utils/messageIds';
import { isMessageBodyEmpty } from '../utils/chatMessageMerge';
import type { HermesMessage, HermesSession } from '../types/chat';
import { isTelegramSession, sortSessionsByRecency } from '../utils/sessionSelection';
import { parseGatewayTimestamp, sessionDisplayTitle } from '../utils/sessionDisplay';
import {
  isHermesLiveStatusContent,
  prepareMessageForChatDisplay,
} from '../utils/chatMessageDisplay';
import { listMessages } from './hermesChatClient';

export type TelegramInboxFetchOptions = {
  maxSessions?: number;
  maxMessages?: number;
  /** Telegram shows user/assistant text — hide tool steps unless Ops-style debug. */
  includeToolActivity?: boolean;
  /** Show Hermes “Working — …” status lines from Telegram/gateway. */
  includeHermesStatus?: boolean;
};

export type TelegramInboxFetchResult = {
  messages: HermesMessage[];
  replySessionId: string;
  threadCount: number;
  messageCap: number;
};

/** Virtual session id — merged Telegram DM across gateway topic sessions. */
export const TELEGRAM_INBOX_SESSION_ID = '__telegram_inbox__';

export function buildTelegramInboxSession(): HermesSession {
  return {
    id: TELEGRAM_INBOX_SESSION_ID,
    source: 'telegram',
    title: 'Active — all threads',
    preview: 'Merged Hermes threads from your Mac (includes Telegram-linked sessions)',
    last_active_at: new Date().toISOString(),
  };
}

export function isTelegramInboxSession(session: HermesSession | null | undefined): boolean {
  return session?.id === TELEGRAM_INBOX_SESSION_ID;
}

function messageSortMs(message: HermesMessage, session: HermesSession, index: number): number {
  const parsed = parseGatewayTimestamp(message.created_at);
  if (parsed) {
    return parsed.getTime();
  }
  const sessionMs = parseGatewayTimestamp(session.last_active_at ?? session.last_active)?.getTime();
  return (sessionMs ?? 0) + index;
}

function shouldIncludeTelegramMessage(
  role: string,
  content: string,
  includeToolActivity: boolean,
  includeHermesStatus: boolean,
): boolean {
  if (includeHermesStatus && isHermesLiveStatusContent(content)) {
    return true;
  }
  if (includeToolActivity) {
    return /^(user|assistant|tool|function|tool_result|system)$/.test(role);
  }
  return role === 'user' || role === 'assistant';
}

/** Reply to the most recently active Telegram thread in the merged inbox. */
export function inferTelegramReplySessionId(
  _messages: HermesMessage[],
  scannedSessions: HermesSession[],
): string {
  return scannedSessions[0]?.id ?? '';
}

/** Pick a concrete gateway session id for replies from the merged inbox view. */
export function resolveTelegramInboxReplySessionId(sessions: HermesSession[]): string {
  const telegramSessions = sortSessionsByRecency(sessions.filter(isTelegramSession));
  return inferTelegramReplySessionId([], telegramSessions);
}

export async function fetchTelegramInboxMessages(
  gatewayUrl: string,
  sessions: HermesSession[],
  apiKey?: string | null,
  maxSessions = 20,
  maxMessages = 250,
  options?: TelegramInboxFetchOptions,
): Promise<TelegramInboxFetchResult> {
  const sessionCap = options?.maxSessions ?? maxSessions;
  const messageCap = options?.maxMessages ?? maxMessages;
  const includeToolActivity = options?.includeToolActivity ?? false;
  const includeHermesStatus = options?.includeHermesStatus ?? false;

  const telegramSessions = sortSessionsByRecency(sessions.filter(isTelegramSession));
  if (telegramSessions.length === 0) {
    return { messages: [], replySessionId: '', threadCount: 0, messageCap };
  }

  const merged: Array<{ message: HermesMessage; sortMs: number }> = [];
  const scannedThreads = telegramSessions.slice(0, sessionCap);

  const fetchResults = await Promise.all(
    scannedThreads.map(async (session) => {
      const threadLabel = sessionDisplayTitle(session);
      try {
        const history = await listMessages(gatewayUrl, session.id, apiKey);
        return { session, threadLabel, history };
      } catch (err) {
        console.warn(`Failed to fetch messages for session ${session.id}:`, err);
        return { session, threadLabel, history: [] as HermesMessage[] };
      }
    }),
  );

  for (const { session, threadLabel, history } of fetchResults) {
    history.forEach((message, index) => {
      const role = message.role?.toLowerCase() ?? '';
      const raw =
        typeof message.content === 'string' ? message.content : String(message.content ?? '');
      if (!shouldIncludeTelegramMessage(role, raw, includeToolActivity, includeHermesStatus)) {
        return;
      }
      const display = prepareMessageForChatDisplay(raw);
      merged.push({
        message: {
          ...message,
          id: `${session.id}:${coerceMessageId(message.id, index) ?? index}`,
          gatewayContent: raw,
          content: display.content,
          rawContent: display.rawContent,
          truncated: display.truncated,
          sourceSessionId: session.id,
          threadLabel,
        },
        sortMs: messageSortMs(message, session, index),
      });
    });
  }

  merged.sort((a, b) => a.sortMs - b.sortMs);
  const messages = merged
    .slice(-messageCap)
    .map((entry) => entry.message)
    .filter((message) => !isMessageBodyEmpty(message.content, message.rawContent));
  const resolvedReplySessionId = inferTelegramReplySessionId(messages, scannedThreads);
  return {
    messages,
    replySessionId: resolvedReplySessionId,
    threadCount: scannedThreads.length,
    messageCap,
  };
}
