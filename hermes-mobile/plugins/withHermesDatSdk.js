/**
 * withHermesDatSdk.js
 *
 * Expo config plugin — adds Meta Wearables Device Access Toolkit (DAT) SDK
 * dependency for streaming raw camera frames from Ray-Ban Meta glasses.
 *
 * Install:
 *   npm install @meta/wearables-dat-sdk
 *   npx expo prebuild
 *
 * The DAT SDK is a native iOS (Swift) and Android (Kotlin) SDK that provides
 * Camera Kit for streaming I420 video frames from Meta smart glasses to a
 * companion app. This bypasses Meta AI's "I can't read screens" guardrail
 * by giving you direct access to raw camera frames.
 *
 * @see https://developers.meta.com/blog/introducing-meta-wearables-device-access-toolkit/
 */
const { withProjectBuildGradle, withAppBuildGradle, withAndroidManifest } = require('@expo/config-plugins');

const DAT_SDK_VERSION = '1.0.0';

function withHermesDatSdk(config) {
  // Add DAT SDK dependency to build.gradle (app level)
  config = withAppBuildGradle(config, (mod) => {
    if (!mod.modResults.contents.includes('@meta:wearables-dat-sdk')) {
      mod.modResults.contents += `
    // Meta Wearables Device Access Toolkit (DAT SDK)
    implementation 'com.meta.wearables:dat-sdk:${DAT_SDK_VERSION}'
`;
    }
    return mod;
  });

  // Add Kotlin options for DAT SDK compatibility
  config = withProjectBuildGradle(config, (mod) => {
    if (!mod.modResults.contents.includes('dat-sdk-kotlin-options')) {
      mod.modResults.contents = mod.modResults.contents.replace(
        'kotlinOptions {',
        'kotlinOptions {\n        // DAT SDK requires Kotlin 2.1+\n        jvmTarget = "21"',
      );
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
    mod.modResults.manifest['dat-sdk-enabled'] = true;
    return mod;
  });

  // Mark config with version metadata
  config.version = config.version || {};
  return config;
}

module.exports = withHermesDatSdk;
