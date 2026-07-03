#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const REQUIRED_SCRIPTS = [
  'typecheck',
  'test:ci',
  'test:release-safety',
  'release:check',
  'launch:preflight:android',
  'launch:preflight:ios',
  'android:phone',
  'e2e:device',
  'e2e:continuous:once',
  'verify:apk',
];

const REQUIRED_FILES = [
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
  'hermes-mobile/.maestro/ship-guard.yaml',
  'hermes-mobile/.maestro/chat-send-persistence.yaml',
  'hermes-mobile/.maestro/e2e-bootstrap.yaml',
  'hermes-mobile/scripts/run-continuous-e2e.sh',
  'hermes-mobile/scripts/run-device-e2e.sh',
  'hermes-mobile/scripts/install-phone-release.sh',
  'hermes-mobile/scripts/verify-apk-package.cjs',
  '.github/workflows/ci.yml',
  '.github/workflows/mobile-continuous.yml',
];

const REQUIRED_WORKFLOW_SNIPPETS = [
  { file: '.github/workflows/ci.yml', snippet: 'Release readiness audit' },
  { file: '.github/workflows/ci.yml', snippet: 'Type check' },
  { file: '.github/workflows/ci.yml', snippet: 'Unit tests with coverage' },
  { file: '.github/workflows/ci.yml', snippet: 'Release safety contract' },
  { file: '.github/workflows/mobile-continuous.yml', snippet: 'Release APK + embedded bundle' },
  { file: '.github/workflows/mobile-continuous.yml', snippet: 'Verify embedded JS bundle' },
  { file: '.github/workflows/mobile-continuous.yml', snippet: 'Maestro ship-guard' },
  { file: '.github/workflows/mobile-continuous.yml', snippet: 'pull_request:' },
  { file: '.github/workflows/mobile-continuous.yml', snippet: 'schedule:' },
];

const REQUIRED_MAESTRO_CONTENT = [
  { file: 'hermes-mobile/.maestro/ship-guard.yaml', snippet: 'chat-input' },
  { file: 'hermes-mobile/.maestro/chat-send-persistence.yaml', snippet: 'chat-send-button' },
  { file: 'hermes-mobile/.maestro/e2e-bootstrap.yaml', snippet: 'tab-hermes' },
];

function readText(root, relativePath) {
  return fs.readFileSync(path.join(root, relativePath), 'utf8');
}

function readJson(root, relativePath) {
  return JSON.parse(readText(root, relativePath));
}

function exists(root, relativePath) {
  return fs.existsSync(path.join(root, relativePath));
}

function hasNestedBoolean(object, pathParts, expected) {
  let cursor = object;
  for (const part of pathParts) {
    if (!cursor || typeof cursor !== 'object' || !(part in cursor)) return false;
    cursor = cursor[part];
  }
  return cursor === expected;
}

function addFailure(results, id, detail) {
  results.failures.push({ id, detail });
}

function addPass(results, id, detail) {
  results.passes.push({ id, detail });
}

function addWarning(results, id, detail) {
  results.warnings.push({ id, detail });
}

function checkRequiredFiles(root, results) {
  for (const relativePath of REQUIRED_FILES) {
    if (exists(root, relativePath)) {
      addPass(results, `file:${relativePath}`, 'present');
    } else {
      addFailure(results, `file:${relativePath}`, 'missing required mobile readiness artifact');
    }
  }
}

function checkPackageScripts(root, results) {
  const pkg = readJson(root, 'hermes-mobile/package.json');
  for (const script of REQUIRED_SCRIPTS) {
    if (pkg.scripts && pkg.scripts[script]) {
      addPass(results, `script:${script}`, pkg.scripts[script]);
    } else {
      addFailure(results, `script:${script}`, 'missing required package script');
    }
  }

  if (pkg.scripts && pkg.scripts['standards:audit']) {
    addPass(results, 'script:standards:audit', pkg.scripts['standards:audit']);
  } else {
    addFailure(results, 'script:standards:audit', 'CI needs an explicit standards audit entrypoint');
  }

  if (pkg.dependencies && pkg.dependencies['@shopify/flash-list']) {
    addPass(results, 'dependency:flash-list', 'large-list virtualization available');
  } else {
    addWarning(results, 'dependency:flash-list', 'no FlashList dependency found for high-volume mobile lists');
  }
}

