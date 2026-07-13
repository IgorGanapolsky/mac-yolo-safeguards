import {
  MAC_MANUAL_RETRY_BUDGET,
  macRetryExhaustedMessage,
  planMacManualRetry,
  resolveMacRetryPromptText,
  shouldEscalateManualRetry,
} from '../utils/macRetryRecovery';

describe('resolveMacRetryPromptText', () => {
  it('prefers lastFailedSendText over pinned strip', () => {
    expect(
      resolveMacRetryPromptText({
        lastFailedSendText: ' from fail ref ',
        pinnedOutboundText: 'pinned',
        lastFailedOutboundText: 'bubble',
        lastUserMessageText: 'user',
      }),
    ).toBe('from fail ref');
  });

  it('falls back to pinned outbound when fail refs empty', () => {
    expect(
      resolveMacRetryPromptText({
        lastFailedSendText: null,
        pinnedOutboundText: 'Make money today',
        lastFailedOutboundText: null,
        lastUserMessageText: 'older',
      }),
    ).toBe('Make money today');
  });

  it('falls back to last user message', () => {
    expect(
      resolveMacRetryPromptText({
        lastFailedSendText: '  ',
        pinnedOutboundText: null,
        lastFailedOutboundText: null,
        lastUserMessageText: 'Make money today',
      }),
    ).toBe('Make money today');
  });

  it('returns null when nothing usable', () => {
    expect(
      resolveMacRetryPromptText({
        lastFailedSendText: null,
        pinnedOutboundText: '   ',
        lastFailedOutboundText: undefined,
        lastUserMessageText: null,
      }),
    ).toBeNull();
  });
});

describe('shouldEscalateManualRetry', () => {
  it('escalates at budget', () => {
    expect(shouldEscalateManualRetry(MAC_MANUAL_RETRY_BUDGET - 1)).toBe(false);
    expect(shouldEscalateManualRetry(MAC_MANUAL_RETRY_BUDGET)).toBe(true);
  });
});

describe('planMacManualRetry', () => {
  it('escalates on auth mismatch even with retry text', () => {
    expect(
      planMacManualRetry({
        attemptCount: 1,
        retryText: 'hi',
        postRetryReachable: true,
        authMismatch: true,
      }),
    ).toEqual({ kind: 'escalate_switch_computer' });
  });

  it('escalates when unreachable after budget', () => {
    expect(
      planMacManualRetry({
        attemptCount: MAC_MANUAL_RETRY_BUDGET,
        retryText: 'hi',
        postRetryReachable: false,
        authMismatch: false,
      }),
    ).toEqual({ kind: 'escalate_switch_computer' });
  });

  it('resends when reachable and text present', () => {
    expect(
      planMacManualRetry({
        attemptCount: 1,
        retryText: 'Make money today',
        postRetryReachable: true,
        authMismatch: false,
      }),
    ).toEqual({ kind: 'reconnect_resend', text: 'Make money today' });
  });

  it('reconnects only when no text to resend', () => {
    expect(
      planMacManualRetry({
        attemptCount: 1,
        retryText: null,
        postRetryReachable: true,
        authMismatch: false,
      }),
    ).toEqual({ kind: 'reconnect_only' });
  });
});

describe('macRetryExhaustedMessage', () => {
  it('names the machine and points to Switch computer', () => {
    expect(macRetryExhaustedMessage('Igors-Mac-mini')).toContain('Igors-Mac-mini');
    expect(macRetryExhaustedMessage('Igors-Mac-mini')).toContain('Switch computer');
  });
});
