import {
  relayWorkerDisplayName,
  resolveRelayRouteDisplay,
  selectRelayWorker,
} from '../utils/relayRouting';
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

  it('shows account relay instead of local machine when unpaired', () => {
    const display = resolveRelayRouteDisplay({
      connectionMode: 'relay',
      isPaired: false,
      connectionState: 'disconnected',
      workers,
      activeWorkerId: 'mac-mini',
      fallbackMachineLabel: '192.168.1.10',
    });

    expect(display.machineLabel).toBe('Hermes account relay');
    expect(display.endpointLabel).toBeUndefined();
    expect(display.routeStatus).toContain('Pair relay in Settings');
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

  it('never says Reconnecting for fresh loopback / empty URL while healing', () => {
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
    expect(empty.routeStatus).toBe('Looking for your Mac…');
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
    expect(usb.routeStatus).toBe('Looking for your Mac…');
  });

  it('routes paired relay to active worker and hides LAN endpoint details', () => {
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
    expect(display.endpointLabel).toBe('via Hermes relay');
    expect(display.routeStatus).toContain('Hermes account');
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
});
