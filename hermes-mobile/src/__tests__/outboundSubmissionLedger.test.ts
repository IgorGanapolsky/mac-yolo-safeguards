import type { HermesMessage } from '../types/chat';
import {
  OUTBOUND_LEDGER_MAX_RECORDS,
  clearOutboundSubmissions,
  createOutboundId,
  createOutboundSubmissionLedger,
  findOutboundSubmissionForBody,
  hasAcceptedSubmissionForBody,
  markOutboundBubbleDelivered,
  markOutboundSubmissionAccepted,
  recordOutboundSubmission,
  resolveStallRecoveryPlan,
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
