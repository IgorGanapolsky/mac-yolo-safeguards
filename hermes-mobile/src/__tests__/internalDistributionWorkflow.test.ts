/// <reference types="node" />

import fs from 'fs';
import path from 'path';

const root = path.resolve(__dirname, '../../..');

const readWorkflow = (relativePath: string) =>
  fs.readFileSync(path.join(root, relativePath), 'utf8');

describe('internal distribution workflow', () => {
  const internalDistribution = readWorkflow('.github/workflows/internal-distribution.yml');
  const storeRelease = readWorkflow('.github/workflows/store-release.yml');

  it('mirrors Android EAS preview APKs to Firebase for tester signoff', () => {
    expect(internalDistribution).toContain('default: android_firebase');
    expect(internalDistribution).toContain('- android_firebase');
    expect(internalDistribution).toContain('RUN_FIREBASE="true"');
    expect(internalDistribution).toContain('confirm_eas_spend:');
    expect(internalDistribution).toContain('confirm_eas_spend=yes');
    expect(internalDistribution).toContain('expo/expo-github-action@v9');
    expect(internalDistribution).toContain('--wait');
    expect(internalDistribution).toContain('FIREBASE_SERVICE_ACCOUNT_JSON');
    expect(internalDistribution).toContain('FIREBASE_ANDROID_APP_ID');
    expect(internalDistribution).toContain('FIREBASE_REQUIRED_TESTER_EMAIL');
    expect(internalDistribution).toContain('verify-apk-package.cjs');
    expect(internalDistribution).toContain('verify-firebase-distribute-auth.cjs');
    expect(internalDistribution).toContain('wzieba/Firebase-Distribution-Github-Action@');
    expect(internalDistribution).toContain('Verify Firebase distribution read-back');
    expect(internalDistribution).toContain('ensure_firebase_internal_distribution.py');
    expect(internalDistribution).toContain('internal-signoff/firebase-android');
    expect(internalDistribution).toContain('HERMES_MOBILE_ANDROID_PACKAGE: com.iganapolsky.hermesmobile');
    expect(internalDistribution).toContain('working-directory: hermes-mobile');
    expect(internalDistribution).toContain('eas_build_id:');
    expect(internalDistribution).toContain('Reuse existing EAS Android build');
    expect(internalDistribution).toContain('Do NOT auto-run on every main push');
  });

  it('requires Firebase Android proof before Android production release', () => {
    expect(storeRelease).toContain('require_context "internal-signoff/eas-android"');
    expect(storeRelease).toContain('require_context "internal-signoff/firebase-android"');
    expect(storeRelease).toContain('confirm_eas_spend:');
    expect(storeRelease).toContain('eas_build_id:');
    expect(storeRelease).toContain('Reuse existing EAS Android production build');
  });
});
