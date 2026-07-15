jest.mock('expo-updates', () => ({
  isEnabled: true,
  channel: 'production',
  runtimeVersion: '1.0',
  updateId: '11111111-2222-3333-4444-555555555555',
  isEmbeddedLaunch: false,
  createdAt: new Date('2026-07-15T12:00:00.000Z'),
  checkForUpdateAsync: jest.fn(),
  fetchUpdateAsync: jest.fn(),
  reloadAsync: jest.fn(),
}));

jest.mock('expo-constants', () => ({
  expoConfig: { version: '1.0' },
  nativeAppVersion: '1.0',
}));

import * as Updates from 'expo-updates';
import {
  checkAndApplyAppUpdate,
  checkForAppUpdate,
  fetchAndApplyAppUpdate,
  getInstalledOtaInfo,
  isOtaUpdatesEnabled,
} from '../services/appOtaUpdate';

describe('appOtaUpdate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (Updates as { isEnabled: boolean }).isEnabled = true;
  });

  it('exposes installed channel/runtime/updateId', () => {
    expect(getInstalledOtaInfo()).toMatchObject({
      enabled: true,
      channel: 'production',
      runtimeVersion: '1.0',
      updateId: '11111111-2222-3333-4444-555555555555',
      isEmbeddedLaunch: false,
    });
  });

  it('reports disabled when OTA is off', async () => {
    (Updates as { isEnabled: boolean }).isEnabled = false;
    expect(isOtaUpdatesEnabled()).toBe(false);
    await expect(checkForAppUpdate()).resolves.toEqual({
      status: 'disabled',
      message: expect.stringContaining('OTA is off'),
    });
  });

  it('reports current with honest channel/runtime copy when nothing is available', async () => {
    (Updates.checkForUpdateAsync as jest.Mock).mockResolvedValue({ isAvailable: false });
    const result = await checkForAppUpdate();
    expect(result.status).toBe('current');
    expect(result.message).toContain('No newer update on channel "production"');
    expect(result.message).toContain('runtime 1.0');
    expect(result.message).not.toBe('App is up to date.');
  });

  it('does not claim downloaded before fetch', async () => {
    (Updates.checkForUpdateAsync as jest.Mock).mockResolvedValue({
      isAvailable: true,
      manifest: { id: 'new-manifest' },
    });
    const result = await checkForAppUpdate();
    expect(result.status).toBe('available');
    expect(result.message).toContain('Update available');
    expect(result.message).not.toContain('downloaded');
  });

  it('fetches and reloads when update is available', async () => {
    (Updates.fetchUpdateAsync as jest.Mock).mockResolvedValue({ isNew: true });
    (Updates.reloadAsync as jest.Mock).mockResolvedValue(undefined);

    await expect(fetchAndApplyAppUpdate()).resolves.toEqual({
      status: 'reloaded',
      message: expect.stringContaining('Restarting'),
    });
    expect(Updates.reloadAsync).toHaveBeenCalled();
  });

  it('checkAndApply returns check result when nothing is available', async () => {
    (Updates.checkForUpdateAsync as jest.Mock).mockResolvedValue({ isAvailable: false });
    const result = await checkAndApplyAppUpdate();
    expect(result.status).toBe('current');
    expect(result.message).toContain('No newer update');
  });

  it('returns error when update check hangs past timeout', async () => {
    jest.useFakeTimers();
    (Updates.checkForUpdateAsync as jest.Mock).mockImplementation(
      () => new Promise(() => {}),
    );

    const pending = checkForAppUpdate();
    await jest.advanceTimersByTimeAsync(30_000);
    await expect(pending).resolves.toEqual({
      status: 'error',
      message: 'Update check timed out after 30s',
    });
    jest.useRealTimers();
  });

  it('returns error when update download hangs past timeout', async () => {
    jest.useFakeTimers();
    (Updates.fetchUpdateAsync as jest.Mock).mockImplementation(
      () => new Promise(() => {}),
    );

    const pending = fetchAndApplyAppUpdate();
    await jest.advanceTimersByTimeAsync(60_000);
    await expect(pending).resolves.toEqual({
      status: 'error',
      message: 'Update download timed out after 60s',
    });
    jest.useRealTimers();
  });
});
