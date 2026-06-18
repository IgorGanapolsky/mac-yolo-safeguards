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

  it('points Firebase at hermes-mobile-distribution only', () => {
    expect(firebaseProject.gcpProjectId).toBe('hermes-mobile-distribution');
    expect(FIREBASE_ANDROID_APP_ID).toBe(firebaseProject.androidAppId);
    expect(firebaseProject.gcpProjectId).not.toMatch(/openclaw|agentleash|liposhield/i);
  });
});

describe('release safety contract', () => {
  it('EAS submit targets Play production track (LLC org)', () => {
    const eas = JSON.parse(read('hermes-mobile/eas.json'));
    expect(eas.submit.production.android.track).toBe('production');
  });

  it('app.json disables OTA updates for standalone APKs', () => {
    const app = JSON.parse(read('hermes-mobile/app.json'));
    expect(app.expo.android.package).toBe('com.iganapolsky.hermesmobile');
    expect(app.expo.updates.enabled).toBe(false);
  });

  it('maestro ship-guard blocks Metro crash and legacy shell', () => {
    const shipGuard = read('hermes-mobile/.maestro/ship-guard.yaml');
    expect(shipGuard).toContain('Unable to load script');
    expect(shipGuard).toContain('Hold the cord on your AI');
    expect(shipGuard).toContain('com.iganapolsky.hermesmobile');
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

  it('maestro full-suite runs flows sequentially', () => {
    const suite = read('hermes-mobile/.maestro/full-suite.yaml');
    expect(suite).toContain('ship-guard.yaml');
    expect(suite).toContain('save_key.yaml');
  });
});
