import NetInfo from '@react-native-community/netinfo';
import { fetchGatewayHealth } from '../services/gatewayClient';
import {
  discoverGatewayOnPhoneSubnet,
  SUBNET_BATCH_SIZE,
  SUBNET_PROBE_TIMEOUT_MS,
} from '../services/gatewayDiscovery';
import {
  connectManualGatewayAddress,
  TAILSCALE_MANUAL_PROBE_TIMEOUT_MS,
  TAILSCALE_RELAY_ROUND_TRIP_MS,
  type ManualGatewayConnectionDependencies,
} from '../services/manualGatewayConnection';

jest.mock('@react-native-community/netinfo', () => ({
  fetch: jest.fn(),
}));

/**
 * Cellular Hermes Mobile reaches a Mac over a Tailscale DERP relay, never directly.
 * Measured against the phone's own tailnet peer:
 *
 *   $ tailscale ping 100.70.124.54
 *   pong from ... via DERP(iad) in 3.416s
 *   direct connection not established
 *
 * These tests replay that link: one relayed round trip costs
 * TAILSCALE_RELAY_ROUND_TRIP_MS, and the first request on a fresh relayed socket
 * also pays the TCP handshake (two round trips before the first byte).
 */
const GATEWAY_URL = 'http://100.94.135.78:8642';
const PREVIOUS_TAILSCALE_BUDGET_MS = 12_000;

type RelayRoute = { status: number; body?: unknown };

function derpRelayFetch(route: (url: string) => RelayRoute | null) {
  const socketOpened = new Set<string>();
  return jest.fn((url: string, options?: { signal?: AbortSignal }) => {
    const origin = url.split('/').slice(0, 3).join('/');
    const firstRequestOnSocket = !socketOpened.has(origin);
    socketOpened.add(origin);
    // TCP handshake + request/response on a fresh relayed socket, one round trip
    // once the socket is warm.
    const latencyMs = TAILSCALE_RELAY_ROUND_TRIP_MS * (firstRequestOnSocket ? 2 : 1);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const match = route(url);
        if (!match) {
          reject(new Error('connection refused'));
          return;
        }
        resolve({
          ok: match.status >= 200 && match.status < 300,
          status: match.status,
          json: async () => match.body ?? {},
        });
      }, latencyMs);
      options?.signal?.addEventListener('abort', () => {
        clearTimeout(timer);
        reject(new Error('Aborted'));
      });
    });
  }) as unknown as typeof fetch;
}

/** A healthy Mac gateway with no /health/detailed route — forces the documented fallback. */
function healthyMacOverDerp() {
  return derpRelayFetch((url) => {
    if (url.includes('/health/detailed')) {
      return { status: 404 };
    }
    if (url.includes('/health')) {
      return {
        status: 200,
        body: {
          status: 'ok',
          gateway_state: 'running',
          hostname: 'Igors-MacBook-Pro.local',
        },
      };
    }
    if (url.includes('/api/sessions')) {
      return { status: 200, body: { sessions: [] } };
    }
    return null;
  });
}

function explicitConnectDependencies(): ManualGatewayConnectionDependencies {
  return {
    // Already paired from a previous session — this test isolates the health verify.
    loadApiKey: jest.fn().mockResolvedValue('paired-key'),
    saveApiKey: jest.fn().mockResolvedValue(undefined),
    clearApiKey: jest.fn().mockResolvedValue(undefined),
    // Pair server (:8765) is not exposed over the relay in this scenario.
    resolvePairServerSetupParams: jest.fn().mockResolvedValue(null),
    withFreshPairServerSetup: jest.fn().mockResolvedValue(null),
    exchangePairingCode: jest.fn().mockResolvedValue(null),
    // The real client — its wall-clock budget is what this fix changes.
    fetchGatewayHealth,
    rememberTailnetProbeHost: jest.fn().mockResolvedValue(undefined),
  };
}

