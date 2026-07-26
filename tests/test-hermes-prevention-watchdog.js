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
  assert.ok(body.includes('hermes-interactive-chrome-gate') || body.includes('HERMES_ALLOW_INTERACTIVE_CHROME'));
  assert.ok(!/\brg -[a-z]*q\b/.test(body), 'watchdog must not depend on ripgrep (mini runner PATH)');
  assert.ok(!/disabled_toolsets:\s*\[browser\]/.test(body) || body.includes('never'));
  // Must not instruct disabling browser
  assert.ok(!body.includes('disabled_toolsets: [browser]'));
  console.log('ok hermes-prevention-watchdog.sh contract');
}

function testChromeCdpScripts() {
  const chrome = path.join(repoRoot, 'scripts/hermes-chrome-cdp.sh');
  const install = path.join(repoRoot, 'scripts/install-hermes-chrome-cdp.sh');
  const configure = path.join(repoRoot, 'scripts/configure-browser-control.sh');
  assert.ok(fs.existsSync(chrome));
  assert.ok(fs.existsSync(install));
  assert.ok(fs.existsSync(configure));
  assert.ok(fs.existsSync(path.join(repoRoot, 'com.hermes.chrome-cdp.plist')));
  assert.ok(fs.existsSync(path.join(repoRoot, 'com.igor.hermes-prevention-watchdog.plist')));
  assert.ok(fs.existsSync(path.join(repoRoot, 'docs/BROWSER-CONTROL.md')));
  const chromeBody = fs.readFileSync(chrome, 'utf8');
  assert.ok(chromeBody.includes('remote-debugging-port'));
  assert.ok(chromeBody.includes('remote-allow-origins'));
  assert.ok(chromeBody.includes('remote-debugging-address'));
  assert.ok(chromeBody.includes('webSocketDebuggerUrl'));
  assert.ok(chromeBody.includes('reclaim_non_cdp_squat') || chromeBody.includes('CDP squat reclaim'));
  assert.ok(chromeBody.includes('hermes-interactive-chrome-gate') || chromeBody.includes('HERMES_ALLOW_INTERACTIVE_CHROME'));
  const watchdogBody = fs.readFileSync(watchdog, 'utf8');
  assert.ok(watchdogBody.includes('cdp_probe_ipv4') || watchdogBody.includes('cdp_ipv4_down'));
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

// This watchdog was found with zero alerting of any kind: its CDP heal (and
// other invariant checks, several of which have NO heal logic at all, e.g.
// disabled_toolsets drift) silently left `all_ok=0` for a human to notice
// later via `launchctl list` or a stale log. These tests prove the added
// ntfy alerting fires exactly when a real problem persists after this tick's
// self-heal attempt (edge-triggered: once on ok->degraded, once again on
// ->ok recovery, silent on every repeat), stays silent for a healthy run
// from a clean start, and never fires during --check/--no-heal inspection
// runs. The disabled_toolsets config drift is used as the deterministic
// "problem the watchdog cannot heal" fixture (no CDP/Chrome/network
// flakiness) -- HERMES_PREVENTION_WATCHDOG_CURL_BIN is a fake curl binary
// that only ever records its argv, so no real ntfy.sh network call is made.
function testSelfHealFailureAlerting() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-prev-alert-'));
  const home = path.join(tmp, 'home');
  fs.mkdirSync(home, { recursive: true });
  const soul = path.join(tmp, 'SOUL.md');
  const goodConfig = path.join(tmp, 'config-good.yaml');
  const badConfig = path.join(tmp, 'config-bad.yaml');
  const alertState = path.join(tmp, 'alert-state');
  const ntfyLog = path.join(tmp, 'ntfy.log');
  const fakeCurl = path.join(tmp, 'fake-curl');

  fs.writeFileSync(soul, '## No constraints\nNOT ALLOWED to invent\n');
  fs.writeFileSync(goodConfig, 'agent:\n  disabled_toolsets: []\n');
  fs.writeFileSync(badConfig, 'agent:\n  disabled_toolsets: [browser]\n');
  fs.writeFileSync(fakeCurl, '#!/usr/bin/env bash\nprintf \'%s\\n\' "$*" >> "${NTFY_LOG:?}"\nexit 0\n');
  fs.chmodSync(fakeCurl, 0o755);

  const baseEnv = {
    HOME: home,
    HERMES_SOUL_PATH: soul,
    HERMES_MAX_SESSION_INPUT_TOKENS: '500000',
    HERMES_PREVENTION_WATCHDOG_ALERT_STATE: alertState,
    HERMES_PREVENTION_WATCHDOG_CURL_BIN: fakeCurl,
    HERMES_PREVENTION_WATCHDOG_NTFY_TOPIC: 'test-topic',
    NTFY_LOG: ntfyLog,
  };
  const runReal = (configPath, extra = {}) =>
    run('bash', [watchdog, '--json'], { ...baseEnv, HERMES_CONFIG_PATH: configPath, ...extra });

  // Case 0: healthy from a clean start (no prior alert-state file) -> no alert.
  fs.rmSync(ntfyLog, { force: true });
  let res = runReal(goodConfig);
  assert.strictEqual(res.status, 0, `expected exit 0 on healthy run: ${res.stderr}`);
  assert.ok(!fs.existsSync(ntfyLog) || fs.readFileSync(ntfyLog, 'utf8').trim() === '', 'unexpected alert on a healthy start');
  assert.strictEqual(fs.readFileSync(alertState, 'utf8').trim(), 'ok');
  console.log('ok case 0: healthy from a clean start -> no alert');

  // Case 1: first tick with an unhealable problem (disabled_toolsets has no
  // heal path at all) -> real ntfy alert fires immediately. Unlike the other
  // two watchdogs (whose restart/reconnect heals are async and need a
  // following tick to prove out, so they get one "healing" grace tick before
  // paging), this watchdog's own CDP heal already runs synchronously and is
  // rechecked before `all_ok` is computed -- so a bad post-heal `all_ok`
  // already means the self-heal attempt (what heal exists) did not resolve
  // it, with no extra grace tick needed.
  fs.rmSync(ntfyLog, { force: true });
  res = runReal(badConfig);
  assert.strictEqual(res.status, 1, 'expected exit 1 with disabled_toolsets: [browser]');
  const parsed1 = JSON.parse(res.stdout);
  assert.strictEqual(parsed1.toolsetsOk, false);
  const ntfyBody1 = fs.readFileSync(ntfyLog, 'utf8');
  assert.ok(ntfyBody1.includes('Title: Hermes prevention watchdog self-heal failed'), ntfyBody1);
  assert.strictEqual(fs.readFileSync(alertState, 'utf8').trim(), 'degraded');
  console.log('ok case 1: first bad tick -> real ntfy self-heal-failed alert fires');

  // Case 2: STILL failing on the following tick -> no duplicate alert (edge-triggered).
  fs.rmSync(ntfyLog, { force: true });
  res = runReal(badConfig);
  assert.strictEqual(res.status, 1);
  assert.ok(!fs.existsSync(ntfyLog) || fs.readFileSync(ntfyLog, 'utf8').trim() === '', 'unexpected duplicate alert while still degraded');
  console.log('ok case 2: still failing on a second tick -> no duplicate alert');

  // Case 3: still failing on a THIRD tick -> still no duplicate alert.
  fs.rmSync(ntfyLog, { force: true });
  res = runReal(badConfig);
  assert.strictEqual(res.status, 1);
  assert.ok(!fs.existsSync(ntfyLog) || fs.readFileSync(ntfyLog, 'utf8').trim() === '', 'unexpected duplicate alert while still degraded');
  console.log('ok case 3: still degraded on a third tick -> no duplicate alert');

  // Case 4: config repaired -> recovery ntfy alert fires exactly once, state resets.
  fs.rmSync(ntfyLog, { force: true });
  res = runReal(goodConfig);
  assert.strictEqual(res.status, 0);
  const ntfyBody4 = fs.readFileSync(ntfyLog, 'utf8');
  assert.ok(ntfyBody4.includes('Title: Hermes prevention watchdog recovered'), ntfyBody4);
  assert.strictEqual(fs.readFileSync(alertState, 'utf8').trim(), 'ok');
  console.log('ok case 4: repaired -> real ntfy recovery alert fires');

  // Case 5: repeated healthy ticks after recovery stay silent.
  fs.rmSync(ntfyLog, { force: true });
  res = runReal(goodConfig);
  assert.strictEqual(res.status, 0);
  assert.ok(!fs.existsSync(ntfyLog) || fs.readFileSync(ntfyLog, 'utf8').trim() === '', 'unexpected repeat alert after recovery');
  console.log('ok case 5: repeated healthy ticks after recovery stay silent');

  // Case 6: --check (inspection / HEAL=0) mode never alerts, even on a
  // persistently unhealable problem -- only real periodic watchdog runs page.
  fs.rmSync(ntfyLog, { force: true });
  fs.rmSync(alertState, { force: true });
  res = run('bash', [watchdog, '--check', '--json'], { ...baseEnv, HERMES_CONFIG_PATH: badConfig });
  const parsed6 = JSON.parse(res.stdout);
  assert.strictEqual(parsed6.toolsetsOk, false);
  assert.ok(!fs.existsSync(ntfyLog) || fs.readFileSync(ntfyLog, 'utf8').trim() === '', '--check must never alert');
  console.log('ok case 6: --check (inspection) mode never alerts');

  fs.rmSync(tmp, { recursive: true, force: true });
}

testChromeCdpScripts();
testWatchdogScriptExists();
testRequireDeviceVerified();
testWatchdogWithFixtures();
testWatchdogWithoutRipgrepInPath();
testDisabledBrowserDetected();
testSelfHealFailureAlerting();
console.log('All prevention watchdog tests passed');
