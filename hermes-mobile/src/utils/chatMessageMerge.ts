import type { HermesMessage } from '../types/chat';
import { coerceMessageId, idHasPrefix } from './messageIds';

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
    !message.content?.trim()
  );
}

function isOptimisticUserMessage(message: HermesMessage): boolean {
  return message.role?.toLowerCase() === 'user' && idHasPrefix(message.id, 'user-');
}

function serverHasUserMessage(serverMessages: HermesMessage[], body: string): boolean {
  if (!body) {
    return false;
  }
  return serverMessages.some(
    (message) => message.role?.toLowerCase() === 'user' && messageBody(message) === body,
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
  const dedupedServer = dedupeChatMessages(serverMessages);
  if (localMessages.length === 0) {
    return dedupedServer;
  }

  const serverFingerprints = new Set(dedupedServer.map(messageFingerprint));
  const pendingTail: HermesMessage[] = [];

  for (const message of localMessages) {
    if (isStreamingPlaceholder(message)) {
      pendingTail.push(message);
      continue;
    }
    if (idHasPrefix(message.id, 'asst-') && message.role?.toLowerCase() === 'assistant') {
      pendingTail.push(message);
      continue;
    }
    if (isOptimisticUserMessage(message)) {
      const body = messageBody(message);
      if (serverFingerprints.has(messageFingerprint(message)) || serverHasUserMessage(dedupedServer, body)) {
        continue;
      }
    }
    if (!serverFingerprints.has(messageFingerprint(message))) {
      pendingTail.push(message);
    }
  }

  if (pendingTail.length === 0) {
    return dedupedServer;
  }
  return dedupeChatMessages([...dedupedServer, ...pendingTail]);
}
