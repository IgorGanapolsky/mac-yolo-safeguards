/**
 * Send-ack feedback: after an optimistic bubble, do not sit in silence.
 * At 3s without gateway ack, surface "Still connecting…" so the UI feels alive.
 */

export const OUTBOUND_ACK_TIMEOUT_MS = 3000;

export const OUTBOUND_STILL_CONNECTING_LABEL = '○ Still connecting…';

export const OUTBOUND_SENDING_LABEL = '○ Sending…';

/** Age of an outbound bubble from ISO / epoch created_at. */
export function outboundPendingAgeMs(
  createdAt: string | number | undefined | null,
  nowMs: number = Date.now(),
): number {
  if (createdAt == null) {
    return 0;
  }
  const parsed =
    typeof createdAt === 'number' ? createdAt : Date.parse(String(createdAt));
  if (!Number.isFinite(parsed)) {
    return 0;
  }
  return Math.max(0, nowMs - parsed);
}

/** True once the optimistic send has waited past the ack timeout. */
export function isOutboundAckTimedOut(ageMs: number): boolean {
  return ageMs >= OUTBOUND_ACK_TIMEOUT_MS;
}

/**
 * Pending / unacked delivery copy.
 * - Before 3s: Sending…
 * - After 3s without ack: Still connecting… (never silent "Waiting forever")
 */
export function outboundPendingAckLabel(input: {
  ageMs: number;
  macHttpOk: boolean;
}): string {
  if (isOutboundAckTimedOut(input.ageMs)) {
    return OUTBOUND_STILL_CONNECTING_LABEL;
  }
  if (!input.macHttpOk) {
    return OUTBOUND_STILL_CONNECTING_LABEL;
  }
  return OUTBOUND_SENDING_LABEL;
}
