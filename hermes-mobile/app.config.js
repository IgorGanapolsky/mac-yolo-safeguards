const appJson = require('./app.json');

const truthy = (value) => value === '1' || String(value).toLowerCase() === 'true';

/** Free listing package (IAP). Paid download package cannot share Free→Paid conversion. */
const ANDROID_FREE_PACKAGE = 'com.iganapolsky.hermesmobile';
const ANDROID_PAID_PACKAGE = 'com.iganapolsky.hermesmobile.paid';

module.exports = ({ config }) => {
  const e2eAutomation = truthy(process.env.EXPO_PUBLIC_E2E_AUTOMATION);
  const storeReviewDemo = truthy(process.env.EXPO_PUBLIC_STORE_REVIEW_DEMO);
  const updatesChannel = process.env.EXPO_PUBLIC_UPDATES_CHANNEL || 'production';
  const androidStoreSku =
    process.env.HERMES_ANDROID_STORE_SKU === 'paid' ||
    truthy(process.env.EXPO_PUBLIC_ANDROID_PAID_DOWNLOAD)
      ? 'paid'
      : 'free';
  const androidPackage =
    androidStoreSku === 'paid' ? ANDROID_PAID_PACKAGE : ANDROID_FREE_PACKAGE;
  const baseUpdates = appJson.expo.updates || {};
  const baseAndroid = appJson.expo.android || {};
  // Expo billing freeze 2026-07-23: native ON_LOAD can replace a local release
  // APK with a CDN OTA mid-session ("Applying update…"). Until thaw, disable
  // automatic checks entirely (and disable the updates controller for phone
  // installs). Thaw: HERMES_OTA_BILLING_THAW=1 / EXPO_PUBLIC_OTA_BILLING_THAW=1.
  const billingThawed =
    truthy(process.env.HERMES_OTA_BILLING_THAW) ||
    truthy(process.env.EXPO_PUBLIC_OTA_BILLING_THAW);
  const billingFreezeActive =
    !billingThawed && Date.now() < Date.parse('2026-08-15T00:00:00.000Z');
  const otaControllerOff = e2eAutomation || billingFreezeActive;

  return {
    ...appJson.expo,
    ...config,
    android: {
      ...baseAndroid,
      ...(config.android || {}),
      package: androidPackage,
    },
    updates: {
      ...baseUpdates,
      enabled: otaControllerOff ? false : baseUpdates.enabled !== false,
      checkAutomatically: otaControllerOff
        ? 'NEVER'
        : baseUpdates.checkAutomatically || 'ON_LOAD',
      fallbackToCacheTimeout: baseUpdates.fallbackToCacheTimeout ?? 0,
      requestHeaders: otaControllerOff
        ? undefined
        : {
            'expo-channel-name': updatesChannel,
          },
    },
    extra: {
      ...(appJson.expo.extra || {}),
      ...(config.extra || {}),
      e2eAutomation,
      storeReviewDemo,
      androidStoreSku,
      androidPackage,
    },
  };
};
