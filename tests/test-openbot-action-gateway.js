'use strict';

const assert = require('assert');
const { OpenBotActionGateway } = require('../tools/openbot-action-gateway');

async function runTests() {
  console.log('=== Running OpenBot AG-UI Action Gateway & Per-Agent Sandbox Tests ===\n');

  const gateway = new OpenBotActionGateway({ workspaceId: 'ws_prod_01' });

  // 1. Policy Evaluation Test (Allow / Ask / Deny)
  const benign = gateway.evaluateAction({
    tool: 'file_read',
    command: 'view_file',
    params: { path: '/app/package.json' },
  });
  assert.strictEqual(benign.decision, 'allow', 'Benign file read allowed');

  const askMoney = gateway.evaluateAction({
    tool: 'stripe_api',
    command: 'create_payment_charge',
    params: { amount: 3000, customer: 'cus_123' },
  });
  assert.strictEqual(askMoney.decision, 'ask', 'Stripe payment paused for human approval');
  assert.strictEqual(askMoney.requiresHumanApproval, true);

  const deniedDestructive = gateway.evaluateAction({
    tool: 'bash',
    command: 'rm -rf /',
    params: { recursive: true },
  });
  assert.strictEqual(deniedDestructive.decision, 'deny', 'Destructive command blocked');
  console.log('PASS [1/5]: Action Gateway Deterministic Policy Evaluation (Allow/Ask/Deny)');

  // 2. Parameter & Secret Scrubbing Test
  const scrubbed = gateway.scrubParameters({
    apiKey: 'sk-live-993842938492834',
    service: 'openai',
    nested: { secretToken: 'ghp_992384729384234' },
  });
  assert.strictEqual(scrubbed.apiKey, '[REDACTED_BY_OPENBOT_GATEWAY]');
  assert.strictEqual(scrubbed.nested.secretToken, '[REDACTED_BY_OPENBOT_GATEWAY]');
  assert.strictEqual(scrubbed.service, 'openai');
  console.log('PASS [2/5]: Parameter & Secret Redaction Scrubbing');

  // 3. Per-Agent Coworker Sandbox Provisioning Test
  const sandbox = gateway.provisionAgentSandbox('digital_worker_chief', { leaseDurationSec: 90 });
  assert.ok(sandbox.sandboxId.startsWith('sbx_digital_worker_chief_'), 'Sandbox ID generated');
  assert.strictEqual(sandbox.active, true);
  assert.strictEqual(sandbox.state, 'ISOLATED_AND_FENCED');
  console.log('PASS [3/5]: Per-Agent Coworker Sandbox Isolation');

  // 4. AG-UI Protocol Execution with Audit Receipts Test
  const allowedExec = await gateway.executeWithGateway({
    tool: 'git_status',
    command: 'git status --short',
  }, () => ({ modified: 0 }));
  assert.strictEqual(allowedExec.success, true);
  assert.strictEqual(allowedExec.receipt.status, 'COMPLETED');
  assert.ok(allowedExec.receipt.actionId.startsWith('act_'));

  const deniedExec = await gateway.executeWithGateway({
    tool: 'bash',
    command: 'drop table users',
  });
  assert.strictEqual(deniedExec.success, false);
  assert.strictEqual(deniedExec.receipt.status, 'INTERDICTED');
  console.log('PASS [4/5]: AG-UI Audit Receipt Generation & Fail-Closed Enforcement');

  // 5. Human-in-the-Loop 2FA / Intervention Approval Test
  const pausedExec = await gateway.executeWithGateway({
    tool: 'stripe_api',
    command: 'charge customer retainers',
  });
  assert.strictEqual(pausedExec.requiresHumanApproval, true);
  assert.ok(pausedExec.interventionId.startsWith('act_'));

  const resolved = gateway.resolveIntervention(pausedExec.interventionId, 'approve', { operator: 'igor' });
  assert.strictEqual(resolved.status, 'APPROVED_BY_HUMAN');
  console.log('PASS [5/5]: Human-in-the-Loop Interdiction & Live Override');

  console.log('\n=== All 5 OpenBot Action Gateway Tests Passed (100% Green) ===');
}

runTests().catch((err) => {
  console.error(err);
  process.exit(1);
});
