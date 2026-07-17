jest.mock('expo-updates', () => ({
  isEnabled: true,
  channel: 'production',
  runtimeVersion: '1.2',
  updateId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  isEmbeddedLaunch: true,
  isEmergencyLaunch: false,
  checkForUpdateAsync: jest.fn(),
  fetchUpdateAsync: jest.fn(),
  reloadAsync: jest.fn(),
}));

import * as Updates from 'expo-updates';
import {
  checkAndApplyAppUpdate,
  checkForAppUpdate,
  fetchAndApplyAppUpdate,
  getOtaDiagnostics,
  isOtaUpdatesEnabled,
} from '../services/appOtaUpdate';

describe('appOtaUpdate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (Updates as { isEnabled: boolean }).isEnabled = true;
    (Updates as { channel: string }).channel = 'production';
    (Updates as { runtimeVersion: string }).runtimeVersion = '1.2';
    (Updates as { updateId: string }).updateId = 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
    (Updates as { isEmbeddedLaunch: boolean }).isEmbeddedLaunch = true;
    (Updates as { isEmergencyLaunch: boolean }).isEmergencyLaunch = false;
  });

  it('treats channel+runtime as enabled when Updates.isEnabled is falsely false', () => {
    (Updates as { isEnabled: boolean }).isEnabled = false;
    expect(isOtaUpdatesEnabled()).toBe(true);
    expect(getOtaDiagnostics().isEnabledFlag).toBe(false);
    expect(getOtaDiagnostics().channel).toBe('production');
  });

  it('reports disabled only when flag is off and channel/runtime are missing', async () => {
    (Updates as { isEnabled: boolean }).isEnabled = false;
    (Updates as { channel: string }).channel = '';
    (Updates as { runtimeVersion: string }).runtimeVersion = '';
    expect(isOtaUpdatesEnabled()).toBe(false);
    await expect(checkForAppUpdate()).resolves.toEqual({
      status: 'disabled',
      message: expect.stringContaining('Needs a store/release rebuild'),
      diagnostics: expect.objectContaining({
        isEnabledFlag: false,
        channel: '',
        runtimeVersion: '',
      }),
    });
  });

  it('reports current when no update is available and includes reason/diagnostics', async () => {
    (Updates.checkForUpdateAsync as jest.Mock).mockResolvedValue({
      isAvailable: false,
      reason: 'updateRejectedBySelectionPolicy',
    });
    await expect(checkForAppUpdate()).resolves.toEqual({
      status: 'current',
      message: expect.stringContaining('updateRejectedBySelectionPolicy'),
      reason: 'updateRejectedBySelectionPolicy',
      diagnostics: expect.objectContaining({
        channel: 'production',
        runtimeVersion: '1.2',
      }),
    });
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
      message: expect.stringContaining('Update check timed out after 30s'),
      diagnostics: expect.any(Object),
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

  it('still checks when isEnabled flag is false but channel/runtime exist', async () => {
    (Updates as { isEnabled: boolean }).isEnabled = false;
    (Updates.checkForUpdateAsync as jest.Mock).mockResolvedValue({
      isAvailable: true,
      manifest: { id: '019f7091-33a8-7493-b7f9-003e72d9a87a' },
    });
    await expect(checkForAppUpdate()).resolves.toEqual({
      status: 'available',
      message: expect.stringContaining('Update available'),
      manifestId: '019f7091-33a8-7493-b7f9-003e72d9a87a',
      diagnostics: expect.objectContaining({ isEnabledFlag: false, channel: 'production' }),
    });
  });
});
