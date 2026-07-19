import NetInfo from '@react-native-community/netinfo';
import { discoverTailscaleGateways } from '../services/tailscaleDiscovery';
import {
  filterPhoneTailscaleSelfHosts,
  filterPhoneTailscaleSelfPeers,
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
});
