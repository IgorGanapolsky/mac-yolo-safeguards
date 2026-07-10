import Constants from 'expo-constants';
import { DEFAULT_GATEWAY_SETTINGS } from '../types/gateway';
import {
  isDemoModeAllowed,
  isStoreReviewDemoBuild,
  sanitizeDemoModeForRelease,
} from '../utils/demoModePolicy';

describe('demoModePolicy', () => {
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

  it('allows demo on App Store review production builds only', () => {
    (Constants.expoConfig as { extra?: Record<string, unknown> }).extra = {
      storeReviewDemo: true,
    };
    expect(isStoreReviewDemoBuild()).toBe(true);
    expect(isDemoModeAllowed()).toBe(true);
  });

  it('strips persisted demo mode on standard release builds', () => {
    expect(
      sanitizeDemoModeForRelease({
        ...DEFAULT_GATEWAY_SETTINGS,
        demoMode: true,
      }).demoMode,
    ).toBe(false);
  });
});
