#!/usr/bin/env node
'use strict';

const assert = require('assert');
const {
  parseArgs,
  nextGsdAction,
  stageCounts,
} = require('../tools/ralph-gsd-loop');

let n = 0;
function check(label, fn) {
  fn();
  n += 1;
  console.log(`  ok - ${label}`);
}

check('parseArgs defaults once mode', () => {
  const a = parseArgs([]);
  assert.strictEqual(a.once, true);
  assert.strictEqual(a.maxCycles, 1);
  assert.strictEqual(a.revenue, true);
  assert.strictEqual(a.ralph, true);
});

check('parseArgs --no-revenue --force-revenue --json', () => {
  const a = parseArgs(['--no-revenue', '--force-revenue', '--json']);
  assert.strictEqual(a.revenue, false);
  assert.strictEqual(a.forceRevenue, true);
  assert.strictEqual(a.json, true);
});

check('parseArgs --loop sets multi-cycle', () => {
  const a = parseArgs(['--loop', '--max-cycles', '3']);
  assert.strictEqual(a.once, false);
  assert.strictEqual(a.maxCycles, 3);
});

check('stageCounts aggregates', () => {
  const c = stageCounts([
    { stage: 'sent' },
    { stage: 'sent' },
    { stage: 'ready' },
    { stage: 'PAID' },
  ]);
  assert.strictEqual(c.sent, 2);
  assert.strictEqual(c.ready, 1);
  assert.strictEqual(c.paid, 1);
});

check('nextGsdAction prioritizes ready sends', () => {
  const a = nextGsdAction({
    pipeline: { counts: { ready: 2, sent: 10 } },
    prs: { behind: 1 },
    stellar: { openItems: ['1.1 ledger'] },
  });
  assert.strictEqual(a, 'send_ready_2');
});

check('nextGsdAction followups when sent zero replies', () => {
  const a = nextGsdAction({
    pipeline: { counts: { sent: 40, replied: 0 } },
    prs: { behind: 0, mergeable: 0, auto: 0 },
    stellar: { openItems: [] },
  });
  assert.strictEqual(a, 'followups_sent_zero_replies');
});

check('nextGsdAction ralph when PRs behind', () => {
  const a = nextGsdAction({
    pipeline: { counts: {} },
    prs: { behind: 3, mergeable: 1, auto: 1 },
    stellar: { openItems: ['x'] },
  });
  assert.strictEqual(a, 'ralph_update_3_behind');
});

console.log(`\n${n} checks passed (ralph-gsd-loop)`);
