#!/usr/bin/env node
/**
 * Test suite for Cloudflare Durable Workflows & CI Self-Healing Engine
 */

const assert = require('node:assert/strict');
const test = require('node:test');
const {
  redactSecrets,
  executeDurableWorkflow,
  runSelfHealingRepair
} = require('../tools/cloudflare_durable_workflow.js');

test('redactSecrets sanitizes API tokens and cloud credentials', () => {
  const dirty = 'Error calling API with bearer sk-123456789012345678901234 and ghp_123456789012345678901234567890';
  const clean = redactSecrets(dirty);
  assert.doesNotMatch(clean, /sk-1234567890/);
  assert.doesNotMatch(clean, /ghp_1234567890/);
  assert.match(clean, /\[REDACTED_SECRET\]/);
});

test('executeDurableWorkflow checkpoints passing steps and captures failure point', async () => {
  const steps = [
    { id: 'step_lint', name: 'Lint', run: async () => ({ clean: true }) },
    { id: 'step_typecheck', name: 'Typecheck', run: async (ctx) => ({ typesOk: true, prev: ctx.step_lint.clean }) },
    {
      id: 'step_flake',
      name: 'Flaky Network',
      run: async () => {
        throw new Error('API timeout bearer sk-9999999999999999999999');
      }
    },
    { id: 'step_deploy', name: 'Deploy', run: async () => ({ deployed: true }) }
  ];

  const result = await executeDurableWorkflow('ci_pipeline', steps, { repo: 'mac-yolo-safeguards' });

  assert.equal(result.success, false);
  assert.deepEqual(result.executedSteps, ['step_lint', 'step_typecheck']);
  assert.equal(result.error.failedStepId, 'step_flake');
  assert.match(result.error.message, /\[REDACTED_SECRET\]/);
  assert.equal(result.checkpoints.step_typecheck.typesOk, true);
});

test('runSelfHealingRepair invokes repair agent and leaves run failed until merged', async () => {
  const failedWorkflow = {
    success: false,
    executedSteps: ['step_lint'],
    error: { failedStepId: 'step_test', message: 'SyntaxError in auth.js' }
  };

  const repairResult = await runSelfHealingRepair(failedWorkflow, async (diag) => {
    assert.equal(diag.failedStep, 'step_test');
    return { patchProposed: true, branch: 'agent/self-heal-auth-fix' };
  });

  assert.equal(repairResult.healed, false); // Must remain unmerged until green checks
  assert.equal(repairResult.details.repairBranch, 'agent/self-heal-auth-fix');
  assert.equal(repairResult.details.patchProposed, true);
});
