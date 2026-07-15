import type { HermesMessage } from '../types/chat';
import { idHasPrefix } from './messageIds';
import { normalizeMessageText } from './chatMessageMerge';

export type OutboundSendDedupeInput = {
  isSending: boolean;
  normalizedIncoming: string;
  normalizedLastCommitted?: string | null;
  normalizedActiveSend?: string | null;
  /** Set synchronously in handleSend before async handleSendMessage runs (double-tap guard). */
  normalizedPendingClaim?: string | null;
  /** True while the last committed outbound bubble is still pending delivery. */
  outboundStillPending?: boolean;
};

/** Sync guard: ignore duplicate send while outbound lock is held. */
export function shouldIgnoreDuplicateOutboundSend(input: OutboundSendDedupeInput): boolean {
  const incoming = input.normalizedIncoming.trim();
  if (!incoming) {
    return false;
  }
  const lastCommitted = input.normalizedLastCommitted?.trim();
  const pendingClaim = input.normalizedPendingClaim?.trim();
  if (!input.isSending) {
    if (pendingClaim && incoming === pendingClaim) {
      return true;
    }
    // Pending outbound with send lock released: allow resend — sendUserText reuses the
    // optimistic bubble instead of duplicating (P0: stuck pending muted Send forever).
    return false;
  }
  if (lastCommitted && incoming === lastCommitted) {
    return true;
  }
  const activeSend = input.normalizedActiveSend?.trim();
  if (activeSend && incoming === activeSend) {
    return true;
  }
  return false;
}

export function isOutboundTurnStillPending(input: {
  pinnedOutboundStatus: 'pending' | 'sent' | 'failed' | null;
  pinnedOutboundText: string | null;
  normalizedIncoming: string;
}): boolean {
  return (
    input.pinnedOutboundStatus === 'pending' &&
    Boolean(input.pinnedOutboundText?.trim()) &&
    normalizeMessageText(input.pinnedOutboundText ?? '') === input.normalizedIncoming.trim()
  );
}

export function shouldSkipQueueOutboundBubbleCommit(input: {
  normalizedQueued: string;
  normalizedLastCommitted?: string | null;
}): boolean {
  const queued = input.normalizedQueued.trim();
  const lastCommitted = input.normalizedLastCommitted?.trim();
  return Boolean(queued && lastCommitted && queued === lastCommitted);
}

export function findPendingOptimisticUserBubble(
  messages: HermesMessage[],
  body: string,
): HermesMessage | undefined {
  const normalized = normalizeMessageText(body);
  if (!normalized) {
    return undefined;
  }
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message.role?.toLowerCase() !== 'user' || !idHasPrefix(message.id, 'user-')) {
      continue;
    }
    if (message.outboundStatus !== 'pending') {
      continue;
    }
    if (normalizeMessageText(message.content || '') === normalized) {
      return message;
    }
  }
  return undefined;
}

/** Drop adjacent optimistic user-* rows that repeat the same normalized body. */
export function dedupeAdjacentOptimisticUserBubbles(messages: HermesMessage[]): HermesMessage[] {
  if (messages.length < 2) {
    return messages;
  }
  const deduped: HermesMessage[] = [];
  for (const message of messages) {
    const previous = deduped[deduped.length - 1];
    const isOptimisticUser =
      message.role?.toLowerCase() === 'user' && idHasPrefix(message.id, 'user-');
    const previousIsOptimisticUser =
      previous?.role?.toLowerCase() === 'user' && idHasPrefix(previous.id, 'user-');
    if (
      isOptimisticUser &&
      previousIsOptimisticUser &&
      normalizeMessageText(message.content || '') === normalizeMessageText(previous.content || '')
    ) {
      continue;
    }
    deduped.push(message);
  }
  return deduped;
}
