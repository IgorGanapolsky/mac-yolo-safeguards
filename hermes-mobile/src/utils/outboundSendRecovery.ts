import type { HermesMessage } from '../types/chat';
import { CHAT_STREAM_FIRST_BYTE_MS } from '../services/hermesGatewayClient';

/** Grace after first-byte timeout before failing orphaned pending bubbles. */
export const OUTBOUND_PENDING_RECOVERY_MS = CHAT_STREAM_FIRST_BYTE_MS + 5_000;

/** Force-release composer send lock if outbound never completes. */
export const OUTBOUND_SEND_LOCK_TIMEOUT_MS = OUTBOUND_PENDING_RECOVERY_MS;

export const OUTBOUND_STUCK_FAILURE_REASON = "Didn't send — tap ↑ again";

export function shouldRecoverOutboundSendLock(
  startedAtMs: number,
  nowMs: number,
  options: { streamInFlight: boolean },
): boolean {
  if (nowMs - startedAtMs < OUTBOUND_SEND_LOCK_TIMEOUT_MS) {
    return false;
  }
  if (options.streamInFlight && nowMs - startedAtMs < OUTBOUND_SEND_LOCK_TIMEOUT_MS * 2) {
    return false;
  }
  return true;
}

export function findStuckPendingOutboundIds(
  messages: HermesMessage[],
  nowMs: number,
  options: {
    isSending: boolean;
    streamInFlight: boolean;
    maxPendingMs?: number;
  },
): string[] {
  if (options.isSending || options.streamInFlight) {
    return [];
  }
  const maxMs = options.maxPendingMs ?? OUTBOUND_PENDING_RECOVERY_MS;
  const stuckIds: string[] = [];
  for (const message of messages) {
    if (message.role?.toLowerCase() !== 'user' || message.outboundStatus !== 'pending') {
      continue;
    }
    const created = Date.parse(message.created_at ?? '');
    if (!Number.isFinite(created) || nowMs - created >= maxMs) {
      if (message.id) {
        stuckIds.push(message.id);
      }
    }
  }
  return stuckIds;
}

export function applyStuckOutboundRecovery(
  messages: HermesMessage[],
  stuckIds: readonly string[],
  failureReason = OUTBOUND_STUCK_FAILURE_REASON,
): HermesMessage[] {
  if (stuckIds.length === 0) {
    return messages;
  }
  const stuck = new Set(stuckIds);
  return messages.map((message) =>
    message.id && stuck.has(message.id)
      ? {
          ...message,
          outboundStatus: 'failed' as const,
          outboundFailureReason: failureReason,
        }
      : message,
  );
}
