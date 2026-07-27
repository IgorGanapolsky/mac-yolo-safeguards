import type { HermesMessage } from '../types/chat';

/** Grace before failing orphaned pending bubbles (tool-heavy Mac runs can exceed 3 min). */
export const OUTBOUND_PENDING_RECOVERY_MS = 5 * 60_000;

/** Force-release composer send lock if outbound never completes. */
export const OUTBOUND_SEND_LOCK_TIMEOUT_MS = OUTBOUND_PENDING_RECOVERY_MS;

/** While HTTP stream is open, allow longer — but not multi-hour hangs. */
export const OUTBOUND_STREAM_LOCK_MULTIPLIER = 2;

/**
 * Absolute wall-clock fail for Connected+Waiting forever.
 * Ignores stuck streamInFlight / isSending — SSE drops must not hang the UI for hours.
 */
export const OUTBOUND_HARD_TIMEOUT_MS = 2 * 60_000;

export const OUTBOUND_STUCK_FAILURE_REASON = 'Sent — no reply from computer';

export function shouldRecoverOutboundSendLock(
  startedAtMs: number,
  nowMs: number,
  options: { streamInFlight: boolean },
): boolean {
  const ageMs = nowMs - startedAtMs;
  if (ageMs >= OUTBOUND_HARD_TIMEOUT_MS) {
    return true;
  }
  if (ageMs < OUTBOUND_SEND_LOCK_TIMEOUT_MS) {
    return false;
  }
  if (options.streamInFlight && ageMs < OUTBOUND_SEND_LOCK_TIMEOUT_MS * OUTBOUND_STREAM_LOCK_MULTIPLIER) {
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
  const maxMs = options.maxPendingMs ?? OUTBOUND_PENDING_RECOVERY_MS;
  const stuckIds: string[] = [];
  for (const message of messages) {
    if (message.role?.toLowerCase() !== 'user' || message.outboundStatus !== 'pending') {
      continue;
    }
    const created = Date.parse(message.created_at ?? '');
    const ageMs = Number.isFinite(created) ? nowMs - created : OUTBOUND_HARD_TIMEOUT_MS;
    const hardStuck = ageMs >= OUTBOUND_HARD_TIMEOUT_MS;
    const softStuck = !options.isSending && !options.streamInFlight && ageMs >= maxMs;
    if ((hardStuck || softStuck) && message.id) {
      stuckIds.push(message.id);
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
