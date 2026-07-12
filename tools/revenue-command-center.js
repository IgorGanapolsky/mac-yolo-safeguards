#!/usr/bin/env node
'use strict';

const fs = require('fs');
const { spawnSync } = require('child_process');
const { discover, latestDataDate } = require('./revenue-date');
const { defaultOut, existsDataFile, resolveDataPath, listDataBasenames } = require('./ops-paths');

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

function availableDates(prefix) {
  return new Set(
    listDataBasenames()
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

function reportPath(prefix, date) {
  return defaultOut(`${prefix}-${date}.md`);
}

function mirrorRequestedReports(requestedDate, dataDate, prefixes) {
  if (requestedDate === dataDate) {
    return;
  }
  for (const prefix of prefixes) {
    const source = resolveDataPath(`${prefix}-${dataDate}.md`);
    const target = reportPath(prefix, requestedDate);
    if (fs.existsSync(source)) {
      fs.copyFileSync(source, target);
      console.log(`Mirrored requested-date report: ${target}`);
    }
  }
}

function mirrorRequestedReport(requestedDate, dataDate, prefix) {
  mirrorRequestedReports(requestedDate, dataDate, [prefix]);
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
    const stripeMapName = `stripe-offer-map-${dataDate}.tsv`;
    if (existsDataFile(stripeMapName)) {
      args.stripeOfferMap = resolveDataPath(stripeMapName);
    }
  }

  if ((pipelines.length === 0 || prospects.length === 0 || !fs.existsSync(args.stripeOfferMap)) && !explicitStripeMap) {
    const fallbackDate = latestUsableDate(requestedDate, explicitStripeMap);
    if (fallbackDate && fallbackDate !== dataDate) {
      dataDate = fallbackDate;
      pipelines = discover('pipeline-status', dataDate);
      prospects = discover('prospects', dataDate);
      args.stripeOfferMap = resolveDataPath(`stripe-offer-map-${dataDate}.tsv`);
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
    reportPath('payment-readiness-all', dataDate),
  ]));
  run('Revenue Price Sensitivity', 'node', [
    'tools/revenue-price-sensitivity.js',
  ].concat(withRepeated('--pipeline', pipelines), [
    '--stripe-offer-map',
    args.stripeOfferMap,
    '--date',
    requestedDate,
    '--out',
    reportPath('revenue-price-sensitivity', dataDate),
  ]));
  run('Partner Pilot Qualification Plan', 'node', [
    'tools/partner-pilot-qualification-plan.js',
  ].concat(withRepeated('--pipeline', pipelines), withRepeated('--prospects', prospects), [
    '--date',
    requestedDate,
    '--limit',
    String(args.limit),
    '--out',
    reportPath('partner-pilot-qualification-plan', dataDate),
  ]));
  run('Partner Pilot Unlock Simulation', 'node', [
    'tools/partner-pilot-unlock-simulation.js',
    '--date',
    requestedDate,
    '--stripe-offer-map',
    args.stripeOfferMap,
    '--out',
    reportPath('partner-pilot-unlock-simulation', dataDate),
  ]);
  run('Partner Pilot Stripe Unlock Packet', 'node', [
    'tools/partner-pilot-stripe-unlock-packet.js',
    '--date',
    requestedDate,
    '--stripe-offer-map',
    args.stripeOfferMap,
    '--out',
    reportPath('partner-pilot-stripe-unlock-packet', dataDate),
  ]);
  run('Pipeline Integrity', 'node', [
    'tools/pipeline-integrity.js',
  ].concat(withRepeated('--pipeline', pipelines), withRepeated('--prospects', prospects), [
    '--out',
    reportPath('pipeline-integrity', dataDate),
  ]));
  run('Pipeline Priority', 'node', [
    'tools/pipeline-prioritize.js',
  ].concat(withRepeated('--pipeline', pipelines), withRepeated('--prospects', prospects), [
    '--limit',
    String(args.limit),
    '--out',
    reportPath('pipeline-priority', dataDate),
  ]));
  run('Send Confirmation Audit', 'node', [
    'tools/send-confirmation-audit.js',
  ].concat(withRepeated('--pipeline', pipelines), [
    '--date',
    dataDate,
    '--out',
    reportPath('send-confirmation-audit', dataDate),
  ]));
  run('Close Target Plan', 'node', [
    'tools/close-target-plan.js',
  ].concat(withRepeated('--pipeline', pipelines), withRepeated('--prospects', prospects), [
    '--stripe-offer-map',
    args.stripeOfferMap,
    '--date',
    requestedDate,
    '--limit',
    String(args.limit),
    '--out',
    reportPath('close-target-plan', dataDate),
  ]));
  run('Proposal Batch Plan', 'node', [
    'tools/proposal-batch-plan.js',
    '--date',
    requestedDate,
    '--close-plan',
    reportPath('close-target-plan', dataDate),
    '--out',
    reportPath('proposal-batch-plan', dataDate),
  ]);
  mirrorRequestedReport(requestedDate, dataDate, 'proposal-batch-plan');
  const proposalBatchForPaymentAudit = requestedDate === dataDate
    ? reportPath('proposal-batch-plan', dataDate)
    : reportPath('proposal-batch-plan', requestedDate);
  run('Payment Waiting Audit', 'node', [
    'tools/payment-waiting-audit.js',
  ].concat(withRepeated('--pipeline', pipelines), [
    '--date',
    requestedDate,
    '--proposal-batch',
    proposalBatchForPaymentAudit,
    '--out',
    reportPath('payment-waiting-audit', dataDate),
  ]));
  run('Revenue Unblock Plan', 'node', [
    'tools/revenue-unblock-plan.js',
  ].concat(withRepeated('--pipeline', pipelines), [
    '--date',
    requestedDate,
    '--stripe-offer-map',
    args.stripeOfferMap,
    '--payment-waiting-audit',
    reportPath('payment-waiting-audit', dataDate),
    '--proposal-batch',
    proposalBatchForPaymentAudit,
    '--out',
    reportPath('revenue-unblock-plan', dataDate),
  ]));
  run('Proposal Batch Plan With Backup', 'node', [
    'tools/proposal-batch-plan.js',
    '--date',
    requestedDate,
    '--close-plan',
    reportPath('close-target-plan', dataDate),
    '--include-backup',
    '--out',
    reportPath('proposal-batch-plan-with-backup', dataDate),
  ]);
  mirrorRequestedReport(requestedDate, dataDate, 'proposal-batch-plan-with-backup');
  const backupProposalBatchForExecution = requestedDate === dataDate
    ? reportPath('proposal-batch-plan-with-backup', dataDate)
    : reportPath('proposal-batch-plan-with-backup', requestedDate);
  run('Payment Request Execution Packet', 'node', [
    'tools/payment-request-execution-packet.js',
    '--date',
    requestedDate,
    '--proposal-batch',
    proposalBatchForPaymentAudit,
    '--backup-proposal-batch',
    backupProposalBatchForExecution,
    '--payment-waiting-audit',
    reportPath('payment-waiting-audit', dataDate),
    '--out',
    reportPath('payment-request-execution-packet', dataDate),
  ]);
  run('Proposal Plan Stale Audit', 'node', [
    'tools/proposal-plan-stale-audit.js',
    '--date',
    dataDate,
    '--out',
    reportPath('proposal-plan-stale-audit', dataDate),
  ]);
  run('Revenue Action Board', 'node', [
    'tools/revenue-action-board.js',
  ].concat(withRepeated('--pipeline', pipelines), withRepeated('--prospects', prospects), [
    '--stripe-offer-map',
    args.stripeOfferMap,
    '--date',
    requestedDate,
    '--out',
    reportPath('revenue-action-board', dataDate),
  ]));
  run('Publication Readiness', 'node', [
    'tools/publication-readiness.js',
    '--out',
    reportPath('publication-readiness', dataDate),
  ]);
  run('Public Funnel Safety Scan', 'node', [
    'tools/public-funnel-safety-scan.js',
    '--out',
    reportPath('public-funnel-safety-scan', dataDate),
  ]);
  run('GitHub Issue Template Check', 'node', [
    'tools/github-issue-template-check.js',
    '--out',
    reportPath('github-issue-template-check', dataDate),
  ]);
  run('Public Local Link Check', 'node', [
    'tools/public-local-link-check.js',
    '--out',
    reportPath('public-local-link-check', dataDate),
  ]);
  run('Public Command Reference Check', 'node', [
    'tools/public-command-reference-check.js',
    '--out',
    reportPath('public-command-reference-check', dataDate),
  ]);
  run('Public Revenue Publish Plan', 'node', [
    'tools/public-revenue-publish-plan.js',
    '--out',
    reportPath('public-revenue-publish-plan', dataDate),
  ]);
  run('Close Follow-Up Batch Plan', 'node', [
    'tools/close-follow-up-batch-plan.js',
    '--date',
    requestedDate,
    '--close-plan',
    reportPath('close-target-plan', dataDate),
    '--out',
    reportPath('close-follow-up-batch-plan', dataDate),
  ]);
  run('Close Execution Packet', 'node', [
    'tools/close-execution-packet.js',
    '--date',
    requestedDate,
    '--close-plan',
    reportPath('close-target-plan', dataDate),
    '--limit',
    '5',
    '--out',
    reportPath('close-execution-packet', dataDate),
  ]);
  run('Revenue Diagnosis', 'node', [
    'tools/revenue-diagnosis.js',
  ].concat(withRepeated('--pipeline', pipelines), withRepeated('--prospects', prospects), [
    '--stripe-offer-map',
    args.stripeOfferMap,
    '--date',
    dataDate,
    '--out',
    reportPath('revenue-diagnosis', dataDate),
  ]));
  run('Revenue Goal Audit', 'node', [
    'tools/revenue-goal-audit.js',
    '--date',
    dataDate,
    '--out',
    reportPath('revenue-goal-audit', dataDate),
  ]);
  run('Public Conversion Check', 'node', ['tools/public-conversion-check.js']);
  mirrorRequestedReports(requestedDate, dataDate, [
    'payment-readiness-all',
    'revenue-price-sensitivity',
    'partner-pilot-qualification-plan',
    'partner-pilot-unlock-simulation',
    'partner-pilot-stripe-unlock-packet',
    'pipeline-integrity',
    'pipeline-priority',
    'send-confirmation-audit',
    'proposal-batch-plan',
    'proposal-batch-plan-with-backup',
    'payment-waiting-audit',
    'revenue-unblock-plan',
    'payment-request-execution-packet',
    'proposal-plan-stale-audit',
    'revenue-action-board',
    'publication-readiness',
    'public-funnel-safety-scan',
    'github-issue-template-check',
    'public-local-link-check',
    'public-command-reference-check',
    'public-revenue-publish-plan',
    'close-target-plan',
    'close-follow-up-batch-plan',
    'close-execution-packet',
    'revenue-diagnosis',
    'revenue-goal-audit',
  ]);
}

try {
  main();
} catch (error) {
  console.error(error.message);
  console.error('');
  console.error(usage);
  process.exit(2);
}
