import { raceFastestConnectionRoute, SmartRouteCandidate } from '../utils/smartConnectionRouter';
import * as gatewayDiscovery from '../services/gatewayDiscovery';

describe('smartConnectionRouter', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('returns null when candidates list is empty', async () => {
    const result = await raceFastestConnectionRoute([]);
    expect(result).toBeNull();
  });

  it('races candidates concurrently and picks the fastest responding 200 OK candidate', async () => {
    const candidates: SmartRouteCandidate[] = [
      { url: 'http://100.87.85.85:8642', kind: 'tailscale', label: 'Tailscale' },
      { url: 'http://192.168.68.78:8642', kind: 'lan', label: 'Home Wi-Fi' },
    ];

    jest.spyOn(gatewayDiscovery, 'probeGatewayDetailed').mockImplementation(async (url) => {
      if (url.includes('192.168.68.78')) {
        return {
          gatewayUrl: url,
          hostname: 'Igors-MacBook-Pro.local',
          reachable: true,
        } as any;
      }
      return null;
    });

    const result = await raceFastestConnectionRoute(candidates, { timeoutMs: 1000 });
    expect(result).not.toBeNull();
    expect(result?.winnerUrl).toBe('http://192.168.68.78:8642');
    expect(result?.winnerKind).toBe('lan');
  });
});
