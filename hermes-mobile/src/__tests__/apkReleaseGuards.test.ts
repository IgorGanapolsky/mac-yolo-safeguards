import fs from 'fs';
import path from 'path';
import {
  apkContainsExpoModules,
  apkContainsLegacyShellMarkers,
  apkHasEmbeddedJsBundle,
  EMBEDDED_JS_BUNDLE_PATH,
  EXPECTED_ANDROID_PACKAGE,
  verifyApkReleaseGuards,
} from '../utils/apkReleaseGuards';

describe('apkReleaseGuards', () => {
  it('requires embedded JS bundle (blocks debug / Metro crash APKs)', () => {
    expect(apkHasEmbeddedJsBundle(['classes.dex', 'AndroidManifest.xml'])).toBe(false);
    expect(apkHasEmbeddedJsBundle([EMBEDDED_JS_BUNDLE_PATH, 'classes.dex'])).toBe(true);
  });

  it('rejects legacy native shell markers', () => {
    const hits = apkContainsLegacyShellMarkers(['Hold the cord on your AI', 'expo/modules']);
    expect(hits).toContain('Hold the cord on your AI');
    expect(apkContainsLegacyShellMarkers(['expo/modules', 'Hermes Mobile'])).toEqual([]);
  });

  it('requires expo modules in binary', () => {
    expect(apkContainsExpoModules(['expo/modules/kotlin'])).toBe(true);
    expect(apkContainsExpoModules(['com.iganapolsky.hermesmobile'])).toBe(false);
  });

  it('passes a valid release inspection', () => {
    const result = verifyApkReleaseGuards({
      entries: [EMBEDDED_JS_BUNDLE_PATH, 'classes.dex'],
      sampledStrings: ['expo/modules', 'Hermes Mobile', 'HERMES CHAT'],
      packageName: EXPECTED_ANDROID_PACKAGE,
      applicationLabel: 'Hermes Mobile',
    });
    expect(result).toEqual({ ok: true });
  });

  it('fails debug APK without bundle (the Jun 17 crash)', () => {
    const result = verifyApkReleaseGuards({
      entries: ['classes.dex'],
      sampledStrings: ['expo/modules'],
      packageName: EXPECTED_ANDROID_PACKAGE,
      applicationLabel: 'Hermes Mobile',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors[0]).toMatch(/embedded JS bundle/i);
    }
  });

  it('fails wrong package APK', () => {
    const result = verifyApkReleaseGuards({
      entries: [EMBEDDED_JS_BUNDLE_PATH],
      sampledStrings: ['expo/modules'],
      packageName: 'com.iganapolsky.legacyapp',
      applicationLabel: 'Hermes Mobile',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(' ')).toMatch(/package/);
    }
  });

  it('fails unexpected application label', () => {
    const result = verifyApkReleaseGuards({
      entries: [EMBEDDED_JS_BUNDLE_PATH],
      sampledStrings: ['expo/modules'],
      packageName: EXPECTED_ANDROID_PACKAGE,
      applicationLabel: 'Wrong Label',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(' ')).toMatch(/label/i);
    }
  });

  it('fails legacy shell APK', () => {
    const result = verifyApkReleaseGuards({
      entries: [EMBEDDED_JS_BUNDLE_PATH],
      sampledStrings: ['Hold the cord on your AI', 'Connect your computer'],
      packageName: EXPECTED_ANDROID_PACKAGE,
      applicationLabel: 'Hermes Mobile Agent',
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.join(' ')).toMatch(/legacy/i);
    }
  });
});

describe('apkReleaseGuards integration', () => {
  const releaseApk = path.resolve(
    __dirname,
    '../../android/app/build/outputs/apk/release/app-release.apk',
  );

  const maybeIt = fs.existsSync(releaseApk) ? it : it.skip;

  maybeIt('validates local release APK when present', () => {
    const entries = fs
      .readFileSync(releaseApk)
      .length > 0
      ? require('child_process')
          .execSync(`unzip -Z1 ${JSON.stringify(releaseApk)}`, { encoding: 'utf8' })
          .split('\n')
          .filter(Boolean)
      : [];

    const result = verifyApkReleaseGuards({
      entries,
      sampledStrings: ['expo/modules'],
      packageName: EXPECTED_ANDROID_PACKAGE,
    });
    expect(result.ok).toBe(true);
  });
});
