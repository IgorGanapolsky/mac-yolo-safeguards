import {
  buildGatewayUrlFromLanIp,
  describeGatewayFetchError,
  extractLanIpFromGatewayUrl,
  gatewayUrlHostname,
  isLoopbackGatewayUrl,
  isValidGatewayUrl,
  resolveDeviceGatewayUrl,
  resolveDisplayLanIp,
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

  it('keeps loopback URL as configured', () => {
    const resolved = resolveDeviceGatewayUrl('http://127.0.0.1:8642', '192.168.12.208');
    expect(resolved).toBe('http://127.0.0.1:8642');
  });

  it('returns configured URL unchanged', () => {
    const resolved = resolveDeviceGatewayUrl('http://127.0.0.1:8642', null);
    expect(resolved).toBe('http://127.0.0.1:8642');
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
    expect(message.toLowerCase()).toContain('usb');
    expect(message.toLowerCase()).toContain('pair');
  });

  it('drops loopback local_ip when gateway URL is LAN', () => {
    expect(resolveDisplayLanIp('127.0.0.1', 'http://10.2.29.103:8642')).toBe('10.2.29.103');
    expect(resolveDisplayLanIp('127.0.0.1', 'http://127.0.0.1:8642')).toBeUndefined();
  });

  it('rejects scheme-only gateway URLs', () => {
    expect(isValidGatewayUrl('http://')).toBe(false);
    expect(isValidGatewayUrl('http')).toBe(false);
    expect(isValidGatewayUrl('http://http:8642')).toBe(false);
    expect(gatewayUrlHostname('http://http:8642')).toBeUndefined();
    expect(isValidGatewayUrl('http://100.94.135.78:8642')).toBe(true);
  });
});
