import AsyncStorage from '@react-native-async-storage/async-storage';
import { storage } from '../services/storage';
import { DEFAULT_GATEWAY_SETTINGS } from '../types/gateway';

describe('storage', () => {
  beforeEach(async () => {
    await storage.clearAll();
  });

  it('loads default gateway settings when empty', async () => {
    const settings = await storage.loadGatewaySettings();
    expect(settings.connectionMode).toBe('relay');
    expect(settings.gatewayUrl).toBe(DEFAULT_GATEWAY_SETTINGS.gatewayUrl);
    expect(settings.redactPii).toBe(true);
    expect(settings.thumbgateCaptureOnUp).toBe(true);
  });

  it('defaults thumbgateCaptureOnUp to true when key is unset in stored settings', async () => {
    await AsyncStorage.setItem(
      'hermes-mobile:gateway_settings',
      JSON.stringify({
        connectionMode: 'relay',
        gatewayUrl: 'http://192.168.1.10:8642',
        thumbgateCaptureOnDown: true,
      }),
    );
    const loaded = await storage.loadGatewaySettings();
    expect(loaded.thumbgateCaptureOnUp).toBe(true);
  });

  it('respects explicit thumbgateCaptureOnUp false when saved', async () => {
    await storage.saveGatewaySettings({
      ...DEFAULT_GATEWAY_SETTINGS,
      thumbgateCaptureOnUp: false,
    });
    const loaded = await storage.loadGatewaySettings();
    expect(loaded.thumbgateCaptureOnUp).toBe(false);
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

  it('keeps loopback gateway URL on load', async () => {
    await storage.saveLastGatewayLanIp('192.168.12.208');
    await storage.saveGatewaySettings({
      ...DEFAULT_GATEWAY_SETTINGS,
      gatewayUrl: 'http://127.0.0.1:8642',
    });
    const loaded = await storage.loadGatewaySettings();
    expect(loaded.gatewayUrl).toBe('http://127.0.0.1:8642');
  });

  it('persists dismissed session ids per gateway host', async () => {
    await storage.addDismissedSessionIds('http://127.0.0.1:8642', ['sess_a', 'sess_b']);
    await storage.addDismissedSessionIds('http://127.0.0.1:8642', ['sess_c']);
    const dismissed = await storage.loadDismissedSessionIds('http://127.0.0.1:8642');
    expect(dismissed).toEqual(expect.arrayContaining(['sess_a', 'sess_b', 'sess_c']));

    await storage.removeDismissedSessionIds('http://127.0.0.1:8642', ['sess_b']);
    const afterRemove = await storage.loadDismissedSessionIds('http://127.0.0.1:8642');
    expect(afterRemove).toEqual(expect.arrayContaining(['sess_a', 'sess_c']));
    expect(afterRemove).not.toContain('sess_b');

    await storage.clearDismissedSessionIds('http://127.0.0.1:8642');
    expect(await storage.loadDismissedSessionIds('http://127.0.0.1:8642')).toEqual([]);
  });

  it('persists hide-cron preference per gateway host', async () => {
    expect(await storage.loadHideCronSessions('http://127.0.0.1:8642')).toBe(false);

    await storage.setHideCronSessions('http://127.0.0.1:8642', true);
    expect(await storage.loadHideCronSessions('http://127.0.0.1:8642')).toBe(true);
    expect(await storage.loadHideCronSessions('http://192.168.1.10:8642')).toBe(false);

    await storage.setHideCronSessions('http://127.0.0.1:8642', false);
    expect(await storage.loadHideCronSessions('http://127.0.0.1:8642')).toBe(false);
  });
});
