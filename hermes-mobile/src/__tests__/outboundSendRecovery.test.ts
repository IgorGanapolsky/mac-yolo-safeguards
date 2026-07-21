import {
  OUTBOUND_HARD_TIMEOUT_MS,
  OUTBOUND_PENDING_RECOVERY_MS,
  OUTBOUND_SEND_LOCK_TIMEOUT_MS,
  applyStuckOutboundRecovery,
  findStuckPendingOutboundIds,
  shouldRecoverOutboundSendLock,
} from '../utils/outboundSendRecovery';

describe('outboundSendRecovery', () => {
  const now = Date.parse('2026-06-25T14:10:00.000Z');

  it('flags pending user bubbles after recovery window when send is idle', () => {
    const ids = findStuckPendingOutboundIds(
      [
        {
          id: 'user-old',
          role: 'user',
          content: 'Print money make money faster',
          outboundStatus: 'pending',
          created_at: new Date(now - OUTBOUND_PENDING_RECOVERY_MS - 1).toISOString(),
        },
      ],
      now,
      { isSending: false, streamInFlight: false },
    );
    expect(ids).toEqual(['user-old']);
  });

  it('does not soft-recover while isSending or stream is in flight before hard timeout', () => {
    const messages = [
      {
        id: 'user-live',
        role: 'user' as const,
        content: 'still going',
        outboundStatus: 'pending' as const,
        created_at: new Date(now - OUTBOUND_HARD_TIMEOUT_MS + 30_000).toISOString(),
      },
    ];
    expect(findStuckPendingOutboundIds(messages, now, { isSending: true, streamInFlight: false })).toEqual(
      [],
    );
    expect(findStuckPendingOutboundIds(messages, now, { isSending: false, streamInFlight: true })).toEqual(
      [],
    );
  });

  it('hard-recovers pending bubbles after 2m even when streamInFlight is stuck', () => {
    const messages = [
      {
        id: 'user-zombie',
        role: 'user' as const,
        content: 'make money today',
        outboundStatus: 'pending' as const,
        created_at: new Date(now - OUTBOUND_HARD_TIMEOUT_MS - 1).toISOString(),
      },
    ];
    expect(
      findStuckPendingOutboundIds(messages, now, { isSending: true, streamInFlight: true }),
    ).toEqual(['user-zombie']);
  });

  it('marks stuck bubbles failed with no-reply copy', () => {
    const next = applyStuckOutboundRecovery(
      [
        {
          id: 'user-old',
          role: 'user',
          content: 'hello',
          outboundStatus: 'pending',
        },
      ],
      ['user-old'],
    );
    expect(next[0]?.outboundStatus).toBe('failed');
    expect(next[0]?.outboundFailureReason).toBe('Sent — no reply from computer');
  });

  it('releases send lock after timeout when stream never starts', () => {
    const startedAt = Date.parse('2026-06-25T14:00:00.000Z');
    const now = startedAt + OUTBOUND_SEND_LOCK_TIMEOUT_MS + 1;
    expect(
      shouldRecoverOutboundSendLock(startedAt, now, { streamInFlight: false }),
    ).toBe(true);
    expect(
      shouldRecoverOutboundSendLock(startedAt, startedAt + 1_000, { streamInFlight: false }),
    ).toBe(false);
  });

  it('hard-releases send lock at 2m even while streamInFlight is stuck', () => {
    const startedAt = Date.parse('2026-06-25T14:00:00.000Z');
    expect(
      shouldRecoverOutboundSendLock(
        startedAt,
        startedAt + OUTBOUND_HARD_TIMEOUT_MS - 1,
        { streamInFlight: true },
      ),
    ).toBe(false);
    expect(
      shouldRecoverOutboundSendLock(
        startedAt,
        startedAt + OUTBOUND_HARD_TIMEOUT_MS,
        { streamInFlight: true },
      ),
    ).toBe(true);
  });
});
