import {
  buildGatewayUrlFromLanIp,
  describeGatewayFetchError,
  extractLanIpFromGatewayUrl,
  isLoopbackGatewayUrl,
  resolveDeviceGatewayUrl,
} from '../utils/gatewayUrlPolicy';

describe('gatewayUrlPolicy', () => {
  it('detects loopback gateway URLs', () => {
    expect(isLoopbackGatewayUrl('http://127.0.0.1:8642')).toBe(true);
    expect(isLoopbackGatewayUrl('http://localhost:8642')).toBe(true);
    expect(isLoopbackGatewayUrl('http://192.168.12.208:8642')).toBe(false);
  });

  it('builds LAN gateway URL', () => {
    expect(buildGatewayUrlFromLanIp('192.168.12.208')).toBe('http://192.168.12.208:8642');
  });

  it('replaces loopback with last known LAN IP on native', () => {
    jest.doMock('react-native', () => ({ Platform: { OS: 'android' } }));
    const resolved = resolveDeviceGatewayUrl('http://127.0.0.1:8642', '192.168.12.208');
    expect(resolved).toBe('http://192.168.12.208:8642');
  });

  it('extracts LAN IP from gateway URL', () => {
    expect(extractLanIpFromGatewayUrl('http://192.168.12.208:8642')).toBe('192.168.12.208');
    expect(extractLanIpFromGatewayUrl('http://mac.local:8642')).toBeNull();
  });

  it('explains loopback failures in plain language', () => {
    const message = describeGatewayFetchError(
      new Error('Network request failed'),
      'http://127.0.0.1:8642',
    );
    expect(message).toContain('127.0.0.1');
    expect(message.toLowerCase()).toContain('qr');
  });
});
