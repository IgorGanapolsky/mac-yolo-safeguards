'use strict';

const assert = require('assert');

const {
  ATHENA_CLAIMS,
  CAPABILITIES,
  buildPlan,
  parseArgs,
  render,
} = require('../tools/athena-agent-revenue-gap');

assert.ok(ATHENA_CLAIMS.outcomes.some((outcome) => outcome.includes('qualify leads')));
assert.ok(CAPABILITIES.some((capability) => capability.key === 'call_center_ai_lane'));
assert.strictEqual(parseArgs(['--json']).json, true);
assert.strictEqual(parseArgs(['--fail-on-low']).failOnLow, true);
assert.throws(() => parseArgs(['--unknown']), /Unknown argument/);

const weakPlan = buildPlan({
  repo: '/tmp/missing',
  corpus: [
    {
      relativePath: 'README.md',
      text: 'generic assistant brainstorm with inspirational slogans and no operating evidence',
    },
  ],
});
assert.ok(weakPlan.readiness < 50);
assert.ok(weakPlan.gaps.includes('Voice/support-agent reliability lane'));
assert.ok(weakPlan.positioning.hook.includes('reliability leak'));
assert.ok(render(weakPlan).includes('Athena-Style Agent Revenue Gap'));

const strongCorpus = [
  {
    relativePath: 'docs/REVENUE-OPERATING-PLAN.md',
    text: [
      'qualified buyer outreach-queue prospect-score pipeline-status pipeline-summary',
      'Stripe checkout cleared payment record-cleared-payment',
      'Reliability Diagnostic hardening sprint diagnostic root cause proof artifacts',
      'Telegram Gmail Reddit Skool LinkedIn email DM',
      'revenue-control captured_cents readiness self-harness observability latency cost',
      'self-harness memory-readiness lessons RAG reflection postmortem',
      'Retell VAPI GHL WhatsApp Meta API support automation voice',
    ].join('\n'),
  },
];
const strongPlan = buildPlan({ repo: '/tmp/repo', corpus: strongCorpus });
assert.strictEqual(strongPlan.readiness, 100);
assert.strictEqual(strongPlan.gaps.length, 0);
assert.ok(strongPlan.nextActions.some((action) => action.includes('Do not compete with ConnexAI')));
assert.ok(render(strongPlan).includes('10x more interactions handled'));

console.log('Athena agent revenue gap tests: PASS');
