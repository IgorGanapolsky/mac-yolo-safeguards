import AsyncStorage from '@react-native-async-storage/async-storage';
import type { HermesMessage } from '../types/chat';
import { isDeferredStreamPlaceholder } from './streamAssistantText';
import { hasUnsyncedLocalMessages } from './chatMessageMerge';

export const PENDING_OUTBOUND_STORAGE_KEY = 'hermes-mobile:pending_outbound_by_session';

/** Used when the user sends before a gateway session id exists. */
export const PENDING_NEW_SESSION_KEY = '__pending_new_session__';

export type PendingOutboundStatus = 'pending' | 'sent' | 'failed';

export type PendingOutboundSnapshot = {
  sessionId: string;
  messages: HermesMessage[];
  pinnedText: string | null;
  pinnedSentAt: string | null;
  pinnedStatus: PendingOutboundStatus;
  updatedAt: string;
};

type PendingOutboundMap = Record<string, PendingOutboundSnapshot>;

function normalizeSessionId(sessionId: string | null | undefined): string | null {
  const trimmed = sessionId?.trim();
  return trimmed ? trimmed : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function sanitizeMessage(raw: unknown): HermesMessage | null {
  if (!isRecord(raw)) {
    return null;
  }
  const role = typeof raw.role === 'string' ? raw.role : '';
  const content = typeof raw.content === 'string' ? raw.content : '';
  if (!role || !content.trim()) {
    return null;
  }
  const message: HermesMessage = {
    role,
    content,
  };
  if (typeof raw.id === 'string' && raw.id.trim()) {
    message.id = raw.id.trim();
  }
  if (typeof raw.created_at === 'string' && raw.created_at.trim()) {
    message.created_at = raw.created_at.trim();
  }
  if (raw.outboundStatus === 'pending' || raw.outboundStatus === 'sent' || raw.outboundStatus === 'failed') {
    message.outboundStatus = raw.outboundStatus;
  }
  if (typeof raw.outboundFailureReason === 'string' && raw.outboundFailureReason.trim()) {
    message.outboundFailureReason = raw.outboundFailureReason.trim();
  }
  return message;
}

function sanitizeSnapshot(sessionId: string, raw: unknown): PendingOutboundSnapshot | null {
  if (!isRecord(raw)) {
    return null;
  }
  const messagesRaw = Array.isArray(raw.messages) ? raw.messages : [];
  const messages = messagesRaw
    .map(sanitizeMessage)
    .filter((message): message is HermesMessage => Boolean(message));
  if (messages.length === 0) {
    return null;
  }
  const pinnedStatus =
    raw.pinnedStatus === 'pending' || raw.pinnedStatus === 'sent' || raw.pinnedStatus === 'failed'
      ? raw.pinnedStatus
      : 'pending';
  return {
    sessionId,
    messages,
    pinnedText: typeof raw.pinnedText === 'string' ? raw.pinnedText : null,
    pinnedSentAt: typeof raw.pinnedSentAt === 'string' ? raw.pinnedSentAt : null,
    pinnedStatus,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : new Date().toISOString(),
  };
}

async function loadPendingOutboundMap(): Promise<PendingOutboundMap> {
  try {
    const raw = await AsyncStorage.getItem(PENDING_OUTBOUND_STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw) as PendingOutboundMap;
    if (!parsed || typeof parsed !== 'object') {
      return {};
    }
    const next: PendingOutboundMap = {};
    for (const [key, value] of Object.entries(parsed)) {
      const snapshot = sanitizeSnapshot(key, value);
      if (snapshot) {
        next[key] = snapshot;
      }
    }
    return next;
  } catch (error) {
    console.warn('[hermes-mobile] loadPendingOutboundMap failed:', error);
    return {};
  }
}

async function writePendingOutboundMap(map: PendingOutboundMap): Promise<void> {
  if (Object.keys(map).length === 0) {
    await AsyncStorage.removeItem(PENDING_OUTBOUND_STORAGE_KEY);
    return;
  }
  await AsyncStorage.setItem(PENDING_OUTBOUND_STORAGE_KEY, JSON.stringify(map));
}

/** Prefer in-memory unsynced bubbles; otherwise use AsyncStorage remount snapshot. */
export function localSnapshotForRemountMerge(
  inMemory: HermesMessage[],
  persistedMessages: HermesMessage[] | null | undefined,
): HermesMessage[] {
  if (hasUnsyncedLocalMessages(inMemory)) {
    return inMemory;
  }
  if (persistedMessages && persistedMessages.length > 0) {
    return persistedMessages;
  }
  return inMemory;
}

export function buildPendingOutboundMessages(input: {
  userMessage: HermesMessage;
  assistantPlaceholder?: HermesMessage | null;
}): HermesMessage[] {
  const messages: HermesMessage[] = [input.userMessage];
  const assistant = input.assistantPlaceholder;
  if (
    assistant &&
    assistant.role?.toLowerCase() === 'assistant' &&
    (isDeferredStreamPlaceholder(assistant.content) || Boolean(assistant.content?.trim()))
  ) {
    messages.push(assistant);
  }
  return messages;
}

export function extractPersistableOutboundFromTranscript(
  messages: HermesMessage[],
): HermesMessage[] {
  const pendingUser = [...messages]
    .reverse()
    .find(
      (message) =>
        message.role?.toLowerCase() === 'user' &&
        (message.outboundStatus === 'pending' ||
          message.outboundStatus === 'failed' ||
          // optimistic ids are local-only until gateway ack
          (typeof message.id === 'string' && message.id.startsWith('user-'))),
    );
  if (!pendingUser?.content?.trim()) {
    return [];
  }
  const lastUserIndex = messages.lastIndexOf(pendingUser);
  const assistant = messages
    .slice(lastUserIndex + 1)
    .find(
      (message) =>
        message.role?.toLowerCase() === 'assistant' &&
        isDeferredStreamPlaceholder(message.content),
    );
  return buildPendingOutboundMessages({
    userMessage: pendingUser,
    assistantPlaceholder: assistant ?? null,
  });
}

export async function loadPendingOutbound(
  sessionId: string | null | undefined,
): Promise<PendingOutboundSnapshot | null> {
  const id = normalizeSessionId(sessionId);
  if (!id) {
    return null;
  }
  const map = await loadPendingOutboundMap();
  return map[id] ?? null;
}

export async function savePendingOutbound(
  sessionId: string | null | undefined,
  input: {
    messages: HermesMessage[];
    pinnedText?: string | null;
    pinnedSentAt?: string | null;
    pinnedStatus?: PendingOutboundStatus;
  },
): Promise<void> {
  const id = normalizeSessionId(sessionId) ?? PENDING_NEW_SESSION_KEY;
  const messages = input.messages.filter((message) => Boolean(message.content?.trim()));
  if (messages.length === 0) {
    await clearPendingOutbound(id);
    return;
  }
  try {
    const map = await loadPendingOutboundMap();
    map[id] = {
      sessionId: id,
      messages,
      pinnedText: input.pinnedText?.trim() ? input.pinnedText.trim() : null,
      pinnedSentAt: input.pinnedSentAt?.trim() ? input.pinnedSentAt.trim() : null,
      pinnedStatus: input.pinnedStatus ?? 'pending',
      updatedAt: new Date().toISOString(),
    };
    await writePendingOutboundMap(map);
  } catch (error) {
    console.warn('[hermes-mobile] savePendingOutbound failed:', error);
  }
}

export async function clearPendingOutbound(sessionId: string | null | undefined): Promise<void> {
  const id = normalizeSessionId(sessionId);
  if (!id) {
    return;
  }
  try {
    const map = await loadPendingOutboundMap();
    if (!map[id]) {
      return;
    }
    delete map[id];
    await writePendingOutboundMap(map);
  } catch (error) {
    console.warn('[hermes-mobile] clearPendingOutbound failed:', error);
  }
}

export async function migratePendingOutbound(
  fromSessionId: string | null | undefined,
  toSessionId: string | null | undefined,
): Promise<PendingOutboundSnapshot | null> {
  const fromId = normalizeSessionId(fromSessionId);
  const toId = normalizeSessionId(toSessionId);
  if (!fromId || !toId || fromId === toId) {
    return toId ? loadPendingOutbound(toId) : null;
  }
  try {
    const map = await loadPendingOutboundMap();
    const existing = map[fromId];
    if (!existing) {
      return map[toId] ?? null;
    }
    map[toId] = {
      ...existing,
      sessionId: toId,
      updatedAt: new Date().toISOString(),
    };
    delete map[fromId];
    await writePendingOutboundMap(map);
    return map[toId];
  } catch (error) {
    console.warn('[hermes-mobile] migratePendingOutbound failed:', error);
    return null;
  }
}

/**
 * Drop persisted outbound only after the gateway has the user turn AND a real
 * assistant reply (not the still-running stub). Keeps the prompt visible across
 * remounts while the Mac is still working.
 */
export function shouldClearPersistedOutbound(
  serverMessages: HermesMessage[],
  persistedMessages: HermesMessage[],
): boolean {
  const pendingUser = persistedMessages.find(
    (message) => message.role?.toLowerCase() === 'user' && Boolean(message.content?.trim()),
  );
  if (!pendingUser) {
    return true;
  }
  const body = pendingUser.content.trim().toLowerCase();
  for (let index = serverMessages.length - 1; index >= 0; index -= 1) {
    const message = serverMessages[index];
    if (message.role?.toLowerCase() !== 'user') {
      continue;
    }
    if ((message.content ?? '').trim().toLowerCase() !== body) {
      return false;
    }
    return serverMessages.slice(index + 1).some(
      (candidate) =>
        candidate.role?.toLowerCase() === 'assistant' &&
        Boolean(candidate.content?.trim()) &&
        !isDeferredStreamPlaceholder(candidate.content),
    );
  }
  return false;
}
