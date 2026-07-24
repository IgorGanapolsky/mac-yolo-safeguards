import {
  collectTailnetProbeHosts,
  discoveredGatewayFromHealth,
  discoverTailscaleGateways,
  filterNewTailscaleDiscoveries,
  tailscaleDiscoveryLabel,
} from '../services/tailscaleDiscovery';
import {
  buildTailscaleGatewayUrl,
  isTailnetRouteLabel,
  isTailscaleGatewayUrl,
  isTailscaleIpv4,
  mergeTailnetProbeHosts,
} from '../utils/tailscaleHosts';

describe('tailscaleDiscovery', () => {
  it('detects Tailscale CGNAT IPv4 addresses', () => {
    expect(isTailscaleIpv4('100.94.135.78')).toBe(true);
    expect(isTailscaleIpv4('100.63.1.1')).toBe(false);
    expect(isTailscaleIpv4('192.168.1.1')).toBe(false);
  });

  it('builds gateway URLs for tailnet hosts', () => {
    expect(buildTailscaleGatewayUrl('100.94.135.78')).toBe('http://100.94.135.78:8642');
    expect(isTailscaleGatewayUrl('http://100.94.135.78:8642')).toBe(true);
    expect(isTailscaleGatewayUrl('http://mac-mini.tailnet.ts.net:8642')).toBe(true);
  });

  it('detects tailnet route labels vs Bonjour machine names', () => {
    expect(isTailnetRouteLabel('igors-mac-mini.tail12aa33.ts.net')).toBe(true);
    expect(isTailnetRouteLabel('100.94.135.78')).toBe(true);
    expect(isTailnetRouteLabel('Igors-Mac-mini')).toBe(false);
    expect(isTailnetRouteLabel('Igors-Mac-mini.local')).toBe(false);
  });

  it('creates a saved profile payload from /health JSON', () => {
    const discovered = discoveredGatewayFromHealth('http://100.94.135.78:8642', {
      status: 'ok',
      hostname: 'Igors-Mac-mini.local',
      local_ip: '192.168.68.56',
    });
    expect(discovered).toEqual({
      gatewayUrl: 'http://100.94.135.78:8642',
      hostname: 'Igors-Mac-mini.local',
      // Prefer probed Tailscale CGNAT IP over /health LAN local_ip.
      localIp: '100.94.135.78',
      label: 'Igors-Mac-mini',
    });
    expect(tailscaleDiscoveryLabel(discovered!)).toBe('Igors-Mac-mini');
  });

  it('ignores unhealthy gateway responses', () => {
    expect(
      discoveredGatewayFromHealth('http://100.94.135.78:8642', {
        status: 'degraded',
        hostname: 'Igors-Mac-mini.local',
      }),
    ).toBeNull();
  });

  it('merges probe hosts from profiles and stored seeds', () => {
    const hosts = collectTailnetProbeHosts(
      [
        {
          id: 'mini',
          label: 'Mac mini',
          gatewayUrl: 'http://100.94.135.78:8642',
          hostname: 'Igors-Mac-mini.local',
          addedAt: '2026-06-26T00:00:00Z',
        },
      ],
      ['macbook.tailnet.ts.net'],
    );
    expect(hosts.sort()).toEqual(['100.94.135.78', 'macbook.tailnet.ts.net'].sort());
    expect(mergeTailnetProbeHosts(['100.94.135.78', '100.94.135.78'])).toEqual(['100.94.135.78']);
  });

  it('filters out computers that are already saved', () => {
    const discovered = [
      {
        gatewayUrl: 'http://100.94.135.78:8642',
        hostname: 'Igors-Mac-mini.local',
        localIp: '192.168.68.56',
        label: 'Igors-Mac-mini',
      },
    ];
    const usbOnly = filterNewTailscaleDiscoveries(
      [
        {
          id: 'usb',
          label: 'Mac via USB',
          gatewayUrl: 'http://127.0.0.1:8642',
          hostname: 'Igors-MacBook-Pro.local',
          addedAt: '2026-06-26T00:00:00Z',
        },
      ],
      discovered,
    );
    expect(usbOnly).toHaveLength(1);

    const alreadySaved = filterNewTailscaleDiscoveries(
      [
        {
          id: 'mini',
          label: 'Igors-Mac-mini',
          gatewayUrl: 'http://100.94.135.78:8642',
          hostname: 'Igors-Mac-mini.local',
          addedAt: '2026-06-26T00:00:00Z',
        },
      ],
      discovered,
    );
    expect(alreadySaved).toHaveLength(0);

    const lanOnlyStillShowsTailscale = filterNewTailscaleDiscoveries(
      [
        {
          id: 'mini-lan',
          label: 'Igors-Mac-mini',
          gatewayUrl: 'http://192.168.68.56:8642',
          hostname: 'Igors-Mac-mini.local',
          localIp: '192.168.68.56',
          addedAt: '2026-06-26T00:00:00Z',
        },
      ],
      discovered,
    );
    expect(lanOnlyStillShowsTailscale).toHaveLength(1);
  });

  it('collapses MagicDNS + CGNAT twins to one chip per physical Mac', () => {
    // Fixture that previously rendered: Add Igors-Mac-mini ×2, Add Igors-MacBook-Pro ×2
    const doubles = [
      {
        gatewayUrl: 'http://100.94.135.78:8642',
        hostname: 'Igors-Mac-mini.local',
        localIp: '100.94.135.78',
        label: 'Igors-Mac-mini',
      },
      {
        gatewayUrl: 'http://igors-mac-mini.tail12aa33.ts.net:8642',
        hostname: 'Igors-Mac-mini.local',
        label: 'Igors-Mac-mini',
      },
      {
        gatewayUrl: 'http://100.87.85.85:8642',
        hostname: 'Igors-MacBook-Pro.local',
        localIp: '100.87.85.85',
        label: 'Igors-MacBook-Pro',
      },
      {
        gatewayUrl: 'http://igors-macbook-pro.tail12aa33.ts.net:8642',
        hostname: 'Igors-MacBook-Pro.local',
        label: 'Igors-MacBook-Pro',
      },
    ];
    const unique = filterNewTailscaleDiscoveries([], doubles);
    expect(unique).toHaveLength(2);
    expect(unique.map((d) => tailscaleDiscoveryLabel(d)).sort()).toEqual([
      'Igors-Mac-mini',
      'Igors-MacBook-Pro',
    ]);
    // Prefer MagicDNS URL over bare CGNAT twin; keep CGNAT localIp when present.
    expect(
      unique.find((d) => d.hostname?.includes('Mac-mini'))?.gatewayUrl,
    ).toBe('http://igors-mac-mini.tail12aa33.ts.net:8642');
    expect(
      unique.find((d) => d.hostname?.includes('Mac-mini'))?.localIp,
    ).toBe('100.94.135.78');
    expect(
      unique.find((d) => d.hostname?.includes('MacBook-Pro'))?.gatewayUrl,
    ).toBe('http://igors-macbook-pro.tail12aa33.ts.net:8642');
  });
});

