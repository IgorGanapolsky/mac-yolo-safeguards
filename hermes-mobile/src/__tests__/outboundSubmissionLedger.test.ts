import type { HermesMessage } from '../types/chat';
import {
  OUTBOUND_LEDGER_MAX_RECORDS,
  RECONNECT_AUTO_RESEND_COOLDOWN_MS,
  RECONNECT_AUTO_RESEND_MAX_ATTEMPTS,
  attachOutboundSubmissionSession,
  autoResendAttemptCount,
  clearOutboundSubmissions,
  createOutboundId,
  createOutboundSubmissionLedger,
  findOutboundSubmissionForBody,
  isAutoResendableFailureReason,
  hasAcceptedSubmissionForBody,
  markOutboundBubbleDelivered,
  markOutboundSubmissionAccepted,
  markOutboundSubmissionDispatched,
  outboundIntentKey,
  recordAutoResendAttempt,
  recordOutboundSubmission,
  resolveReconnectResendPlan,
  resolveStallRecoveryPlan,
  scopeOutboundSubmissionsToSession,
} from '../utils/outboundSubmissionLedger';
import { resolveComposerSendText } from '../utils/failedSendRetry';

describe('outbound submission ledger', () => {
  it('records one submission per outbound id and ignores repeats', () => {
    const ledger = createOutboundSubmissionLedger();
    const id = createOutboundId(1000, 1);
    recordOutboundSubmission(ledger, { outboundId: id, body: 'Do it now', nowMs: 1000 });
    recordOutboundSubmission(ledger, { outboundId: id, body: 'Do it now', nowMs: 1500 });
    expect(ledger.records).toHaveLength(1);
    expect(findOutboundSubmissionForBody(ledger, 'Do it now')?.outboundId).toBe(id);
  });

  it('matches bodies through whitespace/case normalization', () => {
    const ledger = createOutboundSubmissionLedger();
    recordOutboundSubmission(ledger, {
      outboundId: 'ob-1',
      body: 'Do  it   now',
      nowMs: 1,
    });
    expect(findOutboundSubmissionForBody(ledger, 'do it now')).toBeTruthy();
  });

  it('only reports accepted once the gateway took the prompt', () => {
    const ledger = createOutboundSubmissionLedger();
    recordOutboundSubmission(ledger, { outboundId: 'ob-1', body: 'Do it now', nowMs: 1 });
    expect(hasAcceptedSubmissionForBody(ledger, 'Do it now')).toBe(false);
    markOutboundSubmissionAccepted(ledger, 'ob-1', 2);
    expect(hasAcceptedSubmissionForBody(ledger, 'Do it now')).toBe(true);
  });

  it('stays bounded', () => {
    const ledger = createOutboundSubmissionLedger();
    for (let index = 0; index < OUTBOUND_LEDGER_MAX_RECORDS + 10; index += 1) {
      recordOutboundSubmission(ledger, {
        outboundId: `ob-${index}`,
        body: `body ${index}`,
        nowMs: index,
      });
    }
    expect(ledger.records.length).toBe(OUTBOUND_LEDGER_MAX_RECORDS);
  });

  it('clears on session change', () => {
    const ledger = createOutboundSubmissionLedger();
    recordOutboundSubmission(ledger, { outboundId: 'ob-1', body: 'Do it now', nowMs: 1 });
    clearOutboundSubmissions(ledger);
    expect(ledger.records).toHaveLength(0);
  });

  it('preserves an accepted first-message record when null becomes its created session', () => {
    const ledger = createOutboundSubmissionLedger();
    recordOutboundSubmission(ledger, {
      outboundId: 'ob-first',
      sessionId: 'created-session',
      messageId: 'user-first',
      body: 'Do it now',
      nowMs: 1,
    });
    markOutboundSubmissionAccepted(ledger, 'ob-first', 2);

    scopeOutboundSubmissionsToSession(ledger, 'created-session');

    expect(ledger.records).toEqual([
      expect.objectContaining({
        outboundId: 'ob-first',
        sessionId: 'created-session',
        acceptedAtMs: 2,
      }),
    ]);
    expect(
      resolveStallRecoveryPlan({
        failedText: 'Do it now',
        sessionId: 'created-session',
        messageId: 'user-first',
        ledger,
      }),
    ).toEqual({ kind: 'resume', outboundId: 'ob-first' });
  });

  it('drops records from another session and never body-matches across threads', () => {
    const ledger = createOutboundSubmissionLedger();
    recordOutboundSubmission(ledger, {
      outboundId: 'ob-a',
      sessionId: 'session-a',
      body: 'same prompt',
      nowMs: 1,
    });
    markOutboundSubmissionAccepted(ledger, 'ob-a', 2);
    expect(
      resolveStallRecoveryPlan({
        failedText: 'same prompt',
        sessionId: 'session-b',
        ledger,
      }),
    ).toEqual({ kind: 'resend' });

    scopeOutboundSubmissionsToSession(ledger, 'session-b');
    expect(ledger.records).toEqual([]);
  });

  it('does not confuse repeated text in one session with an older accepted message', () => {
    const ledger = createOutboundSubmissionLedger();
    recordOutboundSubmission(ledger, {
      outboundId: 'ob-old',
      sessionId: 'session-a',
      messageId: 'user-old',
      body: 'same prompt',
      nowMs: 1,
    });
    markOutboundSubmissionAccepted(ledger, 'ob-old', 2);
    recordOutboundSubmission(ledger, {
      outboundId: 'ob-new',
      sessionId: 'session-a',
      messageId: 'user-new',
      body: 'same prompt',
      nowMs: 3,
    });

    expect(
      resolveStallRecoveryPlan({
        failedText: 'same prompt',
        sessionId: 'session-a',
        messageId: 'user-new',
        ledger,
      }),
    ).toEqual({ kind: 'resend' });
    expect(
      resolveStallRecoveryPlan({
        failedText: 'same prompt',
        sessionId: 'session-a',
        messageId: 'user-old',
        ledger,
      }),
    ).toEqual({ kind: 'resume', outboundId: 'ob-old' });
  });
});

