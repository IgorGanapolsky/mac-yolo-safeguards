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
  clearRemoteConfigCache,
  __resetMemoryCacheForTesting,
  __setRemoteConfigForTesting,
  getBooleanFlag,
  getBooleanFlagSync,
  isRemoteConfigInitialized,
  refreshRemoteConfig,
} from '../services/remoteConfig';
import {
  __setShouldReportToPostHogForTesting,
} from '../services/productAnalytics';

// Minimal shape of a PostHog /flags response body.
interface FlagsResponse {
  featureFlags?: Record<string, boolean | string>;
}

function mockFlagsResponse(flags: FlagsResponse['featureFlags']): void {
  const body = JSON.stringify({ featureFlags: flags });
  (global.fetch as jest.Mock).mockResolvedValue({
    ok: true,
    json: async () => JSON.parse(body),
  });
}

describe('remoteConfig (PostHog feature flags)', () => {
  const originalDev = (global as { __DEV__?: boolean }).__DEV__;

  beforeEach(async () => {
    await AsyncStorage.clear();
    await clearRemoteConfigCache();
    __setShouldReportToPostHogForTesting(true); // production-allowed
    __setRemoteConfigForTesting({
      host: 'https://us.i.posthog.com',
      key: 'phc_test_key',
      ttlMs: 15 * 60 * 1000,
    });
    (global as { __DEV__?: boolean }).__DEV__ = false;
    global.fetch = jest.fn();
  });

  afterEach(() => {
    (global as { __DEV__?: boolean }).__DEV__ = originalDev;
    __setShouldReportToPostHogForTesting(null);
  });

  describe('refreshRemoteConfig', () => {
    it('fetches /flags?v=2 with token + distinct_id and caches the result', async () => {
      mockFlagsResponse({ kill_chat_send: true, beta_feature: 'control' });
      const result = await refreshRemoteConfig();
      expect(result).toEqual({
        kill_chat_send: true,
        beta_feature: 'control',
      });
      expect(global.fetch).toHaveBeenCalledTimes(1);
      const [url, init] = (global.fetch as jest.Mock).mock.calls[0];
      expect(url).toBe('https://us.i.posthog.com/flags?v=2');
      expect(init.method).toBe('POST');
      const body = JSON.parse(init.body);
      expect(body.token).toBe('phc_test_key');
      expect(typeof body.distinct_id).toBe('string');
      expect(body.distinct_id.length).toBeGreaterThan(0);
    });

    it('returns null and does not fetch when the production gate is closed', async () => {
      __setShouldReportToPostHogForTesting(false);
      const result = await refreshRemoteConfig();
      expect(result).toBeNull();
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('returns null when the API key is absent', async () => {
      __setRemoteConfigForTesting({ key: '' });
      const result = await refreshRemoteConfig();
      expect(result).toBeNull();
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('returns null on a non-ok HTTP response without throwing', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({ ok: false, status: 500 });
      const result = await refreshRemoteConfig();
      expect(result).toBeNull();
    });

    it('returns null on a network error without throwing', async () => {
      (global.fetch as jest.Mock).mockRejectedValue(new Error('offline'));
      const result = await refreshRemoteConfig();
      expect(result).toBeNull();
    });

    it('handles a response with no featureFlags key as an empty map', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        json: async () => ({}),
      });
      const result = await refreshRemoteConfig();
      expect(result).toEqual({});
    });
  });

  describe('getBooleanFlag', () => {
    it('returns the cached boolean value after a refresh', async () => {
      mockFlagsResponse({ kill_chat_send: true, beta_off: false });
      await refreshRemoteConfig();
      expect(await getBooleanFlag('kill_chat_send')).toBe(true);
      expect(await getBooleanFlag('beta_off')).toBe(false);
    });

    it('coerces a string "true"/"false" value to boolean', async () => {
      mockFlagsResponse({ str_true: 'true', str_false: 'false' });
      await refreshRemoteConfig();
      expect(await getBooleanFlag('str_true')).toBe(true);
      expect(await getBooleanFlag('str_false')).toBe(false);
    });

    it('returns the safe default (false) for an unknown flag', async () => {
      mockFlagsResponse({ unrelated: true });
      await refreshRemoteConfig();
      expect(await getBooleanFlag('does_not_exist')).toBe(false);
    });

    it('returns a custom default when provided and flag is absent', async () => {
      mockFlagsResponse({});
      await refreshRemoteConfig();
      expect(await getBooleanFlag('absent', true)).toBe(true);
    });

    it('falls back to disk cache after a memory-only reset (cold start)', async () => {
      mockFlagsResponse({ persisted_kill: true });
      await refreshRemoteConfig(); // populates disk + memory
      __resetMemoryCacheForTesting(); // models a cold start; disk survives
      // No fresh fetch — the disk cache should satisfy the read.
      expect(await getBooleanFlag('persisted_kill')).toBe(true);
    });

    it('returns safe default when there is no cache and no network', async () => {
      await clearRemoteConfigCache();
      expect(await getBooleanFlag('never_seen')).toBe(false);
    });

    it('returns safe default when the production gate is closed', async () => {
      __setShouldReportToPostHogForTesting(false);
      mockFlagsResponse({ should_be_on: true });
      await refreshRemoteConfig(); // no-op (gate closed)
      expect(await getBooleanFlag('should_be_on')).toBe(false);
    });
  });

  describe('getBooleanFlagSync', () => {
    it('reads from memory cache after a refresh', async () => {
      mockFlagsResponse({ sync_flag: true });
      await refreshRemoteConfig();
      expect(getBooleanFlagSync('sync_flag')).toBe(true);
    });

    it('returns default when memory cache is empty', () => {
      expect(getBooleanFlagSync('nothing', true)).toBe(true);
    });
  });

  describe('isRemoteConfigInitialized', () => {
    it('is false before any refresh and true after', async () => {
      expect(isRemoteConfigInitialized()).toBe(false);
      mockFlagsResponse({ x: true });
      await refreshRemoteConfig();
      expect(isRemoteConfigInitialized()).toBe(true);
    });
  });
});
