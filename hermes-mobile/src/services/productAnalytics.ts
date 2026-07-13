import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import appConfig from '../../app.json';
import {
  isDemoModeAllowed,
  isE2eAutomationBuild,
  isStoreReviewDemoBuild,
} from '../utils/demoModePolicy';
import { getMarketingAttributionProperties } from './marketingAttribution';

/**
 * Production-only analytics contract — see docs/POSTHOG-PRODUCTION-ONLY.md.
 *
 * PostHog must count real store users only. Igor dogfood, dev builds, E2E,
 * preview/Firebase APKs, and developer backdoors must never emit events.
 */

const POSTHOG_HOST =
  process.env.EXPO_PUBLIC_POSTHOG_HOST?.trim() || 'https://us.i.posthog.com';

const posthogConfig = {
  key: process.env.EXPO_PUBLIC_POSTHOG_API_KEY?.trim() || '',
};

function posthogKey(): string {
  return posthogConfig.key;
}

/** @internal Test seam — overrides PostHog key without env inlining. */
export function __setPosthogKeyForTesting(key: string): void {
  posthogConfig.key = key;
}

const DISTINCT_ID_KEY = 'hermes.analytics.distinct_id';
const APP_VERSION = appConfig.expo.version;
const BUILD_NUMBER =
  Platform.OS === 'android'
    ? String(Constants.expoConfig?.android?.versionCode ?? '')
    : String(Constants.expoConfig?.ios?.buildNumber ?? '');

let optOut = false;
let distinctIdPromise: Promise<string> | null = null;
/** @internal null = use real build signals; boolean = test override */
let nonProductionBuildOverride: boolean | null = null;

export type ProductAnalyticsRuntimeSignals = {
  developerLeashUnlock: boolean;
  storeLeashPreviewActive: boolean;
  demoMode: boolean;
};

const defaultRuntimeSignals = (): ProductAnalyticsRuntimeSignals => ({
  developerLeashUnlock: false,
  storeLeashPreviewActive: false,
  demoMode: false,
});

let runtimeSignals: ProductAnalyticsRuntimeSignals = defaultRuntimeSignals();

function isTruthyEnv(name: string): boolean {
  const value = process.env[name];
  return value === '1' || String(value).toLowerCase() === 'true';
}

/** Build-time flag for Igor-only installs — never set on Play/App Store production. */
export function isPosthogInternalUserBuild(): boolean {
  return isTruthyEnv('EXPO_PUBLIC_POSTHOG_INTERNAL');
}

/** Non-production EAS profile or dev/demo build flags baked into the binary. */
export function isNonProductionAnalyticsBuild(): boolean {
  if (nonProductionBuildOverride !== null) {
    return nonProductionBuildOverride;
  }
  if (__DEV__) {
    return true;
  }
  if (isDemoModeAllowed()) {
    return true;
  }
  if (isTruthyEnv('EXPO_PUBLIC_HERMES_DEV_UNLOCK')) {
    return true;
  }
  if (isE2eAutomationBuild()) {
    return true;
  }
  if (isStoreReviewDemoBuild()) {
    return true;
  }
  if (isPosthogInternalUserBuild()) {
    return true;
  }
  const profile = process.env.EAS_BUILD_PROFILE?.trim();
  if (profile && profile !== 'production') {
    return true;
  }
  return false;
}

function hasActiveDeveloperBackdoor(): boolean {
  return (
    runtimeSignals.developerLeashUnlock ||
    runtimeSignals.storeLeashPreviewActive ||
    runtimeSignals.demoMode
  );
}

/**
 * Central gate for every PostHog capture path (product events + crash flush).
 * Returns false when the session is Igor/internal, dev, or user opted out.
 */
export function shouldReportToPostHog(): boolean {
  if (!posthogKey()) {
    return false;
  }
  if (optOut) {
    return false;
  }
  if (isNonProductionAnalyticsBuild()) {
    return false;
  }
  if (hasActiveDeveloperBackdoor()) {
    return false;
  }
  return true;
}

export function setProductAnalyticsRuntimeSignals(
  patch: Partial<ProductAnalyticsRuntimeSignals>,
): void {
  runtimeSignals = { ...runtimeSignals, ...patch };
}

export function setProductAnalyticsOptOut(enabled: boolean): void {
  optOut = enabled;
}

export function isProductAnalyticsEnabled(): boolean {
  return shouldReportToPostHog();
}

/** @internal Test seam — resets module-level analytics state. */
export function __resetProductAnalyticsForTesting(): void {
  optOut = false;
  distinctIdPromise = null;
  runtimeSignals = defaultRuntimeSignals();
  nonProductionBuildOverride = null;
  posthogConfig.key = '';
}

/** @internal Test seam — force production vs non-production build gate (Jest inlines __DEV__). */
export function __setNonProductionAnalyticsBuildForTesting(value: boolean | null): void {
  nonProductionBuildOverride = value;
}

async function getDistinctId(): Promise<string> {
  if (!distinctIdPromise) {
    distinctIdPromise = (async () => {
      const existing = await AsyncStorage.getItem(DISTINCT_ID_KEY);
      if (existing?.trim()) {
        return existing.trim();
      }
      const created = `hm_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      await AsyncStorage.setItem(DISTINCT_ID_KEY, created);
      return created;
    })();
  }
  return distinctIdPromise;
}

export async function trackProductEvent(
  event: string,
  properties: Record<string, string | number | boolean | null | undefined> = {},
): Promise<void> {
  if (!shouldReportToPostHog()) {
    if (__DEV__) {
      console.debug('[analytics]', event, properties);
    }
    return;
  }

  try {
    const distinctId = await getDistinctId();
    const attribution = await getMarketingAttributionProperties();
    await fetch(`${POSTHOG_HOST.replace(/\/+$/, '')}/capture/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: posthogKey(),
        event,
        properties: {
          distinct_id: distinctId,
          app: 'hermes-mobile',
          platform: Platform.OS,
          app_version: APP_VERSION,
          build_number: BUILD_NUMBER,
          ...attribution,
          ...properties,
        },
      }),
    });
  } catch (error) {
    if (__DEV__) {
      console.debug('[analytics] capture failed', event, error);
    }
  }
}

export async function trackScreenView(screenName: string): Promise<void> {
  await trackProductEvent('screen_view', { screen: screenName });
}

export async function trackAppOpen(): Promise<void> {
  await trackProductEvent('app_open');
}