describe('resolveStallRecoveryPlan', () => {
  it('resumes (never resubmits) a prompt the gateway already accepted', () => {
    const ledger = createOutboundSubmissionLedger();
    recordOutboundSubmission(ledger, { outboundId: 'ob-1', body: 'Do it now', nowMs: 1 });
    markOutboundSubmissionAccepted(ledger, 'ob-1', 2);
    expect(resolveStallRecoveryPlan({ failedText: 'Do it now', ledger })).toEqual({
      kind: 'resume',
      outboundId: 'ob-1',
    });
  });

  it('allows a resend when the submission never reached the gateway', () => {
    const ledger = createOutboundSubmissionLedger();
    recordOutboundSubmission(ledger, { outboundId: 'ob-1', body: 'Do it now', nowMs: 1 });
    expect(resolveStallRecoveryPlan({ failedText: 'Do it now', ledger })).toEqual({
      kind: 'resend',
    });
  });

  it('is a no-op without a failed body', () => {
    const ledger = createOutboundSubmissionLedger();
    expect(resolveStallRecoveryPlan({ failedText: '  ', ledger })).toEqual({ kind: 'none' });
  });

  it('never resubmits across repeated recovery ticks for one accepted message', () => {
    const ledger = createOutboundSubmissionLedger();
    recordOutboundSubmission(ledger, { outboundId: 'ob-1', body: 'Do it now', nowMs: 1 });
    markOutboundSubmissionAccepted(ledger, 'ob-1', 2);
    const plans = [0, 1, 2].map(() =>
      resolveStallRecoveryPlan({ failedText: 'Do it now', ledger }),
    );
    expect(plans.every((plan) => plan.kind === 'resume')).toBe(true);
  });
});

