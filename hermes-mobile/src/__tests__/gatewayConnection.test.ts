import {
  isGatewayHealthOk,
  isMacGatewayHttpOk,
  isGatewayReachable,
  describeBootstrapPhase,
  resolveChatLinkDisplay,
  resolveEffectiveMacHttpOk,
  isConnectedWrongKeyContradiction,
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

  it('needsPair wins over Connecting so unpaired relay never looks Tailscale-healthy', () => {
    expect(
      resolveChatLinkDisplay({
        connectionState: 'connecting',
        macHttpOk: false,
        needsPair: true,
        pairStatusLabel: 'Pair relay in Settings for Wi‑Fi, cellular, or USB',
      }),
    ).toEqual({
      label: 'Pair relay in Settings for Wi‑Fi, cellular, or USB',
      chatReachable: false,
    });
    expect(
      resolveChatLinkDisplay({
        connectionState: 'connecting',
        macHttpOk: false,
        needsPair: true,
      }),
    ).toEqual({ label: 'Pair in Settings', chatReachable: false });
  });

  it('needsPair does not override Connected when Mac HTTP is up', () => {
    expect(
      resolveChatLinkDisplay({
        connectionState: 'connecting',
        macHttpOk: true,
        needsPair: true,
      }),
    ).toEqual({ label: 'Connected', chatReachable: true });
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
        macHttpOk: true,
        authMismatch: true,
      }),
    ).toEqual({ label: GATEWAY_AUTH_REPAIR_HEADER, chatReachable: false });
  });

  it('RELEASE BLOCK: never green Connected while wrong-key banner is active', () => {
    const link = resolveChatLinkDisplay({
      connectionState: 'connected',
      macHttpOk: true,
      wrongKeyBannerActive: true,
    });
    expect(link.label).toBe(GATEWAY_AUTH_REPAIR_HEADER);
    expect(link.chatReachable).toBe(false);
    expect(
      isConnectedWrongKeyContradiction({
        linkLabel: link.label,
        wrongKeyBannerActive: true,
      }),
    ).toBe(false);
    expect(
      isConnectedWrongKeyContradiction({
        linkLabel: 'Connected',
        authMismatch: true,
      }),
    ).toBe(true);
    expect(
      isConnectedWrongKeyContradiction({
        linkLabel: 'Connected',
        wrongKeyBannerActive: true,
      }),
    ).toBe(true);
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

  it('isGatewayHealthOk rejects green level when authMismatch is set', () => {
    expect(
      isGatewayHealthOk({
        level: 'green',
        checkedAt: '2026-07-13T12:00:00Z',
        authMismatch: true,
      }),
    ).toBe(false);
  });

  it('effective mac HTTP false when authMismatch even if health was green', () => {
    expect(
      resolveEffectiveMacHttpOk({
        macHttpOk: true,
        authMismatch: true,
      }),
    ).toBe(false);
  });

  it('shows amber stalled label when health is ok but last chat failed', () => {
    expect(
      resolveChatLinkDisplay({
        connectionState: 'connected',
        macHttpOk: true,
        chatStalled: true,
      }),
    ).toEqual({
      label: 'Connected — chat stalled',
      chatReachable: true,
      chatStalled: true,
    });
  });
});
