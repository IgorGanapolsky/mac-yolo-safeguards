#!/usr/bin/env node
'use strict';

/**
 * Guard: the Maestro suite must exercise the package the E2E build actually produces.
 *
 * The recurring defect this closes is a GREEN CHECK ON THE WRONG ARTIFACT. Android
 * ships com.iganapolsky.hermesmobile.paid ($4.99, production track). The FREE package
 * com.iganapolsky.hermesmobile is unpublished — its Play listing 404s. For a long
 * stretch the required merge checks built the free package AND ran flows declaring
 * the free package, so they agreed with each other and disagreed with the product.
 *
 * Nothing in this file hardcodes "which package is right" as an isolated opinion:
 * the expected Android package is DERIVED by evaluating app.config.js under the exact
 * env each CI job sets, then compared against what every Maestro entry point will
 * actually launch. If the build env and the launched app id ever diverge again, this
 * fails.
 *
 * The committed flows deliberately keep the iOS bundle id (iOS has exactly one bundle
 * id, and it equals the legacy Android free package string). Android runs go through
 * scripts/run-maestro-for-app.sh / scripts/maestro-flow-tree-for-app.cjs, which rewrite
 * a TEMPORARY copy. So the invariants are:
 *   1. every flow declares exactly one canonical id, and it is the iOS bundle id;
 *   2. the Android rewrite converts 100% of them to the built Android package;
 *   3. every Android Maestro entry point goes through that rewrite;
 *   4. the CI env, the declared HERMES_MOBILE_ANDROID_PACKAGE, and app.config.js agree.
 *
 * Run: node tests/test-maestro-appid-package-parity.js
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const repo = path.resolve(__dirname, '..');
const mobile = path.join(repo, 'hermes-mobile');
const maestroDir = path.join(mobile, '.maestro');
const FREE_PACKAGE = 'com.iganapolsky.hermesmobile';
const PAID_PACKAGE = 'com.iganapolsky.hermesmobile.paid';

let checks = 0;
function check(message, fn) {
  fn();
  checks += 1;
  void message;
}

function read(relativePath) {
  return fs.readFileSync(path.join(repo, relativePath), 'utf8');
}

/**
 * Evaluate hermes-mobile/app.config.js in a child process under a given env and
 * return the resolved Expo config. This is the authority on which package a build
 * with that env produces — never assume it.
 */
function resolveExpoConfig(env) {
  const result = spawnSync(
    process.execPath,
    [
      '-e',
      "const c=require('./app.config.js');process.stdout.write(JSON.stringify(c({config:{}})));",
    ],
    { cwd: mobile, encoding: 'utf8', env: { ...process.env, ...env } },
  );
  assert.equal(result.status, 0, `app.config.js failed to evaluate:\n${result.stderr}`);
  return JSON.parse(result.stdout);
}

/** Slice one top-level job block out of a GitHub Actions workflow. */
function jobBlock(workflow, jobName) {
  const start = workflow.indexOf(`\n  ${jobName}:\n`);
  assert.notEqual(start, -1, `workflow job "${jobName}" not found`);
  const rest = workflow.slice(start + 1);
  const next = rest.slice(1).search(/\n {2}[a-z][a-z0-9-]*:\n/);
  return next === -1 ? rest : rest.slice(0, next + 1);
}

