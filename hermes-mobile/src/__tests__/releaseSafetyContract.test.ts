import fs from 'fs';
import path from 'path';
import {
  FIREBASE_ANDROID_APP_ID,
  HERMES_ANDROID_OPERATOR_EMAIL,
  HERMES_IOS_APPLE_ID_EMAIL,
  HERMES_MOBILE_ANDROID_PACKAGE,
} from '../constants/appIdentity';
import firebaseProject from '../../firebase-project.json';

const root = path.resolve(__dirname, '../../..');

const read = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8');

describe('appIdentity', () => {
  it('uses hermesmobile package everywhere', () => {
    expect(HERMES_MOBILE_ANDROID_PACKAGE).toBe('com.iganapolsky.hermesmobile');
    expect(firebaseProject.androidPackage).toBe(HERMES_MOBILE_ANDROID_PACKAGE);
  });

  it('splits Android Gmail vs iOS iCloud operator emails', () => {
    expect(HERMES_ANDROID_OPERATOR_EMAIL).toBe('iganapolsky@gmail.com');
    expect(HERMES_IOS_APPLE_ID_EMAIL).toBe('igor.ganapolsky@icloud.com');
    expect(HERMES_ANDROID_OPERATOR_EMAIL).not.toBe(HERMES_IOS_APPLE_ID_EMAIL);
  });

  it('points Firebase at hermes-mobile-dist-78361 only', () => {
    expect(firebaseProject.gcpProjectId).toBe('hermes-mobile-dist-78361');
    expect(FIREBASE_ANDROID_APP_ID).toBe(firebaseProject.androidAppId);
    const legacyTerms = [
      ['open', 'claw'].join(''),
      ['agent', 'leash'].join(''),
      ['lipo', 'shield'].join(''),
    ];
    for (const term of legacyTerms) {
      expect(firebaseProject.gcpProjectId.toLowerCase()).not.toContain(term);
    }
  });

  it('uses Hermes Mobile display name and package in app.json', () => {
    const app = JSON.parse(read('hermes-mobile/app.json'));
    expect(app.expo.name).toBe('Hermes Mobile');
    expect(app.expo.slug).toBe('hermes-mobile');
    expect(app.expo.android.package).toBe('com.iganapolsky.hermesmobile');
    expect(app.expo.ios.bundleIdentifier).toBe('com.iganapolsky.hermesmobile');
  });
});

const legacyBrandingTerms = [
  ['lipo', 'shield'].join(''),
  ['random', '-timer-dist'].join(''),
];

describe('Hermes Mobile release docs', () => {
  it('does not reference legacy LipoShield / random-timer-dist Play credentials', () => {
    const paths = [
      'hermes-mobile/docs/PLAY_RELEASE.md',
      'scripts/sync-hermes-secrets.sh',
      'hermes-mobile/.env.example',
    ];
    for (const relativePath of paths) {
      const content = read(relativePath).toLowerCase();
      for (const term of legacyBrandingTerms) {
        expect(content).not.toContain(term);
      }
    }
  });

  it('documents hermes-mobile-publisher Play service account convention', () => {
    const playRelease = read('hermes-mobile/docs/PLAY_RELEASE.md');
    expect(playRelease).toContain('hermes-mobile-publisher');
    expect(playRelease).toContain('Hermes Mobile');
  });
});

