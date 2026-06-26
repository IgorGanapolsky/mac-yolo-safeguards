import type { HermesMessage } from '../types/chat';

/** Show thread label only at the start of each thread in a merged inbox timeline. */
export function threadLabelAtMessageIndex(
  messages: HermesMessage[],
  index: number,
): string | undefined {
  const message = messages[index];
  const label = message.threadLabel?.trim();
  const sessionId = message.sourceSessionId;
  if (!label || !sessionId) {
    return undefined;
  }
  if (index === 0) {
    return label;
  }
  const prevSessionId = messages[index - 1]?.sourceSessionId;
  return prevSessionId !== sessionId ? label : undefined;
}
