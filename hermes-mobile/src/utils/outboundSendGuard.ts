import { normalizeMessageText } from './chatMessageMerge';

/**
 * Guard against double-optimistic user bubbles when Send is double-tapped or
 * the same text is re-entered while a send is already in flight / queued.
 */

export type OutboundQueueDecision =
  | { action: 'ignore' }
  | { action: 'queue'; body: string; commitBubble: boolean }
  | { action: 'send' };

/** True when two user-visible send bodies are the same prompt. */
export function isSameOutboundBody(a: string, b: string): boolean {
  return normalizeMessageText(a) === normalizeMessageText(b);
}

export function queueAlreadyHasBody(queue: readonly string[], body: string): boolean {
  const norm = normalizeMessageText(body);
  return queue.some((item) => normalizeMessageText(item) === norm);
}

/**
 * Decide what to do when the user (or queue) tries to send `body`.
 * - While busy: identical text → ignore (no second bubble, no re-queue).
 * - While busy: new text → queue; bubble only if not already queued.
 * - Idle → proceed to primary send path.
 */
export function decideOutboundSendWhileBusy(input: {
  isSending: boolean;
  body: string;
  inFlightBody: string | null | undefined;
  lastCommittedBody: string | null | undefined;
  queue: readonly string[];
}): OutboundQueueDecision {
  const body = input.body.trim();
  if (!body) {
    return { action: 'ignore' };
  }

  if (!input.isSending) {
    return { action: 'send' };
  }

  if (input.inFlightBody && isSameOutboundBody(body, input.inFlightBody)) {
    return { action: 'ignore' };
  }
  if (input.lastCommittedBody && isSameOutboundBody(body, input.lastCommittedBody)) {
    return { action: 'ignore' };
  }
  if (queueAlreadyHasBody(input.queue, body)) {
    return { action: 'ignore' };
  }

  return { action: 'queue', body, commitBubble: true };
}
