#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const repo = path.resolve(__dirname, '..');
const mobile = path.join(repo, 'hermes-mobile');
const paidPackage = 'com.iganapolsky.hermesmobile.paid';
const freePackage = 'com.iganapolsky.hermesmobile';

function read(relativePath) {
  return fs.readFileSync(path.join(repo, relativePath), 'utf8');
}

const workflow = read('.github/workflows/mobile-e2e.yml');
const runE2e = read('hermes-mobile/scripts/run-e2e.sh');
const continuous = read('hermes-mobile/scripts/run-continuous-e2e.sh');
const device = read('hermes-mobile/scripts/run-device-e2e.sh');
const sourceShipGuard = read('hermes-mobile/.maestro/ship-guard.yaml');

assert.match(sourceShipGuard, new RegExp(`^appId: ${freePackage.replaceAll('.', '\\.')}$`, 'm'));
assert.match(runE2e, /run-maestro-for-app\.sh/);
assert.match(runE2e, /com\.iganapolsky\.hermesmobile\.paid/);
assert.match(continuous, /HERMES_MOBILE_ANDROID_PACKAGE:-com\.iganapolsky\.hermesmobile\.paid/);
assert.match(continuous, /run-e2e\.sh/);
assert.match(device, /TARGET_ANDROID_PACKAGE=.*com\.iganapolsky\.hermesmobile\.paid/);
assert.match(device, /EXPO_PUBLIC_ANDROID_PAID_DOWNLOAD/);
assert.match(device, /run-maestro-for-app\.sh/);
assert.doesNotMatch(device, /uninstall com\.iganapolsky\.hermesmobile(?:\s|$)/);

const androidJobs = workflow.slice(
  workflow.indexOf('  android-e2e:'),
  workflow.indexOf('  ios-e2e:') === -1 ? workflow.length : workflow.indexOf('  ios-e2e:'),
);
assert.equal(
  (androidJobs.match(/HERMES_MOBILE_ANDROID_PACKAGE: com\.iganapolsky\.hermesmobile\.paid/g) || [])
    .length,
  2,
  'both Android required jobs must select the paid package',
);
assert.equal(
  (androidJobs.match(/EXPO_PUBLIC_ANDROID_PAID_DOWNLOAD: "1"/g) || []).length,
  2,
  'both Android required jobs must prebuild the paid package',
);
assert.equal(
  (androidJobs.match(/run-maestro-for-app\.sh/g) || []).length,
  2,
  'both Android required jobs must use the package-aware Maestro runner',
);
assert.equal(
  (androidJobs.match(/verify-apk-package\.cjs/g) || []).length,
  2,
  'both Android required jobs must verify the paid package before install',
);
assert.doesNotMatch(androidJobs, /^\s*maestro test \.maestro\//m);

const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'paid-maestro-app-'));
try {
  const fakeBin = path.join(sandbox, 'bin');
  fs.mkdirSync(fakeBin);
  const receipt = path.join(sandbox, 'receipt.json');
  const fakeMaestro = path.join(fakeBin, 'maestro');
  fs.writeFileSync(
    fakeMaestro,
    `#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const args = process.argv.slice(2);
const flow = args.at(-1);
const root = path.dirname(flow);
const yaml = fs.readdirSync(root)
  .filter((name) => name.endsWith('.yaml'))
  .map((name) => fs.readFileSync(path.join(root, name), 'utf8'))
  .join('\\n');
if (/^appId: com\\.iganapolsky\\.hermesmobile$/m.test(yaml)) process.exit(41);
if (!/^appId: com\\.iganapolsky\\.hermesmobile\\.paid$/m.test(yaml)) process.exit(42);
fs.writeFileSync(process.env.RECEIPT, JSON.stringify({ args, flow, root }));
`,
  );
  fs.chmodSync(fakeMaestro, 0o755);

  const result = spawnSync(
    '/bin/bash',
    [path.join(mobile, 'scripts', 'run-maestro-for-app.sh'), '.maestro/ship-guard.yaml', '-p', 'android'],
    {
      cwd: mobile,
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${fakeBin}:${process.env.PATH}`,
        RECEIPT: receipt,
        HERMES_MOBILE_ANDROID_PACKAGE: paidPackage,
      },
    },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
  assert.match(result.stdout, /Maestro appId: com\.iganapolsky\.hermesmobile\.paid/);
  const observed = JSON.parse(fs.readFileSync(receipt, 'utf8'));
  assert.deepEqual(observed.args.slice(0, 3), ['test', '-p', 'android']);
  assert.equal(path.basename(observed.flow), 'ship-guard.yaml');
  assert.notEqual(observed.root, path.join(mobile, '.maestro'));
  assert.equal(fs.existsSync(observed.root), false, 'temporary parameterized flows must be removed');
  assert.match(sourceShipGuard, new RegExp(`^appId: ${freePackage.replaceAll('.', '\\.')}$`, 'm'));
} finally {
  fs.rmSync(sandbox, { recursive: true, force: true });
}

console.log('paid Android E2E package rail: 18/18 passed');
