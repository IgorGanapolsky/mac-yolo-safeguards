import { discoverTailscaleGateways } from '../services/tailscaleDiscovery';

jest.mock('../utils/tailscaleSelfPeer', () => ({
  filterPhoneTailscaleSelfPeers: (items: unknown[]) => items,
  getPhoneTailscaleIpv4: jest.fn().mockResolvedValue('100.1.2.3'),
}));

describe('Tailscale discovery deduplication regression guard', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('deduplicates probes returning the same machine via IP and MagicDNS', async () => {
    global.fetch = jest.fn().mockImplementation((url: string) => {
      if (url.includes('100.94.135.78')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            status: 'ok',
            hostname: 'Igors-Mac-mini.local',
            local_ip: '192.168.68.70',
          }),
        });
      }
      if (url.includes('igors-mac-mini.tail12aa33.ts.net')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            status: 'ok',
            hostname: 'Igors-Mac-mini.local',
            local_ip: '192.168.68.70',
          }),
        });
      }
      return Promise.reject(new Error('Unknown host'));
    }) as jest.Mock;

    const results = await discoverTailscaleGateways([
      '100.94.135.78',
      'igors-mac-mini.tail12aa33.ts.net',
    ]);

    expect(results).toHaveLength(1);
    expect(results[0].hostname).toBe('Igors-Mac-mini.local');
    expect(results[0].gatewayUrl).toBe('http://100.94.135.78:8642');
  });
});
