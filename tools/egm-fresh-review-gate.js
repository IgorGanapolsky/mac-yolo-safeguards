#!/usr/bin/env node
'use strict';

/**
 * Fresh-context review gate, from Google's Elephant-Goldfish Model.
 * Source: https://github.com/google/elephant-goldfish-model
 * Write-up: https://www.marktechpost.com/2026/11/08/google-elephant-goldfish-model-plugin-spec-review-coding-agents/
 *
 * A review in the same context is not a Goldfish review.
 * The parent must name a different reviewer.
 * A child prompt that already contains the verdict is not a review.
 * Host instruction files do not belong in the child's file list.
 * Installing the plugin is refused. Vendor timings are not local results.
 * An open blocker or open major fails the receipt.
 * A stage may be re-audited at most once.
 * This gate does not call a model.
 */

const fs = require('fs');

const SOURCE = 'https://github.com/google/elephant-goldfish-model';
const RANKS = new Set(['blocker', 'major', 'nit']);
const STATUSES = new Set(['open', 'accepted', 'fixed']);
const HOST_FILES = new Set(['AGENTS.md', 'CLAUDE.md', 'GEMINI.md', '.cursorrules']);
const PROMPT_LEAK = [
  /\bverdict\s*:\s*pass\b/i,
  /return\s+pass\b/i,
  /findings are already/i,
  /already fixed/i,
  /fixes already landed/i,
];
// Timings may carry a unit suffix (573.13s), so no trailing word boundary on them.
const VENDOR_FIGURE = /(?<![\d.])(?:573\.13|482\.30)(?![\d])|15 native reviewers|16 native reviewers|thousands of (?:its |google'?s )?engineers/i;
// An install operation and its plugin target together; reading docs that name the plugin is fine.
const INSTALL = /\b(?:install|add|enable)\b[^\n;&|]{0,80}(?:elephant-goldfish-model|egm@egm)|\bagy\s+plugin\s+install\b/i;
const NEGATED = /\b(?:do\s+not|don'?t|never|must\s+not|should\s+not|without)\b/i;

// A sentence that forbids a verdict ("Do not return PASS") is not a supplied verdict.
function suppliesVerdict(prompt) {
  return prompt.split(/(?<=[.!?;])\s+|\n+/).some((sentence) => {
    const hit = PROMPT_LEAK.map((pattern) => pattern.exec(sentence)).find(Boolean);
    return Boolean(hit) && !NEGATED.test(sentence.slice(0, hit.index));
  });
}
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

  const prompt = filled(input.childPrompt);
  if (prompt && suppliesVerdict(prompt)) {
    findings.push(finding('parent_verdict', 'blocker'));
  }
  const files = Array.isArray(input.childContextFiles) ? input.childContextFiles : [];
  if (files.some((name) => HOST_FILES.has(filled(name).split('/').pop()))) {
    findings.push(finding('host_instructions', 'blocker'));
  }
  // Check every field on its own: a benign value in one must not hide an install in the other.
  const kinds = [input.kind, input.action].map(filled);
  const commands = [input.command, input.install].map(filled).filter(Boolean);
  if (kinds.includes('install') || commands.some((cmd) => INSTALL.test(cmd))) {
    findings.push(finding('plugin_install', 'blocker'));
  }
  if (input.measuredHere === true && VENDOR_FIGURE.test([prompt, filled(input.note)].join('\n'))) {
    findings.push(finding('vendor_figure', 'blocker'));
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
  if (argv.includes('--install')) {
    const report = reviewReceipt({ kind: 'install', command: argValue(argv, '--install') });
    console.log(JSON.stringify(report));
    process.exit(2);
  }
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
