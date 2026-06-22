import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import appConfig from '../../app.json';

const POSTHOG_HOST =
  process.env.EXPO_PUBLIC_POSTHOG_HOST?.trim() || 'https://us.i.posthog.com';

function posthogKey(): string {
  return process.env.EXPO_PUBLIC_POSTHOG_API_KEY?.trim() || '';
}
const DISTINCT_ID_KEY = 'hermes.analytics.distinct_id';
const APP_VERSION = appConfig.expo.version;
const BUILD_NUMBER =
  Platform.OS === 'android'
    ? String(Constants.expoConfig?.android?.versionCode ?? '')
    : String(Constants.expoConfig?.ios?.buildNumber ?? '');

let optOut = false;
let distinctIdPromise: Promise<string> | null = null;

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

export function setProductAnalyticsOptOut(enabled: boolean): void {
  optOut = enabled;
}

export function isProductAnalyticsEnabled(): boolean {
  return Boolean(posthogKey()) && !optOut;
}

export async function trackProductEvent(
  event: string,
  properties: Record<string, string | number | boolean | null | undefined> = {},
): Promise<void> {
  if (!isProductAnalyticsEnabled()) {
    if (__DEV__) {
      console.debug('[analytics]', event, properties);
    }
    return;
  }

  try {
    const distinctId = await getDistinctId();
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