describe('markOutboundBubbleDelivered', () => {
  const failed: HermesMessage[] = [
    { id: 'srv-1', role: 'user', content: 'Do it now', outboundStatus: 'failed', outboundFailureReason: 'Sent — no reply from computer' },
  ];

  it('flips a stalled failed bubble back to delivered without adding a bubble', () => {
    const next = markOutboundBubbleDelivered(failed, 'Do it now');
    expect(next).toHaveLength(1);
    expect(next[0]?.outboundStatus).toBe('sent');
    expect(next[0]?.outboundFailureReason).toBeUndefined();
  });

  it('leaves unrelated bodies alone', () => {
    const next = markOutboundBubbleDelivered(failed, 'something else');
    expect(next).toBe(failed);
  });
});

describe('resolveComposerSendText', () => {
  it('prefers the live composer value', () => {
    expect(
      resolveComposerSendText({ latestText: 'typed', composerValue: 'typed' }),
    ).toBe('typed');
  });

  it('keeps a fresh native draft when the controlled value lags (Android)', () => {
    expect(
      resolveComposerSendText({
        latestText: 'brand new prompt',
        composerValue: '',
        lastSentComposerText: 'Do it now',
      }),
    ).toBe('brand new prompt');
  });

  it('treats the input bar echo of the already-sent body as an empty composer', () => {
    expect(
      resolveComposerSendText({
        latestText: 'Do it now',
        composerValue: '',
        lastSentComposerText: 'Do it now',
      }),
    ).toBe('');
  });

  it('is empty when nothing is typed', () => {
    expect(resolveComposerSendText({ latestText: '', composerValue: '' })).toBe('');
  });
});

