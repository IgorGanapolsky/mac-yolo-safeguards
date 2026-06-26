#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const HARD_METRICS = [
  { key: 'external_revenue_collected_usd', label: 'External revenue collected', target: 1, direction: 'gte' },
  { key: 'qualified_buyer_conversations', label: 'Qualified buyer conversations', target: 20, direction: 'gte' },
  { key: 'scoped_payment_requests', label: 'Correctly scoped payment requests', target: 5, direction: 'gte' },
  { key: 'paid_customers', label: 'Paid customers', target: 1, direction: 'gte' },
  { key: 'average_delivery_time_hours', label: 'Average delivery time', target: 48, direction: 'lte' },
  { key: 'gross_margin_pct', label: 'Gross margin', target: 50, direction: 'gte' },
  { key: 'refunds_disputes_usd', label: 'Refunds and disputes', target: 0, direction: 'lte' },
  { key: 'mrr_usd', label: 'Monthly recurring revenue', target: 1, direction: 'gte' },
  { key: 'personal_cash_runway_weeks', label: 'Personal cash runway', target: 4, direction: 'gte' },
];

const VANITY_METRICS = [
  'agent_runs',
  'rag_queries',
  'leads_found_not_contacted',
  'drafts_generated',
  'audits_created_not_purchased',
  'telegram_alerts',
  'next_dollar_scores',
  'workflow_improvements',
];

const DAILY_ACTIONS = [
  'Apply to three genuinely matched funded AI integration projects.',
  'Contact five people publicly reporting agent or automation failures.',
  'Follow up with every warm conversation.',
  'Make at least one explicit paid offer when scope and proof are matched.',
  'Fulfill paid work before infrastructure work.',
  'Cancel or flag one nonessential recurring expense unless a paying customer requires it.',
];

const THIRTY_DAY_TEST = {
  offer: 'AI Automation Workflow Reliability Diagnostic',
  priceUsd: 499,
  qualifiedConversationTarget: 20,
  paymentRequestTarget: 5,
  maxDays: 30,
  noNewProducts: true,
  triageOfferLocked: 'Do not introduce $99 failure triage until the $499 offer has had 20 qualified conversations and 5 payment requests.',
};

