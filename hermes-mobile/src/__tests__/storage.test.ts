import { storage } from '../services/storage';
import { DEFAULT_GATEWAY_SETTINGS } from '../types/gateway';

describe('storage', () => {
  beforeEach(async () => {
    await storage.clearAll();
  });

  it('loads default gateway settings when empty', async () => {
    const settings = await storage.loadGatewaySettings();
    expect(settings.gatewayUrl).toBe(DEFAULT_GATEWAY_SETTINGS.gatewayUrl);
    expect(settings.redactPii).toBe(true);
  });

  it('persists gateway settings round-trip', async () => {
    await storage.saveGatewaySettings({
      ...DEFAULT_GATEWAY_SETTINGS,
      gatewayUrl: 'https://tunnel.example.com',
      demoMode: true,
    });
    const loaded = await storage.loadGatewaySettings();
    expect(loaded.gatewayUrl).toBe('https://tunnel.example.com');
    expect(loaded.demoMode).toBe(true);
  });

  it('replaces loopback gateway URL with last known LAN IP on load', async () => {
    await storage.saveLastGatewayLanIp('192.168.12.208');
    await storage.saveGatewaySettings({
      ...DEFAULT_GATEWAY_SETTINGS,
      gatewayUrl: 'http://127.0.0.1:8642',
    });
    const loaded = await storage.loadGatewaySettings();
    expect(loaded.gatewayUrl).toBe('http://192.168.12.208:8642');
  });
});
