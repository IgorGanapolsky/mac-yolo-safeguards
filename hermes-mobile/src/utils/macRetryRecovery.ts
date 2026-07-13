/** Manual Retry / Tap-to-reconnect recovery — avoid infinite Retry theater. */

export const MAC_MANUAL_RETRY_BUDGET = 3;

export type MacManualRetryPlan =
  | { kind: 'reconnect_resend'; text: string }
  | { kind: 'reconnect_only' }
  | { kind: 'escalate_switch_computer' };

/**
 * Capture the prompt to resend BEFORE clearing pinned/run UI.
 * Prefer explicit failed-send refs, then the visible strip, then last user bubble.
 */
export function resolveMacRetryPromptText(input: {
  lastFailedSendText?: string | null;
  pinnedOutboundText?: string | null;
  lastFailedOutboundText?: string | null;
  lastUserMessageText?: string | null;
}): string | null {
  for (const candidate of [
    input.lastFailedSendText,
    input.pinnedOutboundText,
    input.lastFailedOutboundText,
    input.lastUserMessageText,
  ]) {
    const text = candidate?.trim();
    if (text) {
      return text;
    }
  }
  return null;
}

export function shouldEscalateManualRetry(
  attemptCount: number,
  budget: number = MAC_MANUAL_RETRY_BUDGET,
): boolean {
  return attemptCount >= budget;
}

/** Decide what Retry should do after a reconnect probe. */
export function planMacManualRetry(input: {
  attemptCount: number;
  budget?: number;
  retryText: string | null;
  postRetryReachable: boolean;
  authMismatch: boolean;
}): MacManualRetryPlan {
  const budget = input.budget ?? MAC_MANUAL_RETRY_BUDGET;
  if (input.authMismatch) {
    return { kind: 'escalate_switch_computer' };
  }
  if (!input.postRetryReachable && shouldEscalateManualRetry(input.attemptCount, budget)) {
    return { kind: 'escalate_switch_computer' };
  }
  if (input.retryText?.trim()) {
    return { kind: 'reconnect_resend', text: input.retryText.trim() };
  }
  return { kind: 'reconnect_only' };
}

export function macRetryExhaustedMessage(machineLabel: string): string {
  const label = machineLabel.trim() || 'your computer';
  return `Still can't reach ${label}. Switch computer or start a new chat — Retry alone won't fix this.`;
}
