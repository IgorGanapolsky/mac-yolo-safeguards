/**
 * withHermesDatSdk.js
 *
 * Expo config plugin — registers Meta Wearables Device Access Toolkit (DAT) SDK
 * for streaming raw camera frames from Ray-Ban Meta glasses.
 *
 * The DAT SDK is distributed via the Meta for Developers portal (not Maven Central)
 * and must be manually installed after enabling Developer Mode on the glasses.
 * This plugin adds the native dependency as a commented placeholder and documents
 * the Kotlin version requirement, so `npx expo prebuild` succeeds.
 *
 * Install (Android):
 *   Visit https://developers.meta.com → Wearables DAT SDK → download AAR
 *   Place the .aar in android/app/libs/ and uncomment the dependency below.
 *
 * Install (iOS):
 *   Use Swift Package Manager with the Meta Wearables DAT SDK URL.
 *
 * Permissions (BLUETOOTH_CONNECT, BLUETOOTH_SCAN, CAMERA) are already declared
 * by expo-camera and the base manifest — this plugin does not duplicate them.
 *
 * @see https://developers.meta.com/blog/introducing-meta-wearables-device-access-toolkit/
 */
const { withAppBuildGradle, withProjectBuildGradle } = require('@expo/config-plugins');

const DAT_SDK_VERSION = '1.0.0';

function withHermesDatSdk(config) {
  // Add DAT SDK dependency placeholder to build.gradle (app level).
  // The actual Maven coordinate depends on how Meta ships the SDK; we add a
  // commented-out placeholder so the dependency line is discoverable but does
  // not break builds when the SDK isn't installed.
  config = withAppBuildGradle(config, (mod) => {
    if (!mod.modResults.contents.includes('@meta/wearables-dat-sdk')) {
      mod.modResults.contents = mod.modResults.contents.replace(
        /dependencies\s*\{/,
        `dependencies {
    // Meta Wearables Device Access Toolkit (DAT SDK)
    // implementation(name: "dat-sdk-${DAT_SDK_VERSION}", ext: "aar")
    // Install: download AAR from developers.meta.com and place in android/app/libs/`,
      );
    }
    return mod;
  });

  // Document Kotlin jvmTarget 21+ requirement (DAT SDK requires Kotlin 2.1+)
  config = withProjectBuildGradle(config, (mod) => {
    if (!mod.modResults.contents.includes('hermes-dat-sdk-kotlin')) {
      mod.modResults.contents = mod.modResults.contents.replace(
        'kotlinOptions {',
        'kotlinOptions {\n        // hermes-dat-sdk-kotlin: Kotlin 2.1+ (jvmTarget 21) required for DAT SDK',
      );
    }
    return mod;
  });

  return config;
}

module.exports = withHermesDatSdk;
