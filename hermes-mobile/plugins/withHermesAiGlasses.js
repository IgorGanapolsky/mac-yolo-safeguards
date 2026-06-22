/**
 * Expo config plugin — wires Jetpack XR projected activity + Kotlin sources on prebuild.
 * @see https://developer.android.com/develop/xr/jetpack-xr-sdk/ai-glasses/first-activity
 */
const fs = require('fs');
const path = require('path');
const {
  withAppBuildGradle,
  withProjectBuildGradle,
  withAndroidManifest,
  withGradleProperties,
  withDangerousMod,
} = require('@expo/config-plugins');

const KOTLIN_VERSION = '2.1.20';

const XR_DEPS = `
    // Hermes AI glasses (Jetpack XR — I/O 2026)
    implementation("androidx.xr.runtime:runtime:1.0.0-alpha15")
    implementation("androidx.xr.glimmer:glimmer:1.0.0-alpha14")
    implementation("androidx.xr.projected:projected:1.0.0-alpha08")
    implementation("androidx.activity:activity-compose:1.9.3")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.7")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.8.7")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.8.1")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
`;

function withHermesComposeCompilerPlugin(config) {
  return withProjectBuildGradle(config, (mod) => {
    const marker = 'compose-compiler-gradle-plugin';
    if (!mod.modResults.contents.includes(marker)) {
      mod.modResults.contents = mod.modResults.contents.replace(
        /classpath\('org\.jetbrains\.kotlin:kotlin-gradle-plugin'\)/,
        `classpath('org.jetbrains.kotlin:kotlin-gradle-plugin')
    classpath('org.jetbrains.kotlin:compose-compiler-gradle-plugin:${KOTLIN_VERSION}')`,
      );
    }
    return mod;
  });
}

function withHermesXrDependencies(config) {
  return withAppBuildGradle(config, (mod) => {
    if (mod.modResults.contents.includes('aiGlassesEnabled')) {
      return mod;
    }
    // Defer XR wiring to app/build.gradle `aiGlassesEnabled` block — plugin only copies sources.
    return mod;
  });
}

function withHermesCompileSdk(config) {
  return withGradleProperties(config, (mod) => {
    const enabled = process.env.HERMES_AI_GLASSES_ENABLED === '1';
    mod.modResults.push({
      type: 'property',
      key: 'hermes.aiGlasses.enabled',
      value: enabled ? 'true' : 'false',
    });
    return mod;
  });
}

function withHermesGlassesManifest(config) {
  if (process.env.HERMES_AI_GLASSES_ENABLED !== '1') {
    return config;
  }
  return withAndroidManifest(config, (mod) => {
    const app = mod.modResults.manifest.application?.[0];
    if (!app) return mod;
    const activities = app.activity ?? [];
    const exists = activities.some(
      (a) => a.$?.['android:name'] === '.glasses.HermesGlassesProjectedActivity',
    );
    if (!exists) {
      app.activity = [
        ...activities,
        {
          $: {
            'android:name': '.glasses.HermesGlassesProjectedActivity',
            'android:exported': 'true',
            'android:theme': '@style/AppTheme',
            'android:requiredDisplayCategory': 'android.hardware.display.category.XR_PROJECTED',
          },
          'intent-filter': [
            {
              action: [{ $: { 'android:name': 'android.intent.action.MAIN' } }],
              category: [{ $: { 'android:name': 'android.intent.category.XR_PROJECTED_LAUNCHER' } }],
            },
          ],
        },
      ];
    }
    return mod;
  });
}

function withHermesGlassesSources(config) {
  if (process.env.HERMES_AI_GLASSES_ENABLED !== '1') {
    return config;
  }
  return withDangerousMod(config, [
    'android',
    async (mod) => {
      const projectRoot = mod.modRequest.projectRoot;
      const srcRoot = path.join(projectRoot, 'native-glasses', 'kotlin');
      const pkgDir = path.join(
        mod.modRequest.platformProjectRoot,
        'app',
        'src',
        'main',
        'java',
        'com',
        'iganapolsky',
        'hermesmobile',
        'glasses',
      );
      fs.mkdirSync(pkgDir, { recursive: true });
      for (const file of fs.readdirSync(srcRoot)) {
        if (file.endsWith('.kt')) {
          fs.copyFileSync(path.join(srcRoot, file), path.join(pkgDir, file));
        }
      }
      const mainAppPath = path.join(
        mod.modRequest.platformProjectRoot,
        'app',
        'src',
        'main',
        'java',
        'com',
        'iganapolsky',
        'hermesmobile',
        'MainApplication.kt',
      );
      if (fs.existsSync(mainAppPath)) {
        let mainApp = fs.readFileSync(mainAppPath, 'utf8');
        if (!mainApp.includes('HermesGlassesPackage')) {
          mainApp = mainApp.replace(
            /(PackageList\(this\)\.packages\.apply\s*\{)/,
            `$1
              add(com.iganapolsky.hermesmobile.glasses.HermesGlassesPackage())`,
          );
          fs.writeFileSync(mainAppPath, mainApp);
        }
      }
      return mod;
    },
  ]);
}

function withHermesAiGlasses(config) {
  config = withHermesComposeCompilerPlugin(config);
  config = withHermesCompileSdk(config);
  config = withHermesXrDependencies(config);
  config = withHermesGlassesManifest(config);
  config = withHermesGlassesSources(config);
  return config;
}

module.exports = withHermesAiGlasses;