function parseArgs(argv) {
  const args = {
    metrics: '',
    json: false,
    failOnVanity: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--metrics') args.metrics = requireValue(argv, ++i, arg);
    else if (arg === '--json') args.json = true;
    else if (arg === '--fail-on-vanity') args.failOnVanity = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function requireValue(argv, index, flag) {
  if (!argv[index]) throw new Error(`${flag} requires a value`);
  return argv[index];
}

function parseMetricsTsv(text) {
  const metrics = {};
  const lines = text.split(/\r?\n/).filter((line) => line.trim() && !line.trim().startsWith('#'));
  const start = /^metric\tvalue(?:\t|$)/i.test(lines[0] || '') ? 1 : 0;
  for (let i = start; i < lines.length; i += 1) {
    const [rawKey, rawValue] = lines[i].split('\t');
    if (!rawKey) continue;
    const value = Number(rawValue);
    metrics[rawKey.trim()] = Number.isFinite(value) ? value : rawValue?.trim();
  }
  return metrics;
}

function loadMetrics(metricsPath) {
  if (!metricsPath) return {};
  const abs = path.resolve(metricsPath);
  const text = fs.readFileSync(abs, 'utf8');
  if (abs.endsWith('.json')) return JSON.parse(text);
  return parseMetricsTsv(text);
}

function evaluateMetric(metric, value) {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return { ...metric, value: null, status: 'missing', pass: false };
  }
  const pass = metric.direction === 'gte' ? value >= metric.target : value <= metric.target;
  return { ...metric, value, status: pass ? 'pass' : 'gap', pass };
}

function bottleneckFrom(metrics) {
  const conversations = Number(metrics.qualified_buyer_conversations || 0);
  const paymentRequests = Number(metrics.scoped_payment_requests || 0);
  const paidCustomers = Number(metrics.paid_customers || 0);
  const deliveryHours = Number(metrics.average_delivery_time_hours || 0);

  if (conversations <= 0) return 'No conversations: fix distribution.';
  if (conversations < THIRTY_DAY_TEST.qualifiedConversationTarget) return 'Too few qualified conversations: increase targeted approaches and funded contract proposals.';
  if (paymentRequests < THIRTY_DAY_TEST.paymentRequestTarget) return 'Conversations but too few payment requests: fix trust, sample proof, scope, or price confidence.';
  if (paidCustomers <= 0) return 'Payment requests but no buyers: review objections before changing the offer.';
  if (deliveryHours > 48) return 'Payments but slow delivery: narrow fulfillment and protect margin.';
  return 'Paid delivery exists: improve handoff, testimonial, referral, repair sprint, and monitoring upsell.';
}

function buildBoard(options = {}) {
  const metrics = options.metrics || loadMetrics(options.metricsPath || '');
  const hard = HARD_METRICS.map((metric) => evaluateMetric(metric, metrics[metric.key]));
  const vanityPresent = VANITY_METRICS.filter((key) => Object.prototype.hasOwnProperty.call(metrics, key));
  const passedHardCount = hard.filter((item) => item.pass).length;
  const missingHardCount = hard.filter((item) => item.status === 'missing').length;
  const readiness = Math.round((passedHardCount / HARD_METRICS.length) * 100);

  return {
    checkedAt: new Date().toISOString(),
    readiness,
    experiment: THIRTY_DAY_TEST,
    dailyActions: DAILY_ACTIONS,
    hardMetrics: hard,
    vanityPresent,
    missingHardCount,
    bottleneck: bottleneckFrom(metrics),
    rules: [
      'Cleared external revenue beats every agent activity metric.',
      'Keep the $499 diagnostic frozen for 20 qualified buyer conversations, 5 scoped payment requests, or 30 days.',
      'Use contract work as the income floor while the productized service is tested.',
      'Do not buy a new course, community, model subscription, server, or tool unless a paying customer requires it and the sale covers it.',
      'Humans keep control of offer selection, price exceptions, public reputation, contracts, final quality, refunds, and spending.',
    ],
  };
}

function render(board) {
  const lines = [
    '# Cash Discipline Board',
    '',
    `Readiness: ${board.readiness}/100`,
    `Bottleneck: ${board.bottleneck}`,
    '',
    '## 30-Day Experiment',
    '',
    `Offer: ${board.experiment.offer}`,
    `Price: $${board.experiment.priceUsd}`,
    `Targets: ${board.experiment.qualifiedConversationTarget} qualified conversations, ${board.experiment.paymentRequestTarget} scoped payment requests, ${board.experiment.maxDays} days max`,
    `Triage rule: ${board.experiment.triageOfferLocked}`,
    '',
    '## Hard Metrics',
    '',
  ];
  for (const metric of board.hardMetrics) {
    const value = metric.value == null ? 'missing' : metric.value;
    const comparator = metric.direction === 'gte' ? '>=' : '<=';
    lines.push(`- ${metric.status.toUpperCase()} ${metric.label}: ${value} target ${comparator} ${metric.target}`);
  }
  if (board.vanityPresent.length > 0) {
    lines.push('', '## Vanity Metrics Ignored', '');
    for (const key of board.vanityPresent) lines.push(`- ${key}`);
  }
  lines.push('', '## Daily Actions', '');
  for (const action of board.dailyActions) lines.push(`- ${action}`);
  lines.push('', '## Rules', '');
  for (const rule of board.rules) lines.push(`- ${rule}`);
  return `${lines.join('\n')}\n`;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log('Usage: node tools/cash-discipline-board.js [--metrics metrics.tsv|metrics.json] [--json] [--fail-on-vanity]');
    return;
  }
  const board = buildBoard({ metricsPath: args.metrics });
  if (args.json) console.log(JSON.stringify(board, null, 2));
  else process.stdout.write(render(board));
  if (args.failOnVanity && board.vanityPresent.length > 0) process.exitCode = 2;
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

module.exports = {
  DAILY_ACTIONS,
  HARD_METRICS,
  THIRTY_DAY_TEST,
  VANITY_METRICS,
  bottleneckFrom,
  buildBoard,
  parseArgs,
  parseMetricsTsv,
  render,
};
