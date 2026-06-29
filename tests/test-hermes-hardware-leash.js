#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const {
  buildSnapshot,
  createHardwareLeashServer,
  normalizeButton,
  normalizeHardwareEvent,
  rankHardwareActions,
  signHardwareEvent,
  verifyHardwareEvent,
} = require('../tools/hermes-hardware-leash');

async function test(name, fn) {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
}

function postJson(port, pathname, payload) {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify(payload);
    const request = http.request({
      hostname: '127.0.0.1',
      port,
      path: pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(body),
      },
    }, (response) => {
      let raw = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => { raw += chunk; });
      response.on('end', () => resolve({
        statusCode: response.statusCode,
        body: JSON.parse(raw || '{}'),
      }));
    });
    request.on('error', reject);
    request.end(body);
  });
}

(async () => {
  await test('normalizes M5Stack button aliases', () => {
    assert.strictEqual(normalizeButton('thumbs up'), 'approve');
    assert.strictEqual(normalizeButton('RED'), 'deny');
    assert.strictEqual(normalizeButton('panic'), 'pause');
    assert.strictEqual(normalizeButton('unpause'), 'resume');
  });

  await test('approve events require a ThumbGate action id', () => {
    assert.throws(
      () => normalizeHardwareEvent({ deviceId: 'Desk Core2', button: 'approve' }),
      /requires action_id/,
    );
  });

  await test('pause events are global operator controls and still require ThumbGate', () => {
    const event = normalizeHardwareEvent({ deviceId: 'Desk Core2', button: 'pause' });
    assert.strictEqual(event.event_type, 'hermes.operator_control');
    assert.strictEqual(event.control, 'pause_outbound_and_new_jobs');
    assert.strictEqual(event.scope, 'all_macs');
    assert.strictEqual(event.requires_thumbgate, true);
  });

  await test('signed events verify and tampered events fail', () => {
    const secret = 'unit-test-secret-not-real';
    const event = normalizeHardwareEvent({
      deviceId: 'Desk Core2',
      button: 'approve',
      actionId: 'gate_123',
      note: 'looks scoped',
    });
    const signed = signHardwareEvent(event, secret);
    assert.strictEqual(verifyHardwareEvent(signed, secret).ok, true);
    assert.strictEqual(
      verifyHardwareEvent({ ...signed, action_id: 'gate_tampered' }, secret).reason,
      'signature_mismatch',
    );
  });

  await test('old events are rejected by replay window', () => {
    const secret = 'unit-test-secret-not-real';
    const event = normalizeHardwareEvent({
      deviceId: 'Desk Core2',
      button: 'deny',
      actionId: 'gate_456',
    }, { now: new Date('2026-06-29T00:00:00.000Z') });
    const signed = signHardwareEvent(event, secret);
    const verified = verifyHardwareEvent(signed, secret, {
      now: '2026-06-29T00:20:00.000Z',
      replayWindowSeconds: 300,
    });
    assert.strictEqual(verified.reason, 'timestamp_outside_replay_window');
  });

  await test('snapshot exposes high ROI hardware use cases for all-Mac Hermes', async () => {
    const snapshot = await buildSnapshot({
      probe: false,
      config: {
        machines: [
          { id: 'mac-mini', label: 'Mac mini', online: true },
          { id: 'mac-pro', label: 'Mac Pro', online: false },
        ],
        thumbgate: {
          pending_cards: [{ action_id: 'gate_789', title: 'Deploy approval' }],
        },
      },
    });
    assert.strictEqual(snapshot.fleet.total_count, 2);
    assert.strictEqual(snapshot.fleet.online_count, 1);
    assert.strictEqual(snapshot.thumbgate.pending_count, 1);
    assert.strictEqual(snapshot.display.color, 'amber');
    const actionIds = snapshot.actions.map((action) => action.id);
    assert.deepStrictEqual(actionIds.slice(0, 3), [
      'physical_thumbgate_decision',
      'panic_pause_outbound',
      'fleet_heartbeat_panel',
    ]);
  });

  await test('local HTTP endpoint accepts only verified hardware events', async () => {
    const secret = 'unit-test-secret-not-real';
    const logPath = path.join(os.tmpdir(), `hermes-hardware-leash-${Date.now()}.jsonl`);
    const server = createHardwareLeashServer({ secret, logPath });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = server.address().port;
    try {
      const event = signHardwareEvent(normalizeHardwareEvent({
        deviceId: 'Desk Core2',
        button: 'approve',
        actionId: 'gate_http',
      }), secret);
      const accepted = await postJson(port, '/event', event);
      assert.strictEqual(accepted.statusCode, 202);
      assert.strictEqual(accepted.body.event_id, event.event_id);
      const rejected = await postJson(port, '/event', { ...event, button: 'deny' });
      assert.strictEqual(rejected.statusCode, 401);
      const lines = fs.readFileSync(logPath, 'utf8').trim().split(/\n/);
      assert.strictEqual(lines.length, 1);
      assert.strictEqual(JSON.parse(lines[0]).event.event_id, event.event_id);
    } finally {
      server.close();
      fs.rmSync(logPath, { force: true });
    }
  });

  await test('ranked actions include revenue and E2E alerts without executing side effects', () => {
    const actions = rankHardwareActions({ thumbgate: { pending_count: 0 }, fleet: { machines: [] } });
    assert(actions.some((action) => action.id === 'payment_and_revenue_alert'));
    assert(actions.some((action) => action.id === 'ci_and_e2e_failure_alert'));
    for (const action of actions) {
      assert(!action.exec);
      assert(!action.command);
    }
  });
})();
