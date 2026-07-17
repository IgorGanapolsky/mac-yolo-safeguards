#!/usr/bin/env node
/**
 * Keep android/res/values/strings.xml expo_runtime_version in sync with
 * app.json expo.version (runtimeVersion.policy = appVersion).
 *
 * Stale native runtime (e.g. 1.0 while app.json is 1.2) makes local release
 * APKs check the wrong EAS Update runtime bucket.
 */
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const appJsonPath = path.join(root, 'app.json');
const stringsPath = path.join(
  root,
  'android',
  'app',
  'src',
  'main',
  'res',
  'values',
  'strings.xml',
);

const app = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
const version = app?.expo?.version;
if (!version || typeof version !== 'string') {
  console.error('sync-expo-runtime-version: app.json expo.version missing');
  process.exit(1);
}

if (!fs.existsSync(stringsPath)) {
  console.log(`sync-expo-runtime-version: skip (no ${path.relative(root, stringsPath)})`);
  process.exit(0);
}

const before = fs.readFileSync(stringsPath, 'utf8');
const re = /(<string name="expo_runtime_version">)([^<]*)(<\/string>)/;
if (!re.test(before)) {
  console.error('sync-expo-runtime-version: expo_runtime_version string not found');
  process.exit(1);
}
const after = before.replace(re, `$1${version}$3`);
if (after === before) {
  console.log(`sync-expo-runtime-version: already ${version}`);
  process.exit(0);
}
fs.writeFileSync(stringsPath, after);
console.log(`sync-expo-runtime-version: ${RegExp.$2 || '?'} → ${version}`);
