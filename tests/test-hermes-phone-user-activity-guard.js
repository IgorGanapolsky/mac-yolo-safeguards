#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-phone-guard-'));
process.env.HERMES_GLOBAL_PHONE_LOCK_DIR = tempRoot;

const {
  physicalPhoneUserActivity,
  runCommandWithPhonePipelineLock,
} = require('../tools/agent-phone-pipeline-lock.js');

function result(status, stdout = '') {
  return { status, stdout, stderr: '' };
}

function mockAdb({ devices, power = '', window = '' }) {
  return (_command, args) => {
    if (args[0] === 'devices') return result(0, devices);
    if (args.includes('power')) return result(0, power);
    if (args.includes('window')) return result(0, window);
    return result(1);
  };
}

let activity = physicalPhoneUserActivity({
  spawnSyncImpl: mockAdb({ devices: 'List of devices attached\nemulator-5554 device\n' }),
});
assert.equal(activity.active, false);
assert.equal(activity.reason, 'no physical phone');

activity = physicalPhoneUserActivity({
  spawnSyncImpl: mockAdb({
    devices: 'List of devices attached\nPHONE123 device usb:1\n',
    power: 'mWakefulness=Asleep\n',
  }),
});
assert.equal(activity.active, false);
assert.equal(activity.serial, 'PHONE123');

activity = physicalPhoneUserActivity({
  spawnSyncImpl: mockAdb({
    devices: 'List of devices attached\nPHONE123 device usb:1\n',
    power: 'mWakefulness=Awake\n',
    window: 'mCurrentFocus=Window{abc u0 com.iganapolsky.hermesmobile/com.iganapolsky.hermesmobile.MainActivity}\n',
  }),
});
assert.equal(activity.active, true);
assert.equal(activity.foregroundPackage, 'com.iganapolsky.hermesmobile');

let nestedSawLock = false;
const commandResult = runCommandWithPhonePipelineLock(
  'continuous-e2e-test',
  'true',
  [],
  {
    spawnSyncImpl: () => {
      nestedSawLock = fs.existsSync(path.join(tempRoot, 'agent-phone-pipeline.lockdir'));
      return result(0);
    },
    stdio: 'pipe',
    pipelineBusyReasonImpl: () => '',
  },
);
assert.equal(commandResult.status, 0);
assert.equal(nestedSawLock, true);
assert.equal(fs.existsSync(path.join(tempRoot, 'agent-phone-pipeline.lockdir')), false);

const continuousE2eSource = fs.readFileSync(
  path.join(__dirname, '..', 'hermes-mobile', 'scripts', 'run-continuous-e2e.sh'),
  'utf8',
);
const runUnitStart = continuousE2eSource.indexOf('run_unit_suite() {');
const runUnitEnd = continuousE2eSource.indexOf('\nrun_e2e_flow() {', runUnitStart);
assert.ok(runUnitStart >= 0 && runUnitEnd > runUnitStart, 'run_unit_suite must remain inspectable');
const runUnitSuite = continuousE2eSource.slice(runUnitStart, runUnitEnd);
assert.match(
  runUnitSuite,
  /npm test[^\n]*\|\| unit_test_rc=\$\?/,
  'a failing full Jest suite must be captured instead of masked by release-safety',
);
assert.match(
  runUnitSuite,
  /npm run test:release-safety[^\n]*\|\| release_safety_rc=\$\?/,
  'release-safety must have an independent captured exit code',
);

function runUnitSuiteCase(unitRc, releaseSafetyRc) {
  const caseRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-unit-exit-'));
  const binDir = path.join(caseRoot, 'bin');
  const npmLog = path.join(caseRoot, 'npm.log');
  fs.mkdirSync(binDir);
  const fakeNpm = path.join(binDir, 'npm');
  fs.writeFileSync(
    fakeNpm,
    `#!/bin/sh
printf '%s\n' "$*" >> "$MOCK_NPM_LOG"
if [ "$1" = "test" ]; then exit "$MOCK_UNIT_RC"; fi
if [ "$1" = "run" ] && [ "$2" = "test:release-safety" ]; then exit "$MOCK_RELEASE_SAFETY_RC"; fi
exit 64
`,
  );
  fs.chmodSync(fakeNpm, 0o755);
  const shell = `${runUnitSuite}
jest_available() { return 0; }
set +e
run_unit_suite
rc=$?
printf '__RC__=%s\n' "$rc"
`;
  const execution = spawnSync('bash', ['-c', shell], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PATH: `${binDir}:${process.env.PATH}`,
      HERMES_DIR: caseRoot,
      MOCK_NPM_LOG: npmLog,
      MOCK_UNIT_RC: String(unitRc),
      MOCK_RELEASE_SAFETY_RC: String(releaseSafetyRc),
    },
  });
  assert.equal(execution.status, 0, execution.stderr);
  const returned = Number(execution.stdout.match(/__RC__=(\d+)/)?.[1]);
  return { returned, calls: fs.readFileSync(npmLog, 'utf8').trim().split('\n') };
}

