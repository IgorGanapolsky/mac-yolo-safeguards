import {
  buildGatewayUrlFromLanIp,
  describeGatewayFetchError,
  extractLanIpFromGatewayUrl,
  gatewayUrlHostname,
  isLoopbackGatewayUrl,
  isValidGatewayUrl,
  resolveDeviceGatewayUrl,
  resolveDisplayLanIp,
  cleanManualGatewayUrl,
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

describe('cleanManualGatewayUrl', () => {
  it('handles null/undefined/empty input', () => {
    expect(cleanManualGatewayUrl(null)).toBeNull();
    expect(cleanManualGatewayUrl(undefined)).toBeNull();
    expect(cleanManualGatewayUrl('   ')).toBeNull();
  });

  it('adds default protocol and port to simple IP', () => {
    expect(cleanManualGatewayUrl('100.87.85.85')).toBe('http://100.87.85.85:8642');
  });

  it('retains protocol and adds port', () => {
    expect(cleanManualGatewayUrl('http://100.87.85.85')).toBe('http://100.87.85.85:8642');
    expect(cleanManualGatewayUrl('https://100.87.85.85')).toBe('https://100.87.85.85:8642');
  });

  it('keeps port if specified', () => {
    expect(cleanManualGatewayUrl('100.87.85.85:9000')).toBe('http://100.87.85.85:9000');
    expect(cleanManualGatewayUrl('http://100.87.85.85:8642')).toBe('http://100.87.85.85:8642');
  });

  it('preserves path segments', () => {
    expect(cleanManualGatewayUrl('100.87.85.85/v1/health')).toBe('http://100.87.85.85:8642/v1/health');
    expect(cleanManualGatewayUrl('http://100.87.85.85:8642/v1')).toBe('http://100.87.85.85:8642/v1');
  });
});
