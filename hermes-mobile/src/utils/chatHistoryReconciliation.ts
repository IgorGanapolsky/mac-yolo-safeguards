import type { HermesMessage } from '../types/chat';
import { parseGatewayTimestamp } from './sessionDisplay';

function messageSentAtMs(message: HermesMessage): number | null {
  for (const value of [message.created_at, message.timestamp]) {
    if (value == null) {
      continue;
    }
    const parsed = parseGatewayTimestamp(value);
    if (parsed) {
      return parsed.getTime();
    }
  }
  return null;
}

function messageFingerprint(message: HermesMessage): string {
  const role = message.role?.toLowerCase() ?? '';
  const content = (message.rawContent ?? message.content ?? '')
    .normalize('NFKC')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
  return `${role}\u0000${content}`;
}

function isOptimisticUserId(id: string | undefined): boolean {
  return typeof id === 'string' && id.startsWith('user-');
}

/**
 * True when the latest server user with this fingerprint already has an assistant
 * after it — so a later phone `user-*` with the same text is a new turn, not a dup.
 */
function serverCompletedMatchingUserTurn(
  serverMessages: readonly HermesMessage[],
  fingerprint: string,
): boolean {
  let lastMatch = -1;
  for (let index = 0; index < serverMessages.length; index += 1) {
    if (messageFingerprint(serverMessages[index]!) === fingerprint) {
      lastMatch = index;
    }
  }
  if (lastMatch < 0) {
    return false;
  }
  for (let index = lastMatch + 1; index < serverMessages.length; index += 1) {
    if (serverMessages[index]?.role?.toLowerCase() === 'assistant') {
      return true;
    }
  }
  return false;
}

function shouldRetainLocalMessage(
  message: HermesMessage,
  serverIds: Set<string | undefined>,
  serverMessages: readonly HermesMessage[],
): boolean {
  if (message.id && serverIds.has(message.id)) {
    return false;
  }
  const fingerprint = messageFingerprint(message);
  const onServer = serverMessages.some((server) => messageFingerprint(server) === fingerprint);
  if (!onServer) {
    return true;
  }
  // Greptile/vault: repeated sent user-* after a completed server turn must stay visible.
  if (
    message.role?.toLowerCase() === 'user' &&
    isOptimisticUserId(message.id) &&
    serverCompletedMatchingUserTurn(serverMessages, fingerprint)
  ) {
    return true;
  }
  return false;
}

/**
 * Gateway history may be newest-first and truncated. Keep phone turns that are
 * absent from that slice, then order the combined transcript by message time.
 */
export function reconcileChatHistory(
  serverMessages: readonly HermesMessage[],
  localMessages: readonly HermesMessage[],
): HermesMessage[] {
  const serverIds = new Set(serverMessages.map((message) => message.id).filter(Boolean));
  const retainedLocal = localMessages.filter((message) =>
    shouldRetainLocalMessage(message, serverIds, serverMessages),
  );
  const combined = [...serverMessages, ...retainedLocal];

  return combined
    .map((message, index) => ({ message, index, sentAtMs: messageSentAtMs(message) }))
    .sort((a, b) => {
      if (a.sentAtMs == null || b.sentAtMs == null) {
        return a.index - b.index;
      }
      return a.sentAtMs - b.sentAtMs || a.index - b.index;
    })
    .map(({ message }) => message);
}
