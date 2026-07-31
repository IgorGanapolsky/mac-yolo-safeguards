#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repo = path.resolve(__dirname, '..');
const installer = fs.readFileSync(
  path.join(repo, 'hermes-mobile', 'scripts', 'install-phone-release.sh'),
  'utf8',
);
assert.match(
  installer,
  /ANDROID_STORE_SKU="\$\{HERMES_ANDROID_STORE_SKU:-paid\}"/,
  'canonical phone install must default to the paid Play package',
);
assert.match(
  installer,
  /TARGET_ANDROID_PACKAGE="com\.iganapolsky\.hermesmobile\.paid"/,
  'paid SKU must resolve to the paid application id',
);
assert.match(
  installer,
  /free\)[\s\S]*TARGET_ANDROID_PACKAGE="com\.iganapolsky\.hermesmobile"/,
  'retired free package must remain explicit opt-in for migration testing',
);
assert.match(
  installer,
  /export HERMES_MOBILE_ANDROID_PACKAGE="\$TARGET_ANDROID_PACKAGE"/,
  'APK verifier must receive the same package selected for the build',
);
assert.match(
  installer,
  /am start -n "\$TARGET_ANDROID_PACKAGE\/\.MainActivity"/,
  'smoke test must launch the package that was built',
);
assert.match(
  installer,
  /printf '%s %s %s\\n'[\s\S]*"\$TARGET_ANDROID_PACKAGE"/,
  'single-flight marker must include package identity',
);
assert.match(
  installer,
  /native_android_package\(\)[\s\S]*applicationId/,
  'installer must read package identity from the generated native project',
);
assert.match(
  installer,
  /native_package" != "\$TARGET_ANDROID_PACKAGE"[\s\S]*expo prebuild --platform android --clean/,
  'package mismatch must regenerate native Android from paid app.config.js',
);
assert.match(
  installer,
  /export SENTRY_DISABLE_AUTO_UPLOAD="\$\{SENTRY_DISABLE_AUTO_UPLOAD:-true\}"/,
  'local phone builds must not require CI-only Sentry upload credentials',
);

console.log('phone release paid-package default: 9/9 passed');
