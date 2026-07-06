import { DEFAULT_GATEWAY_SETTINGS } from '../types/gateway';
import Constants from 'expo-constants';
import {
  isDemoModeAllowed,
  isDeveloperLeashUnlockAllowed,
  isE2eAutomationBuild,
  sanitizeDemoModeForRelease,
} from '../utils/demoModePolicy';

jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: {
      extra: {},
    },
  },
}));

describe('demoModePolicy', () => {
  const originalE2e = process.env.EXPO_PUBLIC_E2E_AUTOMATION;
  const originalDevUnlock = process.env.EXPO_PUBLIC_HERMES_DEV_UNLOCK;

  afterEach(() => {
    (Constants.expoConfig as { extra?: Record<string, unknown> }).extra = {};
    if (originalE2e === undefined) {
      delete process.env.EXPO_PUBLIC_E2E_AUTOMATION;
    } else {
      process.env.EXPO_PUBLIC_E2E_AUTOMATION = originalE2e;
    }
    if (originalDevUnlock === undefined) {
      delete process.env.EXPO_PUBLIC_HERMES_DEV_UNLOCK;
    } else {
      process.env.EXPO_PUBLIC_HERMES_DEV_UNLOCK = originalDevUnlock;
    }
  });

  it('allows demo in __DEV__', () => {
    (global as { __DEV__?: boolean }).__DEV__ = true;
    expect(isDemoModeAllowed()).toBe(true);
  });

  it('allows demo when E2E automation env is set', () => {
    (global as { __DEV__?: boolean }).__DEV__ = false;
    process.env.EXPO_PUBLIC_E2E_AUTOMATION = '1';
    expect(isDemoModeAllowed()).toBe(true);
    expect(isE2eAutomationBuild()).toBe(true);
  });

  it('allows demo when E2E automation is embedded in Expo config', () => {
    (global as { __DEV__?: boolean }).__DEV__ = false;
    delete process.env.EXPO_PUBLIC_E2E_AUTOMATION;
    (Constants.expoConfig as { extra?: Record<string, unknown> }).extra = {
      e2eAutomation: true,
    };

    expect(isDemoModeAllowed()).toBe(true);
    expect(isE2eAutomationBuild()).toBe(true);
  });

  it('does not classify normal dev builds as E2E automation', () => {
    (global as { __DEV__?: boolean }).__DEV__ = true;
    delete process.env.EXPO_PUBLIC_E2E_AUTOMATION;
    expect(isDemoModeAllowed()).toBe(true);
    expect(isE2eAutomationBuild()).toBe(false);
  });

  it('allows developer Leash unlock in internal builds without enabling demo mode', () => {
    (global as { __DEV__?: boolean }).__DEV__ = false;
    delete process.env.EXPO_PUBLIC_E2E_AUTOMATION;
    process.env.EXPO_PUBLIC_HERMES_DEV_UNLOCK = '1';
    expect(isDemoModeAllowed()).toBe(false);
    expect(isDeveloperLeashUnlockAllowed()).toBe(true);
  });

  it('does not allow developer Leash unlock on production release builds without the internal flag', () => {
    (global as { __DEV__?: boolean }).__DEV__ = false;
    delete process.env.EXPO_PUBLIC_E2E_AUTOMATION;
    delete process.env.EXPO_PUBLIC_HERMES_DEV_UNLOCK;
    expect(isDeveloperLeashUnlockAllowed()).toBe(false);
  });

  it('strips persisted demoMode on release builds', () => {
    (global as { __DEV__?: boolean }).__DEV__ = false;
    delete process.env.EXPO_PUBLIC_E2E_AUTOMATION;
    const dirty = { ...DEFAULT_GATEWAY_SETTINGS, demoMode: true };
    expect(sanitizeDemoModeForRelease(dirty).demoMode).toBe(false);
    expect(sanitizeDemoModeForRelease(DEFAULT_GATEWAY_SETTINGS).demoMode).toBe(false);
  });
});
