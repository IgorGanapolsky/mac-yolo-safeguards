import { isConnectivityMessage } from './chatErrors';
import { isEmptyReplyFailureMessage } from './failedSendRetry';
import { isDeadRunEndedMessage } from './deadRunDetection';

export interface RunProgressRetryInput {
  phase: string;
  detail: string | undefined;
  lastFailedSendText: string | null | undefined;
  lastFailedOutboundText: string | null | undefined;
  connectivityRunFailure: boolean;
  macReachable: boolean;
  onRetryFailedSend: () => void;
  onRetryConnectivity: () => void;
}

/**
 * Resolve which retry affordance the RunProgressBanner should wire to its
 * `onRetry` prop.
 *
 * "Retry send" is only meaningful while the Mac is actually reachable. When
 * `macReachable` is false (disconnected / Tailscale off / Mac HTTP down), a
 * failed run must offer "Reconnect" (`onRetryConnectivity`) instead — never
 * "Retry send", which would imply the Mac can accept the send. This removes
 * the "retry send when not connected" contradiction (device screenshot
 * 2026-07-31T21:27) and mirrors the ComposerErrorBanner gate in ChatScreen
 * (`connectionState !== 'connected' || !effectiveMacHttpOk` => "Reconnect &
 * retry") and the `emptyReplyRunRefreshEligible` / `macChatLive` gate.
 */
export function resolveRunProgressRetryAction(
  input: RunProgressRetryInput,
): (() => void) | undefined {
  const {
    phase,
    detail,
    lastFailedSendText,
    lastFailedOutboundText,
    connectivityRunFailure,
    macReachable,
    onRetryFailedSend,
    onRetryConnectivity,
  } = input;

  const canRetrySend =
    macReachable &&
    (isEmptyReplyFailureMessage(detail) ||
      isDeadRunEndedMessage(detail) ||
      (phase === 'failed' &&
        Boolean(
          lastFailedSendText?.trim() || lastFailedOutboundText?.trim(),
        ) &&
        !isConnectivityMessage(detail ?? '')));

  if (canRetrySend) {
    return onRetryFailedSend;
  }
  if (connectivityRunFailure) {
    return onRetryConnectivity;
  }
  return undefined;
}
