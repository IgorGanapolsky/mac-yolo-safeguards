#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');
const jsonMode = process.argv.includes('--json');

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(repoRoot, relativePath), 'utf8'));
}

const failures = [];

function check(condition, message) {
  if (!condition) {
    failures.push(message);
  }
}

const appConfig = readJson('app.json').expo;
const easConfig = readJson('eas.json');
const packageConfig = readJson('package.json');

const expectedAndroidPackage = 'com.iganapolsky.hermesmobile';
const expectedIosBundleId = 'com.iganapolsky.hermesmobile';
const expectedProjectId = '4ed13e30-9b97-4ddd-8a12-59106cae90d6';
const expectedUpdatesUrl = `https://u.expo.dev/${expectedProjectId}`;
const placeholderProjectIds = new Set(['hermes-mobile-local-dev']);

check(appConfig.slug === 'hermes-mobile', 'app.json expo.slug must be hermes-mobile');
check(appConfig.ios?.bundleIdentifier === expectedIosBundleId, `app.json ios.bundleIdentifier must be ${expectedIosBundleId}`);
check(appConfig.android?.package === expectedAndroidPackage, `app.json android.package must be ${expectedAndroidPackage}`);

const projectId = appConfig.extra?.eas?.projectId;
check(typeof projectId === 'string' && projectId.length > 0, 'app.json extra.eas.projectId is required');
check(projectId === expectedProjectId, `app.json extra.eas.projectId must be ${expectedProjectId}`);

check(easConfig.build?.preview?.distribution === 'internal', 'eas.json preview profile must use internal distribution');
check(easConfig.build?.production?.autoIncrement === true, 'eas.json production profile must auto-increment build numbers');
check(easConfig.build?.production?.android?.buildType === 'app-bundle', 'eas.json production android buildType must be app-bundle');

check(typeof packageConfig.scripts?.typecheck === 'string', 'package.json must define typecheck script');
check(typeof packageConfig.scripts?.test === 'string', 'package.json must define test script');
check(typeof packageConfig.scripts?.['test:ci'] === 'string', 'package.json must define test:ci script');

check(
  appConfig.runtimeVersion?.policy === 'appVersion',
  'app.json runtimeVersion.policy must be appVersion for OTA safety',
);

check(appConfig.updates?.enabled === true, 'app.json updates.enabled must be true for production OTA');
check(
  appConfig.updates?.checkAutomatically === 'ON_LOAD',
  'app.json updates.checkAutomatically must be ON_LOAD for launch-time OTA checks',
);

if (process.env.REQUIRE_EAS_PROJECT === '1') {
  check(!placeholderProjectIds.has(projectId), 'app.json extra.eas.projectId is still a local placeholder');
  const updatesUrl = appConfig.updates?.url;
  check(updatesUrl === expectedUpdatesUrl, `app.json updates.url must be ${expectedUpdatesUrl}`);
}

const result = {
  ok: failures.length === 0,
  failures,
};

if (jsonMode) {
  console.log(JSON.stringify(result, null, 2));
} else if (failures.length > 0) {
  console.error('Hermes Mobile release readiness: FAIL');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
} else {
  console.log('Hermes Mobile release readiness: PASS');
}

process.exit(failures.length === 0 ? 0 : 1);
