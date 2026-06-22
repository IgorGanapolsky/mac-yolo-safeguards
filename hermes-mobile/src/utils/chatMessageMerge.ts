import type { HermesMessage } from '../types/chat';
import { coerceMessageId, idHasPrefix } from './messageIds';

function messageFingerprint(message: HermesMessage): string {
  return `${message.role}\u0000${message.content?.trim() ?? ''}`;
}

function isStreamingPlaceholder(message: HermesMessage): boolean {
  return (
    message.role === 'assistant' &&
    idHasPrefix(message.id, 'asst-') &&
    !message.content?.trim()
  );
}

/** Keep in-flight / not-yet-synced bubbles when gateway refresh races mobile send. */
export function mergeServerMessagesWithPending(
  serverMessages: HermesMessage[],
  localMessages: HermesMessage[],
): HermesMessage[] {
  if (localMessages.length === 0) {
    return serverMessages;
  }

  const serverFingerprints = new Set(serverMessages.map(messageFingerprint));
  const pendingTail: HermesMessage[] = [];

  for (const message of localMessages) {
    if (isStreamingPlaceholder(message)) {
      pendingTail.push(message);
      continue;
    }
    if (idHasPrefix(message.id, 'asst-') && message.role === 'assistant') {
      pendingTail.push(message);
      continue;
    }
    if (!serverFingerprints.has(messageFingerprint(message))) {
      pendingTail.push(message);
    }
  }

  if (pendingTail.length === 0) {
    return serverMessages;
  }
  return [...serverMessages, ...pendingTail];
}
