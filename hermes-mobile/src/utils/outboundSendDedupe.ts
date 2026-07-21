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
  /**
   * True when the same body was already delivered to the Mac and we are still
   * waiting for an assistant reply. Must hard-block re-POST — otherwise the
   * gateway stores user;user (Reach out goal 2026-07-20) and alternation repair
   * runs while a slow model is still working.
   */
  outboundAwaitingReply?: boolean;
};

/** Sync guard: ignore duplicate send while outbound lock is held. */
export function shouldIgnoreDuplicateOutboundSend(input: OutboundSendDedupeInput): boolean {
  const incoming = input.normalizedIncoming.trim();
  if (!incoming) {
    return false;
  }
  const lastCommitted = input.normalizedLastCommitted?.trim();
  const pendingClaim = input.normalizedPendingClaim?.trim();
  if (input.outboundAwaitingReply && lastCommitted && incoming === lastCommitted) {
    return true;
  }
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

/**
 * Duplicate-ignore is a no-op send. Callers that already cleared the composer must
 * treat this as rejected (restore draft) — never as accepted success.
 */
export function isNoOpDuplicateOutboundSend(input: OutboundSendDedupeInput): boolean {
  return shouldIgnoreDuplicateOutboundSend(input);
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

/** Failed optimistic bubble for the same intent — stall recovery must reuse, not echo. */
export function findFailedOptimisticUserBubble(
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
    if (message.outboundStatus !== 'failed') {
      continue;
    }
    if (normalizeMessageText(message.content || '') === normalized) {
      return message;
    }
  }
  return undefined;
}

/**
 * Sent optimistic bubble still awaiting a reply — Delivering/retry must reuse it,
 * not append a second identical user prompt (11:14 AM echo class).
 */
export function findSentOptimisticUserBubbleAwaitingReply(
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
    if (message.outboundStatus !== 'sent') {
      continue;
    }
    if (normalizeMessageText(message.content || '') !== normalized) {
      continue;
    }
    let hasAssistantAfter = false;
    for (let after = index + 1; after < messages.length; after += 1) {
      if (messages[after]?.role?.toLowerCase() === 'assistant') {
        const assistantBody =
          messages[after]?.content?.trim() || messages[after]?.rawContent?.trim() || '';
        if (assistantBody.length > 0) {
          hasAssistantAfter = true;
          break;
        }
      }
    }
    if (!hasAssistantAfter) {
      return message;
    }
  }
  return undefined;
}

/** Pending → failed → sent-awaiting-reply — one user intent maps to one bubble across retries. */
export function findReusableOptimisticUserBubble(
  messages: HermesMessage[],
  body: string,
): HermesMessage | undefined {
  return (
    findPendingOptimisticUserBubble(messages, body) ??
    findFailedOptimisticUserBubble(messages, body) ??
    findSentOptimisticUserBubbleAwaitingReply(messages, body)
  );
}

/** Flip a failed optimistic bubble back to pending for stall/manual retry (no second bubble). */
export function reactivateOptimisticUserBubble(
  messages: HermesMessage[],
  messageId: string,
): HermesMessage[] {
  if (!messageId) {
    return messages;
  }
  let changed = false;
  const next = messages.map((message) => {
    if (message.id !== messageId) {
      return message;
    }
    if (message.outboundStatus === 'pending' && !message.outboundFailureReason) {
      return message;
    }
    changed = true;
    return {
      ...message,
      outboundStatus: 'pending' as const,
      outboundFailureReason: undefined,
    };
  });
  return changed ? next : messages;
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
      // Prefer pending over failed when stall-recovery raced a duplicate commit.
      if (
        previous?.outboundStatus === 'failed' &&
        message.outboundStatus === 'pending'
      ) {
        deduped[deduped.length - 1] = message;
      }
      continue;
    }
    deduped.push(message);
  }
  return deduped;
}
