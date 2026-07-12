import fs from 'fs';
import path from 'path';
import {
  FIREBASE_ANDROID_APP_ID,
  HERMES_ANDROID_OPERATOR_EMAIL,
  HERMES_IOS_APPLE_ID_EMAIL,
  HERMES_MOBILE_ANDROID_PACKAGE,
  HERMES_PLAY_CONSOLE_ADMIN_EMAIL,
  HERMES_PLAY_DEVELOPER_ID,
  HERMES_PLAY_DEVELOPER_PUBLIC_NAME,
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

  it('pins Play publisher to Igor Ganapolsky (not Tactical Training)', () => {
    expect(HERMES_PLAY_CONSOLE_ADMIN_EMAIL).toBe('iganapolsky@gmail.com');
    expect(HERMES_PLAY_DEVELOPER_PUBLIC_NAME).toBe('IgorGanapolsky');
    expect(HERMES_PLAY_DEVELOPER_ID).toBe('5120393192891708058');
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

  it('documents Igor Ganapolsky Play publisher identity', () => {
    const playRelease = read('hermes-mobile/docs/PLAY_RELEASE.md');
    expect(playRelease).toContain('iganapolsky@gmail.com');
    expect(playRelease).toContain('IgorGanapolsky');
    expect(playRelease).toContain('5120393192891708058');
    expect(playRelease).toContain('hermes-mobile-publisher');
    if (playRelease.toLowerCase().includes('tactical training')) {
      expect(playRelease.toLowerCase()).toMatch(/do not/);
    }
    if (playRelease.includes('ig5973700')) {
      expect(playRelease.toLowerCase()).toMatch(/do not/);
    }
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

  it('EAS submit targets Play production track (Igor Ganapolsky account)', () => {
    const eas = JSON.parse(read('hermes-mobile/eas.json'));
    expect(eas.submit.production.android.track).toBe('production');
  });

  it('app.json enables OTA updates with expo-updates plugin and appVersion runtime', () => {
    const app = JSON.parse(read('hermes-mobile/app.json'));
    expect(app.expo.android.package).toBe('com.iganapolsky.hermesmobile');
    expect(app.expo.updates.enabled).toBe(true);
    expect(app.expo.updates.checkAutomatically).toBe('ON_LOAD');
    expect(app.expo.updates.url).toBe(
      'https://u.expo.dev/4ed13e30-9b97-4ddd-8a12-59106cae90d6',
    );
    expect(app.expo.runtimeVersion).toEqual({ policy: 'appVersion' });
    expect(app.expo.plugins).toContain('expo-updates');
  });

  it('app.config.js disables OTA for E2E automation and pins production channel otherwise', () => {
    const appConfig = read('hermes-mobile/app.config.js');
    expect(appConfig).toContain('EXPO_PUBLIC_E2E_AUTOMATION');
    expect(appConfig).toContain('expo-channel-name');
    expect(appConfig).toContain("checkAutomatically: e2eAutomation ? 'NEVER' :");
  });

  it('eas.json defines build channels for OTA (eas update --channel, no top-level update key)', () => {
    const eas = JSON.parse(read('hermes-mobile/eas.json'));
    expect(eas).not.toHaveProperty('update');
    expect(eas.build.production.channel).toBe('production');
    expect(eas.build.preview.channel).toBe('preview');
    expect(eas.build['e2e-test'].channel).toBe('e2e-test');
  });

  it('mobile-ota workflow publishes preview + production channels on main push', () => {
    const workflow = read('.github/workflows/mobile-ota.yml');
    expect(workflow).toContain('branches:');
    expect(workflow).toContain('- main');
    expect(workflow).toContain('hermes-mobile/**');
    expect(workflow).toContain('workflow_dispatch');
    expect(workflow).toContain('runtimeVersion');
    expect(workflow).toContain('eas update');
    expect(workflow).toContain('for CH in preview production');
    expect(workflow).toContain('--channel "$CH"');
    expect(workflow).toContain('secrets.EXPO_TOKEN');
    expect(workflow).toContain('test:release-safety');
  });

  it('declares PostHog analytics data in the iOS privacy manifest', () => {
    const app = JSON.parse(read('hermes-mobile/app.json'));
    const collected = app.expo.ios.privacyManifests.NSPrivacyCollectedDataTypes;
    expect(collected).toEqual(
      expect.arrayContaining([
        {
          NSPrivacyCollectedDataType: 'NSPrivacyCollectedDataTypeProductInteraction',
          NSPrivacyCollectedDataTypeLinked: true,
          NSPrivacyCollectedDataTypeTracking: false,
          NSPrivacyCollectedDataTypePurposes: ['NSPrivacyCollectedDataTypePurposeAnalytics'],
        },
        {
          NSPrivacyCollectedDataType: 'NSPrivacyCollectedDataTypeDeviceID',
          NSPrivacyCollectedDataTypeLinked: true,
          NSPrivacyCollectedDataTypeTracking: false,
          NSPrivacyCollectedDataTypePurposes: ['NSPrivacyCollectedDataTypePurposeAnalytics'],
        },
      ]),
    );
  });

  it('maestro ship-guard blocks Metro crash and legacy shell', () => {
    const shipGuard = read('hermes-mobile/.maestro/ship-guard.yaml');
    expect(shipGuard).toContain('Unable to load script');
    expect(shipGuard).toContain('Hold the cord on your AI');
    expect(shipGuard).toContain('com.iganapolsky.hermesmobile');
    expect(shipGuard).toContain('chat-e2e-bootstrap.yaml');
    expect(shipGuard).toContain('recover-chat-tab.yaml');
    expect(shipGuard).toContain('regression-composer-typeable.yaml');
    expect(shipGuard).not.toMatch(/runFlow:\s*e2e-bootstrap\.yaml/);
  });

  it('e2e-bootstrap uses deep links for tab navigation with Android tab-leash fallback', () => {
    const bootstrap = read('hermes-mobile/.maestro/e2e-bootstrap.yaml');
    expect(bootstrap).toContain('hermes://setup?demo=1');
    expect(bootstrap).toContain('hermes://chat');
    expect(bootstrap).toContain('hermes://leash');
    expect(bootstrap).toContain('chat-screen-header');
    expect(bootstrap).toContain('id: "chat-input"');
    expect(bootstrap).toContain('id: "THUMBGATE_LEASH"');
    expect(bootstrap).toContain('id: "tab-leash"');
    expect(bootstrap).toContain('id: "tab-hermes"');
    expect(bootstrap).not.toMatch(/text:\s*"Settings"/);
    expect(bootstrap).not.toContain('hermes://dev/leash-unlock');
    const app = read('hermes-mobile/App.tsx');
    expect(app).toContain('tab-hermes');
    expect(app).toContain('tab-leash');
    expect(app).toContain('tab-settings');
  });

  it('settings inputs have stable testIDs for Maestro', () => {
    const settings = read('hermes-mobile/src/screens/SettingsScreen.tsx');
    expect(settings).toContain('testID="gateway-api-key-input"');
    expect(settings).toContain('testID="gateway-url-input"');
    expect(settings).toContain('isDemoModeAllowed()');
    expect(settings).toContain('Demo mode');
    expect(settings).not.toMatch(/\{__DEV__ \? \([\s\S]*demo-mode-switch/);
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

  it('phone install default build is not demo-capable; E2E flags are opt-in via HERMES_E2E_BUILD', () => {
    const script = read('hermes-mobile/scripts/install-phone-release.sh');
    // Default path explicitly unsets the demo/E2E flags so a shipped production APK can never
    // honor demo deep links; only HERMES_E2E_BUILD=1 opts back into automation capability.
    expect(script).toContain('HERMES_E2E_BUILD');
    expect(script).toContain('unset EXPO_PUBLIC_HERMES_DEV_UNLOCK EXPO_PUBLIC_E2E_AUTOMATION');
    // The demo/E2E exports must live ONLY inside the opt-in gate (exactly once each), never
    // inlined into a gradle build path where every install would bake them in.
    // Neither gradle path may unconditionally export the demo/E2E flags anymore.
    const automationCount = (script.match(/export EXPO_PUBLIC_E2E_AUTOMATION=1/g) || []).length;
    expect(automationCount).toBe(1);
    const devUnlockCount = (script.match(/export EXPO_PUBLIC_HERMES_DEV_UNLOCK=1/g) || []).length;
    expect(devUnlockCount).toBe(1);
    // Both gradle build paths must route flags through the gate helper.
    const countMatches = (re: RegExp) => (script.match(re) ?? []).length;
    expect(countMatches(/apply_release_build_flags\b(?!\(\))/g)).toBe(2);
    const gateStart = script.indexOf('apply_release_build_flags() {');
    const gateEnd = script.indexOf('\n}', gateStart);
    const gate = script.slice(gateStart, gateEnd);
    expect(gate).toContain('HERMES_E2E_BUILD');
    expect(gate).toContain('export EXPO_PUBLIC_HERMES_DEV_UNLOCK=1');
    expect(gate).toContain('export EXPO_PUBLIC_E2E_AUTOMATION=1');
  });

  it('run-hermes-mobile uses phone release install (not Metro-only debug)', () => {
    const script = read('hermes-mobile/scripts/run-hermes-mobile.sh');
    expect(script).toContain('install-phone-release.sh');
    expect(script).not.toContain('expo run:android');
  });

  it('run-hermes-mobile boots simulator before expo run:ios', () => {
    const script = read('hermes-mobile/scripts/run-hermes-mobile.sh');
    expect(script).toContain('resolve_ios_sim_udid');
    expect(script).toContain('expo run:ios --no-bundler --device');
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
    expect(script).toContain('com.iganapolsky.hermesmobile');
    expect(script).toContain('xcrun simctl get_app_container');
    expect(script).toContain('expo run:ios --no-bundler --device');
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
    expect(env).toContain('MAESTRO_ANDROID_ADB_WAIT_ATTEMPTS');
    expect(env).toContain('wait_for_adb_device "$device_id" "$MAESTRO_ANDROID_ADB_WAIT_ATTEMPTS"');
  });

  it('e2e-bootstrap waits for lazy Leash tab load', () => {
    const bootstrap = read('hermes-mobile/.maestro/e2e-bootstrap.yaml');
    expect(bootstrap).toContain('hermes://setup?demo=1');
    expect(bootstrap).toContain('hermes://leash');
    expect(bootstrap).toContain('THUMBGATE_LEASH');
    expect(bootstrap).toContain('id: "tab-leash"');
    expect(bootstrap).toContain('hermes://chat');
    expect(bootstrap).toContain('chat-screen-header');
    expect(bootstrap).toContain('chat-input');
    expect(bootstrap).not.toContain('hermes://dev/leash-unlock');
  });

  it('Android emulator CI builds with E2E automation flag (not production release)', () => {
    const workflow = read('.github/workflows/mobile-e2e.yml');
    expect(workflow).toContain('EXPO_PUBLIC_E2E_AUTOMATION');
    expect(workflow).toContain('assembleDebug');
    expect(workflow).not.toContain('assembleRelease');
    expect(workflow).toContain('SENTRY_DISABLE_AUTO_UPLOAD');
  });

  it('EAS production Android disables Sentry upload until EAS secrets are verified (Jul 2026 vc10 Gradle fix)', () => {
    const eas = JSON.parse(read('hermes-mobile/eas.json'));
    expect(eas.build.production.env.SENTRY_DISABLE_AUTO_UPLOAD).toBe('true');
  });

  it('iOS App Store production EAS enables store review demo only on iOS', () => {
    const eas = JSON.parse(read('hermes-mobile/eas.json'));
    expect(eas.build.production.ios.env.EXPO_PUBLIC_STORE_REVIEW_DEMO).toBe('1');
    expect(eas.build.production.env.EXPO_PUBLIC_STORE_REVIEW_DEMO).toBeUndefined();
    const safeNotes = read('hermes-mobile/scripts/asc-review-notes-template.txt');
    expect(safeNotes).toContain('Demo mode');
    expect(safeNotes).toContain('macOS, Linux, or Windows');
    expect(safeNotes).toContain('hermes://setup?demo=1');
    expect(safeNotes).not.toMatch(/ts\.net/);
  });

  it('iOS simulator E2E builds with automation deep links enabled', () => {
    const script = read('hermes-mobile/scripts/run-simulator-e2e.sh');
    const appConfig = read('hermes-mobile/app.config.js');
    const policy = read('hermes-mobile/src/utils/demoModePolicy.ts');
    const exportIndex = script.indexOf('export EXPO_PUBLIC_E2E_AUTOMATION="${EXPO_PUBLIC_E2E_AUTOMATION:-1}"');
    const buildIndex = script.indexOf('npx expo run:ios');

    expect(exportIndex).toBeGreaterThan(-1);
    expect(buildIndex).toBeGreaterThan(exportIndex);
    expect(appConfig).toContain('process.env.EXPO_PUBLIC_E2E_AUTOMATION');
    expect(appConfig).toContain('e2eAutomation');
    expect(policy).toContain('Constants.expoConfig?.extra');
    expect(policy).toContain('extra?.e2eAutomation === true');
  });

  it('chat-send-persistence uses chat bootstrap without Leash assert', () => {
    const flow = read('hermes-mobile/.maestro/chat-send-persistence.yaml');
    const chatBootstrap = read('hermes-mobile/.maestro/chat-e2e-bootstrap.yaml');
    expect(flow).toContain('chat-e2e-bootstrap.yaml');
    expect(chatBootstrap).toContain('hermes://setup?demo=1');
    expect(chatBootstrap).toContain('hermes://chat');
    expect(chatBootstrap).toContain('chat-input');
    expect(chatBootstrap).toContain('dismiss-print-interruption.yaml');
    expect(chatBootstrap).not.toContain('id: "THUMBGATE_LEASH"');
    expect(chatBootstrap).not.toContain('hermes://dev/leash-unlock');
  });

  it('continuous E2E runner and LaunchAgent exist', () => {
    const runner = read('hermes-mobile/scripts/run-continuous-e2e.sh');
    const shipGuard = read('hermes-mobile/.maestro/ship-guard.yaml');
    expect(runner).toContain('--once');
    expect(runner).toContain('ship-guard.yaml');
    expect(shipGuard).toContain('regression-composer-typeable.yaml');
    expect(runner).toContain('chat-send-persistence.yaml');
    expect(runner).toContain('Android-only continuous E2E requested');
    expect(runner).toContain('android-only continuous E2E skipped');
    expect(runner).toContain('HERMES_E2E_ANDROID_ONLY');
    expect(runner).toContain('LOAD_WAIT_SEC');
    expect(runner).toContain('queueing up to');
    const plist = read('com.igor.hermes-mobile-continuous-e2e.plist');
    expect(plist).toContain('com.igor.hermes-mobile-continuous-e2e');
    expect(plist).toContain('HERMES_E2E_ANDROID_ONLY');
    expect(plist).toContain('StartInterval');
    const workflow = read('.github/workflows/mobile-continuous.yml');
    expect(workflow).toContain('schedule:');
    expect(workflow).toContain('test:ci');
    expect(workflow).toContain('assembleRelease');
    expect(workflow).toContain('verify-apk-package.cjs');
    expect(workflow).toContain('SENTRY_DISABLE_AUTO_UPLOAD');
  });

  it('maestro full-suite includes T-114 regression flows', () => {
    const suite = read('hermes-mobile/.maestro/full-suite.yaml');
    expect(suite).toContain('regression-glanceable-tab.yaml');
    expect(suite).toContain('regression-chat-send-visible.yaml');
    expect(suite).toContain('regression-leash-refresh.yaml');
    expect(suite).toContain('regression-chat-header-model.yaml');
    expect(suite).toContain('regression-composer-typeable.yaml');
  });

  it('tier-0 Maestro validator requires composer typeable regression flow', () => {
    const validator = read('hermes-mobile/scripts/validate-maestro-flows.js');
    expect(validator).toContain("'regression-composer-typeable'");
  });

  it('Android composer dock lifts via marginBottom only (no translateY hit-rect regression)', () => {
    const chatScreen = read('hermes-mobile/src/screens/ChatScreen.tsx');
    expect(chatScreen).toContain('composerDockContainerStyle');
    expect(chatScreen).not.toMatch(
      /Platform\.OS === 'android'[\s\S]{0,200}translateY:\s*-composerDockSpacing\.marginBottom/,
    );
  });
});
