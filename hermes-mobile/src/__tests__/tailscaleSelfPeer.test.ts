import NetInfo from '@react-native-community/netinfo';
import { discoverTailscaleGateways } from '../services/tailscaleDiscovery';
import {
  filterPhoneTailscaleSelfHosts,
  filterPhoneTailscaleSelfPeers,
  getPhoneWifiIpv4,
} from '../utils/tailscaleSelfPeer';

jest.mock('@react-native-community/netinfo', () => ({
  fetch: jest.fn(),
}));

describe('Tailscale self-peer filtering', () => {
  beforeEach(() => {
    (NetInfo.fetch as jest.Mock).mockResolvedValue({
      details: { ipAddress: '100.70.124.54' },
    });
    global.fetch = jest.fn();
    (global.fetch as jest.Mock).mockImplementation((url: string) =>
      Promise.resolve({
        ok: true,
        json: async () => ({
          status: 'ok',
          hostname: url.includes('100.94.135.78') ? 'Igors-Mac-mini' : 'Untrusted label',
        }),
      }),
    );
  });

  it('filters by the phone Tailscale IP, not hostname text', () => {
    const discovered = [
      { gatewayUrl: 'http://100.70.124.54:8642', hostname: 'A-Mac-Looking-Name' },
      { gatewayUrl: 'http://100.94.135.78:8642', hostname: 'igors-s25-1' },
    ];

    expect(filterPhoneTailscaleSelfPeers(discovered, '100.70.124.54')).toEqual([
      discovered[1],
    ]);
    expect(
      filterPhoneTailscaleSelfHosts(
        ['100.70.124.54', '100.94.135.78'],
        '100.70.124.54',
      ),
    ).toEqual(['100.94.135.78']);
  });

  it('filters the follow-up Tailscale hostname probe before callers persist it', async () => {
    await expect(
      discoverTailscaleGateways(['100.70.124.54', '100.94.135.78']),
    ).resolves.toEqual([
      expect.objectContaining({
        gatewayUrl: 'http://100.94.135.78:8642',
        hostname: 'Igors-Mac-mini',
      }),
    ]);
  });

  it('getPhoneWifiIpv4 excludes Tailscale CGNAT IP (100.x) from phone LAN IP detection', async () => {
    // Samsung devices with Tailscale VPN active can report the VPN tunnel
    // interface IP (100.x.x.x) as NetInfo.details.ipAddress. That is NOT a
    // LAN IP — treating it as one causes the subnet sweep to target the
    // wrong /24. getPhoneWifiIpv4 must return null in this case so callers
    // fall back to preferLanIp / fallbackSubnetHosts.
    (NetInfo.fetch as jest.Mock).mockResolvedValue({
      details: { ipAddress: '100.70.124.54' },
    });
    await expect(getPhoneWifiIpv4()).resolves.toBeNull();
  });

  it('getPhoneWifiIpv4 returns a real Wi-Fi LAN IP', async () => {
    (NetInfo.fetch as jest.Mock).mockResolvedValue({
      details: { ipAddress: '192.168.1.50' },
    });
    await expect(getPhoneWifiIpv4()).resolves.toBe('192.168.1.50');
  });

  it('getPhoneWifiIpv4 returns null when NetInfo has no IP address', async () => {
    (NetInfo.fetch as jest.Mock).mockResolvedValue({
      details: {},
    });
    await expect(getPhoneWifiIpv4()).resolves.toBeNull();
  });
});
