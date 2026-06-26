import { DEFAULT_GATEWAY_SETTINGS } from '../types/gateway';
import {
  isDemoModeAllowed,
  isDeveloperLeashUnlockAllowed,
  sanitizeDemoModeForRelease,
} from '../utils/demoModePolicy';

describe('demoModePolicy', () => {
  const originalE2e = process.env.EXPO_PUBLIC_E2E_AUTOMATION;
  const originalDevUnlock = process.env.EXPO_PUBLIC_HERMES_DEV_UNLOCK;

  afterEach(() => {
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
  });

  it('allows developer Leash unlock in internal builds without enabling demo mode', () => {
    (global as { __DEV__?: boolean }).__DEV__ = false;
    delete process.env.EXPO_PUBLIC_E2E_AUTOMATION;
    process.env.EXPO_PUBLIC_HERMES_DEV_UNLOCK = '1';
    expect(isDemoModeAllowed()).toBe(false);
    expect(isDeveloperLeashUnlockAllowed()).toBe(true);
  });

  it('strips persisted demoMode on release builds', () => {
    (global as { __DEV__?: boolean }).__DEV__ = false;
    delete process.env.EXPO_PUBLIC_E2E_AUTOMATION;
    const dirty = { ...DEFAULT_GATEWAY_SETTINGS, demoMode: true };
    expect(sanitizeDemoModeForRelease(dirty).demoMode).toBe(false);
    expect(sanitizeDemoModeForRelease(DEFAULT_GATEWAY_SETTINGS).demoMode).toBe(false);
  });
});
