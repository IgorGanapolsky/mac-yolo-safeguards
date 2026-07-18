#!/usr/bin/env node
'use strict';

const assert = require('assert');
const { parseArgs } = require('../tools/smart-ops-controller');
const { runTests: runWorkflowObservabilityTests } = require('./test-workflow-observability');

let n = 0;
function check(label, fn) {
  fn();
  n += 1;
  console.log(`  ok - ${label}`);
}

check('parseArgs defaults', () => {
  const a = parseArgs([]);
  assert.strictEqual(a.revenue, true);
  assert.strictEqual(a.heal, true);
  assert.strictEqual(a.force, false);
  assert.strictEqual(a.observability, true);
  assert.strictEqual(a.observabilityNotify, true);
});

check('parseArgs force and skips', () => {
  const a = parseArgs(['--force', '--no-revenue', '--json']);
  assert.strictEqual(a.force, true);
  assert.strictEqual(a.revenue, false);
  assert.strictEqual(a.json, true);
});

check('parseArgs observability skips', () => {
  const a = parseArgs(['--no-observability', '--no-observability-notify']);
  assert.strictEqual(a.observability, false);
  assert.strictEqual(a.observabilityNotify, false);
});

console.log(`\nPASS ${n}/${n} smart-ops-controller`);
runWorkflowObservabilityTests();
