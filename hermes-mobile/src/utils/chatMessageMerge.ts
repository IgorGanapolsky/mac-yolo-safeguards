import type { HermesMessage } from '../types/chat';
import { coerceMessageId, idHasPrefix } from './messageIds';
import { dedupeToolDumpMessages } from './chatToolDump';
import { serverHasAssistantReplyAfterLastUser } from './emptyStreamReplyRecovery';
import { isDeferredStreamPlaceholder } from './streamAssistantText';

/** Normalize text so optimistic phone bubbles match gateway transcript formatting. */
export function normalizeMessageText(text: string): string {
  return text
    .normalize('NFKC')
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, '"')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

/** Strip invisible Unicode that gateways sometimes emit as “empty” assistant bodies. */
function stripInvisibleChars(text: string): string {
  return text
    .replace(/[\u200B-\u200D\uFEFF\u2060]/g, '')
    .replace(/\u00ad/g, ''); // soft hyphen
}

export function isMessageDisplayEmpty(content: string | undefined): boolean {
  return normalizeMessageText(stripInvisibleChars(content?.trim() || '')).length === 0;
}

/** True when a bubble has no visible text (empty stream placeholder, tool-only junk, zero-width). */
export function isMessageBodyEmpty(
  content: string | undefined,
  rawContent?: string | undefined,
): boolean {
  if (!isMessageDisplayEmpty(content)) {
    return false;
  }
  const raw = stripInvisibleChars(rawContent?.trim() || '');
  return normalizeMessageText(raw).length === 0;
}

function messageBody(message: HermesMessage): string {
  const raw = message.rawContent?.trim() || message.content?.trim() || '';
  return normalizeMessageText(raw);
}

function messageFingerprint(message: HermesMessage): string {
  const role = message.role?.toLowerCase() ?? '';
  return `${role}\u0000${messageBody(message)}`;
}

function isStreamingPlaceholder(message: HermesMessage): boolean {
  return (
    message.role?.toLowerCase() === 'assistant' &&
    idHasPrefix(message.id, 'asst-') &&
    isMessageBodyEmpty(message.content, message.rawContent)
  );
}

function isLocalAssistantPlaceholder(message: HermesMessage): boolean {
  if (message.role?.toLowerCase() !== 'assistant' || !idHasPrefix(message.id, 'asst-')) {
    return false;
  }
  if (isStreamingPlaceholder(message)) {
    return true;
  }
  if (isDeferredStreamPlaceholder(message.content)) {
    return true;
  }
  return isMessageBodyEmpty(message.content, message.rawContent);
}

function isOptimisticUserMessage(message: HermesMessage): boolean {
  return message.role?.toLowerCase() === 'user' && idHasPrefix(message.id, 'user-');
}

function hasAnyDeferredStreamPlaceholder(messages: HermesMessage[]): boolean {
  return messages.some(
    (message) =>
      message.role?.toLowerCase() === 'assistant' && isDeferredStreamPlaceholder(message.content),
  );
}

function indexOfLastUserMessage(messages: HermesMessage[]): number {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role?.toLowerCase() === 'user') {
      return index;
    }
  }
  return -1;
}

/** True when the transcript already shows a deferred empty-stream placeholder for the active turn. */
export function hasDeferredPlaceholderAfterLastUser(messages: HermesMessage[]): boolean {
  return findDeferredPlaceholderAfterLastUser(messages) !== undefined;
}

export function findDeferredPlaceholderAfterLastUser(
  messages: HermesMessage[],
): HermesMessage | undefined {
  const lastUserIndex = indexOfLastUserMessage(messages);
  for (let index = lastUserIndex + 1; index < messages.length; index += 1) {
    const message = messages[index];
    if (message?.role?.toLowerCase() === 'assistant' && isDeferredStreamPlaceholder(message.content)) {
      return message;
    }
  }
  return undefined;
}

/** Keep one deferred placeholder per transcript (SSE-drop poll + local insert race). */
export function dedupeDeferredStreamPlaceholders(messages: HermesMessage[]): HermesMessage[] {
  const deferredIndices: number[] = [];
  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index];
    if (message?.role?.toLowerCase() === 'assistant' && isDeferredStreamPlaceholder(message.content)) {
      deferredIndices.push(index);
    }
  }
  if (deferredIndices.length <= 1) {
    return messages;
  }
  const keepIndex =
    deferredIndices.find((index) => idHasPrefix(messages[index]?.id, 'asst-')) ??
    deferredIndices[deferredIndices.length - 1];
  const drop = new Set(deferredIndices.filter((index) => index !== keepIndex));
  return messages.filter((_, index) => !drop.has(index));
}

