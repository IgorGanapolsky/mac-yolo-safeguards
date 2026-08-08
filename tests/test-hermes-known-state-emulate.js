#!/usr/bin/env node
'use strict';

/**
 * Tests for hermes-known-state-emulate (WorkOS @workos/emulate steal).
 */

const assert = require('assert');
const {
  createKnownStateStore,
  startEmulateServer,
  runAllScenarios,
  runScenario,
  DEFAULT_SEED,
  FAULTS,
} = require('../tools/hermes-known-state-emulate');

function test(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      console.log(`PASS ${name}`);
    })
    .catch((err) => {
      console.error(`FAIL ${name}`);
      console.error(err.stack || err.message);
      process.exitCode = 1;
    });
}

async function main() {
  await test('DEFAULT_SEED has machines and pair codes', () => {
    assert.ok(DEFAULT_SEED.machines.length >= 2);
    assert.ok(DEFAULT_SEED.pairCodes.length >= 1);
    assert.ok(FAULTS.rate_limit);
  });

  await test('all named scenarios pass', () => {
    const report = runAllScenarios();
    assert.strictEqual(report.ok, true, JSON.stringify(report.results.filter((r) => !r.ok), null, 2));
    assert.strictEqual(report.passed, report.total);
    assert.ok(report.total >= 8);
  });

  await test('happy pair returns session + machine', () => {
    const store = createKnownStateStore();
    const r = store.redeemPairCode('PAIROK01', { deviceId: 'phone_test' });
    assert.strictEqual(r.ok, true);
    assert.ok(r.session.sessionId);
    assert.strictEqual(r.session.deviceId, 'phone_test');
    assert.strictEqual(r.machine.id, 'mac_pro_primary');
  });

  await test('single-use code cannot be redeemed twice', () => {
    const store = createKnownStateStore();
    assert.strictEqual(store.redeemPairCode('PAIROK01').ok, true);
    const second = store.redeemPairCode('PAIROK01');
    assert.strictEqual(second.ok, false);
    assert.strictEqual(second.error, 'code_consumed');
  });

  await test('mint + redeem custom code', () => {
    const store = createKnownStateStore();
    const minted = store.mintPairCode({ code: 'CUSTOM99', machineId: 'mac_usb_loopback' });
    assert.strictEqual(minted.ok, true);
    const r = store.redeemPairCode('custom99');
    assert.strictEqual(r.ok, true);
    assert.strictEqual(r.machine.transport, 'usb');
  });

  await test('fault injection rate_limit', () => {
    const store = createKnownStateStore({ fault: 'rate_limit' });
    const r = store.redeemPairCode('PAIROK01');
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.httpStatus, 429);
  });

  await test('approval allow / deny', () => {
    const store = createKnownStateStore();
    const allow = store.resolveApproval('act_seed_1', 'allow');
    assert.strictEqual(allow.ok, true);
    assert.strictEqual(allow.approval.status, 'allowed');
    const again = store.resolveApproval('act_seed_1', 'deny');
    assert.strictEqual(again.ok, false);
    assert.strictEqual(again.error, 'already_resolved');
  });

  await test('reset restores known state', () => {
    const store = createKnownStateStore();
    store.redeemPairCode('PAIROK01');
    store.reset();
    const snap = store.snapshot();
    assert.strictEqual(snap.sessions.length, 0);
    assert.strictEqual(snap.pairCodes.find((c) => c.code === 'PAIROK01').consumed, false);
  });

  await test('HTTP serve redeem + health', async () => {
    const store = createKnownStateStore();
    const server = await startEmulateServer(store, { port: 0 });
    try {
      const healthRes = await fetch(`${server.baseUrl}/health`);
      const health = await healthRes.json();
      assert.strictEqual(healthRes.status, 200);
      assert.strictEqual(health.level, 'green');

      const redeemRes = await fetch(`${server.baseUrl}/v1/pair/redeem`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: 'PAIROK01', deviceId: 'http_phone' }),
      });
      const redeem = await redeemRes.json();
      assert.strictEqual(redeemRes.status, 200);
      assert.strictEqual(redeem.ok, true);
      assert.strictEqual(redeem.session.deviceId, 'http_phone');
    } finally {
      await server.close();
    }
  });

  await test('HTTP inject rate limit', async () => {
    const store = createKnownStateStore({ fault: 'rate_limit' });
    const server = await startEmulateServer(store, { port: 0 });
    try {
      const res = await fetch(`${server.baseUrl}/v1/pair/redeem`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: 'PAIROK01' }),
      });
      assert.strictEqual(res.status, 429);
    } finally {
      await server.close();
    }
  });

  await test('runScenario unknown fails closed', () => {
    const r = runScenario('does_not_exist');
    assert.strictEqual(r.ok, false);
  });

  if (process.exitCode) {
    process.exit(process.exitCode);
  }
  console.log('All test-hermes-known-state-emulate tests passed.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
