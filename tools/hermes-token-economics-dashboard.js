#!/usr/bin/env node
'use strict';

/**
 * Hermes token economics dashboard.
 *
 * Aggregates `hermes-economic-router-receipts.jsonl` by `tokenClass` (teach/produce/spin)
 * and reports totals, dollars-per-accepted-task, and the teaching-budget guard hit rate.
 *
 * Usage:
 *   node tools/hermes-token-economics-dashboard.js [--receipts PATH] [--json] [--since ISO]
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const DEFAULT_RECEIPT_PATH = path.join(os.homedir(), '.hermes/economic-router-receipts.jsonl');

function parseArgs(argv) {
  const args = { receipts: DEFAULT_RECEIPT_PATH, json: false, since: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--receipts') args.receipts = argv[++i];
    else if (arg === '--since') args.since = new Date(argv[++i]);
    else if (arg === '--json') args.json = true;
    else if (arg === '--help' || arg === '-h') {
      console.log(`Usage: node tools/hermes-token-economics-dashboard.js [--receipts PATH] [--since ISO] [--json]`);
      process.exit(0);
    }
  }
  return args;
}

function readReceipts(target) {
  if (!fs.existsSync(target)) return [];
  const text = fs.readFileSync(target, 'utf8');
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function aggregate(receipts) {
  const totals = {
    teach: { count: 0, estimatedCostUsd: 0, actualCostUsd: 0, accepted: 0, dollarsPerAcceptedTask: null, budgetApproved: 0, budgetRequested: 0 },
    produce: { count: 0, estimatedCostUsd: 0, actualCostUsd: 0, accepted: 0, dollarsPerAcceptedTask: null, budgetApproved: 0, budgetRequested: 0 },
    spin: { count: 0, estimatedCostUsd: 0, actualCostUsd: 0, accepted: 0, dollarsPerAcceptedTask: null, budgetApproved: 0, budgetRequested: 0 },
  };

  let totalActualCostUsd = 0;
  let totalAccepted = 0;

  for (const receipt of receipts) {
    const tokenClass = receipt.tokenClass || 'produce';
    if (!totals[tokenClass]) continue;
    const bucket = totals[tokenClass];
    bucket.count += 1;
    bucket.estimatedCostUsd += Number(receipt.estimatedCostUsd || 0);
    const actualCost = Number(receipt.outcomeContract?.accounting?.actualCostUsd ?? receipt.meteredCostUsd ?? receipt.estimatedCostUsd ?? 0);
    const accepted = receipt.outcomeContract?.accounting?.acceptedTask?.completed === true && Boolean(receipt.outcomeContract?.accounting?.acceptedTask?.verifiedBy);
    bucket.actualCostUsd += actualCost;
    if (accepted) bucket.accepted += 1;
    if (receipt.teachingBudget?.requested) bucket.budgetRequested += 1;
    if (receipt.teachingBudget?.approved) bucket.budgetApproved += 1;
    totalActualCostUsd += actualCost;
    if (accepted) totalAccepted += 1;
  }

  for (const bucket of Object.values(totals)) {
    bucket.dollarsPerAcceptedTask = bucket.accepted > 0 ? bucket.actualCostUsd / bucket.accepted : 0;
    bucket.estimatedCostUsd = Number(bucket.estimatedCostUsd.toFixed(6));
    bucket.actualCostUsd = Number(bucket.actualCostUsd.toFixed(6));
    bucket.dollarsPerAcceptedTask = Number(bucket.dollarsPerAcceptedTask.toFixed(6));
  }

  const overallDollarsPerAcceptedTask = totalAccepted > 0 ? totalActualCostUsd / totalAccepted : 0;

  return {
    totals,
    summary: {
      totalReceipts: receipts.length,
      totalActualCostUsd: Number(totalActualCostUsd.toFixed(6)),
      totalAccepted,
      overallDollarsPerAcceptedTask: Number(overallDollarsPerAcceptedTask.toFixed(6)),
    },
  };
}

function render(report) {
  const lines = [
    '# Hermes Token Economics Dashboard',
    '',
    `Total receipts: ${report.summary.totalReceipts}`,
    `Total actual cost: $${report.summary.totalActualCostUsd}`,
    `Accepted tasks: ${report.summary.totalAccepted}`,
    `Overall dollars per accepted task: $${report.summary.overallDollarsPerAcceptedTask}`,
    '',
    '| tokenClass | count | estimated $ | actual $ | accepted | $/accepted | teachBudget requested | teachBudget approved |',
    '|------------|------:|------------:|---------:|---------:|-----------:|--------------------:|--------------------:|',
  ];
  for (const [tokenClass, bucket] of Object.entries(report.totals)) {
    lines.push(`| ${tokenClass.padEnd(10)} | ${bucket.count} | $${bucket.estimatedCostUsd} | $${bucket.actualCostUsd} | ${bucket.accepted} | $${bucket.dollarsPerAcceptedTask} | ${bucket.budgetRequested} | ${bucket.budgetApproved} |`);
  }
  return lines.join('\n');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const receipts = readReceipts(args.receipts).filter((receipt) => {
    if (!args.since) return true;
    const createdAt = receipt.createdAt ? new Date(receipt.createdAt) : null;
    return createdAt && createdAt >= args.since;
  });
  const report = aggregate(receipts);
  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(render(report));
  }
}

if (require.main === module) {
  main();
}

module.exports = { readReceipts, aggregate, render };
