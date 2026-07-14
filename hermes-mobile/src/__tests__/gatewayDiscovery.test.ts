import NetInfo from '@react-native-community/netinfo';
import {
  discoverGatewayOnPhoneSubnet,
  discoverGatewayViaPairServer,
  discoverAllGatewaysOnLan,
  bootstrapTailnetProbeHostsFromPairServers,
  pairServerHostFromGatewayUrl,
  probeLiveUsbGateway,
  resolvePairServerSetupParams,
} from '../services/gatewayDiscovery';

jest.mock('@react-native-community/netinfo', () => ({
  fetch: jest.fn(),
}));

describe('gatewayDiscovery', () => {
  beforeEach(() => {
    (NetInfo.fetch as jest.Mock).mockResolvedValue({
      details: { ipAddress: '192.168.12.100' },
    });
    global.fetch = jest.fn();
  });

  it('discovers gateway via pair server on subnet', async () => {
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes(':8765/pair.json')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            gatewayUrl: 'http://192.168.12.208:8642',
            deepLink: 'hermes://setup?url=http%3A%2F%2F192.168.12.208%3A8642',
          }),
        });
      }
      return Promise.resolve({ ok: false });
    });

    const url = await discoverGatewayViaPairServer();
    expect(url).toBe('http://192.168.12.208:8642');
  });

  it('resolves setup params with API key from pair server deep link', async () => {
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url === 'http://100.94.135.78:8765/pair.json') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            gatewayUrl: 'http://100.94.135.78:8642',
            deepLink:
              'hermes://setup?url=http%3A%2F%2F100.94.135.78%3A8642&key=sk-mini-rotated-key',
          }),
        });
      }
      return Promise.resolve({ ok: false });
    });

    const setup = await resolvePairServerSetupParams('100.94.135.78');
    expect(setup?.gatewayUrl).toBe('http://100.94.135.78:8642');
    expect(setup?.apiKey).toBe('sk-mini-rotated-key');
  });

  it('maps loopback gateway URL to pair server on 127.0.0.1', () => {
    expect(pairServerHostFromGatewayUrl('http://127.0.0.1:8642')).toBe('127.0.0.1');
    expect(pairServerHostFromGatewayUrl('http://100.94.135.78:8642')).toBe('100.94.135.78');
  });

  it('discovers gateway health on phone subnet', async () => {
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url === 'http://192.168.12.208:8642/health') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ status: 'ok', platform: 'hermes-agent' }),
        });
      }
      return Promise.resolve({ ok: false });
    });

    const url = await discoverGatewayOnPhoneSubnet();
    expect(url).toBe('http://192.168.12.208:8642');
  });

  it('prefers last paired Mac when multiple gateways respond', async () => {
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url === 'http://192.168.12.50:8642/health') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ status: 'ok', hostname: 'Mac-Mini' }),
        });
      }
      if (url === 'http://192.168.12.208:8642/health') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ status: 'ok', hostname: 'Mac-Pro' }),
        });
      }
      return Promise.resolve({ ok: false });
    });

    const url = await discoverGatewayOnPhoneSubnet('192.168.12.208');
    expect(url).toBe('http://192.168.12.208:8642');
  });

  it('returns multiple gateways on LAN', async () => {
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('192.168.12.208:8642/health')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ status: 'ok', hostname: 'Mac-Pro', local_ip: '192.168.12.208' }),
        });
      }
      if (url.includes('192.168.12.50:8642/health')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ status: 'ok', hostname: 'Mac-Mini', local_ip: '192.168.12.50' }),
        });
      }
      return Promise.resolve({ ok: false });
    });

    const { gateways: list } = await discoverAllGatewaysOnLan();
    expect(list.length).toBe(2);
    expect(list.map((g) => g.localIp)).toEqual(expect.arrayContaining(['192.168.12.208', '192.168.12.50']));
  });

  it('collects tailnet probe hosts from pair.json during LAN scan', async () => {
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes(':8765/pair.json')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            gatewayUrl: 'http://192.168.12.208:8642',
            deepLink: 'hermes://setup?url=http%3A%2F%2F192.168.12.208%3A8642',
            tailnetProbeHosts: ['100.94.135.78', 'igors-mac-mini.tail12aa33.ts.net'],
          }),
        });
      }
      return Promise.resolve({ ok: false });
    });

    const { gateways, tailnetProbeHosts } = await discoverAllGatewaysOnLan();
    expect(gateways).toHaveLength(1);
    expect(tailnetProbeHosts.sort()).toEqual(
      ['100.94.135.78', 'igors-mac-mini.tail12aa33.ts.net'].sort(),
    );
  });

  it('returns null when phone has no LAN IP and no loopback pair server', async () => {
    (NetInfo.fetch as jest.Mock).mockResolvedValue({ details: {} });
    expect(await discoverGatewayViaPairServer()).toBeNull();
    expect(await discoverGatewayOnPhoneSubnet()).toBeNull();
  });

  it('scans loopback when phone has no LAN IP but loopback pair server is up', async () => {
    (NetInfo.fetch as jest.Mock).mockResolvedValue({ details: {} });
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('127.0.0.1:8765/pair.json') || url.includes('localhost:8765/pair.json')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            gatewayUrl: 'http://127.0.0.1:8642',
            deepLink: 'hermes://setup?url=http%3A%2F%2F127.0.0.1%3A8642',
            tailnetProbeHosts: ['100.94.135.78', 'igors-mac-mini.tail12aa33.ts.net'],
          }),
        });
      }
      return Promise.resolve({ ok: false });
    });

    const url = await discoverGatewayViaPairServer();
    expect(url).toBe('http://127.0.0.1:8642');

    const { gateways, tailnetProbeHosts } = await discoverAllGatewaysOnLan();
    expect(gateways).toHaveLength(1);
    expect(gateways[0].gatewayUrl).toBe('http://127.0.0.1:8642');
    expect(tailnetProbeHosts).toEqual(
      expect.arrayContaining(['100.94.135.78', 'igors-mac-mini.tail12aa33.ts.net']),
    );
  });

  it('sweeps pair.json on stored tailnet hosts and probes gateway health on fleet', async () => {
    (NetInfo.fetch as jest.Mock).mockResolvedValue({ details: {} });
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url === 'http://100.87.85.85:8765/pair.json') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            gatewayUrl: 'http://100.87.85.85:8642',
            deepLink: 'hermes://setup?url=http%3A%2F%2F100.87.85.85%3A8642',
            tailnetProbeHosts: ['100.94.135.78', '100.87.85.85'],
          }),
        });
      }
      if (url === 'http://100.94.135.78:8642/health') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            status: 'ok',
            hostname: 'Igors-Mac-mini.local',
            local_ip: '192.168.68.73',
          }),
        });
      }
      if (url === 'http://100.87.85.85:8642/health') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            status: 'ok',
            hostname: 'Igors-MacBook-Pro.local',
            local_ip: '192.168.68.70',
          }),
        });
      }
      return Promise.resolve({ ok: false });
    });

    const boot = await bootstrapTailnetProbeHostsFromPairServers(['100.87.85.85']);
    expect(boot.tailnetProbeHosts.sort()).toEqual(['100.87.85.85', '100.94.135.78'].sort());
    expect(boot.gateways.map((g) => g.hostname)).toEqual(
      expect.arrayContaining(['Igors-Mac-mini.local', 'Igors-MacBook-Pro.local']),
    );

    const { gateways, tailnetProbeHosts } = await discoverAllGatewaysOnLan(null, {
      tailnetPairServerHosts: ['100.87.85.85'],
    });
    expect(tailnetProbeHosts).toEqual(expect.arrayContaining(['100.94.135.78', '100.87.85.85']));
    expect(gateways.length).toBeGreaterThanOrEqual(2);
  });

  it('probeLiveUsbGateway returns hostname when adb reverse loopback is healthy', async () => {
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url === 'http://127.0.0.1:8642/health') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            status: 'ok',
            hostname: 'Igors-MacBook-Pro.local',
            local_ip: '192.168.68.70',
          }),
        });
      }
      return Promise.resolve({ ok: false });
    });

    const discovery = await probeLiveUsbGateway();
    expect(discovery?.gatewayUrl).toBe('http://127.0.0.1:8642');
    expect(discovery?.hostname).toBe('Igors-MacBook-Pro.local');
  });
});
