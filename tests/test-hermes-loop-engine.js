#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  RESPONSIBILITY_REGISTRY,
  appendEvent,
  defaultState,
  executableActions,
  nextAction,
  parseArgs,
  saveState,
  validateState,
} = require('../tools/hermes-loop-engine');

function test(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
}

test('responsibility registry separates Hermes, Codex, ThumbGate, and verifier duties', () => {
  const keys = RESPONSIBILITY_REGISTRY.map((entry) => entry.key);
  assert(keys.includes('revenue-orchestrator'));
  assert(keys.includes('codex-fulfillment-worker'));
  assert(keys.includes('thumbgate-boundary'));
  assert(keys.includes('verifier'));
  assert(RESPONSIBILITY_REGISTRY.find((entry) => entry.key === 'codex-fulfillment-worker').forbidden.includes('contact_customer'));
});

test('default state validates and every task has a verifier', () => {
  const state = defaultState();
  const validation = validateState(state);
  assert.strictEqual(validation.ok, true);
  assert(state.tasks.every((task) => task.verifier?.type));
});

test('paid fulfillment is selected before infrastructure work', () => {
  const result = nextAction(defaultState(), { paidCustomerWaiting: true });
  assert.strictEqual(result.selected.task_id, 'fulfill_paid_work');
  assert.strictEqual(result.selected.approval_required, false);
});

test('buyer reply event promotes interested-buyer action with approval gate intact', () => {
  const result = nextAction(defaultState(), {
    eventType: 'NEW_REPLY',
    interestedBuyerWaiting: true,
  });
  assert.strictEqual(result.selected.task_id, 'answer_interested_buyer');
  assert.strictEqual(result.selected.approval_required, true);
  assert.strictEqual(result.selected.owner, 'revenue-orchestrator');
});

test('only five executable actions are emitted', () => {
  const actions = executableActions(defaultState(), { reproducibleBlocker: true }, 5);
  assert(actions.length <= 5);
  assert(actions.every((action) => action.verifier));
  assert(actions.every((action) => typeof action.score === 'number'));
});

test('verification pass closes task and appends evidence', () => {
  const state = appendEvent(defaultState(), {
    type: 'VERIFY_PASS',
    task_id: 'fulfill_paid_work',
    evidence: 'report.md and RESULT.json created',
  });
  const task = state.tasks.find((candidate) => candidate.id === 'fulfill_paid_work');
  assert.strictEqual(task.status, 'done');
  assert(task.evidence.includes('report.md and RESULT.json created'));
});

test('verification failures retry then block at retry limit', () => {
  let state = defaultState();
  state.tasks.find((task) => task.id === 'repair_active_operator_blocker').retry_limit = 1;
  state = appendEvent(state, {
    type: 'VERIFY_FAIL',
    task_id: 'repair_active_operator_blocker',
    evidence: 'gateway smoke failed',
  });
  assert.strictEqual(state.tasks.find((task) => task.id === 'repair_active_operator_blocker').status, 'ready');
  state = appendEvent(state, {
    type: 'VERIFY_FAIL',
    task_id: 'repair_active_operator_blocker',
    evidence: 'gateway smoke failed again',
  });
  const task = state.tasks.find((candidate) => candidate.id === 'repair_active_operator_blocker');
  assert.strictEqual(task.status, 'blocked');
  assert.strictEqual(task.blocker, 'gateway smoke failed again');
});

test('dependencies prevent premature execution', () => {
  const state = defaultState();
  state.tasks.push({
    id: 'dependent_payment',
    lane: 'payment_request',
    status: 'ready',
    owner: 'revenue-orchestrator',
    depends_on: ['fulfill_paid_work'],
    priority: 999,
    revenue_impact: 10,
    urgency: 10,
    next_action: 'should not run until dependency is done',
    verifier: { type: 'provider_truth' },
  });
  const ids = executableActions(state, {}, 10).map((action) => action.task_id);
  assert(!ids.includes('dependent_payment'));
});

test('state can be saved to explicit file without touching repo or secrets', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-loop-engine-'));
  const file = path.join(tmp, 'loop-state.json');
  saveState(defaultState(), file);
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.strictEqual(saved.version, 1);
  assert(saved.tasks.length > 0);
  fs.rmSync(tmp, { recursive: true, force: true });
});

test('argument parser supports event steering', () => {
  const args = parseArgs(['next', '--json', '--event', 'NEW_REPLY', '--buyer']);
  assert.strictEqual(args._[0], 'next');
  assert.strictEqual(args.json, true);
  assert.strictEqual(args.event, 'NEW_REPLY');
  assert.strictEqual(args.buyer, true);
});
