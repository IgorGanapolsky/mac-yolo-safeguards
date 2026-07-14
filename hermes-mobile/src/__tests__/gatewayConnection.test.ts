import {
  isGatewayHealthOk,
  isMacGatewayHttpOk,
  isGatewayReachable,
  describeBootstrapPhase,
  resolveChatLinkDisplay,
  resolveEffectiveMacHttpOk,
} from '../utils/gatewayConnection';
import { GATEWAY_AUTH_REPAIR_HEADER } from '../services/gatewayClient';

describe('gatewayConnection', () => {
  it('treats green health as reachable', () => {
    expect(
      isGatewayReachable({
        demoMode: false,
        health: { level: 'green', checkedAt: '2026-06-18T12:00:00Z' },
        gatewayUrl: 'http://192.168.12.208:8642',
      }),
    ).toBe(true);
  });

  it('treats demo mode as reachable without health', () => {
    expect(
      isGatewayReachable({
        demoMode: true,
        health: null,
        gatewayUrl: 'http://127.0.0.1:8642',
      }),
    ).toBe(true);
  });

  it('flags unreachable when health is red', () => {
    expect(
      isGatewayReachable({
        demoMode: false,
        health: { level: 'red', checkedAt: '2026-06-18T12:00:00Z' },
        gatewayUrl: 'http://192.168.12.208:8642',
      }),
    ).toBe(false);
  });

  it('describes bootstrap phases for UI', () => {
    expect(describeBootstrapPhase('searching')).toContain('Wi‑Fi');
    expect(isGatewayHealthOk({ level: 'amber', checkedAt: '' })).toBe(true);
  });

  it('shows relay only when socket is up but chat HTTP is down', () => {
    expect(
      resolveChatLinkDisplay({
        connectionState: 'connected',
        macHttpOk: false,
      }),
    ).toEqual({ label: 'Relay only', chatReachable: false });
  });

  it('mac HTTP ok uses directGatewayReachable when set', () => {
    expect(
      isMacGatewayHttpOk({
        level: 'green',
        checkedAt: '',
        directGatewayReachable: false,
      }),
    ).toBe(false);
    expect(
      isMacGatewayHttpOk({
        level: 'green',
        checkedAt: '',
        directGatewayReachable: true,
      }),
    ).toBe(true);
  });

  it('effective mac HTTP false after connectivity send failure despite stale health', () => {
    expect(
      resolveEffectiveMacHttpOk({
        macHttpOk: true,
        connectivityFailure: true,
      }),
    ).toBe(false);
    expect(
      resolveEffectiveMacHttpOk({
        macHttpOk: true,
        connectivityFailure: false,
      }),
    ).toBe(true);
  });

  it('shows wrong-key copy instead of Connected when auth mismatches', () => {
    expect(
      resolveChatLinkDisplay({
        connectionState: 'connected',
        macHttpOk: false,
        authMismatch: true,
      }),
    ).toEqual({ label: GATEWAY_AUTH_REPAIR_HEADER, chatReachable: false });
  });

  it('treats authMismatch health as not mac HTTP ok', () => {
    expect(
      isMacGatewayHttpOk({
        level: 'green',
        checkedAt: '2026-07-08T12:00:00Z',
        directGatewayReachable: true,
        authMismatch: true,
      }),
    ).toBe(false);
  });

  it('shows resend hint when health is ok but last chat failed (never "stalled")', () => {
    expect(
      resolveChatLinkDisplay({
        connectionState: 'connected',
        macHttpOk: true,
        chatStalled: true,
      }),
    ).toEqual({
      label: 'Connected — tap ↑ to resend',
      chatReachable: true,
      chatStalled: true,
    });
    expect(
      resolveChatLinkDisplay({
        connectionState: 'connected',
        macHttpOk: true,
        chatStalled: true,
      }).label.toLowerCase(),
    ).not.toContain('stalled');
  });
});
