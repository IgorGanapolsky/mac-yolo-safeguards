#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const {
  PROTECTED_LABELS,
  PAUSED_PREFIX,
  hijackSignal,
  chromeBlocked,
  controlRoutine,
} = require('../tools/routine-pause');

function main() {
  assert.ok(PROTECTED_LABELS.has('com.igor.shutdown-simulators'));

  const stripeOpen = [
    'tell application "Google Chrome"',
    'open -a "Google Chrome" "https://dashboard.stripe.com/acct_1RNcJ1GGBpd520QY/payments?status=successful"',
  ].join('\n');
  const hijack = hijackSignal(stripeOpen);
  assert.strictEqual(hijack.hijacksDesktop, true);
  assert.ok(hijack.hijackCodes.includes('chrome_apple_script'));
  assert.ok(hijack.hijackCodes.includes('chrome_url_open'));
  assert.ok(hijack.hijackCodes.includes('stripe_browser_open'));
  assert.strictEqual(hijackSignal('stripe charges list --live --limit 10').hijacksDesktop, false);
  assert.strictEqual(hijackSignal('open -a "Google Chrome" "https://checkout.stripe.com/c/pay/cs_test"').hijacksDesktop, true);

  const calls = [];
  const paused = controlRoutine(
    'pause',
    {
      kind: 'launchd',
      label: 'com.igor.shutdown-simulators',
      plist: '/Library/LaunchAgents/com.igor.shutdown-simulators.plist',
    },
    { run: (cmd, args) => calls.push([cmd, args]) || { status: 0 } },
  );
  assert.strictEqual(paused.ok, false);
  assert.strictEqual(paused.applied, false);
  assert.strictEqual(paused.chromeOpened, false);
  assert.deepStrictEqual(paused.findings.map((item) => item.id), ['protected_label']);
  assert.strictEqual(calls.length, 0);

  const launchCalls = [];
  const held = controlRoutine(
    'stop',
    {
      kind: 'launchd',
      id: 'com.igor.stripe-money-bell',
      plist: '/tmp/com.igor.stripe-money-bell.plist',
      domain: 'gui/502',
    },
    {
      run: (cmd, args) => {
        launchCalls.push([cmd, ...args]);
        return { status: 0, stderr: '' };
      },
    },
  );
  assert.strictEqual(held.ok, true);
  assert.strictEqual(held.newState, 'stopped');
  assert.strictEqual(held.chromeOpened, false);
  assert.deepStrictEqual(launchCalls, [
    ['/bin/launchctl', 'bootout', 'gui/502', '/tmp/com.igor.stripe-money-bell.plist'],
    ['/bin/launchctl', 'disable', 'gui/502/com.igor.stripe-money-bell'],
  ]);

  const cron = controlRoutine('pause', {
    kind: 'cron',
    id: '1',
    crontab: '*/5 * * * * /usr/local/bin/backup-notes.sh\n',
  });
  assert.strictEqual(cron.ok, true);
  assert.strictEqual(cron.crontab, `${PAUSED_PREFIX}*/5 * * * * /usr/local/bin/backup-notes.sh\n`);
  const resumed = controlRoutine('resume', { kind: 'cron', id: '1', crontab: cron.crontab });
  assert.strictEqual(resumed.crontab, '*/5 * * * * /usr/local/bin/backup-notes.sh\n');
  const stopped = controlRoutine('stop', { kind: 'cron', id: '1', crontab: resumed.crontab });
  assert.strictEqual(stopped.crontab, '');
  assert.strictEqual(stopped.newState, 'stopped');

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'routine-pause-'));
  const script = path.join(root, 'watch_stripe_dashboard.py');
  fs.writeFileSync(script, 'print("asleep")\n');
  const signals = [];
  const scriptStop = controlRoutine(
    'stop',
    { kind: 'script', path: script, root, pid: 4242 },
    { kill: (pid, sig) => signals.push([pid, sig]) },
  );
  assert.strictEqual(scriptStop.ok, true);
  assert.strictEqual(scriptStop.chromeOpened, false);
  assert.deepStrictEqual(signals, [[4242, 'SIGTERM']]);
  assert.strictEqual(fs.existsSync(script), false);
  assert.strictEqual(fs.existsSync(scriptStop.quarantinedPath), true);
  const outside = controlRoutine('stop', { kind: 'script', path: '/etc/passwd', root });
  assert.strictEqual(outside.ok, false);
  assert.deepStrictEqual(outside.findings.map((item) => item.id), ['script_outside_root']);

  const statePath = path.join(root, 'pause.json');
  const chromePause = controlRoutine('pause', { kind: 'chrome' }, { statePath, fs });
  assert.strictEqual(chromePause.applied, true);
  assert.strictEqual(chromePause.newState, 'paused');
  assert.strictEqual(chromeBlocked({ MAC_YOLO_ROUTINE_PAUSE: statePath }), true);
  const chromeResume = controlRoutine('resume', { kind: 'chrome' }, { statePath, fs });
  assert.strictEqual(chromeResume.newState, 'running');
  assert.strictEqual(chromeBlocked({ MAC_YOLO_ROUTINE_PAUSE: statePath }), false);
  fs.writeFileSync(statePath, '{');
  assert.strictEqual(chromeBlocked({ MAC_YOLO_ROUTINE_PAUSE: statePath }), true);
  assert.strictEqual(chromeBlocked({}), false);

  const loop = fs.readFileSync(path.join(__dirname, '../tools/revenue-autonomous-loop.js'), 'utf8');
  assert.ok(loop.includes('chromeBlocked()'));

  const cli = spawnSync(
    process.execPath,
    [
      path.join(__dirname, '../tools/routine-pause.js'),
      '--json',
      'pause',
      '--kind',
      'launchd',
      '--id',
      'com.igor.shutdown-simulators',
    ],
    { encoding: 'utf8' },
  );
  assert.strictEqual(cli.status, 0);
  const dry = JSON.parse(cli.stdout);
  assert.strictEqual(dry.applied, false);
  assert.strictEqual(dry.status, 'held');
  assert.strictEqual(dry.chromeOpened, false);

  fs.rmSync(root, { recursive: true, force: true });
  process.stdout.write('routine-pause: PASS\n');
}

main();
