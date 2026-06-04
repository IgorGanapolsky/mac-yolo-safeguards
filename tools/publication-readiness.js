#!/usr/bin/env node
'use strict';

const fs = require('fs');
const { spawnSync } = require('child_process');

const usage = `Usage:
  node tools/publication-readiness.js [--out publication-readiness.md]

Checks whether public revenue-funnel assets are present and published from the
local git worktree perspective.

This tool is read-only. It does not add, commit, push, or publish anything.`;

const publicRevenueArtifacts = [
  'README.md',
  'CASE-STUDY.md',
  'CHANGELOG.md',
  'AI-AGENT-HARDENING.md',
  'PARTNER-PILOT.md',
  'REVENUE-OPERATING-PLAN.md',
  'SALES-CLOSE-KIT.md',
  '.gitignore',
  'pipeline-status.example.tsv',
  'prospects.example.tsv',
  'revenue-ledger.example.tsv',
  '.github/ISSUE_TEMPLATE/config.yml',
  '.github/ISSUE_TEMPLATE/free-incident-report.yml',
  '.github/ISSUE_TEMPLATE/paid-hardening-inquiry.yml',
  'tools/public-conversion-check.js',
  'tools/public-funnel-safety-scan.js',
  'tools/github-issue-template-check.js',
  'tools/public-command-reference-check.js',
  'tools/public-local-link-check.js',
  'tools/public-revenue-publish-plan.js',
  'tools/publication-readiness.js',
  'tools/revenue-control-checks.js',
  'tools/close-target-plan.js',
  'tools/close-follow-up-batch-plan.js',
  'tools/close-execution-packet.js',
  'tools/outreach-actions.js',
  'tools/outreach-queue.js',
  'tools/partner-pilot-qualification-plan.js',
  'tools/partner-pilot-unlock-simulation.js',
  'tools/partner-pilot-stripe-unlock-packet.js',
  'tools/payment-readiness.js',
  'tools/payment-request-execution-packet.js',
  'tools/payment-waiting-audit.js',
  'tools/pipeline-data-science.js',
  'tools/pipeline-init.js',
  'tools/pipeline-summary.js',
  'tools/pipeline-update.js',
  'tools/proposal-batch-plan.js',
  'tools/proposal-plan.js',
  'tools/proposal-plan-stale-audit.js',
  'tools/prospect-score.js',
  'tools/record-cleared-payment.js',
  'tools/revenue-command-center.js',
  'tools/revenue-date.js',
  'tools/revenue-goal-audit.js',
  'tools/revenue-net.js',
  'tools/revenue-price-sensitivity.js',
  'tools/revenue-unblock-plan.js',
  'tools/send-plan.js',
  'tools/stripe-setup-plan.js',
  'tools/stripe-live-updates-template.js',
];

