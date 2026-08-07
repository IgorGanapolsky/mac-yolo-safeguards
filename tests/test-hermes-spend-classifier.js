#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  classifySpend,
  appendReceipt,
  aggregateReceipts,
} = require('../tools/hermes-spend-classifier');

function test(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (err) {
    console.error(`FAIL ${name}`);
    console.error(err.stack || err.message);
    process.exitCode = 1;
  }
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'spend-clf-'));
const receiptPath = path.join(tmp, 'receipts.jsonl');

test('classifySpend tags agent and task_type', () => {
  const r = classifySpend({
    task: 'implement pair fix',
    agent: 'worker-a',
    department: 'mobile',
    env: {},
  });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.tags.agent, 'worker-a');
  assert.strictEqual(r.tags.department, 'mobile');
  assert.ok(r.tags.task_type);
  assert.ok(r.tags.dimensions.by_agent);
  assert.doesNotMatch(JSON.stringify(r), /sk-|password|api_key/i);
});

test('aggregate detects agent volume spike', () => {
  for (let i = 0; i < 8; i += 1) {
    const { tags } = classifySpend({
      task: i < 6 ? 'smoke ping' : 'implement feature',
      agent: i < 6 ? 'noisy-agent' : 'quiet-agent',
      env: {},
    });
    appendReceipt(tags, receiptPath);
  }
  const agg = aggregateReceipts(receiptPath);
  assert.strictEqual(agg.ok, true);
  assert.ok(agg.total >= 8);
  assert.ok(agg.by_agent['noisy-agent'] >= 6);
  assert.ok(agg.spikes.some((s) => s.agent === 'noisy-agent'));
});

test('empty aggregate is ok', () => {
  const emptyPath = path.join(tmp, 'empty.jsonl');
  const agg = aggregateReceipts(emptyPath);
  assert.strictEqual(agg.total, 0);
  assert.deepStrictEqual(agg.spikes, []);
});

try {
  fs.rmSync(tmp, { recursive: true, force: true });
} catch {
  /* ignore */
}

if (process.exitCode) process.exit(process.exitCode);
console.log('test-hermes-spend-classifier: ok');
