#!/usr/bin/env node
/**
 * Verify an Android APK is a shippable Hermes Mobile Expo release build.
 */
const { execSync, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function findAapt() {
  if (process.env.AAPT_PATH && fs.existsSync(process.env.AAPT_PATH)) {
    return process.env.AAPT_PATH;
  }
  try {
    const which = execSync('command -v aapt 2>/dev/null || command -v aapt2 2>/dev/null', {
      encoding: 'utf8',
      shell: '/bin/bash',
    }).trim();
    if (which) return which.replace(/aapt2?$/, 'aapt');
  } catch {
    /* fall through */
  }
  const sdk = process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT;
  if (!sdk || !fs.existsSync(sdk)) return '';
  const buildTools = path.join(sdk, 'build-tools');
  if (!fs.existsSync(buildTools)) return '';
  const versions = fs
    .readdirSync(buildTools)
    .filter((name) => fs.existsSync(path.join(buildTools, name, 'aapt')))
    .sort((a, b) => (a < b ? 1 : a > b ? -1 : 0));
  if (!versions.length) return '';
  return path.join(buildTools, versions[0], 'aapt');
}


const EMBEDDED_JS_BUNDLE_PATH = 'assets/index.android.bundle';
const EXPECTED_ANDROID_PACKAGE = 'com.iganapolsky.hermesmobile';
const EXPECTED_APP_LABEL = 'Hermes Mobile';
const FORBIDDEN_APP_LABEL = 'Hermes Mobile Agent';
const LEGACY_SHELL_STRING_MARKERS = [
  'Hold the cord on your AI',
  'Hermes Mobile Agent intercepts dangerous',
];
const EXPO_APP_BUNDLE_MARKERS = ['expo/modules', 'HERMES CHAT', 'GatewayProvider'];

function fail(message) {
  console.error(`APK verify: FAIL\n- ${message}`);
  process.exit(1);
}

function listZipEntries(apkPath) {
  const out = execFileSync('unzip', ['-Z1', apkPath], { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  return out.split('\n').map((line) => line.trim()).filter(Boolean);
}

function sampleApkStrings(apkPath) {
  const chunks = [];
  for (const member of ['classes.dex', EMBEDDED_JS_BUNDLE_PATH]) {
    try {
      const buf = execFileSync('unzip', ['-p', apkPath, member], {
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
  const aapt = findAapt();
  if (!aapt) {
    return { packageName: undefined, applicationLabel: undefined };
  }
  // `aapt` may originate from the AAPT_PATH environment variable (see findAapt()
  // above). Use execFileSync with an argument array — never a shell template
  // string — so an attacker-controlled path can never be interpreted as shell
  // syntax, regardless of its content.
  const badging = execFileSync(aapt, ['dump', 'badging', apkPath], { encoding: 'utf8' });
  const labelMatch =
    badging.match(/^application-label:'([^']+)'/m) ||
    badging.match(/^application-label: '([^']+)'/m) ||
    badging.match(/^application-label-[^:]+:'([^']+)'/m);
  return {
    packageName: (badging.match(/^package: name='([^']+)'/m) || [])[1],
    applicationLabel: labelMatch ? labelMatch[1] : undefined,
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

  if (!EXPO_APP_BUNDLE_MARKERS.some((marker) => haystack.includes(marker))) {
    fail('APK JS bundle missing Hermes Mobile fingerprints — not a shippable Expo build');
  }

  console.log('APK verify: PASS (release-ready Expo Hermes Mobile)');
}

main();