describe('release safety contract', () => {
  it('EAS uses local appVersionSource so app.json versionCode drives builds and Firebase verify', () => {
    const eas = JSON.parse(read('hermes-mobile/eas.json'));
    expect(eas.cli.appVersionSource).toBe('local');
  });

  it('EAS preview and production target arm64-only Android (Firebase ~43MB not ~100MB)', () => {
    const eas = JSON.parse(read('hermes-mobile/eas.json'));
    expect(eas.build.preview.env.ORG_GRADLE_PROJECT_reactNativeArchitectures).toBe('arm64-v8a');
    expect(eas.build.production.env.ORG_GRADLE_PROJECT_reactNativeArchitectures).toBe('arm64-v8a');
    const app = JSON.parse(read('hermes-mobile/app.json'));
    const buildProps = app.expo.plugins.find(
      (p: unknown) => Array.isArray(p) && p[0] === 'expo-build-properties',
    ) as [string, { android?: { buildArchs?: string[] } }] | undefined;
    expect(buildProps?.[1]?.android?.buildArchs).toEqual(['arm64-v8a']);
  });

  it('EAS submit targets Play production track (LLC org)', () => {
    const eas = JSON.parse(read('hermes-mobile/eas.json'));
    expect(eas.submit.production.android.track).toBe('production');
  });

  it('app.json disables OTA updates for standalone APKs', () => {
    const app = JSON.parse(read('hermes-mobile/app.json'));
    expect(app.expo.android.package).toBe('com.iganapolsky.hermesmobile');
    expect(app.expo.updates.enabled).toBe(false);
    expect(app.expo.plugins).toContain('expo-updates');
  });

  it('maestro ship-guard blocks Metro crash and legacy shell', () => {
    const shipGuard = read('hermes-mobile/.maestro/ship-guard.yaml');
    expect(shipGuard).toContain('Unable to load script');
    expect(shipGuard).toContain('Hold the cord on your AI');
    expect(shipGuard).toContain('com.iganapolsky.hermesmobile');
  });

  it('e2e-bootstrap uses deep links for tab navigation with Android tab-leash fallback', () => {
    const bootstrap = read('hermes-mobile/.maestro/e2e-bootstrap.yaml');
    expect(bootstrap).toContain('hermes://dev/leash-unlock');
    expect(bootstrap).toContain('hermes://chat');
    expect(bootstrap).toContain('chat-screen-header');
    expect(bootstrap).toContain('id: "chat-input"');
    expect(bootstrap).toContain('id: "THUMBGATE_LEASH"');
    expect(bootstrap).toContain('id: "tab-leash"');
    expect(bootstrap).toContain('id: "tab-hermes"');
    expect(bootstrap).not.toMatch(/text:\s*"Settings"/);
    const app = read('hermes-mobile/App.tsx');
    expect(app).toContain('tab-hermes');
    expect(app).toContain('tab-leash');
    expect(app).toContain('tab-settings');
  });

  it('settings inputs have stable testIDs for Maestro', () => {
    const settings = read('hermes-mobile/src/screens/SettingsScreen.tsx');
    expect(settings).toContain('testID="gateway-api-key-input"');
    expect(settings).toContain('testID="gateway-url-input"');
    const saveKey = read('hermes-mobile/.maestro/save_key.yaml');
    expect(saveKey).toContain('gateway-api-key-input');
  });

  it('verify-apk-package.cjs stays aligned with apkReleaseGuards', () => {
    const script = read('hermes-mobile/scripts/verify-apk-package.cjs');
    expect(script).toContain('assets/index.android.bundle');
    expect(script).toContain('com.iganapolsky.hermesmobile');
    expect(script).toContain('Hold the cord on your AI');
    expect(script).toContain('expo/modules');
  });

  it('device E2E script verifies APK before Maestro', () => {
    const script = read('hermes-mobile/scripts/run-device-e2e.sh');
    expect(script).toContain('verify-apk-package.sh');
    expect(script).toContain('assembleRelease');
    expect(script).toContain('full-suite.yaml');
  });


  it('phone install script sources shared path/java env and smoke-tests logcat', () => {
    const script = read('hermes-mobile/scripts/install-phone-release.sh');
    expect(script).toContain('hermes-mobile-path.sh');
    expect(script).toContain('maestro-env.sh');
    expect(script).toContain('Running main');
    expect(script).toContain('HERMES_MOBILE_SKIP_BUILD');
  });

  it('run-hermes-mobile resolves repo via symlink-safe bootstrap', () => {
    const script = read('hermes-mobile/scripts/run-hermes-mobile.sh');
    expect(script).toContain('_hermes_bootstrap_script_dir');
    expect(script).toContain('hermes-mobile-path.sh');
    expect(script).toContain('install-phone-release.sh');
  });

  it('phone install script builds release with embedded bundle', () => {
    const script = read('hermes-mobile/scripts/install-phone-release.sh');
    expect(script).toContain('assembleRelease');
    expect(script).toContain('verify-apk-package.cjs');
    expect(script).toContain('embedded bundle');
    expect(script).toContain('--no-daemon');
    expect(script).toContain('prebuild --platform android --clean');
  });

  it('run-hermes-mobile uses phone release install (not Metro-only debug)', () => {
    const script = read('hermes-mobile/scripts/run-hermes-mobile.sh');
    expect(script).toContain('install-phone-release.sh');
    expect(script).not.toContain('expo run:android');
  });

  it('run-hermes-mobile boots simulator before expo run:ios', () => {
    const script = read('hermes-mobile/scripts/run-hermes-mobile.sh');
    expect(script).toContain('resolve_ios_sim_udid');
    expect(script).toContain('expo run:ios --no-bundler --udid');
  });

  it('npm run android blocks phone installs (run-android-safe.sh)', () => {
    const pkg = JSON.parse(read('hermes-mobile/package.json'));
    expect(pkg.scripts.android).toContain('run-android-safe.sh');
    expect(pkg.scripts['android:phone']).toContain('install-phone-release.sh');
    const guard = read('hermes-mobile/scripts/run-android-safe.sh');
    expect(guard).toContain('expo run:android');
    expect(guard).toMatch(/phone|adb device/i);
    expect(guard).toMatch(/android:phone|install-phone-release/i);
  });

  it('android debug builds embed JS bundle (no Metro black screen)', () => {
    const plugin = read('hermes-mobile/plugins/withEmbeddedJsBundle.js');
    expect(plugin).toContain('debuggableVariants = []');
    const app = JSON.parse(read('hermes-mobile/app.json'));
    expect(app.expo.plugins).toContain('./plugins/withEmbeddedJsBundle.js');
    const gradlePath = path.join(root, 'hermes-mobile/android/app/build.gradle');
    if (fs.existsSync(gradlePath)) {
      expect(fs.readFileSync(gradlePath, 'utf8')).toContain('debuggableVariants = []');
    }
  });

  it('maestro full-suite runs flows sequentially', () => {
    const suite = read('hermes-mobile/.maestro/full-suite.yaml');
    expect(suite).toContain('ship-guard.yaml');
    expect(suite).toContain('save_key.yaml');
    expect(suite).toContain('chat-send-persistence.yaml');
  });

  it('simulator E2E script sets Java and targets iOS sim', () => {
    const script = read('hermes-mobile/scripts/run-simulator-e2e.sh');
    expect(script).toContain('maestro-env.sh');
    expect(script).toContain('maestro test -p ios');
    expect(script).toContain('full-suite.yaml');
  });

  it('unified E2E runner prefers Android USB then iOS sim', () => {
    const script = read('hermes-mobile/scripts/run-e2e.sh');
    const env = read('hermes-mobile/scripts/maestro-env.sh');
    expect(script).toContain('maestro test -p android');
    expect(script).toContain('run-simulator-e2e.sh');
    expect(script).toContain('HERMES_E2E_IOS_ONLY=1');
    expect(script).toContain('Maestro_ANDROID');
    expect(env).toContain('wait_for_adb_device "$device_id" 24');
  });

  it('e2e-bootstrap waits for lazy Leash tab load', () => {
    const bootstrap = read('hermes-mobile/.maestro/e2e-bootstrap.yaml');
    expect(bootstrap).toContain('hermes://dev/leash-unlock');
    expect(bootstrap).toContain('tab-screen-loading');
    expect(bootstrap).toContain('THUMBGATE_LEASH');
    expect(bootstrap).toContain('id: "tab-leash"');
    expect(bootstrap).toContain('hermes://chat');
    expect(bootstrap).toContain('chat-screen-header');
    expect(bootstrap).toContain('chat-input');
  });

  it('chat-send-persistence uses chat bootstrap without Leash assert', () => {
    const flow = read('hermes-mobile/.maestro/chat-send-persistence.yaml');
    const chatBootstrap = read('hermes-mobile/.maestro/chat-e2e-bootstrap.yaml');
    expect(flow).toContain('chat-e2e-bootstrap.yaml');
    expect(chatBootstrap).toContain('hermes://dev/leash-unlock');
    expect(chatBootstrap).toContain('hermes://chat');
    expect(chatBootstrap).toContain('chat-input');
    expect(chatBootstrap).toContain('dismiss-print-interruption.yaml');
    expect(chatBootstrap).not.toContain('id: "THUMBGATE_LEASH"');
  });

  it('continuous E2E runner and LaunchAgent exist', () => {
    const runner = read('hermes-mobile/scripts/run-continuous-e2e.sh');
    expect(runner).toContain('--once');
    expect(runner).toContain('ship-guard.yaml');
    expect(runner).toContain('chat-send-persistence.yaml');
    expect(runner).toContain('HERMES_E2E_IOS_ONLY=1');
    const plist = read('com.igor.hermes-mobile-continuous-e2e.plist');
    expect(plist).toContain('com.igor.hermes-mobile-continuous-e2e');
    expect(plist).toContain('StartInterval');
    const workflow = read('.github/workflows/mobile-continuous.yml');
    expect(workflow).toContain('schedule:');
    expect(workflow).toContain('test:ci');
    expect(workflow).toContain('assembleRelease');
    expect(workflow).toContain('verify-apk-package.cjs');
  });
});
