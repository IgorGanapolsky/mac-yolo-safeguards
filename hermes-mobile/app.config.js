const appJson = require('./app.json');

const truthy = (value) => value === '1' || String(value).toLowerCase() === 'true';

module.exports = ({ config }) => {
  const e2eAutomation = truthy(process.env.EXPO_PUBLIC_E2E_AUTOMATION);
  const storeReviewDemo = truthy(process.env.EXPO_PUBLIC_STORE_REVIEW_DEMO);
  const updatesChannel = process.env.EXPO_PUBLIC_UPDATES_CHANNEL || 'production';
  const baseUpdates = appJson.expo.updates || {};

  return {
    ...appJson.expo,
    ...config,
    updates: {
      ...baseUpdates,
      enabled: e2eAutomation ? false : baseUpdates.enabled !== false,
      checkAutomatically: e2eAutomation ? 'NEVER' : baseUpdates.checkAutomatically || 'ON_LOAD',
      fallbackToCacheTimeout: baseUpdates.fallbackToCacheTimeout ?? 0,
      requestHeaders: e2eAutomation
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
    },
  };
};
