import {
  isFalseUnpairedStatusCopy,
  isMacDirectReachable,
  resolveCalmConnectionStatus,
  resolveLeashHealthDetail,
  resolveOptionalApprovalsFootnote,
  shouldSurfaceLeashEventError,
} from '../utils/connectionStatusContract';
import type { GatewayHealthSnapshot } from '../types/gateway';

function health(partial: Partial<GatewayHealthSnapshot>): GatewayHealthSnapshot {
  return {
    level: 'unknown',
    checkedAt: new Date().toISOString(),
    ...partial,
  };
}

describe('connectionStatusContract', () => {
  it('treats directGatewayReachable as Mac OK even when gatewayState is unpaired', () => {
    expect(
      isMacDirectReachable(
        health({
          level: 'green',
          gatewayState: 'unpaired',
          directGatewayReachable: true,
          hostname: 'Igors-Mac-mini.local',
        }),
      ),
    ).toBe(true);
  });

  it('does not treat relay-only green as Mac reachability', () => {
    expect(
      isMacDirectReachable(
        health({
          level: 'green',
          gatewayState: 'unpaired',
          directGatewayReachable: false,
        }),
      ),
    ).toBe(false);
  });

  it('resolves calm Connected when Mac HTTP is up', () => {
    expect(
      resolveCalmConnectionStatus({
        health: health({
          level: 'green',
          gatewayState: 'unpaired',
          directGatewayReachable: true,
        }),
      }),
    ).toEqual({ status: 'connected', label: 'Connected' });
  });

  it('resolves Checking while health is pending', () => {
    expect(resolveCalmConnectionStatus({ healthPending: true, health: null })).toEqual({
      status: 'checking',
      label: 'Checking…',
    });
  });

  it('resolves Can\'t reach when Mac HTTP is down', () => {
    expect(
      resolveCalmConnectionStatus({
        health: health({ level: 'red', directGatewayReachable: false }),
      }),
    ).toEqual({ status: 'unreachable', label: "Can't reach" });
  });

  it('health detail never says not paired when Mac is reachable', () => {
    const detail = resolveLeashHealthDetail({
      connectionMode: 'relay',
      isPaired: false,
      health: health({
        level: 'green',
        gatewayState: 'unpaired',
        directGatewayReachable: true,
        hostname: 'Igors-Mac-mini.local',
      }),
    });
    expect(detail).toBe('Igors-Mac-mini');
    expect(detail).not.toMatch(/not paired|unpaired|pair relay/i);
  });

  it('uses calm approvals CTA when Mac is down and relay unpaired', () => {
    expect(
      resolveLeashHealthDetail({
        connectionMode: 'relay',
        isPaired: false,
        health: health({
          level: 'red',
          gatewayState: 'unpaired',
          directGatewayReachable: false,
        }),
      }),
    ).toBe('Pair approvals in Settings');
  });

  it('suppresses red Not paired event error while Mac HTTP is OK', () => {
    expect(
      shouldSurfaceLeashEventError({
        lastEventError:
          'Not paired — run desktop bridge pairing and enter the code in Settings.',
        health: health({
          level: 'green',
          gatewayState: 'unpaired',
          directGatewayReachable: true,
        }),
      }),
    ).toBe(false);
  });

  it('still surfaces unrelated Leash errors', () => {
    expect(
      shouldSurfaceLeashEventError({
        lastEventError: 'Failed to open WebSocket',
        health: health({ directGatewayReachable: true, level: 'green' }),
      }),
    ).toBe(true);
  });

  it('detects false unpaired copy variants', () => {
    expect(isFalseUnpairedStatusCopy('Direct link OK · relay not paired')).toBe(true);
    expect(isFalseUnpairedStatusCopy('Gateway healthy')).toBe(false);
    expect(isFalseUnpairedStatusCopy('Connected')).toBe(false);
  });

  it('optional approvals footnote is never primary not-paired panic when Mac is up', () => {
    const footnote = resolveOptionalApprovalsFootnote({
      connectionMode: 'relay',
      isPaired: false,
      macDirectOk: true,
    });
    expect(footnote).toMatch(/Optional/i);
    expect(footnote).not.toMatch(/not paired/i);
  });
});
