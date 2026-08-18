'use strict';

const assert = require('assert');
const {
  MODEL_PRICING,
  DEFAULT_VOICE_AGENT_TEMPLATE,
  calculateConversationCosts,
  simulateConversationTest,
  evaluateThumbgatePreAction,
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

  console.log('✔ Multi-LLM Voice Cost calculation tests passed');
}

// 2. Conversational Simulation Test Harness
console.log('\n--- 2. Testing Conversational Simulation Test Harness ---');
{
  const passResult = simulateConversationTest(DEFAULT_VOICE_AGENT_TEMPLATE);
  assert.strictEqual(passResult.status, 'PASS');
  assert.strictEqual(passResult.testsPassed, passResult.testsRun);
  assert.strictEqual(passResult.agentId, 'hermes_voice_receptionist_v1');

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

  console.log('✔ Conversational Simulation Harness tests passed');
}

// 3. ThumbGate PreToolUse Safety Interdiction Tests
console.log('\n--- 3. Testing ThumbGate Pre-Action Interdiction ---');
{
  // A. Destructive delete without operator approval -> BLOCK
  const deleteBlocked = evaluateThumbgatePreAction({
    action: 'delete_agent',
    agentId: 'prod_receptionist_01',
    isOperatorApproved: false,
  });
  assert.strictEqual(deleteBlocked.decision, 'BLOCK');
  assert.strictEqual(deleteBlocked.interventionType, 'HUMAN_LEASH_REQUIRED');

  // B. Destructive delete with operator approval -> ALLOW
  const deleteAllowed = evaluateThumbgatePreAction({
    action: 'delete_agent',
    agentId: 'prod_receptionist_01',
    isOperatorApproved: true,
  });
  assert.strictEqual(deleteAllowed.decision, 'ALLOW');

  // C. Mutation without simulated test pass -> BLOCK
  const mutationUnverified = evaluateThumbgatePreAction({
    action: 'update_prompt',
    agentId: 'prod_receptionist_01',
    hasSimulatedPass: false,
  });
  assert.strictEqual(mutationUnverified.decision, 'BLOCK');
  assert.strictEqual(mutationUnverified.interventionType, 'SIMULATION_TEST_REQUIRED');

  // D. Mutation with simulated test pass -> ALLOW
  const mutationAllowed = evaluateThumbgatePreAction({
    action: 'update_prompt',
    agentId: 'prod_receptionist_01',
    hasSimulatedPass: true,
    estimatedCostUsd: 0.01,
  });
  assert.strictEqual(mutationAllowed.decision, 'ALLOW');

  // E. Mutation exceeding cost ceiling without approval -> BLOCK
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

  // F. Safe read-only action -> ALLOW
  const readAction = evaluateThumbgatePreAction({
    action: 'get_transcript',
    agentId: 'prod_receptionist_01',
  });
  assert.strictEqual(readAction.decision, 'ALLOW');

  console.log('✔ ThumbGate Pre-Action Interdiction tests passed');
}

console.log('\n=== ALL ELEVENLABS VOICE AGENT TESTS PASSED ===\n');
