'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  LIVE_MARKER,
  buildHarness,
  executeReadOnlySmoke,
  parseArgs,
  writeReceipt,
} = require('../tools/hermes-coco-harness');

const READY_DOCTOR = Object.freeze({
  ready: true,
  blocker: null,
  version: '1.1.27',
  connection: 'hermes-coco-readonly',
  effectiveRole: 'ACCOUNTADMIN',
  principalLeastPrivilege: false,
  policyBoundary: 'sql_read_only_client_policy_not_least_privilege_principal',
  sqlReadOnly: true,
  mcpEnabledInsideCoco: false,
});

const parsed = parseArgs([
  '--task', 'Snowflake: inspect usage',
  '--execute',
  '--paid-ok',
  '--json',
]);
assert.strictEqual(parsed.task, 'Snowflake: inspect usage');
assert.strictEqual(parsed.execute, true);
assert.strictEqual(parsed.paidOk, true);
assert.strictEqual(parsed.json, true);
assert.throws(() => parseArgs(['--unknown']), /Unknown argument/);

const ready = buildHarness({
  task: 'Snowflake: inspect warehouse usage',
  doctor: READY_DOCTOR,
  now: '2026-07-13T00:00:00.000Z',
  host: 'test-host',
});
assert.strictEqual(ready.overallStatus, 'ready_not_executed');
assert.strictEqual(ready.route.selectedBackend, 'snowflake-coco');
assert.strictEqual(ready.route.silentFallback, false);
assert.strictEqual(ready.route.qwenSelected, false);
assert.strictEqual(ready.controls.sqlReadOnly, true);
assert.strictEqual(ready.controls.mcpEnabledInsideCoco, false);
assert.strictEqual(ready.controls.promptStored, false);
assert.strictEqual(ready.controls.principalLeastPrivilege, false);
assert(!JSON.stringify(ready).includes('inspect warehouse usage'));

const requiresApproval = buildHarness({
  task: 'SQL: SELECT CURRENT_ROLE()',
  doctor: READY_DOCTOR,
  execute: true,
  paidOk: false,
});
assert.strictEqual(requiresApproval.overallStatus, 'blocked');
assert.strictEqual(requiresApproval.execution.blocker, 'live_snowflake_query_requires_paid_ok');

const wrongRoute = buildHarness({
  task: 'write a poem',
  doctor: READY_DOCTOR,
});
assert.strictEqual(wrongRoute.overallStatus, 'blocked');
assert.strictEqual(wrongRoute.execution.blocker, 'prompt_did_not_route_to_snowflake_coco');

const doctorBlocked = buildHarness({
  task: 'Snowflake: inspect usage',
  doctor: { ...READY_DOCTOR, ready: false, blocker: 'connection_failed' },
});
assert.strictEqual(doctorBlocked.overallStatus, 'blocked');
assert.strictEqual(doctorBlocked.execution.blocker, 'connection_failed');

const smoke = executeReadOnlySmoke({ snowBinary: '/fake/snow', env: {} }, {
  runner: (_binary, args) => {
    assert.deepStrictEqual(args.slice(0, 4), ['sql', '-c', 'hermes-coco-readonly', '-q']);
    assert(args[4].startsWith('SELECT'));
    return {
      status: 0,
      stdout: `${LIVE_MARKER} ACCOUNTADMIN HERMES_XS`,
      stderr: '',
      signal: null,
    };
  },
});
assert.strictEqual(smoke.status, 'pass');
assert.strictEqual(smoke.markerObserved, true);
assert.strictEqual(smoke.roleObserved, 'ACCOUNTADMIN');
assert.strictEqual(smoke.warehouseObserved, 'HERMES_XS');

const executed = buildHarness({
  task: 'Snowflake: inspect usage',
  doctor: READY_DOCTOR,
  execute: true,
  paidOk: true,
  snowBinary: '/fake/snow',
}, {
  runner: () => ({
    status: 0,
    stdout: `${LIVE_MARKER} ACCOUNTADMIN HERMES_XS`,
    stderr: '',
    signal: null,
  }),
});
assert.strictEqual(executed.overallStatus, 'pass');
assert.strictEqual(executed.execution.markerObserved, true);
assert.strictEqual(executed.billing.paidApprovalPresent, true);

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-coco-harness-test-'));
const latest = path.join(temp, 'latest.json');
const history = path.join(temp, 'history.jsonl');
writeReceipt(ready, latest, history);
assert.strictEqual(fs.statSync(latest).mode & 0o777, 0o600);
assert.strictEqual(fs.statSync(history).mode & 0o777, 0o600);
assert(!fs.readFileSync(latest, 'utf8').includes('inspect warehouse usage'));
fs.rmSync(temp, { recursive: true, force: true });

console.log('Hermes CoCo harness tests: PASS');