let unitCase = runUnitSuiteCase(1, 0);
assert.equal(unitCase.returned, 1, 'Jest failure must fail the combined unit phase');
assert.equal(unitCase.calls.length, 2, 'release-safety still runs to preserve complete diagnostics');
unitCase = runUnitSuiteCase(0, 1);
assert.equal(unitCase.returned, 1, 'release-safety failure must fail the combined unit phase');
unitCase = runUnitSuiteCase(0, 0);
assert.equal(unitCase.returned, 0, 'both unit gates passing must succeed');

const runCycleStart = continuousE2eSource.indexOf('run_cycle() {');
const runCycleEnd = continuousE2eSource.indexOf('\nstart_daemon() {', runCycleStart);
assert.ok(runCycleStart >= 0 && runCycleEnd > runCycleStart, 'run_cycle must remain inspectable');
const runCycle = continuousE2eSource.slice(runCycleStart, runCycleEnd);
const unitBoundary = runCycle.indexOf('run_unit_suite');
const leaseRecheck = runCycle.indexOf('phone_lease_busy_reason', unitBoundary);
const humanRecheck = runCycle.indexOf('guard_active_physical_phone', unitBoundary);
const physicalE2eBoundary = runCycle.indexOf('run_e2e_suite', unitBoundary);
assert.ok(unitBoundary >= 0, 'continuous E2E must run the unit suite');
assert.ok(
  leaseRecheck > unitBoundary && leaseRecheck < physicalE2eBoundary,
  'continuous E2E must re-check a human hold after the long unit suite and before device E2E',
);
assert.ok(
  humanRecheck > unitBoundary && humanRecheck < physicalE2eBoundary,
  'continuous E2E must re-check physical-phone human activity after the long unit suite and immediately before device E2E',
);
assert.match(
  runCycle,
  /pre_e2e_lease_reason="\$\(phone_lease_busy_reason\)" \|\| true/,
  'an expected busy-reason exit must not abort the set -e cycle before status is written',
);
assert.match(
  continuousE2eSource.slice(
    continuousE2eSource.indexOf('guard_system_pressure() {'),
    continuousE2eSource.indexOf('\nacquire_cycle_lock() {'),
  ),
  /lease_reason="\$\(phone_lease_busy_reason\)" \|\| true/,
  'the cycle-start busy-reason probe must also tolerate its expected nonzero exit',
);

const runE2eSuiteStart = continuousE2eSource.indexOf('run_e2e_suite() {');
const runE2eSuiteEnd = continuousE2eSource.indexOf('\nrun_cycle() {', runE2eSuiteStart);
assert.ok(runE2eSuiteStart >= 0 && runE2eSuiteEnd > runE2eSuiteStart, 'run_e2e_suite must remain inspectable');
const runE2eSuite = continuousE2eSource.slice(runE2eSuiteStart, runE2eSuiteEnd);
const metroPreparation = runE2eSuite.indexOf('ensure_metro');
const deviceLeaseRecheck = runE2eSuite.indexOf('phone_lease_busy_reason', metroPreparation);
const deviceHumanRecheck = runE2eSuite.indexOf('guard_active_physical_phone', metroPreparation);
const maestroBoundary = runE2eSuite.indexOf('run_e2e_flow', metroPreparation);
assert.ok(
  metroPreparation >= 0 &&
    deviceLeaseRecheck > metroPreparation &&
    deviceHumanRecheck > metroPreparation &&
    maestroBoundary > deviceLeaseRecheck &&
    maestroBoundary > deviceHumanRecheck,
  'phone lease and live activity must be re-checked after Metro startup and before the first Maestro flow',
);
assert.match(
  runCycle,
  /run_e2e_suite "\$unit_status"/,
  'the device-boundary guard must preserve the passing unit proof when it skips E2E',
);
assert.match(
  runCycle,
  /4\)\s+e2e_status="skipped"/,
  'device-boundary human activity must be reported as an honest skip, not a Maestro failure',
);

console.log('PASS: physical-phone activity and unified lease guards');
