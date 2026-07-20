/**
 * Expo config plugin — clear Google Play Console "actions recommended" for:
 * 1) Deprecated edge-to-edge theme params (statusBarColor / navigationBarColor)
 * 2) Large-screen orientation / resizability locks
 * 3) Unoptimized PNG drawables → WebP
 * 4) R8 minify + fullMode + PNG crunch confirmed in gradle.properties
 *
 * android/ is gitignored; this must run at prebuild / EAS build time.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const {
  withAndroidManifest,
  withAndroidStyles,
  withGradleProperties,
  withDangerousMod,
} = require('@expo/config-plugins');

const MLKIT_BARCODE_ACTIVITY =
  'com.google.mlkit.vision.codescanner.internal.GmsBarcodeScanningDelegateActivity';

function ensureToolsNamespace(manifest) {
  if (!manifest.$) manifest.$ = {};
  if (!manifest.$['xmlns:tools']) {
    manifest.$['xmlns:tools'] = 'http://schemas.android.com/tools';
  }
}

function stripOrientationLocks(mod) {
  const manifest = mod.modResults.manifest;
  ensureToolsNamespace(manifest);

  const application = manifest.application?.[0];
  if (!application) return mod;
  if (!application.$) application.$ = {};
  application.$['android:resizeableActivity'] = 'true';

  const activities = application.activity || [];
  for (const activity of activities) {
    if (!activity.$) continue;
    const name = activity.$['android:name'] || '';
    if (name === '.MainActivity' || name.endsWith('.MainActivity')) {
      delete activity.$['android:screenOrientation'];
      activity.$['android:resizeableActivity'] = 'true';
    }
  }

  // ML Kit barcode scanner ships PORTRAIT-locked; override for large screens.
  const existing = activities.find((a) => a.$?.['android:name'] === MLKIT_BARCODE_ACTIVITY);
  if (existing) {
    existing.$['android:screenOrientation'] = 'unspecified';
    existing.$['tools:replace'] = 'android:screenOrientation';
  } else {
    activities.push({
      $: {
        'android:name': MLKIT_BARCODE_ACTIVITY,
        'android:screenOrientation': 'unspecified',
        'android:exported': 'false',
        'tools:replace': 'android:screenOrientation',
      },
    });
    application.activity = activities;
  }

  return mod;
}

function stripDeprecatedSystemBarColors(mod) {
  const styles = mod.modResults;
  const resources = styles.resources;
  if (!resources?.style) return mod;

  for (const style of resources.style) {
    if (!style?.$) continue;
    const items = Array.isArray(style.item) ? style.item : style.item ? [style.item] : [];
    style.item = items.filter((item) => {
      const name = item?.$?.name;
      // Deprecated on Android 15+ edge-to-edge — triggers Play "deprecated APIs".
      return name !== 'android:statusBarColor' && name !== 'android:navigationBarColor';
    });

    // Ensure dark icons stay light-content without deprecated color APIs.
    if (style.$.name === 'AppTheme') {
      const names = new Set(
        (style.item || []).map((item) => item?.$?.name).filter(Boolean),
      );
      if (!names.has('android:windowLightStatusBar')) {
        style.item.push({
          $: { name: 'android:windowLightStatusBar' },
          _: 'false',
        });
      }
      if (!names.has('android:windowLightNavigationBar')) {
        style.item.push({
          $: { name: 'android:windowLightNavigationBar' },
          _: 'false',
        });
      }
    }
  }

  return mod;
}

function ensureR8GradleProperties(mod) {
  const props = mod.modResults;
  const wanted = {
    'android.enableMinifyInReleaseBuilds': 'true',
    'android.enableShrinkResourcesInReleaseBuilds': 'true',
    'android.enablePngCrunchInReleaseBuilds': 'true',
    'android.enableR8.fullMode': 'true',
    edgeToEdgeEnabled: 'true',
  };

  for (const [key, value] of Object.entries(wanted)) {
    const existing = props.find((p) => p.type === 'property' && p.key === key);
    if (existing) {
      existing.value = value;
    } else {
      props.push({ type: 'property', key, value });
    }
  }

  return mod;
}

function findCwebp() {
  const candidates = ['/opt/homebrew/bin/cwebp', '/usr/local/bin/cwebp', 'cwebp'];
  for (const bin of candidates) {
    try {
      execFileSync(bin, ['-version'], { stdio: 'ignore' });
      return bin;
    } catch {
      // try next
    }
  }
  return null;
}

function convertPngTreeToWebp(resRoot, cwebp) {
  if (!fs.existsSync(resRoot)) return { converted: 0, skipped: 0 };
  let converted = 0;
  let skipped = 0;

  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(full);
        continue;
      }
      if (!entry.name.endsWith('.png')) continue;
      // Keep mipmap launcher PNGs — Play adaptive icons / legacy launchers expect PNG.
      if (full.includes(`${path.sep}mipmap-`)) {
        skipped += 1;
        continue;
      }
      const webpPath = full.replace(/\.png$/i, '.webp');
      try {
        execFileSync(cwebp, ['-quiet', '-q', '90', full, '-o', webpPath], {
          stdio: 'ignore',
        });
        fs.unlinkSync(full);
        converted += 1;
      } catch {
        skipped += 1;
      }
    }
  };

  walk(resRoot);
  return { converted, skipped };
}

function withBitmapWebpOptimization(config) {
  return withDangerousMod(config, [
    'android',
    async (mod) => {
      const resRoot = path.join(
        mod.modRequest.platformProjectRoot,
        'app',
        'src',
        'main',
        'res',
      );
      const cwebp = findCwebp();
      if (!cwebp) {
        console.warn(
          '[withPlayConsoleAndroidHardening] cwebp not found — skipping PNG→WebP (EAS Linux images include it after apt, or rely on AAPT2 crunch)',
        );
        return mod;
      }
      const result = convertPngTreeToWebp(resRoot, cwebp);
      console.log(
        `[withPlayConsoleAndroidHardening] PNG→WebP converted=${result.converted} skipped=${result.skipped}`,
      );
      return mod;
    },
  ]);
}

function withPlayConsoleAndroidHardening(config) {
  config = withAndroidManifest(config, stripOrientationLocks);
  config = withAndroidStyles(config, stripDeprecatedSystemBarColors);
  config = withGradleProperties(config, ensureR8GradleProperties);
  config = withBitmapWebpOptimization(config);
  return config;
}

module.exports = withPlayConsoleAndroidHardening;
module.exports.MLKIT_BARCODE_ACTIVITY = MLKIT_BARCODE_ACTIVITY;
module.exports.stripOrientationLocks = stripOrientationLocks;
module.exports.stripDeprecatedSystemBarColors = stripDeprecatedSystemBarColors;
module.exports.ensureR8GradleProperties = ensureR8GradleProperties;
module.exports.convertPngTreeToWebp = convertPngTreeToWebp;
