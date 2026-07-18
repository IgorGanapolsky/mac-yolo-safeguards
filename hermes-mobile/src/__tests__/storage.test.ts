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

  it('migrates legacy notificationsEnabled into category toggles on load', async () => {
    await AsyncStorage.setItem(
      'hermes-mobile:gateway_settings',
      JSON.stringify({
        connectionMode: 'relay',
        gatewayUrl: 'http://192.168.1.10:8642',
        notificationsEnabled: false,
      }),
    );
    const loaded = await storage.loadGatewaySettings();
    expect(loaded.notificationApprovals).toBe(false);
    expect(loaded.notificationLiveRunStatus).toBe(false);
    expect(loaded.notificationCompletion).toBe(false);
    expect(loaded.notificationsEnabled).toBe(false);
  });

  it('migrates legacy notificationsEnabled into per-purpose toggles on load', async () => {
    await AsyncStorage.setItem(
      'hermes-mobile:gateway_settings',
      JSON.stringify({
        connectionMode: 'relay',
        gatewayUrl: 'http://192.168.1.10:8642',
        notificationsEnabled: false,
      }),
    );
    const loaded = await storage.loadGatewaySettings();
    expect(loaded.notificationApprovals).toBe(false);
    expect(loaded.notificationLiveRunStatus).toBe(false);
    expect(loaded.notificationCompletion).toBe(false);
    expect(loaded.notificationsEnabled).toBe(false);
  });

  it('loads explicit per-purpose notification toggles', async () => {
    await storage.saveGatewaySettings({
      ...DEFAULT_GATEWAY_SETTINGS,
      notificationApprovals: true,
      notificationLiveRunStatus: false,
      notificationCompletion: true,
      notificationsEnabled: true,
    });
    const loaded = await storage.loadGatewaySettings();
    expect(loaded.notificationApprovals).toBe(true);
    expect(loaded.notificationLiveRunStatus).toBe(false);
    expect(loaded.notificationCompletion).toBe(true);
    expect(loaded.notificationsEnabled).toBe(true);
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

  it('persists dismissed session ids per machine host across gateway URL drift', async () => {
    const lanKeys = ['host:igors-mac-mini', 'mac_192_168_68_56', 'http://192.168.68.56:8642'];
    const tailscaleKeys = ['host:igors-mac-mini', 'mac_100_94_135_78', 'http://100.94.135.78:8642'];

    await storage.addDismissedSessionIds(lanKeys, ['sess_a', 'sess_b'], 'http://192.168.68.56:8642');

    const fromTailscale = await storage.loadDismissedSessionIds(
      tailscaleKeys,
      'http://100.94.135.78:8642',
    );
    expect(fromTailscale).toEqual(expect.arrayContaining(['sess_a', 'sess_b']));

    await storage.setHideCronSessions(lanKeys, true, 'http://192.168.68.56:8642');
    expect(
      await storage.loadHideCronSessions(tailscaleKeys, 'http://100.94.135.78:8642'),
    ).toBe(true);
  });

  it('persists hide-cron preference per gateway host', async () => {
    expect(await storage.loadHideCronSessions('http://127.0.0.1:8642')).toBe(false);

    await storage.setHideCronSessions('http://127.0.0.1:8642', true);
    expect(await storage.loadHideCronSessions('http://127.0.0.1:8642')).toBe(true);
    expect(await storage.loadHideCronSessions('http://192.168.1.10:8642')).toBe(false);

    await storage.setHideCronSessions('http://127.0.0.1:8642', false);
    expect(await storage.loadHideCronSessions('http://127.0.0.1:8642')).toBe(false);
  });

  it('persists hide-automation preference per machine host across gateway URL drift', async () => {
    const lanKeys = ['host:igors-mac-mini', 'mac_192_168_68_56', 'http://192.168.68.56:8642'];
    const tailscaleKeys = ['host:igors-mac-mini', 'mac_100_94_135_78', 'http://100.94.135.78:8642'];

    expect(await storage.loadHideAutomationSessions('http://127.0.0.1:8642')).toBe(false);

    await storage.setHideAutomationSessions(lanKeys, true, 'http://192.168.68.56:8642');
    expect(
      await storage.loadHideAutomationSessions(tailscaleKeys, 'http://100.94.135.78:8642'),
    ).toBe(true);
    expect(await storage.loadHideAutomationSessions('http://10.0.0.9:8642')).toBe(false);

    await storage.setHideAutomationSessions(lanKeys, false, 'http://192.168.68.56:8642');
    expect(
      await storage.loadHideAutomationSessions(tailscaleKeys, 'http://100.94.135.78:8642'),
    ).toBe(false);
  });

  it('persists last selected chat session per saved computer key', async () => {
    await storage.saveLastSessionForComputer('mac_100_94_135_78', 'sess_mini');
    await storage.saveLastSessionForComputer('MAC_100_94_135_78', 'sess_mini_latest');
    await storage.saveLastSessionForComputer('mac_192_168_68_66', 'sess_macbook');

    expect(await storage.loadLastSessionForComputer('mac_100_94_135_78')).toBe(
      'sess_mini_latest',
    );
    expect(await storage.loadLastSessionForComputer('mac_192_168_68_66')).toBe(
      'sess_macbook',
    );
    expect(await storage.loadLastSessionForComputer('missing')).toBeNull();
  });

  it('writes and reads last session across alias keys for the same Mac', async () => {
    await storage.saveLastSessionForComputer(
      ['host:igors-mac-mini', 'mac_192_168_68_56', 'mac_100_94_135_78'],
      'sess_shared',
    );

    expect(await storage.loadLastSessionForComputer('host:igors-mac-mini')).toBe('sess_shared');
    expect(await storage.loadLastSessionForComputer('mac_100_94_135_78')).toBe('sess_shared');
    expect(await storage.loadLastSessionForComputer(['mac_192_168_68_56'])).toBe('sess_shared');
  });

  it('clearLastSessionForComputer drops aliases so relaunch cannot restore deleted mega', async () => {
    await storage.saveLastSessionForComputer(
      ['host:igors-macbook-pro', 'http://100.87.85.85:8642'],
      'api_1784083104_b1c756fb',
    );
    await storage.clearLastSessionForComputer([
      'host:igors-macbook-pro',
      'http://100.87.85.85:8642',
    ]);
    expect(await storage.loadLastSessionForComputer('host:igors-macbook-pro')).toBeNull();
    expect(await storage.loadLastSessionForComputer('http://100.87.85.85:8642')).toBeNull();
  });

  it('persists approvals count and increments correctly', async () => {
    expect(await storage.loadApprovalsCount()).toBe(0);

    const count1 = await storage.incrementApprovalsCount();
    expect(count1).toBe(1);
    expect(await storage.loadApprovalsCount()).toBe(1);

    const count2 = await storage.incrementApprovalsCount();
    expect(count2).toBe(2);
    expect(await storage.loadApprovalsCount()).toBe(2);
  });

  it('persists store review requested flag', async () => {
    expect(await storage.hasRequestedReview()).toBe(false);

    await storage.setRequestedReview(true);
    expect(await storage.hasRequestedReview()).toBe(true);

    await storage.setRequestedReview(false);
    expect(await storage.hasRequestedReview()).toBe(false);
  });
});
