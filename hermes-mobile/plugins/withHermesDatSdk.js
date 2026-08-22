/**
 * withHermesDatSdk.js
 *
 * Expo config plugin — registers Meta Wearables Device Access Toolkit (DAT) SDK
 * for streaming raw camera frames from Ray-Ban Meta glasses.
 *
 * The DAT SDK is distributed via the Meta for Developers portal (not Maven Central)
 * and must be manually installed after enabling Developer Mode on the glasses.
 * This plugin adds the native dependency as a commented placeholder and registers
 * the required permissions + Kotlin version, so `npx expo prebuild` succeeds.
 *
 * Install (Android):
 *   Visit https://developers.meta.com → Wearables DAT SDK → download AAR
 *   Place the .aar in android/app/libs/ and uncomment the dependency below.
 *
 * Install (iOS):
 *   Use Swift Package Manager with the Meta Wearables DAT SDK URL.
 *
 * @see https://developers.meta.com/blog/introducing-meta-wearables-device-access-toolkit/
 */
const { withAppBuildGradle, withProjectBuildGradle, withAndroidManifest } = require('@expo/config-plugins');

const DAT_SDK_VERSION = '1.0.0';

function withHermesDatSdk(config) {
  // Add DAT SDK dependency placeholder to build.gradle (app level).
  // The actual Maven coordinate depends on how Meta ships the SDK; we add a
  // commented-out placeholder so the dependency line is discoverable but does
  // not break builds when the SDK isn't installed.
  config = withAppBuildGradle(config, (mod) => {
    if (!mod.modResults.contents.includes('@meta/wearables-dat-sdk')) {
      // Inject the placeholder inside the dependencies block.
      mod.modResults.contents = mod.modResults.contents.replace(
        /dependencies\s*\{/,
        'dependencies {\n    // Meta Wearables Device Access Toolkit (DAT SDK)\n    // implementation(name: "dat-sdk-1.0.0", ext: "aar")\n    // Install: download AAR from developers.meta.com → android/app/libs/',
      );
    }
    return mod;
  });

  // Set Kotlin jvmTarget to 21 (DAT SDK requires Kotlin 2.1+)
  config = withProjectBuildGradle(config, (mod) => {
    if (!mod.modResults.contents.includes('hermes-dat-sdk-kotlin')) {
      mod.modResults.contents = mod.modResults.contents.replace(
        'kotlinOptions {',
        'kotlinOptions {\n        // DAT SDK requires Kotlin 2.1+\n        // hermes-dat-sdk-kotlin\n        jvmTarget = "21"',
      );
      if (mod.modResults.contents.includes('kotlinOptions {')) {
        // kotlinOptions block may not exist; add after kotlinOptions in buildscript
        mod.modResults.contents += '\n// hermes-dat-sdk-kotlin: Kotlin jvmTarget 21+ required for DAT SDK';
      }
    }
    return mod;
  });

  // Add required permissions for camera streaming
  config = withAndroidManifest(config, (mod) => {
    mod.modResults.manifest.platformPermissions = [
      ...(mod.modResults.manifest.platformPermissions || []),
      'android.permission.BLUETOOTH_CONNECT',
      'android.permission.BLUETOOTH_SCAN',
      'android.permission.CAMERA',
      'android.permission.BROADCAST_STICKY',
    ];
    return mod;
  });

  return config;
}

module.exports = withHermesDatSdk;
