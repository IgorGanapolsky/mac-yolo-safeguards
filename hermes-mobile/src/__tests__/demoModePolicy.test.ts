import Constants from 'expo-constants';
import { DEFAULT_GATEWAY_SETTINGS } from '../types/gateway';
import {
  isDemoModeAllowed,
  isE2eAutomationBuild,
  isStoreReviewDemoBuild,
  sanitizeDemoModeForRelease,
} from '../utils/demoModePolicy';

describe('demoModePolicy — zero demo forever (2026-08-03)', () => {
  const originalDev = (global as { __DEV__?: boolean }).__DEV__;

  beforeEach(() => {
    delete process.env.EXPO_PUBLIC_STORE_REVIEW_DEMO;
    delete process.env.EXPO_PUBLIC_E2E_AUTOMATION;
    (Constants.expoConfig as { extra?: Record<string, unknown> }).extra = {};
    (global as { __DEV__?: boolean }).__DEV__ = false;
  });

  afterAll(() => {
    (global as { __DEV__?: boolean }).__DEV__ = originalDev;
  });

  it('never enables store-review demo (flag permanently retired)', () => {
    (Constants.expoConfig as { extra?: Record<string, unknown> }).extra = {
      storeReviewDemo: true,
    };
    process.env.EXPO_PUBLIC_STORE_REVIEW_DEMO = '1';
    expect(isStoreReviewDemoBuild()).toBe(false);
    expect(isDemoModeAllowed()).toBe(false);
  });

  it('does not allow demo just because __DEV__ is true', () => {
    (global as { __DEV__?: boolean }).__DEV__ = true;
    expect(isDemoModeAllowed()).toBe(false);
  });

  it('allows demo only on explicit E2E automation builds', () => {
    process.env.EXPO_PUBLIC_E2E_AUTOMATION = '1';
    expect(isE2eAutomationBuild()).toBe(true);
    expect(isDemoModeAllowed()).toBe(true);
  });

  it('strips persisted demo mode when automation is off', () => {
    expect(
      sanitizeDemoModeForRelease({
        ...DEFAULT_GATEWAY_SETTINGS,
        demoMode: true,
      }).demoMode,
    ).toBe(false);
  });
});
