// Wrap Expo's default Metro config with Sentry's serializer so the release bundle and
// its source map share a Debug ID. Without this, no Debug ID is emitted and even a
// correctly uploaded source map can never be correlated to a crash — traces stay
// minified. The import MUST come from '@sentry/react-native/metro'
// (getSentryExpoConfig is not on the '/expo' subpath).
const { getSentryExpoConfig } = require('@sentry/react-native/metro');

module.exports = getSentryExpoConfig(__dirname);
