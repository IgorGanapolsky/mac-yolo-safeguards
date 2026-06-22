import {
  isGatewayHealthOk,
  isGatewayReachable,
  describeBootstrapPhase,
} from '../utils/gatewayConnection';

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
});
