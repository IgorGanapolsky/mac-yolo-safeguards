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
  // Client OTA is ON for real installs (Expo subscription is paid / live).
  // Only E2E automation APKs disable the controller so Maestro is not hijacked
  // mid-test by "Applying update…". Never re-introduce a calendar "billing
  // freeze" that silently blocks store users after the account is paid.
  // Emergency client kill-switch: EXPO_PUBLIC_OTA_FORCE_DISABLE=1 at build time.
  const otaForceDisable = truthy(process.env.EXPO_PUBLIC_OTA_FORCE_DISABLE);
  const otaControllerOff = e2eAutomation || otaForceDisable;

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
