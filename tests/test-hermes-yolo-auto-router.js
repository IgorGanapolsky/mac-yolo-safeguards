#!/usr/bin/env node
'use strict';

const assert = require('assert');
const {
  autoRoute,
  classifyTaskType,
  evaluateTurnBudgetSetups,
  evaluateHarnessBoard,
  isForbiddenModel,
  rankCandidates,
  TASK_TYPES,
  TRADEOFFS,
} = require('../tools/hermes-yolo-auto-router');

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

test('task types cover product surfaces', () => {
  assert.ok(TASK_TYPES.smoke && TASK_TYPES.code && TASK_TYPES.mobile_pair && TASK_TYPES.gates);
  assert.ok(TRADEOFFS.includes('cheap'));
});

test('classify smoke vs code vs long_context', () => {
  assert.strictEqual(classifyTaskType('Reply with exactly HERMES-YOLO-READY').id, 'smoke');
  assert.strictEqual(classifyTaskType('implement the login form validation').id, 'code');
  assert.strictEqual(classifyTaskType('analyze the whole large-repo multi-file').id, 'long_context');
  assert.strictEqual(classifyTaskType('fix mobile pair USB tailscale').id, 'mobile_pair');
});

test('autoRoute never emits openrouter/auto', () => {
  for (const tradeoff of TRADEOFFS) {
    const r = autoRoute({ task: 'implement auth fix', tradeoff, env: {} });
    assert.strictEqual(r.ok, true, r.message);
    assert.ok(!isForbiddenModel(r.model), r.model);
    assert.ok(!(r.chain || []).some(isForbiddenModel));
    assert.ok(r.turnBudget.turns >= 1);
    assert.strictEqual(r.costQualityTradeoff, tradeoff);
  }
});

test('cheap tradeoff ranks cheaper than quality for code pool', () => {
  const pool = TASK_TYPES.code.pool;
  const cheap = rankCandidates(pool, 'cheap', {});
  const quality = rankCandidates(pool, 'quality', {});
  assert.ok(cheap[0].costRank <= quality[0].costRank);
});

test('smoke defaults to cheap models not grok', () => {
  const r = autoRoute({ task: 'smoke ping hermes-yolo-ready', env: {} });
  assert.notStrictEqual(r.model, 'grok-4.5');
  assert.ok(r.turnBudget.turns <= 2);
});

test('turn budget eval: cost does not track quality (efficiency winner)', () => {
  const board = evaluateTurnBudgetSetups({ turns: [1, 5, 25] });
  assert.strictEqual(board.ok, true);
  assert.strictEqual(board.setups.length, 3);
  assert.ok(board.setups[2].accuracyPct > board.setups[0].accuracyPct);
  assert.strictEqual(board.winners.expensiveIsNotAlwaysBest, true);
});

test('harness board recommends a local tradeoff', () => {
  const board = evaluateHarnessBoard('implement the login form', { env: {} });
  assert.strictEqual(board.ok, true);
  assert.strictEqual(board.rows.length, 3);
  assert.ok(TRADEOFFS.includes(board.recommend.tradeoff));
  assert.ok(!isForbiddenModel(board.recommend.model));
});

test('spend tags include agent and task_type', () => {
  const r = autoRoute({ task: 'fix pair connect', agent: 'grok-agent', env: {} });
  assert.strictEqual(r.spendTags.agent, 'grok-agent');
  assert.ok(r.spendTags.task_type);
  assert.ok(r.spendTags.turns >= 1);
});

if (process.exitCode) process.exit(process.exitCode);
console.log('test-hermes-yolo-auto-router: ok');
