import {
  OUTBOUND_ACK_TIMEOUT_MS,
  OUTBOUND_SENDING_LABEL,
  OUTBOUND_STILL_CONNECTING_LABEL,
  isOutboundAckTimedOut,
  outboundPendingAckLabel,
  outboundPendingAgeMs,
} from '../utils/outboundAckFeedback';
import { outboundDeliveryLabel } from '../utils/outboundDeliveryStatus';

describe('outboundAckFeedback', () => {
  it('uses a 3s ack timeout', () => {
    expect(OUTBOUND_ACK_TIMEOUT_MS).toBe(3000);
    expect(isOutboundAckTimedOut(2999)).toBe(false);
    expect(isOutboundAckTimedOut(3000)).toBe(true);
  });

  it('computes pending age from ISO created_at', () => {
    const created = '2026-07-16T13:00:00.000Z';
    const now = Date.parse('2026-07-16T13:00:04.000Z');
    expect(outboundPendingAgeMs(created, now)).toBe(4000);
  });

  it('shows Sending… before ack timeout when Mac HTTP is live', () => {
    expect(outboundPendingAckLabel({ ageMs: 500, macHttpOk: true })).toBe(OUTBOUND_SENDING_LABEL);
  });

  it('shows Still connecting… after 3s without ack', () => {
    expect(outboundPendingAckLabel({ ageMs: 3000, macHttpOk: true })).toBe(
      OUTBOUND_STILL_CONNECTING_LABEL,
    );
    expect(outboundPendingAckLabel({ ageMs: 500, macHttpOk: false })).toBe(
      OUTBOUND_STILL_CONNECTING_LABEL,
    );
  });

  it('wires Still connecting… through outboundDeliveryLabel for pending bubbles', () => {
    expect(
      outboundDeliveryLabel('pending', {
        connectionState: 'connected',
        macHttpOk: true,
        pendingAgeMs: 3500,
      }),
    ).toBe(OUTBOUND_STILL_CONNECTING_LABEL);

    expect(
      outboundDeliveryLabel('pending', {
        connectionState: 'connected',
        macHttpOk: true,
        pendingAgeMs: 200,
      }),
    ).toBe(OUTBOUND_SENDING_LABEL);
  });

  it('promotes sent-but-unreachable bubbles to Still connecting… after timeout', () => {
    expect(
      outboundDeliveryLabel('sent', {
        connectionState: 'connected',
        macHttpOk: false,
        pendingAgeMs: 4000,
      }),
    ).toBe(OUTBOUND_STILL_CONNECTING_LABEL);
  });
});
