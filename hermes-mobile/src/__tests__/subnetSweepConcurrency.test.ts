import NetInfo from '@react-native-community/netinfo';
import {
  discoverAllGatewaysOnLan,
  SUBNET_BATCH_SIZE,
  SUBNET_PROBE_TIMEOUT_MS,
} from '../services/gatewayDiscovery';

jest.mock('@react-native-community/netinfo', () => ({
  fetch: jest.fn(),
}));

describe('iPad subnet sweep reliability', () => {
  const realFetch = global.fetch;

  beforeEach(() => {
    (NetInfo.fetch as jest.Mock).mockResolvedValue({
      details: { ipAddress: '192.168.68.42' },
    });
  });

  afterEach(() => {
    global.fetch = realFetch;
  });

  it('never exceeds eight simultaneous pair and health requests', async () => {
    let inFlight = 0;
    let peak = 0;
    let calls = 0;

    global.fetch = jest.fn(async () => {
      calls += 1;
      inFlight += 1;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 1));
      inFlight -= 1;
      throw new Error('connection refused');
    }) as unknown as typeof fetch;

    await discoverAllGatewaysOnLan();

    expect(calls).toBeGreaterThan(500);
    expect(peak).toBe(8);
  }, 30_000);

  it('keeps the all-timeout /24 scan below thirty seconds by construction', () => {
    const hostsInSlash24 = 256;
    const batches = Math.ceil(hostsInSlash24 / SUBNET_BATCH_SIZE);
    expect(batches * SUBNET_PROBE_TIMEOUT_MS).toBeLessThan(30_000);
  });

  it('known Tailscale hit finishes far under a full /24 budget', async () => {
    let calls = 0;
    global.fetch = jest.fn(async (url: string) => {
      calls += 1;
      if (String(url).includes('100.94.135.78:8642/health')) {
        return {
          ok: true,
          json: async () => ({ status: 'ok', hostname: 'Igors-Mac-mini.local' }),
        } as Response;
      }
      throw new Error('connection refused');
    }) as unknown as typeof fetch;

    const started = Date.now();
    const { gateways } = await discoverAllGatewaysOnLan(null, {
      tailnetPairServerHosts: ['100.94.135.78'],
    });
    const elapsed = Date.now() - started;

    expect(gateways.length).toBeGreaterThanOrEqual(1);
    expect(calls).toBeLessThan(40);
    expect(elapsed).toBeLessThan(5_000);
  }, 15_000);
});
