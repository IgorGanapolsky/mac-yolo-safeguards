'use strict';

const assert = require('assert');

const {
  DAILY_ACTIONS,
  HARD_METRICS,
  THIRTY_DAY_TEST,
  VANITY_METRICS,
  bottleneckFrom,
  buildBoard,
  parseArgs,
  parseMetricsTsv,
  render,
} = require('../tools/cash-discipline-board');

assert.ok(HARD_METRICS.some((metric) => metric.key === 'external_revenue_collected_usd'));
assert.ok(VANITY_METRICS.includes('agent_runs'));
assert.strictEqual(THIRTY_DAY_TEST.priceUsd, 499);
assert.strictEqual(THIRTY_DAY_TEST.paymentRequestTarget, 5);
assert.ok(DAILY_ACTIONS.some((action) => action.includes('three genuinely matched funded AI integration projects')));
assert.strictEqual(parseArgs(['--json']).json, true);
assert.strictEqual(parseArgs(['--fail-on-vanity']).failOnVanity, true);
assert.throws(() => parseArgs(['--bogus']), /Unknown argument/);

const parsed = parseMetricsTsv([
  'metric\tvalue',
  'qualified_buyer_conversations\t21',
  'scoped_payment_requests\t3',
  'agent_runs\t900',
  '',
].join('\n'));
assert.strictEqual(parsed.qualified_buyer_conversations, 21);
assert.strictEqual(parsed.scoped_payment_requests, 3);
assert.strictEqual(parsed.agent_runs, 900);

assert.strictEqual(bottleneckFrom({}), 'No conversations: fix distribution.');
assert.ok(bottleneckFrom({ qualified_buyer_conversations: 21, scoped_payment_requests: 3 }).includes('too few payment requests'));
assert.ok(bottleneckFrom({ qualified_buyer_conversations: 21, scoped_payment_requests: 5, paid_customers: 0 }).includes('review objections'));

const weakBoard = buildBoard({
  metrics: {
    qualified_buyer_conversations: 0,
    agent_runs: 100,
    rag_queries: 50,
  },
});
assert.ok(weakBoard.readiness < 30);
assert.deepStrictEqual(weakBoard.vanityPresent.sort(), ['agent_runs', 'rag_queries']);
assert.ok(render(weakBoard).includes('Vanity Metrics Ignored'));
assert.ok(render(weakBoard).includes('No conversations: fix distribution.'));

const strongBoard = buildBoard({
  metrics: {
    external_revenue_collected_usd: 499,
    qualified_buyer_conversations: 20,
    scoped_payment_requests: 5,
    paid_customers: 1,
    average_delivery_time_hours: 36,
    gross_margin_pct: 80,
    refunds_disputes_usd: 0,
    mrr_usd: 299,
    personal_cash_runway_weeks: 4,
  },
});
assert.strictEqual(strongBoard.readiness, 100);
assert.strictEqual(strongBoard.vanityPresent.length, 0);
assert.ok(strongBoard.bottleneck.includes('Paid delivery exists'));
assert.ok(render(strongBoard).includes('Cash Discipline Board'));

console.log('Cash discipline board tests: PASS');
