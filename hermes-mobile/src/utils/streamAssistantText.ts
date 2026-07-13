import type { HermesMessage, HermesSession } from '../types/chat';
import { isSummarizationStub } from './chatCompactionHandoff';
import { isMessageDisplayEmpty, normalizeMessageText } from './chatMessageMerge';
import { isTelegramSession } from './sessionSelection';

/** Shown when gateway returns an empty stream for a Telegram-bound session (message queued). */
export const TELEGRAM_QUEUED_REPLY_PLACEHOLDER =
  'Message queued on this Hermes thread. Your computer may still be running tools from a prior turn — the reply will appear here when it finishes.';

export const GENERIC_EMPTY_STREAM_PLACEHOLDER =
  '(Hermes did not return text yet — still running on your computer.)';

export function isDeferredStreamPlaceholder(content: string | undefined): boolean {
  const body = content?.trim() ?? '';
  return (
    body === TELEGRAM_QUEUED_REPLY_PLACEHOLDER ||
    body === GENERIC_EMPTY_STREAM_PLACEHOLDER ||
    body.startsWith('(Hermes did not return text yet')
  );
}

export function extractAssistantFromRunCompletedPayload(data: Record<string, unknown>): string {
  const fromMessages = extractAssistantFromTranscriptMessages(data.messages);
  if (fromMessages) {
    return fromMessages;
  }
  for (const key of ['output', 'content', 'response'] as const) {
    const value = data[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return '';
}

export function extractAssistantFromTranscriptMessages(messages: unknown): string {
  if (!Array.isArray(messages)) {
    return '';
  }
  const parts: string[] = [];
  for (const raw of messages) {
    if (!raw || typeof raw !== 'object') {
      continue;
    }
    const msg = raw as { role?: string; content?: unknown };
    if (String(msg.role ?? '').toLowerCase() !== 'assistant') {
      continue;
    }
    const content = msg.content;
    if (typeof content === 'string' && content.trim()) {
      parts.push(content.trim());
    }
  }
  return parts.join('\n\n').trim();
}

export function isTelegramDeferredEmptyStream(
  session: HermesSession | null | undefined,
  assistantText: string,
): boolean {
  return isTelegramSession(session) && !assistantText.trim();
}

export function snapshotAssistantBodies(messages: HermesMessage[]): Set<string> {
  const bodies = new Set<string>();
  for (const message of messages) {
    if (message.role?.toLowerCase() !== 'assistant') {
      continue;
    }
    if (isMessageDisplayEmpty(message.content)) {
      continue;
    }
    if (isDeferredStreamPlaceholder(message.content)) {
      continue;
    }
    if (isSummarizationStub(message.content)) {
      continue;
    }
    bodies.add(normalizeMessageText(message.content));
  }
  return bodies;
}

/** First assistant bubble that appeared after send and was not in the pre-send snapshot. */
export function findNewAssistantReply(
  messages: HermesMessage[],
  priorBodies: Set<string>,
): string | null {
  for (const message of messages) {
    if (message.role?.toLowerCase() !== 'assistant') {
      continue;
    }
    if (isMessageDisplayEmpty(message.content)) {
      continue;
    }
    if (isDeferredStreamPlaceholder(message.content)) {
      continue;
    }
    if (isSummarizationStub(message.content)) {
      continue;
    }
    const body = normalizeMessageText(message.content);
    if (!priorBodies.has(body)) {
      return message.content.trim();
    }
  }
  return null;
}
