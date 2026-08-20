const test = require('node:test');
const assert = require('node:assert/strict');

const {
  CodexAppServerHarness,
} = require('../tools/codex-app-server-harness.js');

const {
  ReactiveCollection,
  LocalFirstSyncEngine,
} = require('../tools/local-first-sync-engine.js');

// --- 1. OpenAI Codex Platform & App-Server Harness Tests ---

test('CodexAppServerHarness manages threads, safe tools, and consent ladders', async () => {
  const harness = new CodexAppServerHarness();
  const events = [];
  harness.subscribe((evt) => events.push(evt.eventType));

  // Register safe and protected tools
  harness.registerTool({
    name: 'read_metrics',
    requiresApproval: false,
    handler: async () => ({ dailySpendUsd: 0.12, status: 'healthy' }),
  });

  harness.registerTool({
    name: 'cancel_subscription',
    requiresApproval: true,
    handler: async (args) => ({ status: 'cancelled', accountId: args.accountId }),
  });

  // Create thread and start turn
  const thread = harness.createThread({ title: 'Billing Audit' });
  assert.ok(thread.id.startsWith('th_'));

  const turn = await harness.startTurn(thread.id, { prompt: 'Check metrics and cancel sub' });
  assert.ok(turn.id.startsWith('turn_'));

  // 1. Safe tool executes autonomously
  const safeRes = await harness.dispatchTool(thread.id, turn.id, { name: 'read_metrics' });
  assert.equal(safeRes.status, 'completed');
  assert.equal(safeRes.result.status, 'healthy');

  // 2. Consequential tool held in pending_approval
  const blockedRes = await harness.dispatchTool(thread.id, turn.id, {
    name: 'cancel_subscription',
    arguments: { accountId: 'acc_99' },
  });
  assert.equal(blockedRes.status, 'pending_approval');
  assert.ok(blockedRes.approvalId.startsWith('appr_'));

  // 3. Resolve approval -> executes tool
  const resolution = await harness.resolveApproval(blockedRes.approvalId, 'approved', 'Authorized by owner');
  assert.equal(resolution.status, 'approved');
  assert.equal(resolution.executionResult.status, 'cancelled');
  assert.equal(resolution.executionResult.accountId, 'acc_99');

  assert.ok(events.includes('thread/created'));
  assert.ok(events.includes('turn/started'));
  assert.ok(events.includes('approval/requested'));
  assert.ok(events.includes('approval/resolved'));
});

test('CodexAppServerHarness compacts thread turns while retaining reasoning', async () => {
  const harness = new CodexAppServerHarness();
  const thread = harness.createThread({ title: 'Long Investigation' });

  for (let i = 1; i <= 5; i++) {
    const turn = await harness.startTurn(thread.id, { prompt: `Step ${i} of migration` });
    turn.status = 'completed';
  }

  assert.equal(thread.turns.length, 5);
  const compactResult = harness.compactThreadContext(thread.id, 2);
  assert.equal(compactResult.compacted, true);
  assert.equal(compactResult.activeTurns, 3); // 1 summary turn + 2 recent turns
  assert.ok(thread.turns[0].prompt.includes('[Retained Summary of 3 earlier turns]'));
});

// --- 2. Local-First Sync Engine Tests ---

test('LocalFirstSyncEngine handles instant optimistic updates, rollbacks, and joins', () => {
  const engine = new LocalFirstSyncEngine();
  const threads = engine.getCollection('threads');
  const tasks = engine.getCollection('tasks');

  threads.setRow({ id: 'th-1', title: 'Payment Fix' });
  tasks.setRow({ id: 'task-1', threadId: 'th-1', prompt: 'Audit Stripe tokens' });

  // 1. Optimistic write
  let notificationCount = 0;
  tasks.subscribe(() => notificationCount++);

  const opt = tasks.applyOptimistic({ threadId: 'th-1', prompt: 'New optimistic task' });
  assert.equal(opt.optimisticRecord.__isOptimistic, true);
  assert.equal(tasks.query().length, 2);
  assert.ok(notificationCount > 0);

  // 2. Local reactive join across collections
  const joined = engine.join('threads', 'tasks', 'threadId', 'id');
  assert.equal(joined.length, 1);
  assert.equal(joined[0].tasks.length, 2);

  // 3. Confirm transaction
  tasks.confirmTransaction(opt.txId, { id: 'task-2', threadId: 'th-1', prompt: 'New optimistic task (confirmed)' });
  assert.equal(tasks.query().length, 2);
  assert.equal(tasks.query().some((t) => t.__isOptimistic), false);

  // 4. Test rollback on failure
  const badOpt = tasks.applyOptimistic({ threadId: 'th-1', prompt: 'Failing write' });
  assert.equal(tasks.query().length, 3);
  tasks.rollbackTransaction(badOpt.txId);
  assert.equal(tasks.query().length, 2);
});