function checkExpoConfig(root, results) {
  const app = readJson(root, 'hermes-mobile/app.json').expo || {};

  if (app.ios && app.ios.bundleIdentifier) {
    addPass(results, 'ios:bundleIdentifier', app.ios.bundleIdentifier);
  } else {
    addFailure(results, 'ios:bundleIdentifier', 'missing iOS bundle identifier');
  }

  if (app.android && app.android.package) {
    addPass(results, 'android:package', app.android.package);
  } else {
    addFailure(results, 'android:package', 'missing Android package name');
  }

  if (hasNestedBoolean(app, ['ios', 'privacyManifests', 'NSPrivacyTracking'], false)) {
    addPass(results, 'ios:privacyManifestTracking', 'NSPrivacyTracking=false declared');
  } else {
    addFailure(results, 'ios:privacyManifestTracking', 'Expo privacyManifests must declare tracking status');
  }

  const accessedApis = app.ios?.privacyManifests?.NSPrivacyAccessedAPITypes;
  if (Array.isArray(accessedApis) && accessedApis.length > 0) {
    addPass(results, 'ios:requiredReasonApis', `${accessedApis.length} required-reason API categories declared`);
  } else {
    addFailure(results, 'ios:requiredReasonApis', 'missing required-reason API declarations');
  }

  if (app.android?.allowBackup === false) {
    addPass(results, 'android:allowBackup', 'disabled');
  } else {
    addFailure(results, 'android:allowBackup', 'release app must disable Android backups for local gateway secrets');
  }

  if (app.android?.softwareKeyboardLayoutMode === 'resize') {
    addPass(results, 'android:keyboardResize', 'keyboard resize mode enabled');
  } else {
    addFailure(results, 'android:keyboardResize', 'keyboard resize mode required for chat composer reliability');
  }

  const buildProps = (app.plugins || []).find(
    (entry) => Array.isArray(entry) && entry[0] === 'expo-build-properties',
  );
  const androidProps = buildProps?.[1]?.android || {};
  if (androidProps.enableMinifyInReleaseBuilds && androidProps.enableShrinkResourcesInReleaseBuilds) {
    addPass(results, 'android:r8', 'release minify and resource shrinking enabled');
  } else {
    addFailure(results, 'android:r8', 'release minify and resource shrinking must stay enabled');
  }

  if (app.updates?.enabled === false && app.updates?.checkAutomatically === 'NEVER') {
    addPass(results, 'ota:disabled', 'runtime OTA drift disabled for store release safety');
  } else {
    addWarning(results, 'ota:disabled', 'OTA is enabled; verify store-review and release-safety policy before shipping');
  }
}

function checkWorkflowSnippets(root, results) {
  for (const { file, snippet } of REQUIRED_WORKFLOW_SNIPPETS) {
    const text = readText(root, file);
    if (text.includes(snippet)) {
      addPass(results, `workflow:${file}:${snippet}`, 'present');
    } else {
      addFailure(results, `workflow:${file}:${snippet}`, 'required CI/mobile-continuous gate missing');
    }
  }

  const ciText = readText(root, '.github/workflows/ci.yml');
  if (ciText.includes('npm run standards:audit')) {
    addPass(results, 'workflow:ci:standardsAudit', 'standards audit runs in CI');
  } else {
    addFailure(results, 'workflow:ci:standardsAudit', 'CI must run npm run standards:audit');
  }
}

function checkMaestroFlows(root, results) {
  for (const { file, snippet } of REQUIRED_MAESTRO_CONTENT) {
    const text = readText(root, file);
    if (text.includes(snippet)) {
      addPass(results, `maestro:${file}:${snippet}`, 'present');
    } else {
      addFailure(results, `maestro:${file}:${snippet}`, 'E2E flow no longer checks the user-visible chat path');
    }
  }
}

function auditRoot(root = path.resolve(__dirname, '..')) {
  const results = {
    checkedAt: new Date().toISOString(),
    root,
    standard: 'Hermes Mobile July 2026 readiness gate',
    passes: [],
    warnings: [],
    failures: [],
  };

  checkRequiredFiles(root, results);
  checkPackageScripts(root, results);
  checkExpoConfig(root, results);
  checkWorkflowSnippets(root, results);
  checkMaestroFlows(root, results);

  return results;
}

function formatResults(results) {
  const lines = [];
  lines.push(`Hermes Mobile standards audit: ${results.failures.length === 0 ? 'PASS' : 'FAIL'}`);
  lines.push(`passes=${results.passes.length} warnings=${results.warnings.length} failures=${results.failures.length}`);
  for (const warning of results.warnings) {
    lines.push(`WARN ${warning.id}: ${warning.detail}`);
  }
  for (const failure of results.failures) {
    lines.push(`FAIL ${failure.id}: ${failure.detail}`);
  }
  return lines.join('\n');
}

if (require.main === module) {
  const json = process.argv.includes('--json');
  const results = auditRoot();
  if (json) {
    process.stdout.write(`${JSON.stringify(results, null, 2)}\n`);
  } else {
    process.stdout.write(`${formatResults(results)}\n`);
  }
  process.exitCode = results.failures.length === 0 ? 0 : 1;
}

module.exports = {
  auditRoot,
  formatResults,
};
