import fs from 'fs';
import path from 'path';

const root = path.resolve(__dirname, '../..');

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), 'utf8');
}

describe('Play Console Android hardening contract', () => {
  const app = JSON.parse(read('app.json'));
  const pluginSrc = read('plugins/withPlayConsoleAndroidHardening.js');
  const appTsx = read('App.tsx');

  it('unlocks orientation for large-screen devices', () => {
    expect(app.expo.orientation).toBe('default');
    expect(app.expo.orientation).not.toBe('portrait');
  });

  it('opts into Android edge-to-edge without deprecated theme colors', () => {
    expect(app.expo.android.edgeToEdgeEnabled).toBe(true);
    expect(pluginSrc).toContain("android:statusBarColor");
    expect(pluginSrc).toContain('stripDeprecatedSystemBarColors');
  });

  it('registers the Play Console hardening config plugin', () => {
    expect(app.expo.plugins).toContain('./plugins/withPlayConsoleAndroidHardening.js');
  });

  it('keeps R8 minify + shrink + PNG crunch on for release', () => {
    const buildProps = app.expo.plugins.find(
      (p: unknown) => Array.isArray(p) && p[0] === 'expo-build-properties',
    ) as [string, { android?: Record<string, unknown> }] | undefined;
    expect(buildProps?.[1]?.android?.enableMinifyInReleaseBuilds).toBe(true);
    expect(buildProps?.[1]?.android?.enableShrinkResourcesInReleaseBuilds).toBe(true);
    expect(buildProps?.[1]?.android?.enablePngCrunchInReleaseBuilds).toBe(true);
    expect(pluginSrc).toContain('android.enableR8.fullMode');
    expect(pluginSrc).toContain('android.enableMinifyInReleaseBuilds');
  });

  it('does not mount RN StatusBar (deprecated Window status/nav color APIs)', () => {
    expect(appTsx).not.toMatch(/\bStatusBar\b/);
  });

  it('overrides ML Kit barcode portrait lock and MainActivity orientation', () => {
    expect(pluginSrc).toContain('GmsBarcodeScanningDelegateActivity');
    expect(pluginSrc).toContain('resizeableActivity');
    expect(pluginSrc).toContain("delete activity.$['android:screenOrientation']");
  });

  it('converts non-mipmap drawable PNGs to WebP when cwebp is available', () => {
    expect(pluginSrc).toContain('convertPngTreeToWebp');
    expect(pluginSrc).toContain('mipmap-');
  });

  it('installs cwebp on EAS Linux builders before prebuild', () => {
    const pkg = JSON.parse(read('package.json'));
    expect(pkg.scripts['eas-build-pre-install']).toMatch(/webp|cwebp/);
  });
});
