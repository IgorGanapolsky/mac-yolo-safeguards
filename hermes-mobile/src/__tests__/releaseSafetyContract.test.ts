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

  it('disables Android Auto Backup so uninstall cannot restore gateway profiles', () => {
    const app = JSON.parse(read('hermes-mobile/app.json'));
    expect(app.expo.android.allowBackup).toBe(false);
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
  it('EAS persists production build numbers remotely so CI cannot reuse a Play versionCode', () => {
    const eas = JSON.parse(read('hermes-mobile/eas.json'));
    expect(eas.cli.appVersionSource).toBe('remote');
    expect(eas.build.production.autoIncrement).toBe(true);

    const app = JSON.parse(read('hermes-mobile/app.json'));
    expect(app.expo.android.versionCode).toBeGreaterThanOrEqual(11);
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

  it('production builds cannot fail on optional Sentry source-map upload', () => {
    const eas = JSON.parse(read('hermes-mobile/eas.json'));
    expect(eas.build.production.env.SENTRY_DISABLE_AUTO_UPLOAD).toBe('true');
  });

  // Guard against generic Play "compliance checklists" that misread Expo config.
  // SYSTEM_ALERT_WINDOW is BLOCKED (tools:node=remove), not requested — do not "add rationale".
  it('production ships AAB, minifies, and blocks overlay/mic permissions (not granted)', () => {
    const eas = JSON.parse(read('hermes-mobile/eas.json'));
    expect(eas.build.production.android.buildType).toBe('app-bundle');
    // Internal dogfood may stay APK; store production must not.
    expect(eas.build.production.android.buildType).not.toBe('apk');

    const app = JSON.parse(read('hermes-mobile/app.json'));
    const blocked: string[] = app.expo.android.blockedPermissions ?? [];
    expect(blocked).toEqual(
      expect.arrayContaining([
        'android.permission.SYSTEM_ALERT_WINDOW',
        'android.permission.RECORD_AUDIO',
      ]),
    );

    const buildProps = app.expo.plugins.find(
      (p: unknown) => Array.isArray(p) && p[0] === 'expo-build-properties',
    ) as [string, { android?: { enableMinifyInReleaseBuilds?: boolean; enableShrinkResourcesInReleaseBuilds?: boolean } }] | undefined;
    expect(buildProps?.[1]?.android?.enableMinifyInReleaseBuilds).toBe(true);
    expect(buildProps?.[1]?.android?.enableShrinkResourcesInReleaseBuilds).toBe(true);

    // Generated android/ is gitignored; Expo blockedPermissions → tools:node=remove at prebuild.
    // Do not assert the prebuild tree here — app.json is the source of truth.
  });

  it('store release passes explicit spend confirmation to both EAS build guards', () => {
    const workflow = read('.github/workflows/store-release.yml');
    const mapping =
      "HERMES_EAS_SPEND_APPROVED: ${{ inputs.confirm_eas_spend == 'yes' && 'YES_SPEND_EAS_CREDITS' || '' }}";
    // Android build + Android submit path + iOS build
    expect(workflow.split(mapping)).toHaveLength(4);
    expect(workflow).toContain('if [ "${CONFIRM_EAS:-no}" != "yes" ]');
    expect(workflow).toMatch(/name: Build iOS production artifact[\s\S]*HERMES_EAS_SPEND_APPROVED/);
    expect(workflow).toMatch(/name: Build Android production AAB[\s\S]*HERMES_EAS_SPEND_APPROVED/);
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
    expect(appConfig).toContain('e2eAutomation ? false : baseUpdates.enabled !== false');
  });

  it('syncs expo_runtime_version before phone release builds (appVersion policy)', () => {
    const sync = read('hermes-mobile/scripts/sync-expo-runtime-version.js');
    const install = read('hermes-mobile/scripts/install-phone-release.sh');
    expect(sync).toContain('expo_runtime_version');
    expect(sync).toContain('app.json');
    expect(install).toContain('sync-expo-runtime-version.js');
  });

  it('isOtaUpdatesEnabled treats channel+runtime as enabled (Play false-negative guard)', () => {
    const src = read('hermes-mobile/src/services/appOtaUpdate.ts');
    expect(src).toContain('getOtaDiagnostics');
    expect(src).toContain('channel.length > 0 && runtimeVersion.length > 0');
    expect(src).not.toContain('OTA ships with store builds');
  });

  it('eas.json defines build channels for OTA (eas update --channel, no top-level update key)', () => {
    const eas = JSON.parse(read('hermes-mobile/eas.json'));
    expect(eas).not.toHaveProperty('update');
    expect(eas.build.production.channel).toBe('production');
    expect(eas.build.preview.channel).toBe('preview');
    expect(eas.build['e2e-test'].channel).toBe('e2e-test');
  });

  it('mobile-ota workflow: preview on push; production gated + staged rollout', () => {
    const workflow = read('.github/workflows/mobile-ota.yml');
    expect(workflow).toContain('branches:');
    expect(workflow).toContain('- main');
    expect(workflow).toContain('hermes-mobile/**');
    expect(workflow).toContain('workflow_dispatch');
    expect(workflow).toContain('runtimeVersion');
    expect(workflow).toContain('eas update');
    // Crisis law: preview may publish on push; production needs publish_production + proof.
    expect(workflow).toContain('publish-preview-ota');
    expect(workflow).toContain('publish-production-ota');
    expect(workflow).toContain('publish_production');
    expect(workflow).toContain('--rollout-percentage');
    expect(workflow).toContain('production_rollout_percentage');
    expect(workflow).toContain('promote_production_rollout');
    expect(workflow).toContain('require-stranger-cold-start-proof.cjs');
    expect(workflow).toContain('HERMES_STRANGER_PROOF_WAIT_SEC');
    expect(workflow).toMatch(/checks:\s*read/);
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

  it('cold start always lands on Hermes Chat tab (safetyMode does not open Leash)', () => {
    const leashUx = read('hermes-mobile/src/utils/leashUx.ts');
    expect(leashUx).toMatch(/resolveInitialTab[\s\S]*return 'Chat'/);
    expect(leashUx).not.toMatch(/safetyMode[\s\S]*return 'Leash'/);
    const deepLinks = read('hermes-mobile/src/hooks/useHermesDeepLinks.ts');
    expect(deepLinks).toContain('Unlock only — cold start and pairing must stay on Hermes (Chat).');
    const regression = read('hermes-mobile/.maestro/regression-default-hermes-tab.yaml');
    expect(regression).toContain('tab-hermes');
    expect(regression).toContain('assertNotVisible');
    expect(regression).toContain('THUMBGATE_LEASH');
    expect(regression).not.toMatch(/openLink:\s*"hermes:\/\/leash"/);
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

  it('e2e-bootstrap waits for Leash tab content (not endless loading fallback)', () => {
    const bootstrap = read('hermes-mobile/.maestro/e2e-bootstrap.yaml');
    expect(bootstrap).toContain('hermes://setup?demo=1');
    expect(bootstrap).toContain('hermes://leash');
    expect(bootstrap).toContain('THUMBGATE_LEASH');
    expect(bootstrap).toContain('id: "tab-leash"');
    expect(bootstrap).toContain('assertNotVisible:');
    expect(bootstrap).toContain('id: "tab-screen-loading"');
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

  it('Android emulator CI also runs stranger cold-start without E2E hide-gate', () => {
    const workflow = read('.github/workflows/mobile-e2e.yml');
    const flow = read('hermes-mobile/.maestro/stranger-cold-start.yaml');
    expect(workflow).toContain('Maestro stranger cold-start (Android emulator)');
    expect(workflow).toContain('STRANGER_COLD_START_ASSEMBLE');
    expect(workflow).toContain('stranger-cold-start.yaml');
    const assembleIdx = workflow.indexOf('STRANGER_COLD_START_ASSEMBLE');
    expect(assembleIdx).toBeGreaterThan(-1);
    const assembleSlice = workflow.slice(assembleIdx, assembleIdx + 800);
    expect(assembleSlice).toMatch(/EXPO_PUBLIC_E2E_AUTOMATION:\s*"0"/);
    expect(flow).toMatch(/clearState:\s*true/);
    expect(flow).not.toMatch(/openLink:.*demo=1|hermes:\/\/setup\?demo=1/);
    expect(flow).toContain('connect-mac-gate');
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
    expect(flow).toContain('dismiss-mega-session-warn.yaml');
    expect(flow).toContain('Very large chat session');
    expect(chatBootstrap).toContain('hermes://setup?demo=1');
    expect(chatBootstrap).toContain('hermes://chat');
    expect(chatBootstrap).toContain('chat-input');
    expect(chatBootstrap).toContain('dismiss-print-interruption.yaml');
    expect(chatBootstrap).toContain('dismiss-mega-session-warn.yaml');
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
    expect(runner).toContain('android-only continuous E2E failed');
    expect(runner).toContain('e2e_status="fail"');
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

describe('Android security audit (Jul 2026)', () => {
  it('blocks overlay and microphone permissions not needed for real users', () => {
    const app = JSON.parse(read('hermes-mobile/app.json'));
    expect(app.expo.android.blockedPermissions).toEqual(
      expect.arrayContaining([
        'android.permission.SYSTEM_ALERT_WINDOW',
        'android.permission.RECORD_AUDIO',
      ]),
    );
    const appJson = read('hermes-mobile/app.json');
    expect(appJson).not.toContain('uses-permission android:name="android.permission.SYSTEM_ALERT_WINDOW"');
  });

  it('ships Play production as AAB via EAS (not APK-only)', () => {
    const eas = JSON.parse(read('hermes-mobile/eas.json'));
    expect(eas.build.production.android.buildType).toBe('app-bundle');
    expect(eas.build.preview.android.buildType).toBe('apk');
    const workflow = read('.github/workflows/store-release.yml');
    expect(workflow).toContain('Build Android production AAB');
    expect(workflow).toContain('npm run privacy:scan');
  });

  it('documents Play App Signing and never implies manual APK signing for store', () => {
    const playRelease = read('hermes-mobile/docs/PLAY_RELEASE.md');
    expect(playRelease).toMatch(/Play App Signing/i);
    expect(playRelease).toMatch(/upload key/i);
    expect(playRelease).toMatch(/What we never do for Play production/i);
    expect(playRelease).toMatch(/do not manually sign store APKs/i);
    const eas = JSON.parse(read('hermes-mobile/eas.json'));
    expect(eas.submit.production.android.serviceAccountKeyPath).toBe(
      '$EXPO_ANDROID_SERVICE_ACCOUNT_KEY_PATH',
    );
  });

  it('enables R8 minify and shrink with rules only for shipped native modules', () => {
    const app = JSON.parse(read('hermes-mobile/app.json'));
    const buildProps = app.expo.plugins.find(
      (p: unknown) => Array.isArray(p) && p[0] === 'expo-build-properties',
    ) as [string, { android?: Record<string, unknown> }] | undefined;
    expect(buildProps?.[1]?.android?.enableMinifyInReleaseBuilds).toBe(true);
    expect(buildProps?.[1]?.android?.enableShrinkResourcesInReleaseBuilds).toBe(true);
    const rules = String(buildProps?.[1]?.android?.extraProguardRules ?? '');
    expect(rules).toContain('com.android.billingclient.api');
    expect(rules).toContain('com.google.mlkit');
    expect(rules).not.toContain('swmansion.reanimated');
    expect(rules).not.toContain('swmansion.gesturehandler');
    const pkg = JSON.parse(read('hermes-mobile/package.json'));
    expect(pkg.dependencies['react-native-reanimated']).toBeUndefined();
    expect(pkg.dependencies['react-native-gesture-handler']).toBeUndefined();
  });

  it('does not declare legacy external storage permissions', () => {
    const appJson = read('hermes-mobile/app.json');
    for (const legacy of ['READ_EXTERNAL_STORAGE', 'WRITE_EXTERNAL_STORAGE', 'MANAGE_EXTERNAL_STORAGE']) {
      expect(appJson).not.toContain(legacy);
    }
  });

  it('keeps Expo SDK-pinned react-native (audit react-native@0.84.6 is wrong for SDK 55)', () => {
    const pkg = JSON.parse(read('hermes-mobile/package.json'));
    expect(pkg.dependencies['react-native']).toBe('0.83.6');
    expect(pkg.dependencies.expo).toMatch(/^~55\./);
    const auditDoc = read('hermes-mobile/docs/ANDROID-SECURITY-AUDIT-JULY-2026.md');
    expect(auditDoc).toContain('0.84.6');
    expect(auditDoc).toMatch(/Expo SDK 55/i);
  });

  it('runs public-source privacy scan in store-release workflow', () => {
    const workflow = read('.github/workflows/store-release.yml');
    expect(workflow).toContain('npm run privacy:scan');
    const pkg = JSON.parse(read('hermes-mobile/package.json'));
    expect(pkg.scripts['privacy:scan']).toContain('scan-public-mobile-artifacts.js --source');
  });
});
