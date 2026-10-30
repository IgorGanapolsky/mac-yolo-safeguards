#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const script = path.join(root, 'tools/dayglass-screen-budget.js');
const stack = path.join(root, 'tools/agent-decision-stack.js');
const { budget, GRAPH_SLICE_CHARS } = require(script);
const { buildBrief } = require(stack);

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`ok ${passed} ${name}`);
}

const screen = { app_name: 'Ghostty', window_title: 'thumbgate' };
const shop = { app_name: 'Google Chrome', window_title: 'Auctions In Progress | ShopGoodwill.com' };

check('an unchanged window skips the brief', () => {
  const first = budget({ task: 'edit tools/foo.js', screen });
  assert.equal(first.action, 'screen');
  const again = budget({
    task: 'edit tools/foo.js',
    screen,
    previous: { key: first.screen.key, task: 'edit tools/foo.js' },
  });
  assert.equal(again.action, 'skip');
  assert.equal(again.modelCalls, 0);
  assert.equal(again.callModel, false);
  assert.equal(again.contextBytes, 0);
  assert.equal(again.runFullBrief, false);
  assert.equal(again.confusion.decision, 'proceed');
});

check('an unchanged window still holds a foreign file owner', () => {
  const first = budget({ task: 'edit tools/foo.js', screen });
  const held = budget({
    task: 'edit tools/foo.js',
    screen,
    path: 'tools/foo.js',
    actor: 'beta',
    claims: [{ path: 'tools/foo.js', owner: 'alpha' }],
    previous: { key: first.screen.key, task: 'edit tools/foo.js' },
  });
  assert.equal(held.action, 'hold');
  assert.equal(held.callModel, false);
  assert.equal(held.confusion.decision, 'hold');
  assert.equal(held.confusion.axes[2].fired, true);
});

check('a vague task stays held when a window title looks like a file', () => {
  const held = budget({ task: 'fix it', screen: shop });
  assert.equal(held.action, 'hold');
  assert.equal(held.callModel, false);
  assert.equal(held.runFullBrief, false);
  assert.equal(held.confusion.decision, 'hold');
  assert.equal(held.confusion.axes[0].fired, true);
  assert.ok(held.contextBytes > 0);
  assert.ok(held.contextBytes < GRAPH_SLICE_CHARS);
});

check('a concrete task with a window keeps only the window line', () => {
  const longTitle = 'x'.repeat(5000);
  const decided = budget({
    task: 'edit tools/foo.js',
    screen: { app_name: 'Ghostty', window_title: longTitle },
  });
  assert.equal(decided.action, 'screen');
  assert.equal(decided.modelCalls, 0);
  assert.equal(decided.callModel, true);
  assert.equal(decided.runFullBrief, false);
  assert.ok(decided.contextBytes < 500);
  assert.ok(decided.contextBytes < GRAPH_SLICE_CHARS);
  assert.equal(decided.screen.title.length, 180);
  assert.equal(decided.prompt.includes('GRAPHRAG'), false);
  assert.equal(decided.confusion.decision, 'proceed');
});

check('a foreign file owner holds even with a window', () => {
  const held = budget({
    task: 'edit tools/foo.js',
    screen,
    path: 'tools/foo.js',
    actor: 'beta',
    claims: [{ path: 'tools/foo.js', owner: 'alpha' }],
  });
  assert.equal(held.action, 'hold');
  assert.equal(held.confusion.axes[2].fired, true);
  assert.equal(held.runFullBrief, false);
});

check('the decision stack returns that packet before telemetry', () => {
  const brief = buildBrief({
    task: 'edit tools/foo.js',
    screen,
  });
  assert.equal(brief.budget.action, 'screen');
  assert.equal(brief.budget.modelCalls, 0);
  assert.equal(brief.budget.runFullBrief, false);
  assert.deepEqual(brief.telemetry, {});
  assert.deepEqual(brief.rag, {});
  assert.ok(brief.budget.contextBytes < GRAPH_SLICE_CHARS);
});

check('a supplied pattern manifest still blocks a screen brief', () => {
  const manifest = path.join(os.tmpdir(), `screen-budget-manifest-${process.pid}.json`);
  fs.writeFileSync(manifest, '{}\n');
  try {
    const brief = buildBrief({
      task: 'edit tools/foo.js',
      screen,
      patternManifest: manifest,
    });
    assert.equal(brief.patterns.status, 'block');
    assert.equal(brief.patterns.skipped, undefined);
    assert.equal(brief.budget.callModel, false);
    assert.equal(brief.budget.prompt, '');
    assert.deepEqual(brief.telemetry, {});
    assert.deepEqual(brief.rag, {});
    assert.match(brief.recommendation, /BLOCKED by agentic pattern contract/);
  } finally {
    fs.unlinkSync(manifest);
  }
});

check('cli json matches the library', () => {
  const heldPayload = JSON.stringify({
    task: 'fix it',
    screen: shop,
    previous: { key: 'Google Chrome\nAuctions In Progress | ShopGoodwill.com', task: 'fix it' },
  });
  const heldRun = spawnSync(process.execPath, [script, '--json', heldPayload], { encoding: 'utf8' });
  assert.equal(heldRun.status, 1, heldRun.stderr);
  const heldBody = JSON.parse(heldRun.stdout);
  assert.equal(heldBody.action, 'hold');
  assert.equal(heldBody.confusion.decision, 'hold');

  const first = budget({ task: 'edit tools/foo.js', screen });
  const payload = JSON.stringify({
    task: 'edit tools/foo.js',
    screen,
    previous: { key: first.screen.key, task: 'edit tools/foo.js' },
  });
  const run = spawnSync(process.execPath, [script, '--json', payload], { encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  const body = JSON.parse(run.stdout);
  assert.equal(body.action, 'skip');
  assert.equal(body.contextBytes, 0);
  assert.equal(body.confusion.decision, 'proceed');

  const stackRun = spawnSync(process.execPath, [
    stack,
    '--task', 'edit tools/foo.js',
    '--screen', JSON.stringify(screen),
    '--json',
  ], { encoding: 'utf8' });
  assert.equal(stackRun.status, 0, stackRun.stderr);
  const stacked = JSON.parse(stackRun.stdout);
  assert.equal(stacked.budget.action, 'screen');
  assert.deepEqual(stacked.telemetry, {});
  assert.ok(stacked.budget.contextBytes < GRAPH_SLICE_CHARS);
});

console.log(`dayglass-screen-budget: ${passed} checks passed`);