describe('discoverTailscaleGateways machine dedupe', () => {
  beforeEach(() => {
    global.fetch = jest.fn();
  });

  it('probes MagicDNS+CGNAT hosts and returns one discovery per hostname', async () => {
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      const mini =
        url.includes('100.94.135.78') || url.includes('igors-mac-mini.tail12aa33.ts.net');
      const pro =
        url.includes('100.87.85.85') || url.includes('igors-macbook-pro.tail12aa33.ts.net');
      if (!mini && !pro) {
        return Promise.resolve({ ok: false, json: async () => ({}) });
      }
      return Promise.resolve({
        ok: true,
        json: async () => ({
          status: 'ok',
          hostname: mini ? 'Igors-Mac-mini.local' : 'Igors-MacBook-Pro.local',
          local_ip: mini ? '192.168.68.56' : '192.168.68.77',
        }),
      });
    });

    const discovered = await discoverTailscaleGateways([
      '100.94.135.78',
      'igors-mac-mini.tail12aa33.ts.net',
      '100.87.85.85',
      'igors-macbook-pro.tail12aa33.ts.net',
    ]);

    expect(discovered).toHaveLength(2);
    expect(discovered.map((d) => tailscaleDiscoveryLabel(d)).sort()).toEqual([
      'Igors-Mac-mini',
      'Igors-MacBook-Pro',
    ]);
    expect(discovered.every((d) => d.gatewayUrl.includes('.ts.net'))).toBe(true);
  });
});
