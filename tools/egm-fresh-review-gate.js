#!/usr/bin/env node
'use strict';

/**
 * Fresh-context review gate, from Google's Elephant-Goldfish Model.
 * Source: https://github.com/google/elephant-goldfish-model
 *
 * A review in the same context is not a Goldfish review.
 * The parent must name a different reviewer.
 * An open blocker or open major fails the receipt.
 * A stage may be re-audited at most once.
 * This gate does not call a model.
 */

const fs = require('fs');

const SOURCE = 'https://github.com/google/elephant-goldfish-model';
const RANKS = new Set(['blocker', 'major', 'nit']);
const STATUSES = new Set(['open', 'accepted', 'fixed']);
const REQUIRED = {
  full: [5, 6, 7, 8, 9],
  feature_spec: [5, 6, 7, 8],
  implementation: [9],
  claim: [9],
};

function finding(id, rank) {
  return { id, rank };
}

function filled(value) {
  return String(value == null ? '' : value).trim();
}

function stagesIncomplete(mode, stages) {
  const required = REQUIRED[mode];
  if (!Array.isArray(stages) || stages.length === 0) return true;
  const nums = stages.map(Number);
  if (nums.some((stage) => !Number.isInteger(stage) || stage < 5 || stage > 9)) return true;
  if (nums.some((stage, index) => index > 0 && stage < nums[index - 1])) return true;
  return required.some((stage) => !nums.includes(stage));
}

function reviewReceipt(receipt) {
  const input = receipt && typeof receipt === 'object' ? receipt : {};
  const findings = [];
  const isolation = filled(input.isolation);
  const reviewer = filled(input.reviewerAgentId);
  const parent = filled(input.parentSessionId);
  const mode = filled(input.mode);

  if (isolation !== 'fresh' || !reviewer || !parent || reviewer === parent) {
    findings.push(finding('same_context', 'blocker'));
  }
  if (!REQUIRED[mode]) findings.push(finding('mode_missing', 'blocker'));
  else if (stagesIncomplete(mode, input.stages)) findings.push(finding('stages_incomplete', 'blocker'));

  const reaudit = input.reauditCount;
  if (!Number.isInteger(reaudit) || reaudit < 0 || reaudit > 1) {
    findings.push(finding('reaudit_cap', 'blocker'));
  }

  if (!Array.isArray(input.findings)) findings.push(finding('findings_missing', 'blocker'));
  else {
    for (const row of input.findings) {
      const rank = filled(row && row.rank);
      const status = filled(row && row.status);
      const evidence = filled(row && row.evidence);
      if (!RANKS.has(rank) || !STATUSES.has(status) || !evidence) {
        findings.push(finding('finding_malformed', 'blocker'));
        break;
      }
      if (rank === 'blocker' && status === 'open') findings.push(finding('open_blocker', 'blocker'));
      if (rank === 'major' && status === 'open') findings.push(finding('open_major', 'major'));
    }
  }

  return {
    ok: findings.length === 0,
    findings,
    source: SOURCE,
    calledModel: false,
  };
}

function argValue(argv, flag) {
  const index = argv.indexOf(flag);
  return index >= 0 ? argv[index + 1] : '';
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--review')) {
    const file = argValue(argv, '--review');
    const receipt = JSON.parse(fs.readFileSync(file, 'utf8'));
    const report = reviewReceipt(receipt);
    console.log(JSON.stringify(report));
    process.exit(report.ok ? 0 : 2);
  }
  console.log(JSON.stringify({ ready: true, calledModel: false, source: SOURCE }));
  process.exit(0);
}

if (require.main === module) main();

module.exports = {
  SOURCE,
  reviewReceipt,
};
