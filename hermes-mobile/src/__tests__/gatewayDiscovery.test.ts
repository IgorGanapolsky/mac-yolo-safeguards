import NetInfo from '@react-native-community/netinfo';
import {
  discoverGatewayOnPhoneSubnet,
  discoverGatewayViaPairServer,
  discoverAllGatewaysOnLan,
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

    const list = await discoverAllGatewaysOnLan();
    expect(list.length).toBe(2);
    expect(list.map((g) => g.localIp)).toEqual(expect.arrayContaining(['192.168.12.208', '192.168.12.50']));
  });

  it('returns null when phone has no LAN IP', async () => {
    (NetInfo.fetch as jest.Mock).mockResolvedValue({ details: {} });
    expect(await discoverGatewayViaPairServer()).toBeNull();
    expect(await discoverGatewayOnPhoneSubnet()).toBeNull();
  });
});
