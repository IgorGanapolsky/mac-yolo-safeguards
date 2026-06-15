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
    expect(internalDistribution).toContain('default: all');
    expect(internalDistribution).toContain('- android_firebase');
    expect(internalDistribution).toContain('RUN_FIREBASE="true"');
    expect(internalDistribution).toContain('--wait');
    expect(internalDistribution).toContain('FIREBASE_SERVICE_ACCOUNT_JSON');
    expect(internalDistribution).toContain('FIREBASE_ANDROID_APP_ID');
    expect(internalDistribution).toContain('FIREBASE_REQUIRED_TESTER_EMAIL');
    expect(internalDistribution).toContain('wzieba/Firebase-Distribution-Github-Action@bd494989dd4bec0343f78adee87fe66e48279ad6');
    expect(internalDistribution).toContain('internal-signoff/firebase-android');
    expect(internalDistribution).toContain('working-directory: hermes-mobile');
  });

  it('requires Firebase Android proof before Android production release', () => {
    expect(storeRelease).toContain('require_context "internal-signoff/eas-android"');
    expect(storeRelease).toContain('require_context "internal-signoff/firebase-android"');
  });
});
