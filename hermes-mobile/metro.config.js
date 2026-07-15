// Wrap Expo's default Metro config with Sentry's serializer so the release
// bundle and its source map share a Debug ID. Then optionally enable Callstack
// Rozenite so @react-native-ai/dev-tools (AI SDK Profiler) can appear in
// React Native DevTools. Opt-in only: WITH_ROZENITE=true — keeps doctor:expo /
// release Metro paths free of DevTools middleware unless an agent asks for it.
//
// Docs: hermes-mobile/docs/AI-SDK-PROFILER.md
const { getSentryExpoConfig } = require('@sentry/react-native/metro');

const sentryConfig = getSentryExpoConfig(__dirname);
const withRozeniteEnabled = process.env.WITH_ROZENITE === 'true';

if (!withRozeniteEnabled) {
  module.exports = sentryConfig;
} else {
  // Lazy-require so machines without @rozenite/metro still load Metro when
  // WITH_ROZENITE is unset (default). withRozenite returns an async Metro
  // config factory (Expo/Metro supports that).
  // Do not pass `include: ['@react-native-ai/dev-tools']` until the npm
  // tarball ships dist/rozenite.json — include fails hard without it.
  const { withRozenite } = require('@rozenite/metro');
  module.exports = withRozenite(sentryConfig, {
    enabled: true,
  });
}
