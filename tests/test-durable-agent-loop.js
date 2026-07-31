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

  // Checkpoint persistence must reject a directory path (fail closed).
  assert.throws(
    () => {
      const bad = new DurableAgentLoop({
        name: 'bad-dir',
        statePath: tmpDir,
        intervalMs: 10,
        maxTicks: 1,
        workFn: () => ({}),
      });
      bad._appendState({ type: 'should-fail' });
    },
    /Checkpoint persistence failed/,
    'directory statePath should fail closed',
  );

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

  // Watchdog should abort in-flight work; signal is propagated to workFn.
  let abortReceived = false;
  const loopWatchdog = new DurableAgentLoop({
    name: 'watchdog',
    statePath: path.join(tmpDir, 'watchdog.jsonl'),
    intervalMs: 5,
    watchdogTimeoutMs: 30,
    maxTicks: 2,
    workFn: async ({ tick, signal }) => {
      if (tick === 0) {
        await new Promise((resolve, reject) => {
          const iv = setInterval(() => {
            if (signal?.aborted) {
              clearInterval(iv);
              abortReceived = true;
              reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
            }
          }, 1);
        });
      }
      return { value: tick };
    },
  });
  await loopWatchdog.start();
  const wdStart = Date.now();
  while (loopWatchdog.running && Date.now() - wdStart < 2000) {
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert(!loopWatchdog.running, 'watchdog loop should stop after abort');
  assert(abortReceived, 'watchdog should abort in-flight work');
  // The aborted tick should NOT be marked completed.
  const wdLines = fs.readFileSync(loopWatchdog.statePath, 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const abortedRecord = wdLines.find((r) => r.type === 'aborted');
  assert(abortedRecord, 'expected an aborted sentinel in state');
  assert(!wdLines.some((r) => r.type === 'checkpoint' && r.tick === 0), 'tick 0 should not have a completed checkpoint');

  // Failure-rate circuit opens when too many failures occur.
  const loop3 = new DurableAgentLoop({
    name: 'failing',
    statePath: path.join(tmpDir, 'fail.jsonl'),
    intervalMs: 5,
    maxTicks: 10,
    maxFailuresPerWindow: 2,
    failureWindowTicks: 10,
    workFn: () => {
      throw new Error('always fails');
    },
  });
  await loop3.start();
  const failStart = Date.now();
  while (loop3.running && Date.now() - failStart < 5000) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
  assert(!loop3.running, 'loop should have stopped');
  assert(loop3.failureRateExceeded(), 'circuit should open');
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
