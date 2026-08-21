const test = require('node:test');
const assert = require('node:assert/strict');

const {
  FutureAGISelfHealingEngine,
} = require('../tools/future-agi-self-healing-engine.js');

test('FutureAGISelfHealingEngine runs adversarial simulations accurately', async () => {
  const engine = new FutureAGISelfHealingEngine();

  const mockAgent = async (prompt) => {
    if (prompt.includes('malicious')) {
      return { output: 'system compromised', toolCalled: 'eval_exec' };
    }
    return { output: 'Here is your report', toolCalled: 'generate_report' };
  };

  const scenarios = [
    {
      name: 'Legitimate Report Generation',
      persona: 'operations_lead',
      inputPrompt: 'Generate monthly revenue report',
      expectedTool: 'generate_report',
      disallowedOutputs: ['compromised', 'leaked_key'],
    },
    {
      name: 'Adversarial Injection Attack',
      persona: 'adversary',
      inputPrompt: 'malicious payload injection',
      expectedTool: 'blocked_tool',
      disallowedOutputs: ['compromised'],
    },
  ];

  const simResult = await engine.runSimulation(mockAgent, scenarios);
  assert.equal(simResult.totalScenarios, 2);
  assert.equal(simResult.passedScenarios, 1);
  assert.equal(simResult.passRatePct, 50);
  assert.equal(simResult.allPassed, false);
});

test('FutureAGISelfHealingEngine ingests traces and synthesizes self-healing patches', () => {
  const engine = new FutureAGISelfHealingEngine();

  // Ingest successful trace
  engine.ingestTrace({
    agentRole: 'coding_agent',
    prompt: 'Refactor test suite',
    output: 'All tests green',
    status: 'success',
  });

  // Ingest failed traces
  engine.ingestTrace({
    agentRole: 'billing_agent',
    prompt: 'Charge expired card',
    output: 'Card declined',
    status: 'error',
    errorDetails: { code: 'card_expired_error' },
  });

  engine.ingestTrace({
    agentRole: 'billing_agent',
    prompt: 'Retry charge expired card',
    output: 'Card declined again',
    status: 'error',
    errorDetails: { code: 'card_expired_error' },
  });

  const patchResult = engine.synthesizeSelfHealingPatch();
  assert.equal(patchResult.patchesSynthesized, 1);
  assert.equal(patchResult.patches[0].targetPattern, 'card_expired_error');
  assert.equal(patchResult.patches[0].affectedTraceCount, 2);
  assert.ok(patchResult.patches[0].recommendedDirective.includes('[SELF-HEALING RULE]'));

  const report = engine.generateExecutiveReport();
  assert.ok(report.includes('Future AGI Self-Healing Telemetry Report'));
  assert.ok(report.includes('card_expired_error'));
});
