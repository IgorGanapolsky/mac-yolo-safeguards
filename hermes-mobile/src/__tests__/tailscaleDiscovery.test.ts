import {
  collectTailnetProbeHosts,
  discoveredGatewayFromHealth,
  filterNewTailscaleDiscoveries,
  tailscaleDiscoveryLabel,
} from '../services/tailscaleDiscovery';
import {
  buildTailscaleGatewayUrl,
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

  it('creates a saved profile payload from /health JSON', () => {
    const discovered = discoveredGatewayFromHealth('http://100.94.135.78:8642', {
      status: 'ok',
      hostname: 'Igors-Mac-mini.local',
      local_ip: '192.168.68.56',
    });
    expect(discovered).toEqual({
      gatewayUrl: 'http://100.94.135.78:8642',
      hostname: 'Igors-Mac-mini.local',
      localIp: '192.168.68.56',
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
});
