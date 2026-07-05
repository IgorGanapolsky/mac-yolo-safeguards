const appJson = require('./app.json');

const truthy = (value) => value === '1' || String(value).toLowerCase() === 'true';

module.exports = ({ config }) => {
  const e2eAutomation = truthy(process.env.EXPO_PUBLIC_E2E_AUTOMATION);

  return {
    ...appJson.expo,
    ...config,
    extra: {
      ...(appJson.expo.extra || {}),
      ...(config.extra || {}),
      e2eAutomation,
    },
  };
};
