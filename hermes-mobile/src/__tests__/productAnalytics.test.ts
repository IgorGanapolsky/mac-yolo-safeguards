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
  isProductAnalyticsEnabled,
  setProductAnalyticsOptOut,
  trackProductEvent,
} from '../services/productAnalytics';

describe('productAnalytics', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
    await clearMarketingAttribution();
    setProductAnalyticsOptOut(false);
    delete process.env.EXPO_PUBLIC_POSTHOG_API_KEY;
    global.fetch = jest.fn().mockResolvedValue({ ok: true });
  });

  it('no-ops when PostHog key is missing', async () => {
    expect(isProductAnalyticsEnabled()).toBe(false);
    await trackProductEvent('test_event');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('captures events when key is configured', async () => {
    process.env.EXPO_PUBLIC_POSTHOG_API_KEY = 'phc_test';
    await trackProductEvent('mac_scan_complete', { found_count: 2 });
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toContain('/capture/');
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body);
    expect(body.event).toBe('mac_scan_complete');
    expect(body.properties.found_count).toBe(2);
  });

  it('attaches first and last marketing attribution properties', async () => {
    process.env.EXPO_PUBLIC_POSTHOG_API_KEY = 'phc_test';
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
    process.env.EXPO_PUBLIC_POSTHOG_API_KEY = 'phc_test';
    setProductAnalyticsOptOut(true);
    expect(isProductAnalyticsEnabled()).toBe(false);
    await trackProductEvent('ignored');
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
