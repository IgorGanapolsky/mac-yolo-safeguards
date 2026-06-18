#!/usr/bin/env node
/**
 * Verify an Android APK is a shippable Hermes Mobile Expo release build.
 */
const { execSync } = require('child_process');
const fs = require('fs');

const EMBEDDED_JS_BUNDLE_PATH = 'assets/index.android.bundle';
const EXPECTED_ANDROID_PACKAGE = 'com.iganapolsky.hermesmobile';
const EXPECTED_APP_LABEL = 'Hermes Mobile';
const FORBIDDEN_APP_LABEL = 'Hermes Mobile Agent';
const LEGACY_SHELL_STRING_MARKERS = [
  'Hold the cord on your AI',
  'Connect your computer',
  'Hermes Mobile Agent intercepts dangerous',
];

function fail(message) {
  console.error(`APK verify: FAIL\n- ${message}`);
  process.exit(1);
}

function listZipEntries(apkPath) {
  const out = execSync(`unzip -Z1 ${JSON.stringify(apkPath)}`, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  return out.split('\n').map((line) => line.trim()).filter(Boolean);
}

function sampleApkStrings(apkPath) {
  const chunks = [];
  for (const member of ['classes.dex', EMBEDDED_JS_BUNDLE_PATH]) {
    try {
      const buf = execSync(`unzip -p ${JSON.stringify(apkPath)} ${JSON.stringify(member)}`, {
        maxBuffer: 16 * 1024 * 1024,
      });
      chunks.push(buf.toString('latin1'));
    } catch {
      /* absent on debug builds */
    }
  }
  return chunks.join('\n');
}

function readBadging(apkPath) {
  let aapt = process.env.AAPT_PATH || '';
  if (!aapt) {
    try {
      aapt = execSync('which aapt 2>/dev/null', { encoding: 'utf8' }).trim();
    } catch {
      return { packageName: undefined, applicationLabel: undefined };
    }
  }
  const badging = execSync(`${aapt} dump badging ${JSON.stringify(apkPath)}`, { encoding: 'utf8' });
  return {
    packageName: (badging.match(/^package: name='([^']+)'/m) || [])[1],
    applicationLabel: (badging.match(/^application-label:'([^']+)'/m) || [])[1],
  };
}

function main() {
  const apkPath = process.argv[2];
  if (!apkPath || !fs.existsSync(apkPath)) {
    fail('Usage: verify-apk-package.cjs <path-to.apk>');
  }

  const expectedPackage = process.env.HERMES_MOBILE_ANDROID_PACKAGE || EXPECTED_ANDROID_PACKAGE;
  const entries = listZipEntries(apkPath);
  const haystack = sampleApkStrings(apkPath);
  const { packageName, applicationLabel } = readBadging(apkPath);

  console.log(`APK: ${apkPath}`);
  console.log(`  package: ${packageName || '(aapt unavailable)'}`);
  console.log(`  label: ${applicationLabel || '(aapt unavailable)'}`);
  console.log(`  embedded bundle: ${entries.includes(EMBEDDED_JS_BUNDLE_PATH) ? 'yes' : 'NO'}`);

  if (!entries.includes(EMBEDDED_JS_BUNDLE_PATH)) {
    fail('Missing assets/index.android.bundle — use assembleRelease, not assembleDebug');
  }

  if (packageName && packageName !== expectedPackage) {
    fail(`Wrong package ${packageName} (expected ${expectedPackage})`);
  }

  if (applicationLabel === FORBIDDEN_APP_LABEL) {
    fail(`Legacy native shell label (${FORBIDDEN_APP_LABEL})`);
  }

  if (applicationLabel && applicationLabel !== EXPECTED_APP_LABEL) {
    fail(`Unexpected label '${applicationLabel}' (expected ${EXPECTED_APP_LABEL})`);
  }

  for (const marker of LEGACY_SHELL_STRING_MARKERS) {
    if (haystack.includes(marker)) {
      fail(`Legacy shell marker found: ${marker}`);
    }
  }

  if (!haystack.includes('expo/modules')) {
    fail('No expo/modules in APK — not the Expo Hermes Mobile build');
  }

  console.log('APK verify: PASS (release-ready Expo Hermes Mobile)');
}

main();
