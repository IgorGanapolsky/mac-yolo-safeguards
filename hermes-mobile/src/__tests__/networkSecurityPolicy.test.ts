import {
  isPrivateLanIpv4,
  isTailscaleIpv4Local,
  isAllowedCleartextHost,
  isPublicHttpUrl,
  isValidGatewayUrl,
  isLoopbackHost,
  isEmulatorHost,
} from '../utils/gatewayUrlPolicy';

describe('networkSecurityPolicy G-02 cleartext scoping', () => {
  it('detects private LAN IPv4', () => {
    expect(isPrivateLanIpv4('10.0.0.5')).toBe(true);
    expect(isPrivateLanIpv4('10.255.255.255')).toBe(true);
    expect(isPrivateLanIpv4('172.16.0.1')).toBe(true);
    expect(isPrivateLanIpv4('172.31.255.255')).toBe(true);
    expect(isPrivateLanIpv4('192.168.1.1')).toBe(true);
    expect(isPrivateLanIpv4('192.168.0.1')).toBe(true);
    expect(isPrivateLanIpv4('8.8.8.8')).toBe(false);
    expect(isPrivateLanIpv4('100.64.0.1')).toBe(false); // Tailscale CGNAT not private LAN
    expect(isPrivateLanIpv4('127.0.0.1')).toBe(false); // loopback separate
  });

  it('detects Tailscale CGNAT IPv4', () => {
    expect(isTailscaleIpv4Local('100.64.0.1')).toBe(true);
    expect(isTailscaleIpv4Local('100.87.85.85')).toBe(true);
    expect(isTailscaleIpv4Local('100.127.255.255')).toBe(true);
    expect(isTailscaleIpv4Local('100.63.255.255')).toBe(false);
    expect(isTailscaleIpv4Local('100.128.0.1')).toBe(false);
    expect(isTailscaleIpv4Local('192.168.1.1')).toBe(false);
  });

  it('detects loopback and emulator hosts', () => {
    expect(isLoopbackHost('127.0.0.1')).toBe(true);
    expect(isLoopbackHost('localhost')).toBe(true);
    expect(isLoopbackHost('0.0.0.0')).toBe(true);
    expect(isEmulatorHost('10.0.2.2')).toBe(true);
    expect(isEmulatorHost('10.0.2.3')).toBe(true);
  });

  it('allows cleartext for private, loopback, tailscale, .local, emulator', () => {
    expect(isAllowedCleartextHost('127.0.0.1')).toBe(true);
    expect(isAllowedCleartextHost('localhost')).toBe(true);
    expect(isAllowedCleartextHost('10.0.2.2')).toBe(true);
    expect(isAllowedCleartextHost('192.168.12.208')).toBe(true);
    expect(isAllowedCleartextHost('10.0.0.5')).toBe(true);
    expect(isAllowedCleartextHost('172.16.5.4')).toBe(true);
    expect(isAllowedCleartextHost('100.87.85.85')).toBe(true); // Tailscale
    expect(isAllowedCleartextHost('my-mac.local')).toBe(true);
    expect(isAllowedCleartextHost('my-device.ts.net')).toBe(true);
    expect(isAllowedCleartextHost('example.com')).toBe(false);
    expect(isAllowedCleartextHost('8.8.8.8')).toBe(false);
  });

  it('detects public http URLs (should be blocked)', () => {
    expect(isPublicHttpUrl('http://example.com')).toBe(true);
    expect(isPublicHttpUrl('http://example.com:8642')).toBe(true);
    expect(isPublicHttpUrl('http://8.8.8.8:8642')).toBe(true);
    expect(isPublicHttpUrl('http://1.1.1.1')).toBe(true);
    // private http allowed
    expect(isPublicHttpUrl('http://192.168.12.208:8642')).toBe(false);
    expect(isPublicHttpUrl('http://10.0.0.5:8642')).toBe(false);
    expect(isPublicHttpUrl('http://100.87.85.85:8642')).toBe(false);
    expect(isPublicHttpUrl('http://127.0.0.1:8642')).toBe(false);
    expect(isPublicHttpUrl('http://localhost:8642')).toBe(false);
    expect(isPublicHttpUrl('http://my-mac.local:8642')).toBe(false);
    expect(isPublicHttpUrl('http://my-device.ts.net:8642')).toBe(false);
    // https public allowed (not cleartext)
    expect(isPublicHttpUrl('https://example.com')).toBe(false);
    expect(isPublicHttpUrl('https://8.8.8.8:8642')).toBe(false);
  });

  it('rejects public http in isValidGatewayUrl G-02 AC', () => {
    expect(isValidGatewayUrl('http://example.com')).toBe(false);
    expect(isValidGatewayUrl('http://example.com:8642')).toBe(false);
    expect(isValidGatewayUrl('http://8.8.8.8:8642')).toBe(false);
    // private still valid
    expect(isValidGatewayUrl('http://192.168.12.208:8642')).toBe(true);
    expect(isValidGatewayUrl('http://100.87.85.85:8642')).toBe(true);
    expect(isValidGatewayUrl('http://127.0.0.1:8642')).toBe(true);
    expect(isValidGatewayUrl('http://my-device.ts.net:8642')).toBe(true);
    // https public allowed (relay uses https)
    expect(isValidGatewayUrl('https://example.com')).toBe(true);
    expect(isValidGatewayUrl('https://hermesmobile-cloud.fly.dev')).toBe(true);
  });

  it('AC: production cannot fetch http://example.com but LAN works', () => {
    // Simulate policy: public http blocked, private http allowed
    const publicHttp = 'http://example.com:8787/pair.json';
    const lanHttp = 'http://192.168.1.10:8765/pair.json';
    const tailscaleHttp = 'http://100.87.85.85:8765/pair.json';
    expect(isPublicHttpUrl(publicHttp)).toBe(true);
    expect(isValidGatewayUrl(publicHttp)).toBe(false);
    expect(isPublicHttpUrl(lanHttp)).toBe(false);
    expect(isValidGatewayUrl(lanHttp)).toBe(true);
    expect(isPublicHttpUrl(tailscaleHttp)).toBe(false);
    expect(isValidGatewayUrl(tailscaleHttp)).toBe(true);
  });
});
