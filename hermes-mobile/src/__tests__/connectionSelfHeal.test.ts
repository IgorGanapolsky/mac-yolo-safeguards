import type { GatewayProfile } from '../types/gatewayProfile';
import {
  buildSelfHealProbeUrls,
  resolveCellularTailscaleFailoverUrl,
  savedProfileFallbackUrls,
} from '../utils/connectionSelfHeal';

const profiles: GatewayProfile[] = [
  {
    id: 'lan',
    label: 'Mac mini',
    gatewayUrl: 'http://192.168.68.56:8642',
    localIp: '192.168.68.56',
    addedAt: '2026-06-28T00:00:00Z',
  },
  {
    id: 'ts',
    label: 'Mac mini tailnet',
    gatewayUrl: 'http://100.94.135.78:8642',
    addedAt: '2026-06-28T00:00:01Z',
  },
];

describe('connectionSelfHeal', () => {
  it('prefers Tailscale saved URLs when LAN primary fails', () => {
    expect(
      savedProfileFallbackUrls({
        primaryUrl: 'http://192.168.68.56:8642',
        profiles,
        preferTailscaleFirst: true,
      }),
    ).toEqual(['http://100.94.135.78:8642']);
  });

  it('builds probe list with Tailscale before USB loopback', () => {
    const urls = buildSelfHealProbeUrls({
      primaryUrl: 'http://192.168.68.56:8642',
      wifiConnected: true,
      profiles,
      tailnetProbeHosts: ['igors-mac-mini.tail12aa33.ts.net'],
    });
    expect(urls[0]).toBe('http://100.94.135.78:8642');
    expect(urls).toContain('http://igors-mac-mini.tail12aa33.ts.net:8642');
  });

  it('resolves Tailscale failover URL for cellular with LAN primary', () => {
    const failover = resolveCellularTailscaleFailoverUrl({
      primaryUrl: 'http://192.168.68.56:8642',
      profiles,
      activeProfile: profiles[0],
      discoveries: [
        {
          gatewayUrl: 'http://100.94.135.78:8642',
          hostname: 'Igors-Mac-mini.local',
          localIp: '192.168.68.56',
          label: 'Igors-Mac-mini',
        },
      ],
    });
    expect(failover).toBe('http://100.94.135.78:8642');
  });
});
