const test = require('node:test');
const assert = require('node:assert/strict');

const {
  NVIDIASkillEvaluator,
} = require('../tools/nvidia-skill-evaluator.js');

const {
  STEP_SPECIALISTS,
  NVIDIANeMoSwitchyard,
} = require('../tools/nvidia-nemo-switchyard.js');

// --- 1. NVIDIA SkillEvaluator Tests ---

test('NVIDIASkillEvaluator computes accurate precision, recall, and token density', () => {
  const evaluator = new NVIDIASkillEvaluator();

  const sampleSkill = {
    name: 'test-db-repair',
    triggers: ['database corrupt', 'sqlite lock', 'db repair'],
    description: 'Diagnose and resolve sqlite locks and database corruption',
    instructions: '# Quick runbook for repairing locked sqlite database...',
    targetToolCalls: 2,
  };

  const queries = [
    { query: 'How to fix a database corrupt issue?', shouldTrigger: true },
    { query: 'Handling sqlite lock contention in production', shouldTrigger: true },
    { query: 'What is the pricing for Stripe?', shouldTrigger: false },
    { query: 'Write a poem about the beach', shouldTrigger: false },
  ];

  const existingSkills = [
    { name: 'stripe-billing', triggers: ['stripe', 'checkout'] },
  ];

  const evalResult = evaluator.evaluateSkill(sampleSkill, queries, existingSkills);
  assert.equal(evalResult.skillName, 'test-db-repair');
  assert.equal(evalResult.metrics.precision, 1.0);
  assert.equal(evalResult.metrics.recall, 1.0);
  assert.equal(evalResult.metrics.f1Score, 1.0);
  assert.equal(evalResult.metrics.densityGrade, 'optimal');
  assert.equal(evalResult.collisions.length, 0);
  assert.equal(evalResult.passedEvaluation, true);

  const report = evaluator.generateEvaluationReport(evalResult);
  assert.ok(report.includes('NVIDIA SkillEvaluator Performance Receipt'));
  assert.ok(report.includes('PASSED'));
});

test('NVIDIASkillEvaluator detects trigger collisions and bloated instructions', () => {
  const evaluator = new NVIDIASkillEvaluator();

  const bloatedSkill = {
    name: 'bloated-skill',
    triggers: ['billing', 'invoice'],
    description: 'Bloated billing skill',
    instructions: 'A'.repeat(15000), // ~3750 tokens -> bloated
    targetToolCalls: 4,
  };

  const existingSkills = [
    { name: 'stripe-agency-billing', triggers: ['billing', 'stripe'] },
  ];

  const evalResult = evaluator.evaluateSkill(bloatedSkill, [], existingSkills);
  assert.equal(evalResult.metrics.densityGrade, 'bloated');
  assert.equal(evalResult.collisions.length, 1);
  assert.equal(evalResult.collisions[0].collidingSkill, 'stripe-agency-billing');
  assert.equal(evalResult.passedEvaluation, false);
});

// --- 2. NVIDIA NeMo Switchyard Tests ---

test('NVIDIANeMoSwitchyard routes agent steps to specialist models with high savings', () => {
  const switchyard = new NVIDIANeMoSwitchyard();

  // 1. Planning Step -> High Reasoner
  const planStep = switchyard.routeStep('planning_and_architecture', { tokenCount: 4000 });
  assert.equal(planStep.selectedModel, 'qwen-3-8-max-reasoner');
  assert.ok(planStep.savingsVsFrontierPct > 70);
  assert.ok(planStep.latencySpeedupPct > 40);

  // 2. Tool Execution Step -> Nemotron 3.5 Lightning (250 TPS, low cost)
  const toolStep = switchyard.routeStep('tool_execution_and_dispatch', { tokenCount: 2000 });
  assert.equal(toolStep.selectedModel, 'nemotron-3-5-lightning');
  assert.ok(toolStep.savingsVsFrontierPct >= 95);
  assert.ok(toolStep.latencySpeedupPct >= 80);

  // 3. Validation Step -> Zero-Cost Local
  const valStep = switchyard.routeStep('result_validation_and_assertion', { tokenCount: 1500 });
  assert.equal(valStep.selectedModel, 'ollama-local-qwen38');
  assert.equal(valStep.estimatedSpendUsd, 0.00);

  // 4. Session Telemetry
  const telemetry = switchyard.getSessionTelemetry();
  assert.equal(telemetry.totalSteps, 3);
  assert.ok(telemetry.averageCostSavingsPct >= 80);
  assert.ok(telemetry.averageLatencyMs < 600);
});
