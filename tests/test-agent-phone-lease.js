#!/usr/bin/env node
'use strict';

/**
 * Unit tests for tools/agent-phone-lease.js (T-330 priority 2: unified global phone lease).
 * Uses HERMES_GLOBAL_PHONE_LOCK_DIR to isolate state from the real fleet lock directory.
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'phone-lease-test-'));
process.env.HERMES_GLOBAL_PHONE_LOCK_DIR = tmpDir;

// Force a fresh require graph so the module reads the env var above.
for (const key of Object.keys(require.cache)) {
  if (key.includes('agent-phone-pipeline-lock.js') || key.includes('agent-phone-lease.js')) {
    delete require.cache[key];
  }
}

const lease = require('../tools/agent-phone-lease.js');

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

check('no hold by default', () => {
  assert.strictEqual(lease.isHumanHoldActive(), false);
  assert.strictEqual(lease.getHumanHold(), null);
});

check('setHumanHold persists a reason and expiry', () => {
  const payload = lease.setHumanHold('igor is texting from the phone', 60_000);
  assert.strictEqual(payload.reason, 'igor is texting from the phone');
  assert.ok(lease.isHumanHoldActive());
  const read = lease.getHumanHold();
  assert.strictEqual(read.reason, 'igor is texting from the phone');
  lease.clearHumanHold();
  assert.strictEqual(lease.isHumanHoldActive(), false);
});

check('human hold expires after its TTL', () => {
  lease.setHumanHold('short hold', 5);
  const deadline = Date.now() + 50;
  while (Date.now() < deadline) {
    /* burn past ttl */
  }
  assert.strictEqual(lease.isHumanHoldActive(), false);
});

check('automated lanes (maestro/e2e/screenshots/dogfooding) SKIP immediately on human hold', () => {
  lease.setHumanHold('igor is on the phone', 60_000);
  let ranMaestro = false;
  const resultMaestro = lease.withPhoneLease('maestro', 'test', () => {
    ranMaestro = true;
  });
  assert.strictEqual(ranMaestro, false, 'maestro lane must not run while human holds the phone');
  assert.strictEqual(resultMaestro.ran, false);
  assert.strictEqual(resultMaestro.skipped, true);
  assert.ok(resultMaestro.reason.includes('human hold'));

  for (const lane of ['e2e', 'screenshots', 'dogfooding']) {
    let ran = false;
    const result = lease.withPhoneLease(lane, 'test', () => {
      ran = true;
    });
    assert.strictEqual(ran, false, `${lane} lane must skip on human hold`);
    assert.strictEqual(result.skipped, true);
  }
  lease.clearHumanHold();
});

check('pairing/install lanes queue (do not skip instantly) — but never barge past a real hold', () => {
  lease.setHumanHold('igor is on the phone', 60_000);
  let ran = false;
  const result = lease.withPhoneLease(
    'pairing',
    'test',
    () => {
      ran = true;
    },
    { waitMs: 200, skipIfBusy: false },
  );
  assert.strictEqual(ran, false, 'pairing must never run while a human hold is active');
  assert.strictEqual(result.ran, false);
  assert.ok(result.reason && result.reason.includes('human hold'));
  lease.clearHumanHold();
});

check('lease runs the callback and releases when free', () => {
  // Guard against a real scheduled com.igor.hermes-phone-install-once launchctl job or
  // live install flock on the machine running this test — that is a legitimate external
  // busy signal (not a bug), so treat it as inconclusive rather than a false failure.
  const { pipelineBusyReason } = require('../tools/agent-phone-pipeline-lock.js');
  const realBusy = pipelineBusyReason();
  if (realBusy) {
    console.log(`    (skipped assertion: real environment busy — ${realBusy})`);
    return;
  }
  let ran = false;
  const result = lease.withPhoneLease('install', 'test', () => {
    ran = true;
  });
  assert.strictEqual(ran, true);
  assert.strictEqual(result.ran, true);
});

check('unknown lane is rejected', () => {
  assert.throws(() => lease.withPhoneLease('not-a-real-lane', 'test', () => {}));
});

check('combinedBusyReason surfaces the human hold for automated lanes only when relevant', () => {
  lease.setHumanHold('igor is on the phone', 60_000);
  assert.ok(lease.combinedBusyReason('maestro').includes('human hold'));
  assert.ok(lease.combinedBusyReason().includes('human hold'));
  lease.clearHumanHold();
  assert.strictEqual(lease.getHumanHold(), null);
});

check('combinedBusyReason ignores the pipeline lock under HERMES_PHONE_PIPELINE_LEASE_HELD=1 but still honors a human hold (avoids self-deadlock with T-323 run_once_with_global_phone_lease)', () => {
  const previous = process.env.HERMES_PHONE_PIPELINE_LEASE_HELD;
  try {
    process.env.HERMES_PHONE_PIPELINE_LEASE_HELD = '1';
    // Even with a real busy pipeline (e.g. the launchctl phone-install-once job on this
    // Mac), the descendant must not see its own ancestor's lease as a reason to skip.
    const reasonWhileHeld = lease.combinedBusyReason('maestro');
    assert.strictEqual(
      reasonWhileHeld,
      '',
      'descendant must not see its own ancestor lock as busy',
    );

    lease.setHumanHold('igor grabbed the phone mid-cycle', 60_000);
    const reasonWithHold = lease.combinedBusyReason('maestro');
    assert.ok(
      reasonWithHold.includes('human hold'),
      'a human hold must still be honored even while the process tree holds its own lease',
    );
    lease.clearHumanHold();
  } finally {
    if (previous === undefined) {
      delete process.env.HERMES_PHONE_PIPELINE_LEASE_HELD;
    } else {
      process.env.HERMES_PHONE_PIPELINE_LEASE_HELD = previous;
    }
  }
});

fs.rmSync(tmpDir, { recursive: true, force: true });

console.log(`\nResults: ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
