'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  parseArgs,
  runHarness,
  writeReceipt,
} = require('../tools/hermes-9router-harness');

const READY_DOCTOR = Object.freeze({
  ready: true,
  blockers: [],
  upstream: { version: '0.5.30', integrityVerified: true },
  server: { loopbackOnly: true, rssMb: 88 },
  route: { provider: 'ollama-local', model: 'ollama-local/qwen2.5:3b' },
  controls: {
    nonLocalProviderCount: 0,
    tunnelEnabled: false,
    rtkEnabled: false,
  },
});

assert.deepStrictEqual(parseArgs(['--task', 'private task', '--execute', '--json']).task, 'private task');
assert.strictEqual(parseArgs(['hello', 'there']).task, 'hello there');
assert.throws(() => parseArgs(['--execute']), /requires a prompt/);
assert.throws(() => parseArgs(['--unknown']), /unknown argument/);

(async () => {
  const ready = await runHarness({ doctor: READY_DOCTOR, now: '2026-07-14T00:00:00.000Z', host: 'test-host' });
  assert.strictEqual(ready.receipt.overallStatus, 'ready_not_executed');
  assert.strictEqual(ready.receipt.route.selectedBackend, '9router-local');
  assert.strictEqual(ready.receipt.route.explicit, true);
  assert.strictEqual(ready.receipt.route.automatic, false);
  assert.strictEqual(ready.receipt.route.silentFallback, false);
  assert.strictEqual(ready.receipt.route.defaultHermesRouteChanged, false);
  assert.strictEqual(ready.receipt.controls.credentialMigration, false);
  assert.strictEqual(ready.receipt.controls.loopbackOnly, true);

  const executed = await runHarness({
    doctor: READY_DOCTOR,
    execute: true,
    task: 'private prompt words',
  }, {
    chat: async () => ({
      text: 'HERMES_9ROUTER_OK',
      receipt: { schema: '9router-yolo/receipt-v1' },
    }),
  });
  assert.strictEqual(executed.receipt.overallStatus, 'pass');
  assert.strictEqual(executed.receipt.execution.markerObserved, true);
  assert.strictEqual(executed.text, 'HERMES_9ROUTER_OK');
  assert(!JSON.stringify(executed.receipt).includes('private prompt words'));
  assert(!JSON.stringify(executed.receipt).includes('HERMES_9ROUTER_OK'));

  const blocked = await runHarness({
    doctor: { ...READY_DOCTOR, ready: false, blockers: ['health_check_failed'] },
    execute: true,
    task: 'private prompt words',
  });
  assert.strictEqual(blocked.receipt.overallStatus, 'blocked');
  assert.strictEqual(blocked.receipt.execution.attempted, false);

  const failed = await runHarness({ doctor: READY_DOCTOR, execute: true, task: 'private prompt' }, {
    chat: async () => { throw new Error('synthetic failure'); },
  });
  assert.strictEqual(failed.receipt.overallStatus, 'fail');
  assert.strictEqual(failed.receipt.execution.blocker, '9router_execution_failed');

  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-9router-test-'));
  const latest = path.join(temp, 'latest.json');
  const history = path.join(temp, 'history.jsonl');
  writeReceipt(executed.receipt, latest, history);
  assert.strictEqual(fs.statSync(latest).mode & 0o777, 0o600);
  assert.strictEqual(fs.statSync(history).mode & 0o777, 0o600);
  assert(!fs.readFileSync(latest, 'utf8').includes('private prompt'));
  fs.rmSync(temp, { recursive: true, force: true });

  console.log('Hermes 9Router harness tests: PASS');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
