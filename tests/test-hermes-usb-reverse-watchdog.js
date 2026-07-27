#!/usr/bin/env node
'use strict';

/**
 * Unit tests for tools/hermes-usb-reverse-watchdog.js (T-332 P0 2026-07-14).
 *
 * Uses a stateful fake `adb` script (no real device/adbd required) to prove the
 * watchdog re-applies exactly the missing tcp reverse ports and never touches
 * emulator serials.
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'usb-reverse-watchdog-test-'));
const stateFile = path.join(tmpDir, 'state.json');
const fakeAdbPath = path.join(tmpDir, 'fake-adb.js');

function readState() {
  try {
    return JSON.parse(fs.readFileSync(stateFile, 'utf8'));
  } catch {
    return { reversed: {}, failPorts: [], devices: [['R3CY90QPM7E', 'device']] };
  }
}

function writeState(state) {
  fs.writeFileSync(stateFile, JSON.stringify(state));
}

writeState({ reversed: {}, failPorts: [], devices: [['R3CY90QPM7E', 'device']] });

const fakeAdbSource = `#!/usr/bin/env node
'use strict';
const fs = require('fs');
const stateFile = ${JSON.stringify(stateFile)};
function readState() {
  return JSON.parse(fs.readFileSync(stateFile, 'utf8'));
}
function writeState(state) {
  fs.writeFileSync(stateFile, JSON.stringify(state));
}
const args = process.argv.slice(2);
if (args[0] === 'devices' && args[1] === '-l') {
  const state = readState();
  const lines = state.devices.map(([serial, status]) => \`\${serial}\\t\${status} product:test\`);
  process.stdout.write(['List of devices attached', ...lines, ''].join('\\n'));
  process.exit(0);
}
if (args[0] === '-s' && args[2] === 'reverse' && args[3] === '--list') {
  const serial = args[1];
  const state = readState();
  const ports = state.reversed[serial] || [];
  const lines = ports.map((port) => \`tcp:\${port} tcp:\${port}\`);
  process.stdout.write(lines.join('\\n'));
  process.exit(0);
}
if (args[0] === '-s' && args[2] === 'reverse' && args[3] === '--remove' && args[4] && args[4].startsWith('tcp:')) {
  const serial = args[1];
  const port = Number(args[4].slice(4));
  const state = readState();
  state.reversed[serial] = (state.reversed[serial] || []).filter((p) => p !== port);
  writeState(state);
  process.exit(0);
}
if (args[0] === '-s' && args[2] === 'reverse' && args[3].startsWith('tcp:')) {
  const serial = args[1];
  const port = Number(args[3].slice(4));
  const state = readState();
  if ((state.failPorts || []).includes(port)) {
    process.exit(1);
  }
  state.reversed[serial] = Array.from(new Set([...(state.reversed[serial] || []), port]));
  writeState(state);
  process.exit(0);
}
process.exit(1);
`;

fs.writeFileSync(fakeAdbPath, fakeAdbSource);
fs.chmodSync(fakeAdbPath, 0o755);

const watchdog = require('../tools/hermes-usb-reverse-watchdog.js');

let pass = 0;
let fail = 0;
function check(name, fn) {
  try {
    fn();
    pass += 1;
    console.log(`  [PASS] ${name}`);
  } catch (err) {
    fail += 1;
    console.log(`  [FAIL] ${name}: ${err.message}`);
  }
}

check('healSerial re-applies a missing port and leaves an already-live one alone', () => {
  writeState({ reversed: { R3CY90QPM7E: [8642] }, failPorts: [], devices: [['R3CY90QPM7E', 'device']] });
  const result = watchdog.healSerial('R3CY90QPM7E', { adbCommand: fakeAdbPath });
  assert.deepStrictEqual(result.missing, [8765]);
  assert.deepStrictEqual(result.reapplied, [8765]);
  assert.deepStrictEqual(result.failed, []);
  const state = readState();
  assert.deepStrictEqual(state.reversed.R3CY90QPM7E.sort(), [8642, 8765]);
});

check('healSerial is a no-op when both ports are already live', () => {
  writeState({ reversed: { R3CY90QPM7E: [8642, 8765] }, failPorts: [], devices: [['R3CY90QPM7E', 'device']] });
  const result = watchdog.healSerial('R3CY90QPM7E', { adbCommand: fakeAdbPath });
  assert.deepStrictEqual(result.missing, []);
  assert.deepStrictEqual(result.reapplied, []);
});

check('healSerial reports a failed re-apply without throwing', () => {
  writeState({ reversed: {}, failPorts: [8765], devices: [['R3CY90QPM7E', 'device']] });
  const result = watchdog.healSerial('R3CY90QPM7E', { adbCommand: fakeAdbPath });
  assert.deepStrictEqual(result.missing.sort(), [8642, 8765]);
  assert.deepStrictEqual(result.reapplied, [8642]);
  assert.deepStrictEqual(result.failed, [8765]);
});

check('runOnce heals every physical serial and skips emulators', () => {
  writeState({
    reversed: {},
    failPorts: [],
    devices: [
      ['R3CY90QPM7E', 'device'],
      ['emulator-5554', 'device'],
    ],
  });
  const summary = watchdog.runOnce({
    adbCommand: fakeAdbPath,
    skipPair: true,
    appearStatePath: path.join(tmpDir, 'appear-heal.json'),
  });
  assert.strictEqual(summary.devicesChecked, 1, 'emulator serial must never be touched');
  assert.strictEqual(summary.results[0].serial, 'R3CY90QPM7E');
  assert.strictEqual(summary.healed, true);
  assert.strictEqual(summary.anyFailed, false);
  const state = readState();
  assert.strictEqual(state.reversed['emulator-5554'], undefined);
});

check('runOnce reports zero devices checked when nothing is authorized', () => {
  writeState({ reversed: {}, failPorts: [], devices: [] });
  const summary = watchdog.runOnce({
    adbCommand: fakeAdbPath,
    skipPair: true,
    appearStatePath: path.join(tmpDir, 'appear-empty.json'),
  });
  assert.strictEqual(summary.devicesChecked, 0);
  assert.strictEqual(summary.healed, false);
  assert.strictEqual(summary.anyFailed, false);
});

check('maybePairOnAppear runs pair once on absent→present edge', () => {
  const appearPath = path.join(tmpDir, 'appear-edge.json');
  const calls = [];
  const first = watchdog.maybePairOnAppear(['R3CY90QPM7E'], {
    appearStatePath: appearPath,
    pipelineBusyReason: () => '',
    pairRunner: (serial) => {
      calls.push(serial);
      return { serial, paired: true, reason: 'paired' };
    },
  });
  assert.deepStrictEqual(first.appeared, ['R3CY90QPM7E']);
  assert.strictEqual(first.pairAttempts[0].paired, true);
  assert.deepStrictEqual(calls, ['R3CY90QPM7E']);

  const second = watchdog.maybePairOnAppear(['R3CY90QPM7E'], {
    appearStatePath: appearPath,
    pipelineBusyReason: () => '',
    pairRunner: (serial) => {
      calls.push(serial);
      return { serial, paired: true, reason: 'paired' };
    },
  });
  assert.deepStrictEqual(second.appeared, []);
  assert.deepStrictEqual(calls, ['R3CY90QPM7E'], 'must not re-pair while continuously present');
});

check('appear pairing uses silent USB arguments and never requests a browser', () => {
  let received = null;
  const result = watchdog.runAppearPair('R3CY90QPM7E', {
    pairRunner: (serial, invocation) => {
      received = { serial, ...invocation };
      return { serial, paired: true, reason: 'paired' };
    },
  });
  assert.strictEqual(result.paired, true);
  assert.deepStrictEqual(received.args, ['--no-serve']);
  assert.strictEqual(received.args.includes('--open'), false);
});

check('maybePairOnAppear retries when pipeline is busy', () => {
  const appearPath = path.join(tmpDir, 'appear-busy.json');
  const first = watchdog.maybePairOnAppear(['R3CY90QPM7E'], {
    appearStatePath: appearPath,
    pipelineBusyReason: () => 'maestro running',
    pairRunner: () => {
      throw new Error('pairRunner must not run while busy');
    },
  });
  assert.strictEqual(first.pairAttempts[0].paired, false);
  assert.match(first.pairAttempts[0].reason, /pipeline_busy/);
  assert.deepStrictEqual(first.knownPresent, []);

  const second = watchdog.maybePairOnAppear(['R3CY90QPM7E'], {
    appearStatePath: appearPath,
    pipelineBusyReason: () => '',
    pairRunner: (serial) => ({ serial, paired: true, reason: 'paired' }),
  });
  assert.strictEqual(second.pairAttempts[0].paired, true);
  assert.deepStrictEqual(second.knownPresent, ['R3CY90QPM7E']);
});

check('maybePairOnAppear re-pairs after disconnect then reconnect', () => {
  const appearPath = path.join(tmpDir, 'appear-reconnect.json');
  let calls = 0;
  const runner = (serial) => {
    calls += 1;
    return { serial, paired: true, reason: 'paired' };
  };
  watchdog.maybePairOnAppear(['R3CY90QPM7E'], {
    appearStatePath: appearPath,
    pipelineBusyReason: () => '',
    pairRunner: runner,
  });
  watchdog.maybePairOnAppear([], {
    appearStatePath: appearPath,
    pipelineBusyReason: () => '',
    pairRunner: runner,
  });
  watchdog.maybePairOnAppear(['R3CY90QPM7E'], {
    appearStatePath: appearPath,
    pipelineBusyReason: () => '',
    pairRunner: runner,
  });
  assert.strictEqual(calls, 2);
});

check('runOnce with skipPair still heals reverses and records appear skip', () => {
  writeState({
    reversed: {},
    failPorts: [],
    devices: [['R3CY90QPM7E', 'device']],
  });
  const appearPath = path.join(tmpDir, 'appear-skip.json');
  const summary = watchdog.runOnce({
    adbCommand: fakeAdbPath,
    skipPair: true,
    appearStatePath: appearPath,
  });
  assert.strictEqual(summary.healed, true);
  assert.strictEqual(summary.appear.pairAttempts[0].reason, 'skip_pair');
  assert.strictEqual(summary.paired, false);
});

check('healSerial skips re-adding tcp:8642 when mini-primary intent is active', () => {
  writeState({ reversed: {}, failPorts: [], devices: [['R3CY90QPM7E', 'device']] });
  const result = watchdog.healSerial('R3CY90QPM7E', {
    adbCommand: fakeAdbPath,
    intent: { skip8642: true, gatewayUrl: 'http://127.0.0.1:18642' },
  });
  assert.strictEqual(result.skip8642, true);
  assert.deepStrictEqual(result.missing, [8765]);
  assert.deepStrictEqual(result.reapplied, [8765]);
  const state = readState();
  assert.deepStrictEqual(state.reversed.R3CY90QPM7E, [8765]);
  assert.strictEqual(state.reversed.R3CY90QPM7E.includes(8642), false, 'must never re-add 8642 under mini-primary intent');
});

check('healSerial actively removes a stale tcp:8642 that reappeared while mini-primary intent is active', () => {
  writeState({ reversed: { R3CY90QPM7E: [8642, 8765] }, failPorts: [], devices: [['R3CY90QPM7E', 'device']] });
  const result = watchdog.healSerial('R3CY90QPM7E', {
    adbCommand: fakeAdbPath,
    intent: { skip8642: true, gatewayUrl: 'http://127.0.0.1:18642' },
  });
  assert.strictEqual(result.skip8642, true);
  assert.strictEqual(result.removed8642, true, 'a live stale tcp:8642 must be actively removed, not just left alone');
  const state = readState();
  assert.deepStrictEqual(state.reversed.R3CY90QPM7E, [8765]);
});

check('healSerial heals tcp:8642 normally when no mini-primary intent is on record', () => {
  writeState({ reversed: {}, failPorts: [], devices: [['R3CY90QPM7E', 'device']] });
  const result = watchdog.healSerial('R3CY90QPM7E', {
    adbCommand: fakeAdbPath,
    intentStatePath: path.join(tmpDir, 'no-such-intent-file.json'),
  });
  assert.strictEqual(result.skip8642, false);
  assert.deepStrictEqual(result.missing.sort(), [8642, 8765]);
  assert.deepStrictEqual(result.reapplied.sort(), [8642, 8765]);
  const state = readState();
  assert.deepStrictEqual(state.reversed.R3CY90QPM7E.sort(), [8642, 8765]);
});

check('healSerial reads a real persisted intent file written by hermes-mobile-pair-lib', () => {
  const { writeUsbReversePrimaryIntent } = require('../tools/hermes-mobile-pair-lib');
  const intentStatePath = path.join(tmpDir, 'persisted-intent.json');
  writeUsbReversePrimaryIntent(
    { skip8642: true, gatewayUrl: 'http://127.0.0.1:18642', forceMiniUsbPrimary: true },
    intentStatePath,
  );
  writeState({ reversed: {}, failPorts: [], devices: [['R3CY90QPM7E', 'device']] });
  const result = watchdog.healSerial('R3CY90QPM7E', { adbCommand: fakeAdbPath, intentStatePath });
  assert.strictEqual(result.skip8642, true);
  const state = readState();
  assert.strictEqual(state.reversed.R3CY90QPM7E.includes(8642), false);
});

check('runOnce excludes tcp:8642 from "already live" ports display and healing under mini-primary intent', () => {
  writeState({ reversed: { R3CY90QPM7E: [8765] }, failPorts: [], devices: [['R3CY90QPM7E', 'device']] });
  const intentStatePath = path.join(tmpDir, 'runonce-intent.json');
  const { writeUsbReversePrimaryIntent } = require('../tools/hermes-mobile-pair-lib');
  writeUsbReversePrimaryIntent({ skip8642: true, gatewayUrl: 'http://127.0.0.1:18642' }, intentStatePath);
  const summary = watchdog.runOnce({
    adbCommand: fakeAdbPath,
    skipPair: true,
    appearStatePath: path.join(tmpDir, 'appear-mini-primary.json'),
    intentStatePath,
  });
  assert.strictEqual(summary.results[0].skip8642, true);
  assert.strictEqual(summary.results[0].missing.length, 0, 'tcp:8765 alone must satisfy healing under mini-primary intent');
  assert.strictEqual(summary.anyFailed, false);
  const state = readState();
  assert.strictEqual(state.reversed.R3CY90QPM7E.includes(8642), false);
});

fs.rmSync(tmpDir, { recursive: true, force: true });

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