/** Read a job-level `env:` mapping of plain scalars. */
function jobEnv(block) {
  const envStart = block.search(/\n {4}env:\n/);
  if (envStart === -1) return {};
  const body = block.slice(envStart + 1).split('\n').slice(1);
  const env = {};
  for (const line of body) {
    const match = /^ {6}([A-Z0-9_]+):\s*(.*)$/.exec(line);
    if (!match) break;
    env[match[1]] = match[2].trim().replace(/^["'](.*)["']$/, '$1');
  }
  return env;
}

// ---------------------------------------------------------------------------
// 0. Baseline: app.config.js really is the package selector, and free != paid.
// ---------------------------------------------------------------------------
const baseConfig = resolveExpoConfig({
  HERMES_ANDROID_STORE_SKU: '',
  EXPO_PUBLIC_ANDROID_PAID_DOWNLOAD: '',
});
const IOS_BUNDLE_ID = baseConfig.ios.bundleIdentifier;

check('unset env still selects the retired free package', () => {
  assert.equal(baseConfig.android.package, FREE_PACKAGE);
});
check('iOS has a single bundle id and it is the canonical flow appId', () => {
  assert.equal(IOS_BUNDLE_ID, FREE_PACKAGE);
});
check('HERMES_ANDROID_STORE_SKU=paid selects the shipped package', () => {
  assert.equal(
    resolveExpoConfig({ HERMES_ANDROID_STORE_SKU: 'paid' }).android.package,
    PAID_PACKAGE,
  );
});
check('EXPO_PUBLIC_ANDROID_PAID_DOWNLOAD=1 selects the shipped package', () => {
  assert.equal(
    resolveExpoConfig({ EXPO_PUBLIC_ANDROID_PAID_DOWNLOAD: '1' }).android.package,
    PAID_PACKAGE,
  );
});

// ---------------------------------------------------------------------------
// 1. Every committed flow declares exactly one canonical appId == iOS bundle id.
// ---------------------------------------------------------------------------
const flowFiles = fs.readdirSync(maestroDir).filter((name) => name.endsWith('.yaml')).sort();
check('the Maestro suite is non-empty', () => {
  assert.ok(flowFiles.length >= 40, `expected the full flow suite, saw ${flowFiles.length}`);
});

const declaredIds = new Map();
for (const name of flowFiles) {
  const contents = fs.readFileSync(path.join(maestroDir, name), 'utf8');
  const ids = [...contents.matchAll(/^appId:[ \t]*(\S+)[ \t]*$/gm)].map((m) => m[1]);
  assert.equal(ids.length, 1, `${name}: expected exactly one appId declaration, saw ${ids.length}`);
  declaredIds.set(name, ids[0]);
}

check('no flow drifts off the canonical appId', () => {
  const offenders = [...declaredIds.entries()].filter(([, id]) => id !== IOS_BUNDLE_ID);
  assert.deepEqual(
    offenders,
    [],
    `flows must declare the canonical appId ${IOS_BUNDLE_ID} (Android is rewritten at run time); ` +
      `offenders: ${offenders.map(([f, id]) => `${f}=${id}`).join(', ')}`,
  );
});

// ---------------------------------------------------------------------------
// 2. Both REQUIRED Android emulator jobs build and launch the same paid package.
// ---------------------------------------------------------------------------
const mobileE2e = read('.github/workflows/mobile-e2e.yml');
const requiredAndroidJobs = ['android-e2e', 'android-stranger-cold-start'];

for (const jobName of requiredAndroidJobs) {
  const block = jobBlock(mobileE2e, jobName);
  const env = jobEnv(block);

  check(`${jobName} declares the launch package`, () => {
    assert.ok(
      env.HERMES_MOBILE_ANDROID_PACKAGE,
      `${jobName} must declare HERMES_MOBILE_ANDROID_PACKAGE`,
    );
  });

  // THE core assertion: what the job BUILDS must equal what the job LAUNCHES.
  const built = resolveExpoConfig({
    HERMES_ANDROID_STORE_SKU: env.HERMES_ANDROID_STORE_SKU || '',
    EXPO_PUBLIC_ANDROID_PAID_DOWNLOAD: env.EXPO_PUBLIC_ANDROID_PAID_DOWNLOAD || '',
  }).android.package;

  check(`${jobName} launches the package it builds`, () => {
    assert.equal(
      env.HERMES_MOBILE_ANDROID_PACKAGE,
      built,
      `${jobName}: Maestro/adb target ${env.HERMES_MOBILE_ANDROID_PACKAGE} but app.config.js ` +
        `builds ${built} under this job's env — the gate would test the wrong artifact`,
    );
  });

  check(`${jobName} targets the SHIPPED package, not the unpublished free listing`, () => {
    assert.equal(
      built,
      PAID_PACKAGE,
      `${jobName} builds ${built}; the free listing is unpublished (Play 404) so it proves nothing`,
    );
  });

  check(`${jobName} verifies the APK package before installing it`, () => {
    assert.match(block, /verify-apk-package\.cjs/);
  });

  check(`${jobName} runs Maestro through the package-aware runner`, () => {
    assert.match(block, /run-maestro-for-app\.sh/);
    assert.doesNotMatch(
      block,
      /^\s*maestro test\b/m,
      `${jobName} must not invoke bare "maestro test" on the source flow tree`,
    );
  });
}

// The Android release-APK guard must also compile the shipped package.
const mobileContinuous = read('.github/workflows/mobile-continuous.yml');
const apkGuard = jobBlock(mobileContinuous, 'release-apk-guard');
check('release-apk-guard verifies the shipped package', () => {
  const built = resolveExpoConfig({
    HERMES_ANDROID_STORE_SKU: jobEnv(apkGuard).HERMES_ANDROID_STORE_SKU || '',
    EXPO_PUBLIC_ANDROID_PAID_DOWNLOAD: jobEnv(apkGuard).EXPO_PUBLIC_ANDROID_PAID_DOWNLOAD || '',
  }).android.package;
  assert.equal(
    built,
    PAID_PACKAGE,
    `release-apk-guard builds ${built}; it would green-light an APK nobody can buy`,
  );
  assert.equal(jobEnv(apkGuard).HERMES_MOBILE_ANDROID_PACKAGE, built);
});

// The e2e EAS build profile must not silently produce the free package either.
const eas = JSON.parse(read('hermes-mobile/eas.json'));
check('eas.json e2e-test profile builds the shipped package', () => {
  const env = eas.build['e2e-test'].env || {};
  assert.equal(
    resolveExpoConfig({
      HERMES_ANDROID_STORE_SKU: env.HERMES_ANDROID_STORE_SKU || '',
      EXPO_PUBLIC_ANDROID_PAID_DOWNLOAD: env.EXPO_PUBLIC_ANDROID_PAID_DOWNLOAD || '',
    }).android.package,
    PAID_PACKAGE,
  );
});

// ---------------------------------------------------------------------------
// 3. The Android rewrite converts 100% of flows — no survivors, no partial pass.
// ---------------------------------------------------------------------------
const runner = read('hermes-mobile/scripts/run-maestro-for-app.sh');
check('run-maestro-for-app.sh rewrites exactly the canonical appId', () => {
  assert.ok(
    runner.includes(IOS_BUNDLE_ID.replace(/\./g, '\\.')),
    'run-maestro-for-app.sh must match the canonical appId the flows declare',
  );
  assert.match(runner, new RegExp(`HERMES_MOBILE_ANDROID_PACKAGE:-${PAID_PACKAGE.replace(/\./g, '\\.')}`));
});

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'maestro-appid-parity-'));
try {
  // 3a. run-maestro-for-app.sh, observed through a fake `maestro` binary that reports
  //     what the flow tree looked like at launch time.
  const fakeBin = path.join(sandbox, 'bin');
  fs.mkdirSync(fakeBin);
  const receipt = path.join(sandbox, 'receipt.json');
  fs.writeFileSync(
    path.join(fakeBin, 'maestro'),
    `#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const args = process.argv.slice(2);
const flow = args.at(-1);
const root = path.dirname(flow);
const ids = [];
for (const name of fs.readdirSync(root)) {
  if (!name.endsWith('.yaml')) continue;
  const body = fs.readFileSync(path.join(root, name), 'utf8');
  for (const m of body.matchAll(/^appId:[ \\t]*(\\S+)[ \\t]*$/gm)) ids.push(name + '=' + m[1]);
}
fs.writeFileSync(process.env.RECEIPT, JSON.stringify({ args, flow, root, ids }));
`,
  );
  fs.chmodSync(path.join(fakeBin, 'maestro'), 0o755);

  const run = spawnSync(
    '/bin/bash',
    [
      path.join(mobile, 'scripts', 'run-maestro-for-app.sh'),
      '.maestro/ship-guard.yaml',
      '-p',
      'android',
    ],
    {
      cwd: mobile,
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${fakeBin}:${process.env.PATH}`,
        RECEIPT: receipt,
        HERMES_MOBILE_ANDROID_PACKAGE: PAID_PACKAGE,
      },
    },
  );
  assert.equal(run.status, 0, run.stderr || run.stdout);
  const observed = JSON.parse(fs.readFileSync(receipt, 'utf8'));

  check('every flow Maestro sees on Android declares the shipped package', () => {
    const wrong = observed.ids.filter((entry) => !entry.endsWith(`=${PAID_PACKAGE}`));
    assert.deepEqual(
      wrong,
      [],
      `Android Maestro would launch non-shipped app ids: ${wrong.join(', ')}`,
    );
    assert.equal(
      observed.ids.length,
      flowFiles.length,
      `rewrote ${observed.ids.length} of ${flowFiles.length} flows`,
    );
  });

  check('the source flow tree is never mutated in place', () => {
    assert.notEqual(observed.root, maestroDir);
    assert.equal(fs.existsSync(observed.root), false, 'temporary flow tree must be cleaned up');
    const shipGuard = fs.readFileSync(path.join(maestroDir, 'ship-guard.yaml'), 'utf8');
    assert.match(shipGuard, new RegExp(`^appId: ${IOS_BUNDLE_ID.replace(/\./g, '\\.')}$`, 'm'));
  });

  // 3b. The shared helper used by non-`maestro` runners must agree exactly.
  const helperDest = path.join(sandbox, 'helper-tree');
  const helper = spawnSync(
    process.execPath,
    [
      path.join(mobile, 'scripts', 'maestro-flow-tree-for-app.cjs'),
      maestroDir,
      helperDest,
      PAID_PACKAGE,
    ],
    { encoding: 'utf8' },
  );
  check('maestro-flow-tree-for-app.cjs rewrites the whole tree', () => {
    assert.equal(helper.status, 0, helper.stderr);
    const ids = fs
      .readdirSync(helperDest)
      .filter((name) => name.endsWith('.yaml'))
      .flatMap((name) => {
        const body = fs.readFileSync(path.join(helperDest, name), 'utf8');
        return [...body.matchAll(/^appId:[ \t]*(\S+)[ \t]*$/gm)].map((m) => `${name}=${m[1]}`);
      });
    assert.equal(ids.length, flowFiles.length);
    assert.deepEqual(ids.filter((e) => !e.endsWith(`=${PAID_PACKAGE}`)), []);
  });
} finally {
  fs.rmSync(sandbox, { recursive: true, force: true });
}

// ---------------------------------------------------------------------------
// 4. No Android entry point may bypass the rewrite and launch the source tree.
// ---------------------------------------------------------------------------
const androidEntryPoints = [
  'hermes-mobile/scripts/run-e2e.sh',
  'hermes-mobile/scripts/run-device-e2e.sh',
  'hermes-mobile/scripts/run-e2e-proofs.sh',
  'hermes-mobile/scripts/run-fresh-user-e2e.sh',
  'hermes-mobile/scripts/run-agent-device-e2e.sh',
];
for (const entry of androidEntryPoints) {
  const source = read(entry);
  check(`${entry} routes Android through the package-aware rewrite`, () => {
    assert.ok(
      /run-maestro-for-app\.sh|maestro-flow-tree-for-app\.cjs|run-e2e\.sh/.test(source),
      `${entry} drives Android Maestro without rewriting the flow tree`,
    );
  });
  check(`${entry} never targets the unpublished free package on Android`, () => {
    // The free id is ALSO the iOS bundle id, so its mere presence is fine
    // (IOS_BUNDLE=..., comments, an explicit reject-list). What is never fine is
    // driving adb at it, or defaulting an Android package variable to it.
    const offenders = source
      .split('\n')
      .filter((line) => !/^\s*#/.test(line))
      .filter((line) => /com\.iganapolsky\.hermesmobile(?![.\w])/.test(line))
      .filter(
        (line) =>
          /\badb\b/.test(line) ||
          /^\s*(export\s+)?[A-Z_]*(ANDROID|PKG|PACKAGE)[A-Z_]*=.*com\.iganapolsky\.hermesmobile(?![.\w])/.test(
            line,
          ),
      )
      // run-device-e2e.sh maps the free id explicitly in order to REJECT it.
      .filter((line) => !/\)\s*$/.test(line.trim()));
    assert.deepEqual(
      offenders.map((line) => line.trim()),
      [],
      `${entry}: free package used as a live Android target`,
    );
  });
}

const pkg = JSON.parse(read('hermes-mobile/package.json'));
for (const [name, command] of Object.entries(pkg.scripts)) {
  if (!/^(e2e|test:e2e)/.test(name)) continue;
  if (/(^|:)ios$/.test(name) || name.endsWith(':ios')) continue; // iOS: source tree is correct
  check(`npm script "${name}" does not run Android against the source flow tree`, () => {
    assert.doesNotMatch(
      command,
      /^(maestro test|agent-device test|npx agent-device test)\b/,
      `npm run ${name} launches the un-rewritten .maestro tree ("${command}") — on Android that ` +
        `targets ${FREE_PACKAGE}, which is not installable`,
    );
  });
}

console.log(`Maestro appId <-> built package parity: ${checks}/${checks} checks passed`);
console.log(`  canonical flow appId (iOS bundle): ${IOS_BUNDLE_ID}`);
console.log(`  Android E2E build package:         ${PAID_PACKAGE}`);
console.log(`  flows verified:                    ${flowFiles.length}`);
