'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const {
  MODEL_PRICING,
  DEFAULT_VOICE_AGENT_TEMPLATE,
  calculateConversationCosts,
  compareModels,
  simulateConversationTest,
  evaluateThumbgatePreAction,
  promoteConfig,
} = require('../tools/elevenlabs-voice-engine.js');

console.log('Running test suite for ElevenLabs Voice Agent & ThumbGate Governance Suite...');

// 1. Pricing Catalog & Cost Calculation Tests
console.log('\n--- 1. Testing Multi-LLM Voice Cost Estimator ---');
{
  assert.ok(MODEL_PRICING['gemini-2.5-flash'], 'Gemini 2.5 Flash must be cataloged');
  assert.ok(MODEL_PRICING['qwen-2.5-72b'], 'Qwen 2.5 72B must be cataloged');
  assert.ok(MODEL_PRICING['glm-5.3'], 'GLM-5.3 must be cataloged');
  assert.ok(MODEL_PRICING['gpt-4o'], 'GPT-4o must be cataloged');
  assert.ok(MODEL_PRICING['claude-3-5-sonnet'], 'Claude 3.5 Sonnet must be cataloged');

  const report = calculateConversationCosts({
    numConversations: 200,
    avgMinutesPerConv: 3.0,
  });

  assert.strictEqual(report.parameters.numConversations, 200);
  assert.strictEqual(report.parameters.totalMinutes, 600);
  assert.strictEqual(report.models.length, Object.keys(MODEL_PRICING).length);
  assert.ok(report.analysis.maxSavingsPercent > 10, 'Savings should be greater than 10%');
  assert.strictEqual(report.analysis.cheapestModel, 'gemini-2.5-flash');

  const cmp = compareModels({
    baseline: 'gpt-4o',
    candidate: 'gemini-2.5-flash',
    numConversations: 100,
    avgMinutesPerConv: 3,
  });
  assert.ok(cmp.deltaCostPerConversationUsd < 0, 'Flash should be cheaper than GPT-4o');
  assert.ok(cmp.recommendation.includes('gemini-2.5-flash'));

  console.log('✔ Multi-LLM Voice Cost calculation tests passed');
}

// 2. Conversational Simulation Test Harness
console.log('\n--- 2. Testing Conversational Simulation Test Harness ---');
{
  const passResult = simulateConversationTest(DEFAULT_VOICE_AGENT_TEMPLATE);
  assert.strictEqual(passResult.status, 'PASS');
  assert.strictEqual(passResult.testsPassed, passResult.testsRun);
  assert.strictEqual(passResult.agentId, 'hermes_voice_receptionist_v1');
  assert.ok(
    passResult.testCases.some((t) => t.name === 'Billing Dispute Escalation Retained' && t.passed),
    'Default template must retain billing escalation'
  );

  // Failing test: empty prompt and unrecognized LLM
  const badConfig = {
    agentId: 'broken_voice_bot',
    conversationConfig: {
      agent: {
        prompt: { prompt: '', llm: 'fake-unsupported-model' },
        firstMessage: '',
      },
    },
  };
  const failResult = simulateConversationTest(badConfig);
  assert.strictEqual(failResult.status, 'FAIL');
  assert.ok(failResult.testsPassed < failResult.testsRun);

  // TNS regression: trimmed prompt drops billing escalation → FAIL
  const trimmed = JSON.parse(JSON.stringify(DEFAULT_VOICE_AGENT_TEMPLATE));
  trimmed.conversationConfig.agent.prompt.prompt =
    'You are Hermes. Be concise in 1-2 sentences. Confirm risky commands on phone screen.';
  const trimmedResult = simulateConversationTest(trimmed);
  assert.strictEqual(trimmedResult.status, 'FAIL');
  const billingCase = trimmedResult.testCases.find(
    (t) => t.name === 'Billing Dispute Escalation Retained'
  );
  assert.ok(billingCase && billingCase.passed === false);

  console.log('✔ Conversational Simulation Harness tests passed');
}

