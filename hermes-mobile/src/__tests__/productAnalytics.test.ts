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
  isProductAnalyticsEnabled,
  setProductAnalyticsOptOut,
  trackProductEvent,
} from '../services/productAnalytics';

describe('productAnalytics', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
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

  it('respects opt-out', async () => {
    process.env.EXPO_PUBLIC_POSTHOG_API_KEY = 'phc_test';
    setProductAnalyticsOptOut(true);
    expect(isProductAnalyticsEnabled()).toBe(false);
    await trackProductEvent('ignored');
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
