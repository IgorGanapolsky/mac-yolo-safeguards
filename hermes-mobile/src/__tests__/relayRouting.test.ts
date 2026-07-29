import {
  DIRECT_LINK_ROUTE_STATUS,
  relayWorkerDisplayName,
  resolveRelayRouteDisplay,
  selectRelayWorker,
} from '../utils/relayRouting';
import { isOptionalPairingStatusCopy } from '../utils/connectionStatusContract';
import type { RelayWorker } from '../types/mobileRelay';

const workers: RelayWorker[] = [
  {
    id: 'mac-mini',
    hostname: 'Igors-Mac-mini.local',
    project: 'skool_top1percent',
    status: 'online',
  },
  {
    id: 'mac-pro',
    label: 'Mac Pro fulfillment worker',
    status: 'idle',
  },
];

describe('relayRouting', () => {
  it('names workers from host and project context', () => {
    expect(relayWorkerDisplayName(workers[0])).toBe('Igors-Mac-mini · skool_top1percent');
    expect(relayWorkerDisplayName(workers[1])).toBe('Mac Pro fulfillment worker');
  });

  it('selects explicit active worker before online fallback', () => {
    expect(selectRelayWorker(workers, 'mac-pro')?.id).toBe('mac-pro');
    expect(selectRelayWorker(workers, null)?.id).toBe('mac-mini');
  });

  it('labels an unpaired cloud approval queue without implying computer transport', () => {
    const display = resolveRelayRouteDisplay({
      connectionMode: 'relay',
      isPaired: false,
      connectionState: 'disconnected',
      workers,
      activeWorkerId: 'mac-mini',
      fallbackMachineLabel: '192.168.1.10',
    });

    expect(display.machineLabel).toBe('Cloud approvals');
    expect(display.endpointLabel).toBeUndefined();
    expect(display.routeStatus).toBe('Pair to receive approval requests anywhere');
  });

  it('suppresses pair relay nag while silently reconnecting on Wi-Fi', () => {
    const display = resolveRelayRouteDisplay({
      connectionMode: 'relay',
      isPaired: false,
      connectionState: 'disconnected',
      workers,
      activeWorkerId: 'mac-mini',
      fallbackMachineLabel: 'Mac mini',
      gatewayUrl: 'http://192.168.68.56:8642',
      wifiConnected: true,
      hasAlternateRoutes: true,
      heal: { attempt: 1, inFlight: true, exhausted: false },
      macHttpOk: false,
    });

    expect(display.routeStatus).toBe('Reconnecting…');
  });

  it('does not describe a fresh unpaired approval queue as a computer connection', () => {
    const empty = resolveRelayRouteDisplay({
      connectionMode: 'relay',
      isPaired: false,
      connectionState: 'disconnected',
      workers: [],
      fallbackMachineLabel: 'Computer',
      gatewayUrl: '',
      heal: { attempt: 1, inFlight: true, exhausted: false },
      macHttpOk: false,
    });
    expect(empty.routeStatus).toBe('Waiting for approval pairing…');
    expect(empty.routeStatus.toLowerCase()).not.toContain('reconnect');

    const usb = resolveRelayRouteDisplay({
      connectionMode: 'relay',
      isPaired: false,
      connectionState: 'disconnected',
      workers: [],
      fallbackMachineLabel: 'Computer via USB',
      gatewayUrl: 'http://127.0.0.1:8642',
      heal: { attempt: 1, inFlight: true, exhausted: false },
      macHttpOk: false,
    });
    expect(usb.routeStatus).toBe('Waiting for approval pairing…');
  });

  it('labels paired relay workers as cloud approvals, not Tailscale transport', () => {
    const display = resolveRelayRouteDisplay({
      connectionMode: 'relay',
      isPaired: true,
      connectionState: 'connected',
      workers,
      activeWorkerId: 'mac-mini',
      fallbackMachineLabel: '192.168.1.10',
      fallbackEndpoint: '192.168.1.10:8642',
    });

    expect(display.machineLabel).toBe('Igors-Mac-mini · skool_top1percent');
    expect(display.endpointLabel).toBe('cloud approvals');
    expect(display.routeStatus).toContain('Approval requests anywhere');
  });

  it('keeps direct fallback display in gateway mode', () => {
    const display = resolveRelayRouteDisplay({
      connectionMode: 'gateway',
      isPaired: true,
      connectionState: 'connected',
      workers,
      activeWorkerId: 'mac-mini',
      fallbackMachineLabel: 'MacBook Pro',
      fallbackEndpoint: '10.2.29.103:8642',
    });

    expect(display.machineLabel).toBe('MacBook Pro');
    expect(display.endpointLabel).toBe('10.2.29.103:8642');
  });
  /**
   * PRODUCT LAW (connectionStatusContract, 2026-07-22 rage; re-broken 2026-07-25):
   * optional cloud-approvals/relay pairing may NEVER be the headline status while the
   * Mac itself is reachable. Screenshot regression:
   * "Igors-Mac-mini · Cloud approvals are not paired · Tailscale".
   */
  it('never surfaces cloud-approvals pairing as route status while the Mac is reachable', () => {
    const display = resolveRelayRouteDisplay({
      connectionMode: 'relay',
      isPaired: false,
      connectionState: 'connected',
      workers,
      activeWorkerId: 'mac-mini',
      fallbackMachineLabel: 'Igors-Mac-mini',
      fallbackEndpoint: 'Tailscale',
      gatewayUrl: 'http://igors-mac-mini.tail12aa33.ts.net:8642',
      heal: { attempt: 3, inFlight: false, exhausted: true },
      wifiConnected: false,
      macHttpOk: true,
    });

    expect(display.routeStatus).toBe(DIRECT_LINK_ROUTE_STATUS);
    expect(display.routeStatus.toLowerCase()).not.toContain('not paired');
    expect(display.routeStatus.toLowerCase()).not.toContain('cloud approvals');
    expect(display.machineLabel).toBe('Igors-Mac-mini');
    expect(isOptionalPairingStatusCopy(display.routeStatus)).toBe(false);
    // Pairing stays discoverable, but only as a calm secondary footnote.
    expect(display.optionalApprovalsNote).toMatch(/Optional/i);
  });

  it('still nags to pair cloud approvals when the Mac is NOT reachable', () => {
    const display = resolveRelayRouteDisplay({
      connectionMode: 'relay',
      isPaired: false,
      connectionState: 'disconnected',
      workers,
      activeWorkerId: 'mac-mini',
      fallbackMachineLabel: 'Igors-Mac-mini',
      gatewayUrl: 'http://igors-mac-mini.tail12aa33.ts.net:8642',
      heal: { attempt: 3, inFlight: false, exhausted: true },
      macHttpOk: false,
    });

    expect(display.machineLabel).toBe('Cloud approvals');
    expect(display.routeStatus).toBe('Pair to receive approval requests anywhere');
  });
});
