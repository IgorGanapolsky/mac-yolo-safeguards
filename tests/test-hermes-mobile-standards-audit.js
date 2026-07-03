#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { auditRoot, formatResults } = require('../tools/hermes-mobile-standards-audit');

const repoRoot = path.resolve(__dirname, '..');

function copyFileIntoTemp(relativePath, tempRoot) {
  const source = path.join(repoRoot, relativePath);
  const destination = path.join(tempRoot, relativePath);
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  fs.copyFileSync(source, destination);
}

function copyRequiredFixture(tempRoot) {
  const files = [
    'hermes-mobile/package.json',
    'hermes-mobile/app.json',
    '.github/workflows/ci.yml',
    '.github/workflows/mobile-continuous.yml',
    'hermes-mobile/.maestro/ship-guard.yaml',
    'hermes-mobile/.maestro/chat-send-persistence.yaml',
    'hermes-mobile/.maestro/e2e-bootstrap.yaml',
    'hermes-mobile/scripts/run-continuous-e2e.sh',
    'hermes-mobile/scripts/run-device-e2e.sh',
    'hermes-mobile/scripts/install-phone-release.sh',
    'hermes-mobile/scripts/verify-apk-package.cjs',
    'hermes-mobile/src/services/appPerformance.ts',
    'hermes-mobile/src/services/crashReporting.ts',
    'hermes-mobile/src/services/productAnalytics.ts',
    'hermes-mobile/src/services/marketingAttribution.ts',
    'hermes-mobile/src/services/storeReview.ts',
    'hermes-mobile/src/services/thumbgateIap.ts',
    'hermes-mobile/src/__tests__/freshUserOnboarding.test.ts',
    'hermes-mobile/src/__tests__/FreshUserOnboardingCard.test.tsx',
    'hermes-mobile/src/__tests__/ChatConnectionPanel.test.tsx',
    'hermes-mobile/src/__tests__/AppStartup.test.ts',
    'hermes-mobile/src/__tests__/appPerformance.test.ts',
    'hermes-mobile/src/__tests__/crashReporting.test.ts',
    'hermes-mobile/src/__tests__/productAnalytics.test.ts',
    'hermes-mobile/src/__tests__/storeReview.test.ts',
    'hermes-mobile/src/__tests__/thumbgateIap.test.ts',
  ];
  files.forEach((file) => copyFileIntoTemp(file, tempRoot));
}

function testRepoPasses() {
  const results = auditRoot(repoRoot);
  assert.strictEqual(
    results.failures.length,
    0,
    formatResults(results),
  );
  assert(
    results.passes.some((pass) => pass.id === 'workflow:ci:standardsAudit'),
    'CI standards audit pass should be recorded',
  );
  assert(
    results.passes.some((pass) => pass.id === 'ios:privacyManifestTracking'),
    'iOS privacy manifest tracking declaration should be recorded',
  );
}

function testMissingWorkflowGateFails() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-mobile-standards-'));
  copyRequiredFixture(tempRoot);
  const ciPath = path.join(tempRoot, '.github/workflows/ci.yml');
  fs.writeFileSync(
    ciPath,
    fs.readFileSync(ciPath, 'utf8').replace(/\n\s+- name: July 2026 mobile standards audit\n\s+run: npm run standards:audit\n/, '\n'),
  );

  const results = auditRoot(tempRoot);
  assert(
    results.failures.some((failure) => failure.id === 'workflow:ci:standardsAudit'),
    formatResults(results),
  );
}

function testMissingPrivacyManifestFails() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-mobile-standards-'));
  copyRequiredFixture(tempRoot);
  const appPath = path.join(tempRoot, 'hermes-mobile/app.json');
  const appJson = JSON.parse(fs.readFileSync(appPath, 'utf8'));
  delete appJson.expo.ios.privacyManifests;
  fs.writeFileSync(appPath, `${JSON.stringify(appJson, null, 2)}\n`);

  const results = auditRoot(tempRoot);
  assert(
    results.failures.some((failure) => failure.id === 'ios:privacyManifestTracking'),
    formatResults(results),
  );
  assert(
    results.failures.some((failure) => failure.id === 'ios:requiredReasonApis'),
    formatResults(results),
  );
}

testRepoPasses();
testMissingWorkflowGateFails();
testMissingPrivacyManifestFails();

console.log('test-hermes-mobile-standards-audit: ok');
