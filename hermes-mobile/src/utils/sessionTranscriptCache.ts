import AsyncStorage from '@react-native-async-storage/async-storage';
import type { HermesMessage } from '../types/chat';
import { mergeServerMessagesWithPending } from './chatMessageMerge';

/** Local last-known transcript so resume after phone-call/background never blanks. */
export const SESSION_TRANSCRIPT_CACHE_KEY = 'hermes-mobile:session_transcript_cache_v1';

const MAX_MESSAGES_PER_SESSION = 60;
const MAX_CONTENT_CHARS = 8_000;
const MAX_SESSIONS = 12;

type TranscriptCacheMap = Record<
  string,
  {
    sessionId: string;
    messages: HermesMessage[];
    updatedAt: string;
  }
>;

function normalizeSessionId(sessionId: string | null | undefined): string | null {
  const trimmed = sessionId?.trim();
  return trimmed ? trimmed : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Full-screen "Fetching session history…" only when we truly have nothing to show.
 * In-memory, pending outbound, or last-known cache must win over a blank spinner.
 */
export function shouldShowFullScreenSessionLoading(input: {
  isLoadingMessages: boolean;
  messageCount: number;
}): boolean {
  return input.isLoadingMessages && input.messageCount <= 0;
}

/**
 * Soft-seed messages before / while listMessages runs (AppState resume, remount).
 * Prefer longer cached history and fold in any unsynced pending outbound bubbles.
 */
export function resolveResumeSeedMessages(
  cachedTranscript: readonly HermesMessage[] | null | undefined,
  persistedOutbound: readonly HermesMessage[] | null | undefined,
): HermesMessage[] {
  const cached = Array.isArray(cachedTranscript) ? [...cachedTranscript] : [];
  const pending = Array.isArray(persistedOutbound) ? [...persistedOutbound] : [];
  if (cached.length === 0) {
    return pending;
  }
  if (pending.length === 0) {
    return cached;
  }
  return mergeServerMessagesWithPending(cached, pending);
}

function slimMessage(raw: HermesMessage): HermesMessage | null {
  const role = typeof raw.role === 'string' ? raw.role : '';
  let content = typeof raw.content === 'string' ? raw.content : '';
  if (!role || !content.trim()) {
    return null;
  }
  if (content.startsWith('data:image')) {
    content = '[image]';
  } else if (content.length > MAX_CONTENT_CHARS) {
    content = `${content.slice(0, MAX_CONTENT_CHARS)}…`;
  }
  const message: HermesMessage = { role, content };
  if (typeof raw.id === 'string' && raw.id.trim()) {
    message.id = raw.id.trim();
  }
  if (typeof raw.created_at === 'string' && raw.created_at.trim()) {
    message.created_at = raw.created_at.trim();
  }
  if (
    raw.outboundStatus === 'pending' ||
    raw.outboundStatus === 'sent' ||
    raw.outboundStatus === 'failed'
  ) {
    message.outboundStatus = raw.outboundStatus;
  }
  if (typeof raw.outboundFailureReason === 'string' && raw.outboundFailureReason.trim()) {
    message.outboundFailureReason = raw.outboundFailureReason.trim();
  }
  return message;
}

export function slimTranscriptForCache(messages: readonly HermesMessage[]): HermesMessage[] {
  const slimmed = messages
    .map(slimMessage)
    .filter((message): message is HermesMessage => Boolean(message));
  if (slimmed.length <= MAX_MESSAGES_PER_SESSION) {
    return slimmed;
  }
  return slimmed.slice(-MAX_MESSAGES_PER_SESSION);
}

async function loadCacheMap(): Promise<TranscriptCacheMap> {
  try {
    const raw = await AsyncStorage.getItem(SESSION_TRANSCRIPT_CACHE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as TranscriptCacheMap;
    if (!parsed || typeof parsed !== 'object') {
      return {};
    }
    const next: TranscriptCacheMap = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (!isRecord(value) || !Array.isArray(value.messages)) {
        continue;
      }
      const messages = slimTranscriptForCache(value.messages as HermesMessage[]);
      if (messages.length === 0) {
        continue;
      }
      next[key] = {
        sessionId: key,
        messages,
        updatedAt:
          typeof value.updatedAt === 'string' && value.updatedAt.trim()
            ? value.updatedAt
            : new Date().toISOString(),
      };
    }
    return next;
  } catch (error) {
    console.warn('[hermes-mobile] loadSessionTranscriptCache failed:', error);
    return {};
  }
}

async function writeCacheMap(map: TranscriptCacheMap): Promise<void> {
  if (Object.keys(map).length === 0) {
    await AsyncStorage.removeItem(SESSION_TRANSCRIPT_CACHE_KEY);
    return;
  }
  // Keep the most recently updated sessions only.
  const entries = Object.entries(map).sort((a, b) =>
    (b[1].updatedAt || '').localeCompare(a[1].updatedAt || ''),
  );
  const pruned: TranscriptCacheMap = {};
  for (const [key, value] of entries.slice(0, MAX_SESSIONS)) {
    pruned[key] = value;
  }
  await AsyncStorage.setItem(SESSION_TRANSCRIPT_CACHE_KEY, JSON.stringify(pruned));
}

export async function loadSessionTranscriptCache(
  sessionId: string | null | undefined,
): Promise<HermesMessage[]> {
  const id = normalizeSessionId(sessionId);
  if (!id) {
    return [];
  }
  const map = await loadCacheMap();
  return map[id]?.messages ?? [];
}

export async function saveSessionTranscriptCache(
  sessionId: string | null | undefined,
  messages: readonly HermesMessage[],
): Promise<void> {
  const id = normalizeSessionId(sessionId);
  if (!id) {
    return;
  }
  const slimmed = slimTranscriptForCache(messages);
  try {
    const map = await loadCacheMap();
    if (slimmed.length === 0) {
      delete map[id];
    } else {
      map[id] = {
        sessionId: id,
        messages: slimmed,
        updatedAt: new Date().toISOString(),
      };
    }
    await writeCacheMap(map);
  } catch (error) {
    console.warn('[hermes-mobile] saveSessionTranscriptCache failed:', error);
  }
}

export async function clearSessionTranscriptCache(
  sessionId: string | null | undefined,
): Promise<void> {
  const id = normalizeSessionId(sessionId);
  if (!id) {
    return;
  }
  try {
    const map = await loadCacheMap();
    if (!map[id]) {
      return;
    }
    delete map[id];
    await writeCacheMap(map);
  } catch (error) {
    console.warn('[hermes-mobile] clearSessionTranscriptCache failed:', error);
  }
}
