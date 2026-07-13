jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: {
      android: { versionCode: 4 },
      ios: { buildNumber: '1' },
    },
  },
}));

jest.mock('expo-updates', () => ({
  channel: 'production',
  isEnabled: true,
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  clearMarketingAttribution,
  recordAttributionFromUrl,
} from '../services/marketingAttribution';
import {
  __resetProductAnalyticsForTesting,
  __setPosthogKeyForTesting,
  __setShouldReportToPostHogForTesting,
  isProductAnalyticsEnabled,
  isProductionPostHogBuild,
  setPostHogDogfoodExclusions,
  setProductAnalyticsOptOut,
  shouldReportToPostHog,
  trackProductEvent,
} from '../services/productAnalytics';

describe('productAnalytics', () => {
  const originalDev = (global as { __DEV__?: boolean }).__DEV__;

  beforeEach(async () => {
    await AsyncStorage.clear();
    await clearMarketingAttribution();
    __resetProductAnalyticsForTesting();
    setProductAnalyticsOptOut(false);
    setPostHogDogfoodExclusions({
      developerLeashUnlock: false,
      storeLeashPreview: false,
      demoMode: false,
    });
    __setShouldReportToPostHogForTesting(null);
    delete process.env.EXPO_PUBLIC_POSTHOG_API_KEY;
    delete process.env.EXPO_PUBLIC_POSTHOG_INTERNAL;
    delete process.env.EXPO_PUBLIC_HERMES_DEV_UNLOCK;
    delete process.env.EXPO_PUBLIC_E2E_AUTOMATION;
    delete process.env.EAS_BUILD_PROFILE;
    delete process.env.EXPO_PUBLIC_EAS_PROFILE;
    delete process.env.EXPO_PUBLIC_UPDATES_CHANNEL;
    (global as { __DEV__?: boolean }).__DEV__ = false;
    process.env.EAS_BUILD_PROFILE = 'production';
    global.fetch = jest.fn().mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    (global as { __DEV__?: boolean }).__DEV__ = originalDev;
    __resetProductAnalyticsForTesting();
  });

  it('no-ops when PostHog key is missing', async () => {
    expect(isProductAnalyticsEnabled()).toBe(false);
    await trackProductEvent('test_event');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('captures events when key is configured on production builds', async () => {
    __setPosthogKeyForTesting('phc_test');
    await trackProductEvent('mac_scan_complete', { found_count: 2 });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toContain('/capture/');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body);
    expect(body.event).toBe('mac_scan_complete');
    expect(body.properties.found_count).toBe(2);
    expect(body.properties.distinct_id).toMatch(/^hm_/);
    expect(body.properties.distinct_id).not.toContain('@');
  });

  it('attaches first and last marketing attribution properties', async () => {
    __setPosthogKeyForTesting('phc_test');
    await recordAttributionFromUrl(
      'hermes://chat?utm_source=applovin&utm_medium=cpp&utm_campaign=day0-paywall&campaign_id=c-1&creative_id=cr-9',
      Date.parse('2026-07-01T12:00:00Z'),
    );
    await trackProductEvent('leash_purchase_result', { status: 'purchased' });

    const [, init] = (global.fetch as jest.Mock).mock.calls[0];
    const body = JSON.parse(init.body);
    expect(body.properties.attribution_source).toBe('applovin');
    expect(body.properties.attribution_medium).toBe('cpp');
    expect(body.properties.attribution_campaign).toBe('day0-paywall');
    expect(body.properties.attribution_campaign_id).toBe('c-1');
    expect(body.properties.attribution_creative_id).toBe('cr-9');
    expect(body.properties.attribution_window).toBe('day0');
    expect(body.properties.first_attribution_source).toBe('applovin');
    expect(body.properties.status).toBe('purchased');
  });

  it('respects opt-out', async () => {
    __setPosthogKeyForTesting('phc_test');
    setProductAnalyticsOptOut(true);
    expect(isProductAnalyticsEnabled()).toBe(false);
    await trackProductEvent('ignored');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  describe('shouldReportToPostHog', () => {
    beforeEach(() => {
      __setPosthogKeyForTesting('phc_test');
      process.env.EAS_BUILD_PROFILE = 'production';
      (global as { __DEV__?: boolean }).__DEV__ = false;
    });

    it('allows production builds with key', () => {
      expect(isProductionPostHogBuild()).toBe(true);
      expect(shouldReportToPostHog()).toBe(true);
    });

    it('skips __DEV__', () => {
      (global as { __DEV__?: boolean }).__DEV__ = true;
      expect(shouldReportToPostHog()).toBe(false);
      expect(isProductAnalyticsEnabled()).toBe(false);
    });

    it('skips non-production EAS profile', () => {
      process.env.EAS_BUILD_PROFILE = 'preview';
      expect(isProductionPostHogBuild()).toBe(false);
      expect(shouldReportToPostHog()).toBe(false);
    });

    it('skips non-production updates channel', () => {
      delete process.env.EAS_BUILD_PROFILE;
      process.env.EXPO_PUBLIC_UPDATES_CHANNEL = 'preview';
      expect(isProductionPostHogBuild()).toBe(false);
      expect(shouldReportToPostHog()).toBe(false);
    });

    it('skips developerLeashUnlock dogfood', () => {
      setPostHogDogfoodExclusions({ developerLeashUnlock: true });
      expect(shouldReportToPostHog()).toBe(false);
    });

    it('skips store leash preview', () => {
      setPostHogDogfoodExclusions({ storeLeashPreview: true });
      expect(shouldReportToPostHog()).toBe(false);
    });

    it('skips demo mode sessions', () => {
      setPostHogDogfoodExclusions({ demoMode: true });
      expect(shouldReportToPostHog()).toBe(false);
    });

    it('skips EXPO_PUBLIC_POSTHOG_INTERNAL dogfood builds', () => {
      process.env.EXPO_PUBLIC_POSTHOG_INTERNAL = '1';
      expect(shouldReportToPostHog()).toBe(false);
    });

    it('skips E2E and dev unlock env flags', () => {
      process.env.EXPO_PUBLIC_E2E_AUTOMATION = '1';
      expect(shouldReportToPostHog()).toBe(false);

      delete process.env.EXPO_PUBLIC_E2E_AUTOMATION;
      process.env.EXPO_PUBLIC_HERMES_DEV_UNLOCK = '1';
      expect(shouldReportToPostHog()).toBe(false);
    });

    it('does not send events when gated off', async () => {
      setPostHogDogfoodExclusions({ developerLeashUnlock: true });
      await trackProductEvent('leash_purchase_result', { status: 'purchased' });
      expect(global.fetch).not.toHaveBeenCalled();
    });
  });
});
