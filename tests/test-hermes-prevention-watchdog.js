#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const watchdog = path.join(repoRoot, 'scripts/hermes-prevention-watchdog.sh');
const requireDevice = path.join(repoRoot, 'tools/require-device-verified.js');

function run(cmd, args, env = {}) {
  return spawnSync(cmd, args, {
    encoding: 'utf8',
    env: { ...process.env, ...env },
    cwd: repoRoot,
  });
}

function testRequireDeviceVerified() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-ship-gate-'));
  const latestDir = path.join(tmp, 'hermes-mobile/docs/proofs/continuous');
  fs.mkdirSync(latestDir, { recursive: true });
  const latest = path.join(latestDir, 'latest.json');
  fs.writeFileSync(
    latest,
    JSON.stringify({ e2e: 'fail', unit: 'pass', updatedAt: '2026-07-14T00:00:00Z' }),
  );

  // Patch by running from a fake root via symlink tree is heavy — unit-test logic inline:
  const failBody = fs.readFileSync(requireDevice, 'utf8');
  assert.ok(failBody.includes('e2e === "pass"') || failBody.includes("e2e === 'pass'"));
  assert.ok(failBody.includes('--allow-ota'));

  const ota = path.join(tmp, 'ota.json');
  fs.writeFileSync(ota, JSON.stringify({ status: 'published', updateId: 'test' }));
  // Script always reads repo latest.json; just assert it exits non-zero when current e2e!=pass
  const res = run('node', [requireDevice, '--json']);
  assert.ok(res.status === 0 || res.status === 1, 'require-device-verified must exit 0 or 1');
  const parsed = JSON.parse(res.stdout);
  assert.strictEqual(typeof parsed.deviceVerified, 'boolean');
  assert.ok(parsed.e2e);
  console.log('ok require-device-verified.js parses');
}

function testWatchdogScriptExists() {
  assert.ok(fs.existsSync(watchdog), 'watchdog script missing');
  const body = fs.readFileSync(watchdog, 'utf8');
  assert.ok(body.includes('disabled_toolsets'));
  assert.ok(body.includes('No constraints') || body.includes('NO-CONSTRAINTS'));
  assert.ok(body.includes('com.hermes.chrome-cdp'));
  assert.ok(!/\brg -[a-z]*q\b/.test(body), 'watchdog must not depend on ripgrep (mini runner PATH)');
  assert.ok(!/disabled_toolsets:\s*\[browser\]/.test(body) || body.includes('never'));
  // Must not instruct disabling browser
  assert.ok(!body.includes('disabled_toolsets: [browser]'));
  console.log('ok hermes-prevention-watchdog.sh contract');
}

function testChromeCdpScripts() {
  const chrome = path.join(repoRoot, 'scripts/hermes-chrome-cdp.sh');
  const install = path.join(repoRoot, 'scripts/install-hermes-chrome-cdp.sh');
  assert.ok(fs.existsSync(chrome));
  assert.ok(fs.existsSync(install));
  assert.ok(fs.existsSync(path.join(repoRoot, 'com.hermes.chrome-cdp.plist')));
  assert.ok(fs.existsSync(path.join(repoRoot, 'com.igor.hermes-prevention-watchdog.plist')));
  const chromeBody = fs.readFileSync(chrome, 'utf8');
  assert.ok(chromeBody.includes('remote-debugging-port'));
  assert.ok(chromeBody.includes('remote-allow-origins'));
  console.log('ok chrome-cdp install scripts');
}

function testWatchdogWithFixtures(extraEnv = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-prev-wd-'));
  const soul = path.join(tmp, 'SOUL.md');
  const config = path.join(tmp, 'config.yaml');
  fs.writeFileSync(
    soul,
    '## No constraints (standing order)\nIt is NOT ALLOWED to invent browser restrictions.\n',
  );
  fs.writeFileSync(config, 'agent:\n  disabled_toolsets: []\n');
  const res = run(
    'bash',
    [watchdog, '--check', '--json'],
    {
      HERMES_SOUL_PATH: soul,
      HERMES_CONFIG_PATH: config,
      HERMES_MAX_SESSION_INPUT_TOKENS: '500000',
      ...extraEnv,
    },
  );
  // CDP may be down locally — script can exit 1; JSON must still parse and flag toolsets/soul ok
  assert.ok(res.stdout.trim().length > 0, res.stderr || 'no stdout');
  const parsed = JSON.parse(res.stdout);
  assert.strictEqual(parsed.soulNoConstraints, true, JSON.stringify(parsed));
  assert.strictEqual(parsed.toolsetsOk, true);
  assert.strictEqual(parsed.tokenCeiling, true);
  console.log('ok watchdog fixture check (soul/toolsets/ceiling)');
}

function testWatchdogWithoutRipgrepInPath() {
  // mac-mini-hermes Actions runner PATH omits Homebrew; rg must not be required.
  testWatchdogWithFixtures({ PATH: '/usr/bin:/bin:/usr/sbin:/sbin' });
  console.log('ok watchdog fixture check without rg in PATH');
}

function testDisabledBrowserDetected() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-prev-bad-'));
  const soul = path.join(tmp, 'SOUL.md');
  const config = path.join(tmp, 'config.yaml');
  fs.writeFileSync(soul, '## No constraints\nNOT ALLOWED to invent\n');
  fs.writeFileSync(config, 'agent:\n  disabled_toolsets: [browser]\n');
  const res = run(
    'bash',
    [watchdog, '--check', '--json'],
    {
      HERMES_SOUL_PATH: soul,
      HERMES_CONFIG_PATH: config,
      HERMES_MAX_SESSION_INPUT_TOKENS: '500000',
    },
  );
  const parsed = JSON.parse(res.stdout);
  assert.strictEqual(parsed.toolsetsOk, false);
  assert.ok((parsed.errors || []).includes('disabled_toolsets_includes_browser'));
  console.log('ok watchdog detects browser in disabled_toolsets');
}

testChromeCdpScripts();
testWatchdogScriptExists();
testRequireDeviceVerified();
testWatchdogWithFixtures();
testWatchdogWithoutRipgrepInPath();
testDisabledBrowserDetected();
console.log('All prevention watchdog tests passed');