// 3. ThumbGate PreToolUse Safety Interdiction Tests
console.log('\n--- 3. Testing ThumbGate Pre-Action Interdiction ---');
{
  const deleteBlocked = evaluateThumbgatePreAction({
    action: 'delete_agent',
    agentId: 'prod_receptionist_01',
    isOperatorApproved: false,
  });
  assert.strictEqual(deleteBlocked.decision, 'BLOCK');
  assert.strictEqual(deleteBlocked.interventionType, 'HUMAN_LEASH_REQUIRED');

  const deleteAllowed = evaluateThumbgatePreAction({
    action: 'delete_agent',
    agentId: 'prod_receptionist_01',
    isOperatorApproved: true,
  });
  assert.strictEqual(deleteAllowed.decision, 'ALLOW');

  const mutationUnverified = evaluateThumbgatePreAction({
    action: 'update_prompt',
    agentId: 'prod_receptionist_01',
    hasSimulatedPass: false,
  });
  assert.strictEqual(mutationUnverified.decision, 'BLOCK');
  assert.strictEqual(mutationUnverified.interventionType, 'SIMULATION_TEST_REQUIRED');

  const mutationAllowed = evaluateThumbgatePreAction({
    action: 'update_prompt',
    agentId: 'prod_receptionist_01',
    hasSimulatedPass: true,
    estimatedCostUsd: 0.01,
  });
  assert.strictEqual(mutationAllowed.decision, 'ALLOW');

  const expensiveMutation = evaluateThumbgatePreAction({
    action: 'swap_model',
    agentId: 'prod_receptionist_01',
    hasSimulatedPass: true,
    estimatedCostUsd: 0.12,
    costCeilingUsd: 0.05,
    isOperatorApproved: false,
  });
  assert.strictEqual(expensiveMutation.decision, 'BLOCK');
  assert.strictEqual(expensiveMutation.interventionType, 'COST_CEILING_EXCEEDED');

  const readAction = evaluateThumbgatePreAction({
    action: 'get_transcript',
    agentId: 'prod_receptionist_01',
  });
  assert.strictEqual(readAction.decision, 'ALLOW');

  console.log('✔ ThumbGate Pre-Action Interdiction tests passed');
}

// 4. Atomic promote path (simulate → cost → gate)
console.log('\n--- 4. Testing Atomic Promote Path ---');
{
  const good = promoteConfig(DEFAULT_VOICE_AGENT_TEMPLATE, { dryRun: true });
  assert.strictEqual(good.promotable, true);
  assert.strictEqual(good.deployAction, 'WOULD_PUSH_CONFIG');
  assert.strictEqual(good.simulation.status, 'PASS');
  assert.strictEqual(good.gate.decision, 'ALLOW');

  const bad = JSON.parse(JSON.stringify(DEFAULT_VOICE_AGENT_TEMPLATE));
  bad.conversationConfig.agent.prompt.prompt = 'Be brief.';
  const held = promoteConfig(bad, { dryRun: true });
  assert.strictEqual(held.promotable, false);
  assert.strictEqual(held.deployAction, 'HOLD');
  assert.strictEqual(held.simulation.status, 'FAIL');

  const expensive = JSON.parse(JSON.stringify(DEFAULT_VOICE_AGENT_TEMPLATE));
  expensive.conversationConfig.agent.prompt.llm = 'claude-3-5-sonnet';
  expensive.conversationConfig.safetyGuardrails.maxCostPerConversationUsd = 0.001;
  const costHeld = promoteConfig(expensive, { dryRun: true });
  assert.strictEqual(costHeld.promotable, false);
  assert.strictEqual(costHeld.gate.interventionType, 'COST_CEILING_EXCEEDED');

  console.log('✔ Atomic promote path tests passed');
}

// 5. CLI smoke (Python engine via bin/eleven-voice)
console.log('\n--- 5. Testing CLI smoke (bin/eleven-voice) ---');
{
  const bin = path.join(__dirname, '..', 'bin', 'eleven-voice');
  assert.ok(fs.existsSync(bin), 'bin/eleven-voice must exist');

  const gate = spawnSync('bash', [bin, 'gate-check', '--action', 'delete_agent', '--agent-id', 'cli_demo'], {
    encoding: 'utf8',
  });
  assert.notStrictEqual(gate.status, 0, 'delete without approval must exit non-zero');
  assert.ok(gate.stdout.includes('BLOCK'), gate.stdout);

  const cmp = spawnSync(
    'bash',
    [bin, 'compare-models', '--baseline', 'gpt-4o', '--candidate', 'gemini-2.5-flash', '--json'],
    { encoding: 'utf8' }
  );
  assert.strictEqual(cmp.status, 0, cmp.stderr);
  const cmpJson = JSON.parse(cmp.stdout);
  assert.ok(cmpJson.delta_cost_per_conversation_usd < 0);

  const promote = spawnSync('bash', [bin, 'promote', '--json'], { encoding: 'utf8' });
  assert.strictEqual(promote.status, 0, promote.stderr);
  const receipt = JSON.parse(promote.stdout);
  assert.strictEqual(receipt.promotable, true);
  assert.strictEqual(receipt.dry_run, true);

  const sampleBad = path.join(__dirname, '..', 'config', 'voice-agents', 'trimmed-no-billing.json');
  if (fs.existsSync(sampleBad)) {
    const badPromote = spawnSync('bash', [bin, 'promote', '--config', sampleBad, '--json'], {
      encoding: 'utf8',
    });
    assert.notStrictEqual(badPromote.status, 0);
    const badReceipt = JSON.parse(badPromote.stdout);
    assert.strictEqual(badReceipt.promotable, false);
  }

  console.log('✔ CLI smoke tests passed');
}

console.log('\n=== ALL ELEVENLABS VOICE AGENT TESTS PASSED ===\n');
