import { DEFAULT_GATEWAY_SETTINGS, type GatewaySettings } from '../types/gateway';
import { applySetupDeepLinkWithThumbgate } from '../utils/applySetupDeepLinkWithThumbgate';
import type { SetupDeepLinkParams } from '../utils/setupDeepLink';

describe('applySetupDeepLinkWithThumbgate', () => {
  const currentSettings = {
    ...DEFAULT_GATEWAY_SETTINGS,
    connectionMode: 'gateway' as const,
    gatewayUrl: 'http://100.94.135.78:8642',
  };

  it('leaves the no-ThumbGate setup path unchanged', async () => {
    const params: SetupDeepLinkParams = {
      gatewayUrl: 'http://127.0.0.1:8642',
      apiKey: 'new-computer-key',
    };
    const saveSettings = jest.fn().mockResolvedValue(undefined);
    const applySetupDeepLink = jest.fn().mockResolvedValue(undefined);

    await applySetupDeepLinkWithThumbgate({
      params,
      currentSettings,
      currentApiKey: 'current-computer-key',
      saveSettings,
      applySetupDeepLink,
    });

    expect(saveSettings).not.toHaveBeenCalled();
    expect(applySetupDeepLink).toHaveBeenCalledTimes(1);
    expect(applySetupDeepLink).toHaveBeenCalledWith(params);
  });

  it('saves only the trimmed ThumbGate credential before setup owns the final transport', async () => {
    const calls: string[] = [];
    const params: SetupDeepLinkParams = {
      gatewayUrl: 'http://127.0.0.1:8642',
      apiKey: 'new-computer-key',
      thumbgateApiKey: '  thumbgate-key  ',
    };
    const saveSettings = jest.fn(async () => {
      calls.push('save-thumbgate');
    });
    const applySetupDeepLink = jest.fn(async () => {
      calls.push('apply-setup');
    });

    await applySetupDeepLinkWithThumbgate({
      params,
      currentSettings,
      currentApiKey: 'current-computer-key',
      saveSettings,
      applySetupDeepLink,
    });

    expect(calls).toEqual(['save-thumbgate', 'apply-setup']);
    expect(saveSettings).toHaveBeenCalledWith(
      currentSettings,
      'current-computer-key',
      'thumbgate-key',
    );
    expect(applySetupDeepLink).toHaveBeenCalledWith(params);
  });

  it('finishes on the direct USB transport even when the prior snapshot was relay', async () => {
    let persistedSettings: GatewaySettings = {
      ...currentSettings,
      connectionMode: 'relay' as const,
      gatewayUrl: 'https://relay.example.test',
    };
    const params: SetupDeepLinkParams = {
      gatewayUrl: 'http://127.0.0.1:8642',
      apiKey: 'usb-computer-key',
      thumbgateApiKey: 'thumbgate-key',
    };
    const saveSettings = jest.fn(async (nextSettings) => {
      persistedSettings = { ...nextSettings };
    });
    const applySetupDeepLink = jest.fn(async (setup) => {
      persistedSettings = {
        ...persistedSettings,
        connectionMode: 'gateway',
        gatewayUrl: setup.gatewayUrl ?? '',
      };
    });

    await applySetupDeepLinkWithThumbgate({
      params,
      currentSettings: persistedSettings,
      currentApiKey: 'relay-computer-key',
      saveSettings,
      applySetupDeepLink,
    });

    expect(persistedSettings.connectionMode).toBe('gateway');
    expect(persistedSettings.gatewayUrl).toBe('http://127.0.0.1:8642');
  });

  it('finishes on the selected Tailscale computer even when the prior snapshot was relay', async () => {
    let persistedSettings: GatewaySettings = {
      ...currentSettings,
      connectionMode: 'relay' as const,
      gatewayUrl: 'https://relay.example.test',
    };
    const params: SetupDeepLinkParams = {
      gatewayUrl: 'http://100.94.135.78:8642',
      apiKey: 'mac-mini-key',
      thumbgateApiKey: 'thumbgate-key',
      macName: 'Igors-Mac-mini',
    };
    const saveSettings = jest.fn(async (nextSettings) => {
      persistedSettings = { ...nextSettings };
    });
    const applySetupDeepLink = jest.fn(async (setup) => {
      persistedSettings = {
        ...persistedSettings,
        connectionMode: 'gateway',
        gatewayUrl: setup.gatewayUrl ?? '',
      };
    });

    await applySetupDeepLinkWithThumbgate({
      params,
      currentSettings: persistedSettings,
      currentApiKey: 'relay-computer-key',
      saveSettings,
      applySetupDeepLink,
    });

    expect(persistedSettings.connectionMode).toBe('gateway');
    expect(persistedSettings.gatewayUrl).toBe('http://100.94.135.78:8642');
    expect(applySetupDeepLink).toHaveBeenCalledWith(
      expect.objectContaining({ macName: 'Igors-Mac-mini' }),
    );
  });

  it('still applies direct setup when ThumbGate credential persistence fails', async () => {
    const saveError = new Error('secure store unavailable');
    const params: SetupDeepLinkParams = {
      gatewayUrl: 'http://127.0.0.1:8642',
      thumbgateApiKey: 'thumbgate-key',
    };
    const saveSettings = jest.fn().mockRejectedValue(saveError);
    const applySetupDeepLink = jest.fn().mockResolvedValue(undefined);

    await expect(
      applySetupDeepLinkWithThumbgate({
        params,
        currentSettings,
        currentApiKey: 'current-computer-key',
        saveSettings,
        applySetupDeepLink,
      }),
    ).rejects.toBe(saveError);

    expect(applySetupDeepLink).toHaveBeenCalledTimes(1);
    expect(applySetupDeepLink).toHaveBeenCalledWith(params);
  });

  it('surfaces a setup failure after the ThumbGate credential was saved', async () => {
    const setupError = new Error('pairing failed');
    const params: SetupDeepLinkParams = {
      gatewayUrl: 'http://100.94.135.78:8642',
      thumbgateApiKey: 'thumbgate-key',
    };
    const saveSettings = jest.fn().mockResolvedValue(undefined);
    const applySetupDeepLink = jest.fn().mockRejectedValue(setupError);

    await expect(
      applySetupDeepLinkWithThumbgate({
        params,
        currentSettings,
        currentApiKey: 'current-computer-key',
        saveSettings,
        applySetupDeepLink,
      }),
    ).rejects.toBe(setupError);

    expect(saveSettings).toHaveBeenCalledTimes(1);
    expect(applySetupDeepLink).toHaveBeenCalledTimes(1);
  });
});
