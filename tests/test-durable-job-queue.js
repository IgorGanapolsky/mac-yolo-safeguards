'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { enqueue, claim, complete } = require('../tools/durable-job-queue');

test('enqueue → claim → complete durable lifecycle', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'djq-'));
  const dbPath = path.join(dir, 'jobs.sqlite');
  const enq = enqueue({ dbPath, type: 'index-microbatch', payload: { once: true } });
  assert.equal(enq.ok, true);
  assert.ok(enq.job && enq.job.id);

  const c1 = claim({ dbPath, worker: 'w-test', leaseSec: 60 });
  assert.equal(c1.ok, true);
  assert.ok(c1.job);
  assert.equal(c1.job.type, 'index-microbatch');
  assert.equal(c1.job.locked_by, 'w-test');

  // Second claim finds nothing while leased
  const c2 = claim({ dbPath, worker: 'w-other', leaseSec: 60 });
  assert.equal(c2.job, null);

  const stolen = complete({ dbPath, id: c1.job.id, worker: 'not-owner' });
  assert.equal(stolen.ok, false);

  const done = complete({ dbPath, id: c1.job.id, worker: 'w-test' });
  assert.equal(done.ok, true);
  assert.equal(done.status, 'done');

  const c3 = claim({ dbPath, worker: 'w-test' });
  assert.equal(c3.job, null);
});

test('expired lease can be reclaimed', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'djq-lease-'));
  const dbPath = path.join(dir, 'jobs.sqlite');
  enqueue({ dbPath, type: 'heal', payload: {} });
  const c1 = claim({ dbPath, worker: 'w1', leaseSec: 0 }); // expires immediately-ish
  assert.ok(c1.job);
  // force expired lock
  const { spawnSync } = require('child_process');
  spawnSync('sqlite3', [dbPath, `UPDATE jobs SET locked_until='2000-01-01T00:00:00.000Z' WHERE id=${c1.job.id};`]);
  const c2 = claim({ dbPath, worker: 'w2', leaseSec: 30 });
  assert.ok(c2.job);
  assert.equal(c2.job.locked_by, 'w2');
});
