#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const script = path.join(root, 'tools/agent-decision-stack.js');
const { buildBrief, confusionFromArgs } = require(script);

const TWEET = 'improve our system: https://x.com/sarbjeetjohal/status/2115073742321713223?shem=aimgspe,';

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`ok ${passed} ${name}`);
}

check('a vague task holds before telemetry', () => {
  const brief = buildBrief({ task: 'fix it' });
  assert.equal(brief.confusion.decision, 'hold');
  assert.equal(brief.confusion.confusionScore, 1);
  assert.equal(brief.confusion.axes[0].fired, true);
  assert.deepEqual(brief.telemetry, {});
  assert.equal(brief.governance.reason, 'held by confusion gate');
});

check('the tweet task is concrete and a foreign owner still holds', () => {
  const tweet = confusionFromArgs({ task: TWEET, command: 'git diff' });
  assert.equal(tweet.decision, 'proceed');
  assert.equal(tweet.confusionScore, 0);

  const brief = buildBrief({
    task: 'edit tools/foo.js',
    command: 'git diff',
    path: 'tools/foo.js',
    actor: 'beta',
    claims: [{ path: 'tools/foo.js', owner: 'alpha' }],
  });
  assert.equal(brief.confusion.axes[0].fired, false);
  assert.equal(brief.confusion.axes[1].fired, false);
  assert.equal(brief.confusion.axes[2].fired, true);
  assert.deepEqual(brief.telemetry, {});
});

check('cli holds on a plan owner and does not continue', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'decision-confusion-'));
  const planPath = path.join(dir, 'plan.md');
  fs.writeFileSync(planPath, [
    '| File | Owner | Claimed |',
    '| tools/foo.js | alpha | 2026-10-29T14:16:00Z |',
    '',
  ].join('\n'));
  const held = spawnSync(process.execPath, [
    script,
    '--task', 'edit tools/foo.js',
    '--path', 'tools/foo.js',
    '--actor', 'beta',
    '--command', 'git diff',
    '--plan', planPath,
    '--json',
  ], { encoding: 'utf8' });
  assert.equal(held.status, 1, held.stderr);
  const body = JSON.parse(held.stdout);
  assert.equal(body.confusion.decision, 'hold');
  assert.equal(body.confusion.axes[2].fired, true);
  assert.deepEqual(body.telemetry, {});
  fs.rmSync(dir, { recursive: true, force: true });
});

console.log(`decision-stack-confusion: ${passed} checks passed`);
