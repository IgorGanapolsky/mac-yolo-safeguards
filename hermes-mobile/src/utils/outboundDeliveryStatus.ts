import type { LeashConnectionState } from './gatewayEndpoint';

export type OutboundDeliveryStatus = 'pending' | 'sent' | 'failed';

const OUTBOUND_FAILURE_REASON_MAX = 40;

export function truncateOutboundFailureReason(reason: string, maxLen = OUTBOUND_FAILURE_REASON_MAX): string {
  const trimmed = reason.trim();
  if (trimmed.length <= maxLen) {
    return trimmed;
  }
  return `${trimmed.slice(0, maxLen - 1)}…`;
}

export function isGatewayLiveForDelivery(input: {
  connectionState: LeashConnectionState;
  macHttpOk: boolean;
}): boolean {
  return (
    input.connectionState === 'connected' ||
    input.connectionState === 'demo' ||
    input.macHttpOk
  );
}

/** Human label for outbound bubbles / submitted strip — never show ✓ Sent when Mac isn't reachable. */
export function outboundDeliveryLabel(
  status: OutboundDeliveryStatus,
  input: {
    connectionState: LeashConnectionState;
    macHttpOk: boolean;
    failureReason?: string;
  },
): string {
  if (status === 'failed') {
    const reason = input.failureReason?.trim();
    if (reason) {
      return `⚠ ${truncateOutboundFailureReason(reason)}`;
    }
    if (input.macHttpOk) {
      return '⚠ No reply — tap ↑ again';
    }
    return "⚠ Couldn't reach your computer";
  }

  const live = isGatewayLiveForDelivery(input);

  if (status === 'sent') {
    if (live) {
      return '✓ Sent';
    }
    return '○ Waiting for computer…';
  }

  if (!live) {
    return '○ Waiting for computer…';
  }
  if (input.connectionState === 'connecting') {
    return '○ Sending…';
  }
  return '○ Sending';
}
