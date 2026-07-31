'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const { DurableAgentLoop, defaultStatePath, parseArgs } = require('../tools/durable-agent-loop');

// parseArgs
const parsed = parseArgs(['--run', '--name', 'x', '--interval', '1000', '--max-ticks', '3']);
assert.strictEqual(parsed.run, true);
assert.strictEqual(parsed.name, 'x');
assert.strictEqual(parsed.interval, 1000);
assert.strictEqual(parsed['max-ticks'], 3);

// defaultStatePath contains name
const dsp = defaultStatePath('unit-test');
assert(dsp.includes('durable-agent-loop-unit-test'));

async function runTest() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'durable-loop-'));
  const statePath = path.join(tmpDir, 'state.jsonl');

  let calls = [];
  const loop = new DurableAgentLoop({
    name: 'unit',
    statePath,
    intervalMs: 10,
    maxTicks: 3,
    workFn: ({ tick, idempotencyKey }) => {
      calls.push({ tick, idempotencyKey });
      if (tick === 1) throw new Error('boom');
      return { value: tick * 10 };
    },
  });

  await loop.start();
  while (loop.running) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  assert.strictEqual(calls.length, 3, `expected 3 calls, got ${calls.length}`);
  assert.strictEqual(loop.ticks, 3);
  assert.strictEqual(loop.successes, 2);
  assert.strictEqual(loop.failures, 1);

  assert(fs.existsSync(statePath), 'state file should exist');
  const lines = fs.readFileSync(statePath, 'utf8').trim().split('\n').filter(Boolean);
  assert(lines.length >= 4, 'expected start + 3 checkpoints');
  const checkpoints = lines.map((l) => JSON.parse(l)).filter((r) => r.type === 'checkpoint');
  assert.strictEqual(checkpoints.length, 3);
  assert(checkpoints[2].completedKeys.length >= 2, 'completed keys persisted');

  // Restart from checkpoint: tick 0 already completed, workFn should see tick 3 only (resumes after last tick)
  let restartCalls = [];
  const loop2 = new DurableAgentLoop({
    name: 'unit',
    statePath,
    intervalMs: 10,
    maxTicks: 5,
    workFn: ({ tick, idempotencyKey }) => {
      restartCalls.push({ tick, idempotencyKey });
      return { value: tick * 10 };
    },
  });

  await loop2.start();
  while (loop2.running) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  assert.strictEqual(loop2.ticks, 5, `expected 5 ticks, got ${loop2.ticks}`);
  assert.strictEqual(restartCalls.length, 2, 'only new ticks execute');

  // Idempotency: tick 0 should be skipped on rerun after completion
  const key0 = loop2.makeIdempotencyKey(0);
  assert(loop2.shouldSkipDuplicate(key0), 'tick 0 should be skipped');

  // Failure-rate circuit opens when too many failures occur.
  const loop3 = new DurableAgentLoop({
    name: 'failing',
    statePath: path.join(tmpDir, 'fail.jsonl'),
    intervalMs: 5,
    maxTicks: 10,
    maxFailuresPerWindow: 2,
    failureWindowTicks: 3,
    workFn: () => {
      throw new Error('always fails');
    },
  });
  await loop3.start();
  while (loop3.running) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert(loop3.failureRateExceeded() || loop3.ticks < 10, 'circuit should open or stop early');
  assert(loop3.failures >= 3, `expected >=3 failures, got ${loop3.failures}`);

  fs.rmSync(tmpDir, { recursive: true, force: true });
}

runTest()
  .then(() => {
    console.log('Durable agent loop tests: PASS');
  })
  .catch((error) => {
    console.error('Durable agent loop tests: FAIL', error);
    process.exit(1);
  });
