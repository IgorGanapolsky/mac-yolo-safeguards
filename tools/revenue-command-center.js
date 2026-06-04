#!/usr/bin/env node
'use strict';

const fs = require('fs');
const { spawnSync } = require('child_process');

const usage = `Usage:
  node tools/revenue-command-center.js [--date YYYY-MM-DD] [--stripe-offer-map stripe-offer-map.tsv] [--limit N]

Discovers private pipeline/prospect TSV files for the day and runs the revenue
control checks: pipeline summary, payment readiness, integrity, priority, and
close-target planning. It also verifies that the public repo still exposes the
paid hardening path and safety boundaries.

This tool does not send outreach, create payment links, mutate pipeline rows, or
prove revenue. It is an evidence aggregator.`;

function parseArgs(argv) {
  const args = {
    date: new Date().toISOString().slice(0, 10),
    limit: 25,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--date') {
      args.date = argv[++i];
    } else if (arg === '--stripe-offer-map') {
      args.stripeOfferMap = argv[++i];
    } else if (arg === '--limit') {
      args.limit = Number(argv[++i]);
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function datedSuffix(name) {
  const match = String(name || '').match(/(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : null;
}

function discover(prefix, date) {
  return fs.readdirSync(process.cwd())
    .filter((name) => name.startsWith(prefix))
    .filter((name) => name.endsWith('.tsv'))
    .filter((name) => name.includes(date))
    .filter((name) => !name.includes('.example.'))
    .sort();
}

function availableDates(prefix) {
  return new Set(
    fs.readdirSync(process.cwd())
      .filter((name) => name.startsWith(prefix))
      .filter((name) => name.endsWith('.tsv'))
      .filter((name) => !name.includes('.example.'))
      .map(datedSuffix)
      .filter(Boolean)
  );
}

function latestUsableDate(requestedDate, hasExplicitStripeMap) {
  const pipelineDates = availableDates('pipeline-status');
  const prospectDates = availableDates('prospects');
  const stripeDates = availableDates('stripe-offer-map');
  const candidates = Array.from(pipelineDates)
    .filter((date) => date <= requestedDate)
    .filter((date) => prospectDates.has(date))
    .filter((date) => hasExplicitStripeMap || stripeDates.has(date))
    .sort();
  return candidates[candidates.length - 1] || null;
}

function run(label, command, args) {
  console.log(`\n== ${label} ==`);
  console.log([command].concat(args).join(' '));
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }
  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

function withRepeated(flag, values) {
  return values.flatMap((value) => [flag, value]);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage);
    process.exit(0);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(args.date)) {
    throw new Error('--date must be YYYY-MM-DD');
  }
  if (!Number.isFinite(args.limit) || args.limit <= 0) {
    throw new Error('--limit must be a positive number');
  }

  const requestedDate = args.date;
  let dataDate = requestedDate;
  let pipelines = discover('pipeline-status', dataDate);
  let prospects = discover('prospects', dataDate);
  const explicitStripeMap = Boolean(args.stripeOfferMap);
  if (!args.stripeOfferMap) {
    args.stripeOfferMap = `stripe-offer-map-${dataDate}.tsv`;
  }

  if ((pipelines.length === 0 || prospects.length === 0 || !fs.existsSync(args.stripeOfferMap)) && !explicitStripeMap) {
    const fallbackDate = latestUsableDate(requestedDate, explicitStripeMap);
    if (fallbackDate && fallbackDate !== dataDate) {
      dataDate = fallbackDate;
      pipelines = discover('pipeline-status', dataDate);
      prospects = discover('prospects', dataDate);
      args.stripeOfferMap = `stripe-offer-map-${dataDate}.tsv`;
    }
  }

  if (pipelines.length === 0) {
    throw new Error(`No pipeline-status*.tsv files found for ${requestedDate}`);
  }
  if (prospects.length === 0) {
    throw new Error(`No prospects*.tsv files found for ${requestedDate}`);
  }
  if (!fs.existsSync(args.stripeOfferMap)) {
    throw new Error(`Stripe offer map not found: ${args.stripeOfferMap}`);
  }

  console.log(`Requested date: ${requestedDate}`);
  console.log(`Data date: ${dataDate}`);
  console.log(`Pipelines discovered: ${pipelines.length}`);
  console.log(`Prospect files discovered: ${prospects.length}`);
  console.log(`Stripe offer map: ${args.stripeOfferMap}`);

  run('Pipeline Summary', 'node', ['tools/pipeline-summary.js'].concat(pipelines));
  run('Payment Readiness', 'node', [
    'tools/payment-readiness.js',
    '--stripe-offer-map',
    args.stripeOfferMap,
  ].concat(withRepeated('--pipeline', pipelines), [
    '--out',
    `payment-readiness-all-${dataDate}.md`,
  ]));
  run('Pipeline Integrity', 'node', [
    'tools/pipeline-integrity.js',
  ].concat(withRepeated('--pipeline', pipelines), withRepeated('--prospects', prospects), [
    '--out',
    `pipeline-integrity-${dataDate}.md`,
  ]));
  run('Pipeline Priority', 'node', [
    'tools/pipeline-prioritize.js',
  ].concat(withRepeated('--pipeline', pipelines), withRepeated('--prospects', prospects), [
    '--limit',
    String(args.limit),
    '--out',
    `pipeline-priority-${dataDate}.md`,
  ]));
  run('Send Confirmation Audit', 'node', [
    'tools/send-confirmation-audit.js',
  ].concat(withRepeated('--pipeline', pipelines), [
    '--date',
    dataDate,
    '--out',
    `send-confirmation-audit-${dataDate}.md`,
  ]));
  run('Proposal Plan Stale Audit', 'node', [
    'tools/proposal-plan-stale-audit.js',
    '--date',
    dataDate,
    '--out',
    `proposal-plan-stale-audit-${dataDate}.md`,
  ]);
  run('Revenue Action Board', 'node', [
    'tools/revenue-action-board.js',
  ].concat(withRepeated('--pipeline', pipelines), withRepeated('--prospects', prospects), [
    '--stripe-offer-map',
    args.stripeOfferMap,
    '--date',
    dataDate,
    '--out',
    `revenue-action-board-${dataDate}.md`,
  ]));
  run('Publication Readiness', 'node', [
    'tools/publication-readiness.js',
    '--out',
    `publication-readiness-${dataDate}.md`,
  ]);
  run('Public Funnel Safety Scan', 'node', [
    'tools/public-funnel-safety-scan.js',
    '--out',
    `public-funnel-safety-scan-${dataDate}.md`,
  ]);
  run('GitHub Issue Template Check', 'node', [
    'tools/github-issue-template-check.js',
    '--out',
    `github-issue-template-check-${dataDate}.md`,
  ]);
  run('Public Local Link Check', 'node', [
    'tools/public-local-link-check.js',
    '--out',
    `public-local-link-check-${dataDate}.md`,
  ]);
  run('Public Command Reference Check', 'node', [
    'tools/public-command-reference-check.js',
    '--out',
    `public-command-reference-check-${dataDate}.md`,
  ]);
  run('Public Revenue Publish Plan', 'node', [
    'tools/public-revenue-publish-plan.js',
    '--out',
    `public-revenue-publish-plan-${dataDate}.md`,
  ]);
  run('Close Target Plan', 'node', [
    'tools/close-target-plan.js',
  ].concat(withRepeated('--pipeline', pipelines), withRepeated('--prospects', prospects), [
    '--stripe-offer-map',
    args.stripeOfferMap,
    '--limit',
    String(args.limit),
    '--out',
    `close-target-plan-${dataDate}.md`,
  ]));
  run('Revenue Diagnosis', 'node', [
    'tools/revenue-diagnosis.js',
  ].concat(withRepeated('--pipeline', pipelines), withRepeated('--prospects', prospects), [
    '--stripe-offer-map',
    args.stripeOfferMap,
    '--date',
    dataDate,
    '--out',
    `revenue-diagnosis-${dataDate}.md`,
  ]));
  run('Revenue Goal Audit', 'node', [
    'tools/revenue-goal-audit.js',
    '--date',
    dataDate,
    '--out',
    `revenue-goal-audit-${dataDate}.md`,
  ]);
  run('Public Conversion Check', 'node', ['tools/public-conversion-check.js']);
}

try {
  main();
} catch (error) {
  console.error(error.message);
  console.error('');
  console.error(usage);
  process.exit(2);
}
