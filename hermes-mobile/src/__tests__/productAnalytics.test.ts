jest.mock('expo-constants', () => ({
  __esModule: true,
  default: {
    expoConfig: {
      android: { versionCode: 4 },
      ios: { buildNumber: '1' },
    },
  },
}));

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  clearMarketingAttribution,
  recordAttributionFromUrl,
} from '../services/marketingAttribution';
import {
  __resetProductAnalyticsForTesting,
  __setNonProductionAnalyticsBuildForTesting,
  __setPosthogKeyForTesting,
  isNonProductionAnalyticsBuild,
  isPosthogInternalUserBuild,
  isProductAnalyticsEnabled,
  setProductAnalyticsOptOut,
  setProductAnalyticsRuntimeSignals,
  shouldReportToPostHog,
  trackProductEvent,
} from '../services/productAnalytics';

describe('productAnalytics', () => {
  const originalDev = (global as { __DEV__?: boolean }).__DEV__;
  const envSnapshot = { ...process.env };

  beforeEach(async () => {
    await AsyncStorage.clear();
    await clearMarketingAttribution();
    __resetProductAnalyticsForTesting();
    __setNonProductionAnalyticsBuildForTesting(false);
    delete process.env.EXPO_PUBLIC_POSTHOG_API_KEY;
    delete process.env.EXPO_PUBLIC_POSTHOG_INTERNAL;
    delete process.env.EXPO_PUBLIC_HERMES_DEV_UNLOCK;
    delete process.env.EXPO_PUBLIC_E2E_AUTOMATION;
    delete process.env.EXPO_PUBLIC_STORE_REVIEW_DEMO;
    delete process.env.EAS_BUILD_PROFILE;
    (global as { __DEV__?: boolean }).__DEV__ = false;
    global.fetch = jest.fn().mockResolvedValue({ ok: true });
  });

  afterEach(() => {
    process.env = { ...envSnapshot };
    (global as { __DEV__?: boolean }).__DEV__ = originalDev;
  });

  it('no-ops when PostHog key is missing', async () => {
    expect(shouldReportToPostHog()).toBe(false);
    expect(isProductAnalyticsEnabled()).toBe(false);
    await trackProductEvent('test_event');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('captures events when key is configured on production builds', async () => {
    __setPosthogKeyForTesting('phc_test');
    process.env.EAS_BUILD_PROFILE = 'production';
    expect(shouldReportToPostHog()).toBe(true);
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
    process.env.EAS_BUILD_PROFILE = 'production';
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
    process.env.EAS_BUILD_PROFILE = 'production';
    setProductAnalyticsOptOut(true);
    expect(shouldReportToPostHog()).toBe(false);
    expect(isProductAnalyticsEnabled()).toBe(false);
    await trackProductEvent('ignored');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('blocks __DEV__ builds', async () => {
    __setPosthogKeyForTesting('phc_test');
    process.env.EAS_BUILD_PROFILE = 'production';
    __setNonProductionAnalyticsBuildForTesting(true);
    expect(isNonProductionAnalyticsBuild()).toBe(true);
    expect(shouldReportToPostHog()).toBe(false);
    await trackProductEvent('dev_only');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('blocks non-production EAS profiles', async () => {
    __setPosthogKeyForTesting('phc_test');
    process.env.EAS_BUILD_PROFILE = 'preview';
    __setNonProductionAnalyticsBuildForTesting(null);
    expect(shouldReportToPostHog()).toBe(false);
    await trackProductEvent('preview_only');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('blocks dev unlock and E2E automation env flags', async () => {
    __setPosthogKeyForTesting('phc_test');
    process.env.EAS_BUILD_PROFILE = 'production';
    __setNonProductionAnalyticsBuildForTesting(null);
    process.env.EXPO_PUBLIC_HERMES_DEV_UNLOCK = '1';
    expect(shouldReportToPostHog()).toBe(false);

    delete process.env.EXPO_PUBLIC_HERMES_DEV_UNLOCK;
    process.env.EXPO_PUBLIC_E2E_AUTOMATION = '1';
    expect(shouldReportToPostHog()).toBe(false);
  });

  it('blocks EXPO_PUBLIC_POSTHOG_INTERNAL Igor-only builds', async () => {
    __setPosthogKeyForTesting('phc_test');
    process.env.EAS_BUILD_PROFILE = 'production';
    __setNonProductionAnalyticsBuildForTesting(null);
    process.env.EXPO_PUBLIC_POSTHOG_INTERNAL = '1';
    expect(isPosthogInternalUserBuild()).toBe(true);
    expect(shouldReportToPostHog()).toBe(false);
    await trackProductEvent('igor_dogfood');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('blocks runtime developer backdoors', async () => {
    __setPosthogKeyForTesting('phc_test');
    process.env.EAS_BUILD_PROFILE = 'production';
    setProductAnalyticsRuntimeSignals({ developerLeashUnlock: true });
    expect(shouldReportToPostHog()).toBe(false);
    await trackProductEvent('backdoor');
    expect(global.fetch).not.toHaveBeenCalled();

    setProductAnalyticsRuntimeSignals({
      developerLeashUnlock: false,
      storeLeashPreviewActive: true,
    });
    expect(shouldReportToPostHog()).toBe(false);

    setProductAnalyticsRuntimeSignals({
      storeLeashPreviewActive: false,
      demoMode: true,
    });
    expect(shouldReportToPostHog()).toBe(false);
  });
});
