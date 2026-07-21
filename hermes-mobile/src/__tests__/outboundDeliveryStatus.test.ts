import {
  isGatewayLiveForDelivery,
  outboundDeliveryLabel,
  OUTBOUND_NO_REPLY_MAC_LIVE,
  OUTBOUND_RUN_STALLED_HINT,
  OUTBOUND_SESSION_BUSY_HINT,
  OUTBOUND_SLOW_REPLY_HINT,
  OUTBOUND_UNREACHABLE_HINT,
  resolveOutboundFailureLabel,
} from '../utils/outboundDeliveryStatus';
import { GATEWAY_WRONG_KEY_MESSAGE } from '../services/gatewayClient';
import { OUTBOUND_STUCK_FAILURE_REASON } from '../utils/outboundSendRecovery';
import { RUN_NO_TOKEN_FAIL_DETAIL } from '../utils/runStaleDetection';

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

  it('does not contradict Connected with Waiting for computer when Mac HTTP is down', () => {
    expect(
      outboundDeliveryLabel('sent', { connectionState: 'connected', macHttpOk: false }),
    ).toBe('○ Still waiting for reply…');
  });

  it('shows resend hint when send failed but Mac health is ok', () => {
    expect(
      outboundDeliveryLabel('failed', { connectionState: 'connected', macHttpOk: true }),
    ).toBe(`⚠ ${OUTBOUND_NO_REPLY_MAC_LIVE}`);
  });

  it('shows resend hint when health is ok but socket is disconnected', () => {
    expect(
      outboundDeliveryLabel('failed', { connectionState: 'disconnected', macHttpOk: true }),
    ).toBe(`⚠ ${OUTBOUND_NO_REPLY_MAC_LIVE}`);
  });

  it('does not treat relay connected as live when Mac HTTP auth failed', () => {
    expect(
      outboundDeliveryLabel('failed', { connectionState: 'connected', macHttpOk: false }),
    ).toBe(`⚠ ${OUTBOUND_UNREACHABLE_HINT}`);
  });

  it('shows wrong-key repair hint when failure reason is auth mismatch', () => {
    expect(
      outboundDeliveryLabel('failed', {
        connectionState: 'connected',
        macHttpOk: false,
        failureReason: 'Outdated connection',
      }),
    ).toBe('⚠ Outdated connection — tap Re-pair this Mac');
  });

  it('shows reachability hint when send failed and Mac health is down', () => {
    expect(
      outboundDeliveryLabel('failed', { connectionState: 'connecting', macHttpOk: false }),
    ).toBe(`⚠ ${OUTBOUND_UNREACHABLE_HINT}`);
  });

  it('shows session-busy hint when Mac operator slot is in use', () => {
    expect(
      resolveOutboundFailureLabel(
        'Your computer is still on the previous chat. Wait a moment, pick another thread, or try again.',
        true,
      ),
    ).toBe(`⚠ ${OUTBOUND_SESSION_BUSY_HINT}`);
  });

  it('shows stalled-run hint for stuck outbound recovery', () => {
    expect(resolveOutboundFailureLabel(OUTBOUND_STUCK_FAILURE_REASON, true)).toBe(
      `⚠ ${OUTBOUND_RUN_STALLED_HINT}`,
    );
  });

  it('uses slow-reply copy for no-token waits — not scary Run stalled', () => {
    expect(resolveOutboundFailureLabel(RUN_NO_TOKEN_FAIL_DETAIL, true)).toBe(
      `⚠ ${OUTBOUND_SLOW_REPLY_HINT}`,
    );
    expect(resolveOutboundFailureLabel(RUN_NO_TOKEN_FAIL_DETAIL, true).toLowerCase()).not.toContain(
      'run stalled',
    );
  });

  it('never shows bare Aborted on outbound bubbles', () => {
    const label = resolveOutboundFailureLabel('Aborted', true);
    expect(label.toLowerCase()).not.toContain('aborted');
    expect(label).toMatch(/Stopped before finishing|tap ↑/i);
  });

  it('shows wrong-key guidance on bubble when auth failed', () => {
    expect(
      outboundDeliveryLabel('failed', {
        connectionState: 'connected',
        macHttpOk: true,
        failureReason: GATEWAY_WRONG_KEY_MESSAGE,
      }),
    ).toBe('⚠ Outdated connection — tap Re-pair this Mac');
  });

  it('treats demo as live for delivery', () => {
    expect(isGatewayLiveForDelivery({ connectionState: 'demo', macHttpOk: false })).toBe(true);
  });
});
