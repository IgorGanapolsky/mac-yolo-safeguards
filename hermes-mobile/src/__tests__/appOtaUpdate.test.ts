jest.mock('expo-updates', () => ({
  isEnabled: true,
  checkForUpdateAsync: jest.fn(),
  fetchUpdateAsync: jest.fn(),
  reloadAsync: jest.fn(),
}));

import * as Updates from 'expo-updates';
import {
  checkAndApplyAppUpdate,
  checkForAppUpdate,
  fetchAndApplyAppUpdate,
  isOtaUpdatesEnabled,
} from '../services/appOtaUpdate';

describe('appOtaUpdate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (Updates as { isEnabled: boolean }).isEnabled = true;
  });

  it('reports disabled when OTA is off', async () => {
    (Updates as { isEnabled: boolean }).isEnabled = false;
    expect(isOtaUpdatesEnabled()).toBe(false);
    await expect(checkForAppUpdate()).resolves.toEqual({
      status: 'disabled',
      message: expect.stringContaining('dev clients'),
    });
  });

  it('reports current when no update is available', async () => {
    (Updates.checkForUpdateAsync as jest.Mock).mockResolvedValue({ isAvailable: false });
    await expect(checkForAppUpdate()).resolves.toEqual({
      status: 'current',
      message: 'App is up to date.',
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
    await expect(checkAndApplyAppUpdate()).resolves.toEqual({
      status: 'current',
      message: 'App is up to date.',
    });
  });
});