describe('resolveReconnectResendPlan', () => {
  const LIVE = { macChatLive: true, isDemo: false, isSending: false };

  function ledgerWith(options: { accepted: boolean }) {
    const ledger = createOutboundSubmissionLedger();
    recordOutboundSubmission(ledger, {
      outboundId: 'ob-1',
      sessionId: 'session-1',
      messageId: 'user-1',
      body: 'Do it now',
      nowMs: 1_000,
    });
    if (options.accepted) {
      markOutboundSubmissionAccepted(ledger, 'ob-1', 1_500);
    }
    return ledger;
  }

  const target = {
    failedText: 'Do it now',
    sessionId: 'session-1',
    messageId: 'user-1',
  };

  it('auto-resends a prompt the gateway never accepted — no tap required', () => {
    const plan = resolveReconnectResendPlan({
      ...target,
      ledger: ledgerWith({ accepted: false }),
      nowMs: 10_000,
      ...LIVE,
    });
    expect(plan).toEqual({ kind: 'resend', intentKey: 'msg:user-1', attempt: 1 });
  });

  it('RESUMES an accepted prompt — the Mac already has it, never resubmit', () => {
    const plan = resolveReconnectResendPlan({
      ...target,
      ledger: ledgerWith({ accepted: true }),
      nowMs: 10_000,
      ...LIVE,
    });
    expect(plan).toEqual({ kind: 'resume', outboundId: 'ob-1', intentKey: 'msg:user-1' });
  });

  it('still resumes an accepted prompt across a burst of reconnect edges', () => {
    const ledger = ledgerWith({ accepted: true });
    const kinds = [0, 3_000, 6_000, 9_000, 12_000].map(
      (offset) =>
        resolveReconnectResendPlan({
          ...target,
          ledger,
          nowMs: 10_000 + offset,
          ...LIVE,
        }).kind,
    );
    expect(kinds).toEqual(['resume', 'resume', 'resume', 'resume', 'resume']);
    expect(autoResendAttemptCount(ledger, 'msg:user-1')).toBe(0);
  });

  it('collapses a reconnect burst into one submission per cooldown window', () => {
    const ledger = ledgerWith({ accepted: false });
    const intentKey = outboundIntentKey({ messageId: 'user-1', body: 'Do it now' });
    const first = resolveReconnectResendPlan({ ...target, ledger, nowMs: 10_000, ...LIVE });
    expect(first.kind).toBe('resend');
    recordAutoResendAttempt(ledger, intentKey, 10_000);

    // Flapping gateway: four more reconnect edges inside the same window.
    for (const offset of [200, 1_000, 5_000, RECONNECT_AUTO_RESEND_COOLDOWN_MS - 1]) {
      const plan = resolveReconnectResendPlan({
        ...target,
        ledger,
        nowMs: 10_000 + offset,
        ...LIVE,
      });
      expect(plan).toEqual({ kind: 'none', reason: 'cooldown' });
    }
    expect(autoResendAttemptCount(ledger, intentKey)).toBe(1);

    // Past the window a genuine new reconnect may try again.
    expect(
      resolveReconnectResendPlan({
        ...target,
        ledger,
        nowMs: 10_000 + RECONNECT_AUTO_RESEND_COOLDOWN_MS,
        ...LIVE,
      }).kind,
    ).toBe('resend');
  });

  it('bounds the whole episode with an attempt cap', () => {
    const ledger = ledgerWith({ accepted: false });
    const intentKey = outboundIntentKey({ messageId: 'user-1', body: 'Do it now' });
    let now = 10_000;
    for (let attempt = 0; attempt < RECONNECT_AUTO_RESEND_MAX_ATTEMPTS; attempt += 1) {
      expect(
        resolveReconnectResendPlan({ ...target, ledger, nowMs: now, ...LIVE }).kind,
      ).toBe('resend');
      recordAutoResendAttempt(ledger, intentKey, now);
      now += RECONNECT_AUTO_RESEND_COOLDOWN_MS;
    }
    expect(resolveReconnectResendPlan({ ...target, ledger, nowMs: now, ...LIVE })).toEqual({
      kind: 'none',
      reason: 'attempts_exhausted',
    });
  });

  it('gives a fresh budget once a submission is finally accepted', () => {
    const ledger = ledgerWith({ accepted: false });
    const intentKey = outboundIntentKey({ messageId: 'user-1', body: 'Do it now' });
    recordAutoResendAttempt(ledger, intentKey, 10_000);
    recordAutoResendAttempt(ledger, intentKey, 40_000);
    expect(autoResendAttemptCount(ledger, intentKey)).toBe(2);

    recordOutboundSubmission(ledger, {
      outboundId: 'ob-2',
      sessionId: 'session-1',
      messageId: 'user-1',
      body: 'Do it now',
      nowMs: 60_000,
    });
    markOutboundSubmissionAccepted(ledger, 'ob-2', 60_500);
    expect(autoResendAttemptCount(ledger, intentKey)).toBe(0);
  });

  it('never auto-resends while offline, in demo, or mid-send', () => {
    const ledger = ledgerWith({ accepted: false });
    expect(
      resolveReconnectResendPlan({ ...target, ledger, nowMs: 10_000, ...LIVE, macChatLive: false }),
    ).toEqual({ kind: 'none', reason: 'offline' });
    expect(
      resolveReconnectResendPlan({ ...target, ledger, nowMs: 10_000, ...LIVE, isDemo: true }),
    ).toEqual({ kind: 'none', reason: 'demo' });
    expect(
      resolveReconnectResendPlan({ ...target, ledger, nowMs: 10_000, ...LIVE, isSending: true }),
    ).toEqual({ kind: 'none', reason: 'busy' });
    expect(
      resolveReconnectResendPlan({ ...target, failedText: '  ', ledger, nowMs: 10_000, ...LIVE }),
    ).toEqual({ kind: 'none', reason: 'nothing_to_send' });
  });

  it('binds a submission recorded before the offline gate to its real session', () => {
    const ledger = createOutboundSubmissionLedger();
    recordOutboundSubmission(ledger, {
      outboundId: 'ob-1',
      sessionId: null,
      messageId: 'user-1',
      body: 'Do it now',
      nowMs: 1_000,
    });
    attachOutboundSubmissionSession(ledger, 'ob-1', 'session-9');
    expect(findOutboundSubmissionForBody(ledger, 'Do it now', 'session-9', 'user-1')).toBeTruthy();
  });
});

/**
 * PR #1241 review (chatgpt-codex-connector, three P1s). Each of these pins a
 * way the auto-resend could have reintroduced the duplicate-run bug it exists
 * to prevent, or silently undone an explicit user action.
 */
