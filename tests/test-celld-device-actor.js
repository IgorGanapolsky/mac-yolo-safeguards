#!/usr/bin/env node
'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { CelldDeviceActor } = require('../tools/lib/celld-device-actor');
const { CelldClusterManager } = require('../tools/celld-runner-harness');

test('Celld Stateful Durable Object Device Actor — Unit & Benchmark Suite', async (t) => {
  await t.test('Actor initializes and reports online status', () => {
    const actor = new CelldDeviceActor('device-mac-mini', 'org_1', "Igor's Mac mini");
    const status = actor.getStatus();
    assert.equal(status.deviceId, 'device-mac-mini');
    assert.equal(status.status, 'online');
    assert.equal(status.activeLeasesCount, 0);
  });

  await t.test('Celld co-located storage primitives function as expected', async () => {
    const actor = new CelldDeviceActor('device-1', 'org_1', 'Mac');
    await actor.put('user_preference', { mode: 'auto-failover' });
    const pref = await actor.get('user_preference');
    assert.deepEqual(pref, { mode: 'auto-failover' });

    const deleted = await actor.delete('user_preference');
    assert.equal(deleted, true);
    const missing = await actor.get('user_preference');
    assert.equal(missing, undefined);
  });

  await t.test('CAS task lease claims and completion enforce owner tokens and generation increments', () => {
    const actor = new CelldDeviceActor('device-1', 'org_1', 'Mac');
    const lease = actor.claimTask('task-101', 'device:device-1', 90_000, 1000);
    assert.ok(lease);
    assert.equal(lease.taskId, 'task-101');
    assert.equal(lease.leaseGeneration, 1);

    // Second claim on same active task by another owner fails
    const blocked = actor.claimTask('task-101', 'device:other-device', 90_000, 1050);
    assert.equal(blocked, null);

    // Completion with wrong lease token fails
    const badComplete = actor.completeTask('task-101', 'device:device-1', 'invalid-token', 1100);
    assert.equal(badComplete, false);

    // Completion with correct lease token succeeds
    const okComplete = actor.completeTask('task-101', 'device:device-1', lease.leaseToken, 1100);
    assert.equal(okComplete, true);
  });

  await t.test('Purging stale leases releases expired tasks', () => {
    const actor = new CelldDeviceActor('device-1', 'org_1', 'Mac');
    actor.claimTask('stale-task', 'device:device-1', 5000, 1000); // expires at 6000
    assert.equal(actor.getStatus().activeLeasesCount, 1);

    const purgedAt5000 = actor.purgeStaleLeases(5500);
    assert.equal(purgedAt5000, 0);

    const purgedAt7000 = actor.purgeStaleLeases(7000);
    assert.equal(purgedAt7000, 1);
    assert.equal(actor.getStatus().activeLeasesCount, 0);
  });

  await t.test('CelldClusterManager benchmark runs 100 tasks cleanly', () => {
    const manager = new CelldClusterManager();
    const result = manager.benchmark(100);
    assert.equal(result.totalTasks, 100);
    assert.equal(result.claimsSuccessful, 100);
    assert.ok(result.opsPerSec >= 100);
  });
});
