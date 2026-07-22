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

/**
 * Gateway history may be newest-first and truncated. Keep phone turns that are
 * absent from that slice, then order the combined transcript by message time.
 */
export function reconcileChatHistory(
  serverMessages: readonly HermesMessage[],
  localMessages: readonly HermesMessage[],
): HermesMessage[] {
  const serverIds = new Set(serverMessages.map((message) => message.id).filter(Boolean));
  const serverFingerprints = new Set(serverMessages.map(messageFingerprint));
  const retainedLocal = localMessages.filter(
    (message) =>
      (!message.id || !serverIds.has(message.id)) && !serverFingerprints.has(messageFingerprint(message)),
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