describe('auto-resend safety gates', () => {
  const LIVE = { macChatLive: true, isDemo: false, isSending: false };
  const target = {
    failedText: 'Do it now',
    sessionId: 'session-1',
    messageId: 'user-1',
    failureReason: "Can't reach your computer",
  };

  function undispatchedLedger() {
    const ledger = createOutboundSubmissionLedger();
    recordOutboundSubmission(ledger, {
      outboundId: 'ob-1',
      sessionId: 'session-1',
      messageId: 'user-1',
      body: 'Do it now',
      nowMs: 1_000,
    });
    return ledger;
  }

  it('stands down when the request was DISPATCHED but never acknowledged', () => {
    const ledger = undispatchedLedger();
    expect(resolveReconnectResendPlan({ ...target, ledger, nowMs: 9_000, ...LIVE }).kind).toBe(
      'resend',
    );

    // Same turn, but it made it onto the wire before the link died: the Mac may
    // already be running it, so non-delivery can no longer be proven.
    markOutboundSubmissionDispatched(ledger, 'ob-1', 2_000);
    expect(resolveReconnectResendPlan({ ...target, ledger, nowMs: 9_000, ...LIVE })).toEqual({
      kind: 'none',
      reason: 'ambiguous_dispatch',
    });
  });

  it('resumes instead of resending when the server already stored the turn', () => {
    const ledger = undispatchedLedger();
    const plan = resolveReconnectResendPlan({
      ...target,
      serverAcknowledged: true,
      ledger,
      nowMs: 9_000,
      ...LIVE,
    });
    expect(plan.kind).toBe('resume');
  });

  it('never auto-resends a run the user STOPPED', () => {
    const ledger = undispatchedLedger();
    for (const reason of [
      'Stopped before finishing — tap ↑ to try again',
      'Aborted',
      'AbortError',
    ]) {
      expect(
        resolveReconnectResendPlan({ ...target, failureReason: reason, ledger, nowMs: 9_000, ...LIVE }),
      ).toEqual({ kind: 'none', reason: 'not_connectivity' });
    }
  });

  it('never auto-resends a failure a resend cannot fix', () => {
    const ledger = undispatchedLedger();
    for (const reason of [
      'Outdated connection — tap to reconnect',
      'session_in_use: still on the previous chat',
      'Chat too large — start a fresh chat',
    ]) {
      expect(
        resolveReconnectResendPlan({ ...target, failureReason: reason, ledger, nowMs: 9_000, ...LIVE }).kind,
      ).toBe('none');
    }
  });

  it('classifies auto-resendable failure reasons', () => {
    expect(isAutoResendableFailureReason("Can't reach your computer")).toBe(true);
    expect(isAutoResendableFailureReason('Your computer is not connected yet')).toBe(true);
    expect(isAutoResendableFailureReason(undefined)).toBe(true);
    expect(isAutoResendableFailureReason('Stopped before finishing — tap ↑ to try again')).toBe(false);
    expect(isAutoResendableFailureReason('Aborted')).toBe(false);
    expect(isAutoResendableFailureReason('Outdated connection')).toBe(false);
  });

  it('keeps an in-flight unbound record alive while its session is being created', () => {
    const ledger = createOutboundSubmissionLedger();
    recordOutboundSubmission(ledger, {
      outboundId: 'ob-1',
      sessionId: null,
      messageId: 'user-1',
      body: 'Do it now',
      nowMs: 1_000,
    });

    // setCurrentSession lands before attachOutboundSubmissionSession — this ran
    // in between and used to delete the record, losing the acceptance mark.
    scopeOutboundSubmissionsToSession(ledger, 'session-new');
    expect(ledger.records).toHaveLength(1);

    attachOutboundSubmissionSession(ledger, 'ob-1', 'session-new');
    markOutboundSubmissionAccepted(ledger, 'ob-1', 2_000);
    expect(
      resolveReconnectResendPlan({
        failedText: 'Do it now',
        sessionId: 'session-new',
        messageId: 'user-1',
        failureReason: "Can't reach your computer",
        ledger,
        nowMs: 9_000,
        ...LIVE,
      }).kind,
    ).toBe('resume');
  });
});
