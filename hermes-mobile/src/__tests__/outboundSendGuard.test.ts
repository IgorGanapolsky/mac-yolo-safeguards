import {
  decideOutboundSendWhileBusy,
  isSameOutboundBody,
  queueAlreadyHasBody,
} from '../utils/outboundSendGuard';

describe('outboundSendGuard', () => {
  it('treats whitespace/case as same body', () => {
    expect(isSameOutboundBody('make money faster', '  Make Money Faster  ')).toBe(true);
    expect(isSameOutboundBody('a', 'b')).toBe(false);
  });

  it('detects body already on the queue', () => {
    expect(queueAlreadyHasBody(['hello', 'make money faster'], 'Make money faster')).toBe(true);
    expect(queueAlreadyHasBody(['hello'], 'make money faster')).toBe(false);
  });

  it('sends when idle', () => {
    expect(
      decideOutboundSendWhileBusy({
        isSending: false,
        body: 'make money faster',
        inFlightBody: null,
        lastCommittedBody: null,
        queue: [],
      }),
    ).toEqual({ action: 'send' });
  });

  it('ignores identical double-tap while in flight (no second bubble)', () => {
    expect(
      decideOutboundSendWhileBusy({
        isSending: true,
        body: 'make money faster',
        inFlightBody: 'make money faster',
        lastCommittedBody: 'make money faster',
        queue: [],
      }),
    ).toEqual({ action: 'ignore' });
  });

  it('ignores when last committed bubble already shows the same text', () => {
    expect(
      decideOutboundSendWhileBusy({
        isSending: true,
        body: 'make money faster',
        inFlightBody: null,
        lastCommittedBody: 'make money faster',
        queue: [],
      }),
    ).toEqual({ action: 'ignore' });
  });

  it('queues a different follow-up message with a bubble', () => {
    expect(
      decideOutboundSendWhileBusy({
        isSending: true,
        body: 'second prompt',
        inFlightBody: 'first prompt',
        lastCommittedBody: 'first prompt',
        queue: [],
      }),
    ).toEqual({ action: 'queue', body: 'second prompt', commitBubble: true });
  });

  it('does not re-queue an already-queued body', () => {
    expect(
      decideOutboundSendWhileBusy({
        isSending: true,
        body: 'second prompt',
        inFlightBody: 'first prompt',
        lastCommittedBody: 'first prompt',
        queue: ['second prompt'],
      }),
    ).toEqual({ action: 'ignore' });
  });
});