describe('explicit connect over a Tailscale DERP relay', () => {
  const realFetch = global.fetch;

  afterEach(() => {
    global.fetch = realFetch;
    jest.useRealTimers();
  });

  it('verifies a healthy Mac that answers in ~3.5s per relayed round trip', async () => {
    jest.useFakeTimers();
    global.fetch = healthyMacOverDerp();
    const persistProfile = jest.fn().mockResolvedValue(undefined);

    const connect = connectManualGatewayAddress(
      {
        gatewayUrl: GATEWAY_URL,
        fallbackLabel: 'Tailscale computer',
        persistProfile,
      },
      explicitConnectDependencies(),
    );
    const settled = connect.then(
      () => 'connected',
      (error: Error) => error.message,
    );

    await jest.advanceTimersByTimeAsync(TAILSCALE_MANUAL_PROBE_TIMEOUT_MS);

    await expect(settled).resolves.toBe('connected');
    expect(persistProfile).toHaveBeenCalledWith(
      'Igors-MacBook-Pro',
      GATEWAY_URL,
      'paired-key',
    );
  });

  it('would have aborted the same healthy Mac on the previous 12s budget', async () => {
    jest.useFakeTimers();
    global.fetch = healthyMacOverDerp();

    const stale = fetchGatewayHealth(GATEWAY_URL, 'paired-key', PREVIOUS_TAILSCALE_BUDGET_MS);
    await jest.advanceTimersByTimeAsync(PREVIOUS_TAILSCALE_BUDGET_MS + 1);
    const staleSnapshot = await stale;
    // This is the reported bug: the relayed Mac is up (curl returns 200 on the Mac)
    // but the probe is cut off mid-verification, so Connect reports
    // "Couldn't reach Hermes at this Tailscale address."
    expect(staleSnapshot.directGatewayReachable).toBeFalsy();

    global.fetch = healthyMacOverDerp();
    const relaySized = fetchGatewayHealth(
      GATEWAY_URL,
      'paired-key',
      TAILSCALE_MANUAL_PROBE_TIMEOUT_MS,
    );
    await jest.advanceTimersByTimeAsync(TAILSCALE_MANUAL_PROBE_TIMEOUT_MS);
    const relaySnapshot = await relaySized;
    expect(relaySnapshot.directGatewayReachable).toBe(true);
    expect(relaySnapshot.level).toBe('green');
  });

  it('budgets at least three relayed round trips for the explicit path', () => {
    expect(TAILSCALE_MANUAL_PROBE_TIMEOUT_MS).toBeGreaterThan(
      TAILSCALE_RELAY_ROUND_TRIP_MS * 3,
    );
    // Never an unbounded spinner: stays under the explicit repair ceiling.
    expect(TAILSCALE_MANUAL_PROBE_TIMEOUT_MS).toBeLessThanOrEqual(30_000);
  });
});

describe('background LAN discovery keeps its short probe budget', () => {
  const realFetch = global.fetch;

  beforeEach(() => {
    (NetInfo.fetch as jest.Mock).mockResolvedValue({
      details: { ipAddress: '192.168.68.42' },
    });
  });

  afterEach(() => {
    global.fetch = realFetch;
    jest.useRealTimers();
  });

  it('still aborts subnet sweep probes at 400ms, not on the relay budget', async () => {
    jest.useFakeTimers();
    let aborted = 0;
    global.fetch = jest.fn(
      (_url: string, options?: { signal?: AbortSignal }) =>
        new Promise((_resolve, reject) => {
          options?.signal?.addEventListener('abort', () => {
            aborted += 1;
            reject(new Error('Aborted'));
          });
        }),
    ) as unknown as typeof fetch;

    const scan = discoverGatewayOnPhoneSubnet();

    await jest.advanceTimersByTimeAsync(SUBNET_PROBE_TIMEOUT_MS - 1);
    expect(aborted).toBe(0);

    await jest.advanceTimersByTimeAsync(1);
    expect(aborted).toBeGreaterThan(0);
    expect(aborted).toBeLessThanOrEqual(SUBNET_BATCH_SIZE);

    // Drain the bounded sweep so nothing is left in flight.
    await jest.advanceTimersByTimeAsync(
      Math.ceil(256 / SUBNET_BATCH_SIZE) * SUBNET_PROBE_TIMEOUT_MS,
    );
    await expect(scan).resolves.toBeNull();
  });

  it('leaves the sweep constants untouched by the explicit-path fix', () => {
    expect(SUBNET_PROBE_TIMEOUT_MS).toBe(400);
    expect(SUBNET_BATCH_SIZE).toBe(4);
    expect(Math.ceil(256 / SUBNET_BATCH_SIZE) * SUBNET_PROBE_TIMEOUT_MS).toBeLessThan(
      30_000,
    );
  });
});