function runNode(args, options = {}) {
  const result = spawnSync('node', args, { encoding: 'utf8' });
  if (result.status !== 0 && !options.allowFailure) {
    throw new Error((result.stderr || result.stdout || `node ${args.join(' ')} failed`).trim());
  }
  return result;
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--out') {
      args.out = argv[++i];
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function runGit(args, options = {}) {
  const result = spawnSync('git', args, { encoding: 'utf8' });
  if (result.status !== 0) {
    if (options.optional) {
      return null;
    }
    throw new Error((result.stderr || result.stdout || `git ${args.join(' ')} failed`).trim());
  }
  return result.stdout.replace(/\s+$/, '');
}

function statusRows(paths) {
  const output = runGit(['status', '--porcelain=v1', '--untracked-files=all', '--'].concat(paths));
  if (!output) {
    return [];
  }
  return output.split(/\r?\n/).map((line) => ({
    code: line.slice(0, 2),
    path: line.slice(3),
    raw: line,
  }));
}

function branchState() {
  const branch = runGit(['rev-parse', '--abbrev-ref', 'HEAD'], { optional: true }) || 'UNKNOWN';
  const upstream = runGit(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'], { optional: true });
  if (!upstream) {
    return { branch, upstream: 'NONE', ahead: null, behind: null };
  }
  const counts = runGit(['rev-list', '--left-right', '--count', 'HEAD...@{upstream}'], { optional: true });
  if (!counts) {
    return { branch, upstream, ahead: null, behind: null };
  }
  const [aheadRaw, behindRaw] = counts.split(/\s+/);
  return {
    branch,
    upstream,
    ahead: Number(aheadRaw),
    behind: Number(behindRaw),
  };
}

function classifyStatus(row) {
  if (row.code === '??') {
    return 'untracked';
  }
  if (row.code.includes('M')) {
    return 'modified';
  }
  if (row.code.includes('A')) {
    return 'added';
  }
  if (row.code.includes('D')) {
    return 'deleted';
  }
  return row.code.trim() || 'changed';
}

function build() {
  const branch = branchState();
  const rows = statusRows(publicRevenueArtifacts);
  const rowByPath = new Map(rows.map((row) => [row.path, row]));
  const artifacts = publicRevenueArtifacts.map((artifact) => {
    const exists = fs.existsSync(artifact);
    const status = rowByPath.get(artifact);
    return {
      artifact,
      exists,
      gitStatus: status ? classifyStatus(status) : 'clean',
    };
  });
  const missing = artifacts.filter((item) => !item.exists);
  const unpublishedWorkingTree = artifacts.filter((item) => item.gitStatus !== 'clean');
  const localAhead = Number.isFinite(branch.ahead) ? branch.ahead : 0;
  const localBehind = Number.isFinite(branch.behind) ? branch.behind : 0;
  const safety = runNode(['tools/public-funnel-safety-scan.js'], { allowFailure: true });
  const safetyFailure = safety.status !== 0;
  const issueTemplates = runNode(['tools/github-issue-template-check.js'], { allowFailure: true });
  const issueTemplateFailure = issueTemplates.status !== 0;
  const localLinks = runNode(['tools/public-local-link-check.js'], { allowFailure: true });
  const localLinkFailure = localLinks.status !== 0;
  const commandReferences = runNode(['tools/public-command-reference-check.js'], { allowFailure: true });
  const commandReferenceFailure = commandReferences.status !== 0;
  const publicationReady = missing.length === 0
    && unpublishedWorkingTree.length === 0
    && localAhead === 0
    && localBehind === 0
    && !safetyFailure
    && !issueTemplateFailure
    && !localLinkFailure
    && !commandReferenceFailure;
  return {
    branch,
    artifacts,
    missing,
    unpublishedWorkingTree,
    safetyStatus: safetyFailure ? 'FAIL' : 'PASS',
    safetyOutput: safety.stdout.trim(),
    issueTemplateStatus: issueTemplateFailure ? 'FAIL' : 'PASS',
    localLinkStatus: localLinkFailure ? 'FAIL' : 'PASS',
    commandReferenceStatus: commandReferenceFailure ? 'FAIL' : 'PASS',
    publicationReady,
  };
}

function renderMarkdown(data) {
  const lines = [
    `# Publication Readiness - ${new Date().toISOString().slice(0, 10)}`,
    '',
    'Read-only report. This does not add, commit, push, or publish anything.',
    '',
    '## Git State',
    '',
    `- Branch: ${data.branch.branch}`,
    `- Upstream: ${data.branch.upstream}`,
    `- Ahead of upstream: ${data.branch.ahead === null ? 'unknown' : data.branch.ahead}`,
    `- Behind upstream: ${data.branch.behind === null ? 'unknown' : data.branch.behind}`,
    `- Changed/untracked public artifacts: ${data.unpublishedWorkingTree.length}`,
    `- Missing public artifacts: ${data.missing.length}`,
    `- Public funnel safety scan: ${data.safetyStatus}`,
    `- GitHub issue template check: ${data.issueTemplateStatus}`,
    `- Public local link check: ${data.localLinkStatus}`,
    `- Public command reference check: ${data.commandReferenceStatus}`,
    `- Public revenue funnel publication status: ${data.publicationReady ? 'READY_OR_ALREADY_PUBLISHED' : 'NOT_PUBLISHED_FROM_LOCAL_STATE'}`,
    '',
    '## Public Revenue Artifacts',
    '',
    '| Artifact | Exists | Git status |',
    '|---|---|---|',
  ];
  for (const item of data.artifacts) {
    lines.push(`| ${item.artifact} | ${item.exists ? 'yes' : 'no'} | ${item.gitStatus} |`);
  }
  lines.push(
    '',
    '## Operator Actions',
    '',
  );
  if (data.missing.length) {
    lines.push(`- Restore missing public artifact(s): ${data.missing.map((item) => item.artifact).join(', ')}`);
  }
  if (data.unpublishedWorkingTree.length) {
    lines.push(`- Review, commit, and publish changed public revenue artifact(s): ${data.unpublishedWorkingTree.map((item) => `${item.artifact} (${item.gitStatus})`).join(', ')}`);
  }
  if (data.safetyStatus !== 'PASS') {
    lines.push('- Fix public funnel safety scan failures before publishing.');
  }
  if (data.issueTemplateStatus !== 'PASS') {
    lines.push('- Fix GitHub issue template check failures before publishing.');
  }
  if (data.localLinkStatus !== 'PASS') {
    lines.push('- Fix public local link check failures before publishing.');
  }
  if (data.commandReferenceStatus !== 'PASS') {
    lines.push('- Fix public command reference check failures before publishing.');
  }
  if (Number.isFinite(data.branch.ahead) && data.branch.ahead > 0) {
    lines.push(`- Push ${data.branch.ahead} local commit(s) to ${data.branch.upstream}.`);
  }
  if (Number.isFinite(data.branch.behind) && data.branch.behind > 0) {
    lines.push(`- Pull/rebase ${data.branch.behind} upstream commit(s) before publishing.`);
  }
  if (data.publicationReady) {
    lines.push('- Public revenue assets appear clean and aligned with the local upstream tracking state.');
  }
  lines.push('', 'This report is not revenue proof. It only checks whether the public funnel can plausibly be visible after publication.');
  return lines.join('\n');
}

function renderConsole(data) {
  console.log(`Branch: ${data.branch.branch}`);
  console.log(`Upstream: ${data.branch.upstream}`);
  console.log(`Ahead of upstream: ${data.branch.ahead === null ? 'unknown' : data.branch.ahead}`);
  console.log(`Behind upstream: ${data.branch.behind === null ? 'unknown' : data.branch.behind}`);
  console.log(`Public artifacts checked: ${data.artifacts.length}`);
  console.log(`Missing public artifacts: ${data.missing.length}`);
  console.log(`Changed/untracked public artifacts: ${data.unpublishedWorkingTree.length}`);
  console.log(`Public funnel safety scan: ${data.safetyStatus}`);
  console.log(`GitHub issue template check: ${data.issueTemplateStatus}`);
  console.log(`Public local link check: ${data.localLinkStatus}`);
  console.log(`Public command reference check: ${data.commandReferenceStatus}`);
  console.log(`Public revenue funnel publication status: ${data.publicationReady ? 'READY_OR_ALREADY_PUBLISHED' : 'NOT_PUBLISHED_FROM_LOCAL_STATE'}`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage);
    process.exit(0);
  }
  const data = build();
  renderConsole(data);
  if (args.out) {
    fs.writeFileSync(args.out, `${renderMarkdown(data)}\n`);
    console.log('');
    console.log(`Publication readiness report written: ${args.out}`);
  }
}

try {
  main();
} catch (error) {
  console.error(error.message);
  console.error('');
  console.error(usage);
  process.exit(2);
}
