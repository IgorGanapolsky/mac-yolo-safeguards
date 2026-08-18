'use strict';

const assert = require('assert');
const { VellumAIEngine } = require('../tools/vellum-ai-engine.js');

console.log('=== Running Vellum.ai Engine Unit Tests ===');

const engine = new VellumAIEngine();

// Test 1: Jinja template rendering
const rendered = engine.renderPrompt('Hello {{ name }}, your order {{ orderId }} is {{ status }}.', {
  name: 'Igor',
  orderId: 'ORD-99',
  status: 'SHIPPED'
});
assert.equal(rendered, 'Hello Igor, your order ORD-99 is SHIPPED.');
console.log('✔ Test 1: Prompt rendering with variables passed');

// Test 2: JSON Schema assertion
const jsonOutput = JSON.stringify({ name: 'Alice', role: 'admin', active: true });
const evalJson = engine.evaluateOutput(jsonOutput, [
  { type: 'JSON_SCHEMA', requiredKeys: ['name', 'role', 'active'] }
]);
assert.equal(evalJson.passed, true);
assert.equal(evalJson.score, 100);
console.log('✔ Test 2: JSON Schema evaluator passed');

// Test 3: Custom Code Evaluator (predicate function)
const evalCode = engine.evaluateOutput('Total spend: $450.00', [
  {
    type: 'CODE_EVAL',
    codePredicate: (txt) => {
      const match = txt.match(/\$([0-9.]+)/);
      return match && parseFloat(match[1]) <= 500;
    }
  }
]);
assert.equal(evalCode.passed, true);
assert.equal(evalCode.score, 100);
console.log('✔ Test 3: Sandboxed Code Evaluator passed');

// Test 4: Compound Workflow Execution
async function testWorkflow() {
  const workflow = {
    name: 'Lead Risk Evaluator',
    steps: [
      {
        id: 'render_step',
        type: 'PROMPT_NODE',
        template: 'Evaluate lead {{ company }} with budget {{ budget }}',
        outputVar: 'assessment',
        mockResponse: () => JSON.stringify({ risk: 'LOW', tier: 'ENTERPRISE', verified: true })
      },
      {
        id: 'code_step',
        type: 'CODE_NODE',
        outputVar: 'formatted',
        transform: (ctx) => {
          const parsed = JSON.parse(ctx.assessment);
          return `Company verified: ${parsed.verified}, Tier: ${parsed.tier}`;
        }
      },
      {
        id: 'eval_step',
        type: 'EVALUATION_NODE',
        targetVar: 'formatted',
        assertions: [
          { type: 'CONTAINS', expected: 'Tier: ENTERPRISE' },
          { type: 'CONTAINS', expected: 'verified: true' }
        ]
      }
    ]
  };

  const res = await engine.executeWorkflow(workflow, {
    company: 'Stripe',
    budget: '$50,000'
  });

  assert.equal(res.success, true);
  assert.equal(res.finalContext.formatted, 'Company verified: true, Tier: ENTERPRISE');
  console.log('✔ Test 4: Compound Workflow DAG execution passed');
}

// Test 5: Fallback handling when VELLUM_API_KEY is not set
async function testFallback() {
  const fallbackRes = await engine.callVellumApi('test-endpoint', { foo: 'bar' });
  assert.equal(fallbackRes.status, 'LOCAL_FALLBACK');
  console.log('✔ Test 5: Local zero-cost fallback passed');
}

(async () => {
  await testWorkflow();
  await testFallback();
  console.log('\nAll Vellum.ai Engine tests passed cleanly!');
})();
