import type { LeashConnectionState } from './gatewayEndpoint';
import { GATEWAY_WRONG_KEY_MESSAGE, GATEWAY_AUTH_REPAIR_HEADER } from '../services/gatewayClient';
import { EMPTY_REPLY_FAILURE_REASON } from './emptyStreamReplyRecovery';
import { OUTBOUND_STUCK_FAILURE_REASON } from './outboundSendRecovery';
import { RUN_NO_TOKEN_FAIL_DETAIL } from './runStaleDetection';
import { isRawAbortMessage, USER_RUN_INTERRUPTED_MESSAGE } from './chatErrors';

export type OutboundDeliveryStatus = 'pending' | 'sent' | 'failed';

const OUTBOUND_FAILURE_REASON_MAX = 40;

export const OUTBOUND_NO_REPLY_MAC_LIVE =
  "Your computer didn't answer — tap ↑ to send again";

export const OUTBOUND_RUN_STALLED_HINT =
  'Run stalled on your Mac — recovering automatically…';

/** Shown only after auto-recover exhausted — still one-tap ↑, not Stop babysitting. */
export const OUTBOUND_RUN_STALLED_MANUAL_HINT =
  'Run stalled on your Mac — tap ↑ to resend';

/**
 * Slow / no first token yet — Mac may still be healthy (tools, mega context).
 * Must NOT reuse the scary "Run stalled" copy (false-positive rage class).
 */
export const OUTBOUND_SLOW_REPLY_HINT =
  'Still waiting on your Mac — recovering automatically…';

export const OUTBOUND_SESSION_BUSY_HINT =
  'Mac busy with another chat — tap ↑ to try again';

export const OUTBOUND_UNREACHABLE_HINT =
  "Couldn't reach your computer — tap Computer above";

/** Header already says Connected — do not contradict with "Waiting for computer". */
export const OUTBOUND_CONNECTED_WAITING_REPLY =
  '○ Still waiting for reply…';

export function truncateOutboundFailureReason(reason: string, maxLen = OUTBOUND_FAILURE_REASON_MAX): string {
  const trimmed = reason.trim();
  if (trimmed.length <= maxLen) {
    return trimmed;
  }
  return `${trimmed.slice(0, maxLen - 1)}…`;
}

function isWrongKeyFailureReason(reason: string): boolean {
  const lower = reason.toLowerCase();
  return (
    reason === GATEWAY_WRONG_KEY_MESSAGE ||
    reason.includes(GATEWAY_AUTH_REPAIR_HEADER) ||
    lower.includes('wrong key') ||
    lower.includes('outdated connection') ||
    lower.includes('invalid_api_key')
  );
}

function isSessionBusyFailureReason(reason: string): boolean {
  const lower = reason.toLowerCase();
  return (
    lower.includes('session_in_use') ||
    lower.includes('still on the previous chat') ||
    (lower.includes('already in use') && !lower.includes('title'))
  );
}

function isSlowReplyFailureReason(reason: string): boolean {
  const lower = reason.toLowerCase();
  return (
    reason === RUN_NO_TOKEN_FAIL_DETAIL ||
    lower.includes('still waiting for a reply') ||
    lower.includes('no reply yet')
  );
}

function isRunStalledFailureReason(reason: string): boolean {
  const lower = reason.toLowerCase();
  if (isSlowReplyFailureReason(reason)) {
    return false;
  }
  return (
    reason === OUTBOUND_STUCK_FAILURE_REASON ||
    lower.includes('no reply from computer') ||
    lower.includes('no live progress') ||
    lower.includes('stalled') ||
    lower.includes('still working')
  );
}

function isEmptyReplyFailureReason(reason: string): boolean {
  return (
    reason === EMPTY_REPLY_FAILURE_REASON ||
    reason.toLowerCase().includes('no reply text arrived')
  );
}

/** Map gateway failure reasons to bubble copy with a clear next step. */
export function resolveOutboundFailureLabel(
  failureReason: string | undefined,
  macHttpOk: boolean,
): string {
  const reason = failureReason?.trim();
  if (reason) {
    if (isWrongKeyFailureReason(reason)) {
      return '⚠ Outdated connection — tap Re-pair this Mac';
    }
    if (isSessionBusyFailureReason(reason)) {
      return `⚠ ${OUTBOUND_SESSION_BUSY_HINT}`;
    }
    if (isSlowReplyFailureReason(reason)) {
      return `⚠ ${OUTBOUND_SLOW_REPLY_HINT}`;
    }
    if (isRunStalledFailureReason(reason)) {
      return `⚠ ${OUTBOUND_RUN_STALLED_HINT}`;
    }
    if (isEmptyReplyFailureReason(reason)) {
      return `⚠ ${OUTBOUND_NO_REPLY_MAC_LIVE}`;
    }
    if (isRawAbortMessage(reason)) {
      return `⚠ ${USER_RUN_INTERRUPTED_MESSAGE}`;
    }
    if (macHttpOk) {
      return `⚠ ${truncateOutboundFailureReason(reason)}`;
    }
    return `⚠ ${truncateOutboundFailureReason(reason)}`;
  }

  if (macHttpOk) {
    return `⚠ ${OUTBOUND_NO_REPLY_MAC_LIVE}`;
  }
  return `⚠ ${OUTBOUND_UNREACHABLE_HINT}`;
}

export function isGatewayLiveForDelivery(input: {
  connectionState: LeashConnectionState;
  macHttpOk: boolean;
}): boolean {
  if (input.connectionState === 'demo') {
    return true;
  }
  if (!input.macHttpOk) {
    return false;
  }
  if (input.connectionState === 'connected') {
    return true;
  }
  if (input.connectionState === 'disconnected') {
    return false;
  }
  return true;
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
    return resolveOutboundFailureLabel(input.failureReason, input.macHttpOk);
  }

  const live = isGatewayLiveForDelivery(input);

  if (status === 'sent') {
    if (live) {
      return '✓ Sent';
    }
    // Connected banner + dead Mac HTTP = wait for reply, not "computer unreachable".
    if (input.connectionState === 'connected') {
      return OUTBOUND_CONNECTED_WAITING_REPLY;
    }
    return '○ Waiting for computer…';
  }

  if (!live) {
    if (input.connectionState === 'connected') {
      return OUTBOUND_CONNECTED_WAITING_REPLY;
    }
    return '○ Waiting for computer…';
  }
  if (input.connectionState === 'connecting') {
    return '○ Sending…';
  }
  return '○ Sending';
}