/** True when the phone still has bubbles the gateway transcript may not include yet. */
export function hasUnsyncedLocalMessages(messages: HermesMessage[]): boolean {
  return messages.some((message) => {
    if (isStreamingPlaceholder(message)) {
      return true;
    }
    if (idHasPrefix(message.id, 'asst-') && message.role?.toLowerCase() === 'assistant') {
      return true;
    }
    return isOptimisticUserMessage(message);
  });
}

/** Match only the latest server user line — avoids dropping a new optimistic bubble when an older turn repeats the same text. */
function serverHasLatestUserMessage(serverMessages: HermesMessage[], body: string): boolean {
  if (!body) {
    return false;
  }
  for (let index = serverMessages.length - 1; index >= 0; index -= 1) {
    const message = serverMessages[index];
    if (message.role?.toLowerCase() !== 'user') {
      continue;
    }
    return messageBody(message) === body;
  }
  return false;
}

function serverHasAssistantMessage(serverMessages: HermesMessage[], body: string): boolean {
  if (!body) {
    return false;
  }
  return serverMessages.some(
    (message) => message.role?.toLowerCase() === 'assistant' && messageBody(message) === body,
  );
}

/** Drop adjacent duplicate bubbles (gateway / Telegram occasionally echo twice). */
export function dedupeChatMessages(messages: HermesMessage[]): HermesMessage[] {
  const seen = new Set<string>();
  const deduped: HermesMessage[] = [];
  for (const message of messages) {
    const fp = messageFingerprint(message);
    if (seen.has(fp)) {
      continue;
    }
    seen.add(fp);
    deduped.push(message);
  }
  return deduped;
}

/** Keep in-flight / not-yet-synced bubbles when gateway refresh races mobile send. */
export function mergeServerMessagesWithPending(
  serverMessages: HermesMessage[],
  localMessages: HermesMessage[],
): HermesMessage[] {
  const dedupedServer = dedupeDeferredStreamPlaceholders(dedupeChatMessages(serverMessages));
  if (localMessages.length === 0) {
    return dedupedServer;
  }

  const serverFingerprints = new Set(dedupedServer.map(messageFingerprint));
  const pendingTail: HermesMessage[] = [];

  const serverHasFreshAssistantReply = serverHasAssistantReplyAfterLastUser(dedupedServer);
  const hasUnackedPendingUser = localMessages.some((message) => {
    if (!isOptimisticUserMessage(message) || message.outboundStatus !== 'pending') {
      return false;
    }
    const body = messageBody(message);
    return !serverHasLatestUserMessage(dedupedServer, body);
  });

  for (const message of localMessages) {
    if (isLocalAssistantPlaceholder(message)) {
      // An older completed turn on the gateway must not drop the still-running stub for a
      // newer phone-only pending user send (background remount / stale listMessages race).
      if (serverHasFreshAssistantReply && !hasUnackedPendingUser) {
        continue;
      }
      if (
        isDeferredStreamPlaceholder(message.content) &&
        hasAnyDeferredStreamPlaceholder(pendingTail)
      ) {
        continue;
      }
      if (
        isDeferredStreamPlaceholder(message.content) &&
        hasAnyDeferredStreamPlaceholder(dedupedServer) &&
        !idHasPrefix(message.id, 'asst-')
      ) {
        continue;
      }
      pendingTail.push(message);
      continue;
    }
    if (idHasPrefix(message.id, 'asst-') && message.role?.toLowerCase() === 'assistant') {
      const body = messageBody(message);
      if (serverHasAssistantMessage(dedupedServer, body)) {
        continue;
      }
      pendingTail.push(message);
      continue;
    }
    if (isOptimisticUserMessage(message)) {
      if (message.outboundStatus === 'pending') {
        pendingTail.push(message);
        continue;
      }
      const body = messageBody(message);
      if (
        serverFingerprints.has(messageFingerprint(message)) ||
        serverHasLatestUserMessage(dedupedServer, body)
      ) {
        continue;
      }
    }
    if (!serverFingerprints.has(messageFingerprint(message))) {
      pendingTail.push(message);
    }
  }

  if (pendingTail.length === 0) {
    return dedupeDeferredStreamPlaceholders(dedupeToolDumpMessages(dedupedServer));
  }
  const merged = dedupeToolDumpMessages([...dedupedServer, ...pendingTail]);
  const hasPendingUser = pendingTail.some(
    (message) => isOptimisticUserMessage(message) && message.outboundStatus === 'pending',
  );
  const normalized = hasPendingUser ? merged : dedupeChatMessages(merged);
  return dedupeDeferredStreamPlaceholders(normalized);
}

/** Cheap fingerprint to skip FlatList updates when a gateway refresh returns the same transcript. */
export function transcriptDigest(messages: HermesMessage[]): string {
  return messages
    .map((message, index) => {
      const id = message.id ?? `idx-${index}`;
      const len = message.content?.length ?? 0;
      const truncated = message.truncated ? 1 : 0;
      return `${id}:${message.role}:${len}:${truncated}`;
    })
    .join('|');
}
