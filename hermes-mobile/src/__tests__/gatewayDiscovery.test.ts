import NetInfo from '@react-native-community/netinfo';
import {
  classifyDiscoveredReach,
  bootstrapTailnetProbeHostsFromPairServers,
  countUniqueDiscoveredMachines,
  dedupeDiscoveredGatewaysByMachine,
  summarizeDiscoveredReach,
  discoverGatewayOnPhoneSubnet,
  discoverGatewayViaPairServer,
  discoverAllGatewaysOnLan,
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

  it('counts URL aliases as one machine so Found N matches the picker (Mac Pro rage)', () => {
    const aliases = [
      {
        gatewayUrl: 'http://127.0.0.1:8642',
        hostname: 'Igors-MacBook-Pro.local',
      },
      {
        gatewayUrl: 'http://localhost:8642',
        hostname: 'Igors-MacBook-Pro.local',
      },
      {
        gatewayUrl: 'http://192.168.68.69:8642',
        hostname: 'Igors-MacBook-Pro.local',
        localIp: '192.168.68.69',
      },
      {
        gatewayUrl: 'http://100.87.85.85:8642',
        hostname: 'Igors-MacBook-Pro.local',
        localIp: '192.168.68.69',
      },
      {
        gatewayUrl: 'http://igors-macbook-pro-1.tail12aa33.ts.net:8642',
        hostname: 'Igors-MacBook-Pro.local',
      },
      {
        gatewayUrl: 'http://192.168.68.73:8642',
        hostname: 'Igors-Mac-mini.local',
        localIp: '192.168.68.73',
      },
      {
        gatewayUrl: 'http://100.94.135.78:8642',
        hostname: 'Igors-Mac-mini.local',
        localIp: '192.168.68.73',
      },
      {
        gatewayUrl: 'http://igors-mac-mini.tail12aa33.ts.net:8642',
        hostname: 'Igors-Mac-mini.local',
      },
    ];
    expect(countUniqueDiscoveredMachines(aliases)).toBe(2);
    const deduped = dedupeDiscoveredGatewaysByMachine(aliases);
    expect(deduped).toHaveLength(2);
    const isPreferredDiscoveryUrl = (gatewayUrl: string): boolean => {
      try {
        const { hostname } = new URL(gatewayUrl);
        return hostname.endsWith('.ts.net') || /^100\.\d+\.\d+\.\d+$/.test(hostname);
      } catch {
        return false;
      }
    };
    expect(deduped.every((g) => isPreferredDiscoveryUrl(g.gatewayUrl))).toBe(true);
    // MagicDNS ranks above bare CGNAT for the same hostname.
    expect(deduped.map((g) => g.gatewayUrl).sort()).toEqual(
      [
        'http://igors-mac-mini.tail12aa33.ts.net:8642',
        'http://igors-macbook-pro-1.tail12aa33.ts.net:8642',
      ].sort(),
    );

    // Off-home / cellular: winners are Tailscale — never count as "local" LAN.
    const reach = summarizeDiscoveredReach(aliases);
    expect(reach).toEqual({
      foundCount: 2,
      lanCount: 0,
      tailscaleCount: 2,
      usbCount: 0,
      otherCount: 0,
    });
    expect(deduped.every((g) => classifyDiscoveredReach(g) === 'tailscale')).toBe(true);
  });

  it('collapses MagicDNS + CGNAT chip doubles to one row per Mac (Connect your Mac rage)', () => {
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
    expect(countUniqueDiscoveredMachines(doubles)).toBe(2);
    const deduped = dedupeDiscoveredGatewaysByMachine(doubles);
    expect(deduped).toHaveLength(2);
    expect(deduped.every((g) => g.gatewayUrl.includes('.ts.net'))).toBe(true);
    expect(deduped.find((g) => g.label === 'Igors-Mac-mini')?.localIp).toBe('100.94.135.78');
  });

  it('classifies RFC1918/.local as lan and loopback as usb (Tailscale CGNAT never lan)', () => {
    expect(
      classifyDiscoveredReach({
        gatewayUrl: 'http://192.168.1.10:8642',
        hostname: 'Home-Mac.local',
      }),
    ).toBe('lan');
    expect(
      classifyDiscoveredReach({
        gatewayUrl: 'http://Igors-Mac.local:8642',
      }),
    ).toBe('lan');
    expect(
      classifyDiscoveredReach({
        gatewayUrl: 'http://100.87.85.85:8642',
      }),
    ).toBe('tailscale');
    expect(
      classifyDiscoveredReach({
        gatewayUrl: 'http://127.0.0.1:8642',
      }),
    ).toBe('usb');
    expect(
      summarizeDiscoveredReach([
        { gatewayUrl: 'http://127.0.0.1:8642', hostname: 'Only-USB.local' },
      ]),
    ).toMatchObject({ foundCount: 1, usbCount: 1, lanCount: 0, tailscaleCount: 0 });
  });

  it('ignores poisoned RFC1918 localIp on Tailscale pair.json (mini URL + MacBook LAN IP)', async () => {
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('127.0.0.1:8765/pair.json') || url.includes('localhost:8765/pair.json')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            gatewayUrl: 'http://100.94.135.78:8642',
            deepLink: 'hermes://setup?url=http%3A%2F%2F100.94.135.78%3A8642&name=Igors-Mac-mini',
            hostname: 'Igors-Mac-mini',
            localIp: '192.168.68.69',
            tailnetProbeHosts: ['100.94.135.78', '100.87.85.85'],
          }),
        });
      }
      if (url.includes('100.94.135.78:8642/health')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            status: 'ok',
            hostname: 'Igors-Mac-mini.local',
            local_ip: '192.168.68.73',
          }),
        });
      }
      if (url.includes('100.87.85.85:8642/health')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            status: 'ok',
            hostname: 'Igors-MacBook-Pro.local',
            local_ip: '192.168.68.69',
          }),
        });
      }
      return Promise.resolve({ ok: false });
    });

    const { gateways } = await discoverAllGatewaysOnLan(null, {
      tailnetPairServerHosts: ['100.94.135.78', '100.87.85.85'],
    });
    expect(countUniqueDiscoveredMachines(gateways)).toBeGreaterThanOrEqual(2);
    const labels = gateways.map((g) => (g.hostname || g.label || '').replace(/\.local$/i, ''));
    expect(labels.some((n) => /macbook-pro/i.test(n))).toBe(true);
    expect(labels.some((n) => /mac-mini/i.test(n))).toBe(true);
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

  it('excludes the phone Tailscale IP from picker output and future probe hosts', async () => {
    (NetInfo.fetch as jest.Mock).mockResolvedValue({
      details: { ipAddress: '100.70.124.54' },
    });
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes(':8765/pair.json')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            gatewayUrl: 'http://100.94.135.78:8642',
            tailnetProbeHosts: ['100.70.124.54', '100.94.135.78'],
          }),
        });
      }
      if (url === 'http://100.70.124.54:8642/health') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ status: 'ok', hostname: 'Mac-looking phone' }),
        });
      }
      if (url === 'http://100.94.135.78:8642/health') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ status: 'ok', hostname: 'Igors-Mac-mini' }),
        });
      }
      return Promise.resolve({ ok: false });
    });

    const { gateways, tailnetProbeHosts } = await discoverAllGatewaysOnLan();

    expect(gateways).toEqual([
      expect.objectContaining({ gatewayUrl: 'http://100.94.135.78:8642' }),
    ]);
    expect(tailnetProbeHosts).toEqual(['100.94.135.78']);
  });

  it('never returns the phone Tailscale self-peer from bootstrap probe storage', async () => {
    (NetInfo.fetch as jest.Mock).mockResolvedValue({
      details: { ipAddress: '100.70.124.54' },
    });
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url === 'http://127.0.0.1:8765/pair.json') {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            gatewayUrl: 'http://100.70.124.54:8642',
            tailnetProbeHosts: ['100.70.124.54', '100.94.135.78'],
          }),
        });
      }
      if (url === 'http://100.94.135.78:8642/health') {
        return Promise.resolve({
          ok: true,
          json: async () => ({ status: 'ok', hostname: 'Igors-Mac-mini' }),
        });
      }
      return Promise.resolve({ ok: false });
    });

    const boot = await bootstrapTailnetProbeHostsFromPairServers();

    expect(boot.tailnetProbeHosts).toEqual(['100.94.135.78']);
    expect(boot.gateways).toEqual([
      expect.objectContaining({ gatewayUrl: 'http://100.94.135.78:8642' }),
    ]);
    expect(global.fetch).not.toHaveBeenCalledWith('http://100.70.124.54:8642/health', expect.anything());
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
