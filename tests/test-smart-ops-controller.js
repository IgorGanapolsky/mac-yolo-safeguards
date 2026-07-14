#!/usr/bin/env node
'use strict';

const assert = require('assert');
const { parseArgs } = require('../tools/smart-ops-controller');

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
});

check('parseArgs force and skips', () => {
  const a = parseArgs(['--force', '--no-revenue', '--json']);
  assert.strictEqual(a.force, true);
  assert.strictEqual(a.revenue, false);
  assert.strictEqual(a.json, true);
});

console.log(`\nPASS ${n}/${n} smart-ops-controller`);
