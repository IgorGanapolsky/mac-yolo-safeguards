import {
  isGatewayLiveForDelivery,
  outboundDeliveryLabel,
  truncateOutboundFailureReason,
} from '../utils/outboundDeliveryStatus';

describe('outboundDeliveryStatus', () => {
  it('shows waiting instead of sent when Mac is unreachable', () => {
    expect(
      outboundDeliveryLabel('sent', { connectionState: 'connecting', macHttpOk: false }),
    ).toBe('○ Waiting for computer…');
  });

  it('shows sent when HTTP health is ok even if socket is connecting', () => {
    expect(
      outboundDeliveryLabel('sent', { connectionState: 'connecting', macHttpOk: true }),
    ).toBe('✓ Sent');
  });

  it('shows waiting instead of sent when relay is up but Mac HTTP is down', () => {
    expect(
      outboundDeliveryLabel('sent', { connectionState: 'connected', macHttpOk: false }),
    ).toBe('○ Waiting for computer…');
  });

  it('shows no-reply hint when send failed but Mac health is ok', () => {
    expect(
      outboundDeliveryLabel('failed', { connectionState: 'connected', macHttpOk: true }),
    ).toBe('⚠ No reply — tap ↑ again');
  });

  it('does not treat relay connected as live when Mac HTTP auth failed', () => {
    expect(
      outboundDeliveryLabel('failed', { connectionState: 'connected', macHttpOk: false }),
    ).toBe("⚠ Couldn't reach your computer — tap Computer above");
  });

  it('shows wrong-key repair hint when failure reason is auth mismatch', () => {
    expect(
      outboundDeliveryLabel('failed', {
        connectionState: 'connected',
        macHttpOk: false,
        failureReason: 'Wrong key for this computer',
      }),
    ).toBe('⚠ Wrong key — tap Computer above to refresh');
  });

  it('shows reachability hint when send failed and Mac health is down', () => {
    expect(
      outboundDeliveryLabel('failed', { connectionState: 'connecting', macHttpOk: false }),
    ).toBe("⚠ Couldn't reach your computer — tap Computer above");
  });

  it('shows reconnect hint when health is stale but link is not live', () => {
    expect(
      outboundDeliveryLabel('failed', { connectionState: 'disconnected', macHttpOk: true }),
    ).toBe('⚠ No reply — tap Computer above or ↑');
  });

  it('shows truncated failure reason on bubble when provided', () => {
    const longReason =
      'Sign-in to your computer failed. Open Settings and pair again.';
    expect(
      outboundDeliveryLabel('failed', {
        connectionState: 'connected',
        macHttpOk: true,
        failureReason: longReason,
      }),
    ).toBe(`⚠ ${truncateOutboundFailureReason(longReason)}`);
    expect(truncateOutboundFailureReason(longReason).length).toBeLessThanOrEqual(40);
  });

  it('treats demo as live for delivery', () => {
    expect(isGatewayLiveForDelivery({ connectionState: 'demo', macHttpOk: false })).toBe(true);
  });
});
