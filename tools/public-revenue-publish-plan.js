#!/usr/bin/env node
'use strict';

const fs = require('fs');
const { spawnSync } = require('child_process');

const usage = `Usage:
  node tools/public-revenue-publish-plan.js [--out public-revenue-publish-plan.md]

Builds a dry-run publish plan for public revenue-funnel artifacts only.

This tool is read-only. It does not add, commit, push, or publish anything.`;

const publicArtifacts = [
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

const privateArtifactPatterns = [
  /^business_os\//,
  /(^|\/)(contacts|send-queue|action-links|pipeline-priority|pipeline-integrity|send-confirmation-audit|market-research)-\d{4}-\d{2}-\d{2}/,
  /(^|\/)(pipeline-status|prospects|revenue-ledger)-\d{4}-\d{2}-\d{2}\.tsv$/,
  /(^|\/)(stripe-offer-map|stripe-live-updates|stripe-live-updates-template|stripe-readonly-candidates)-\d{4}-\d{2}-\d{2}\.tsv$/,
  /(^|\/)(payment-readiness-all|payment-waiting-audit|payment-request-execution-packet|stripe-setup-plan|stripe-readonly-discovery|close-target-plan|close-follow-up-batch-plan|close-execution-packet|partner-pilot-qualification-plan|partner-pilot-unlock-simulation|partner-pilot-stripe-unlock-packet|revenue-goal-audit|revenue-diagnosis|revenue-action-board|revenue-price-sensitivity|revenue-unblock-plan|publication-readiness)-\d{4}-\d{2}-\d{2}/,
  /(^|\/)(public-funnel-safety-scan|github-issue-template-check|public-local-link-check|public-command-reference-check|public-revenue-publish-plan)-\d{4}-\d{2}-\d{2}/,
];

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

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8' });
  if (result.status !== 0 && !options.allowFailure) {
    throw new Error((result.stderr || result.stdout || `${command} ${args.join(' ')} failed`).trim());
  }
  return result;
}

function git(args, options = {}) {
  return run('git', args, options).stdout.replace(/\s+$/, '');
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function statusRows(paths) {
  const output = git(['status', '--porcelain=v1', '--untracked-files=all', '--'].concat(paths));
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
  const branch = git(['rev-parse', '--abbrev-ref', 'HEAD'], { allowFailure: true }) || 'UNKNOWN';
  const upstream = git(['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}'], { allowFailure: true }) || 'NONE';
  const counts = upstream === 'NONE' ? '0\t0' : git(['rev-list', '--left-right', '--count', 'HEAD...@{upstream}'], { allowFailure: true }) || '0\t0';
  const [aheadRaw, behindRaw] = counts.split(/\s+/);
  return {
    branch,
    upstream,
    ahead: Number(aheadRaw),
    behind: Number(behindRaw),
  };
}

function classifyStatus(code) {
  if (code === '??') {
    return 'untracked';
  }
  if (code.includes('M')) {
    return 'modified';
  }
  if (code.includes('A')) {
    return 'added';
  }
  if (code.includes('D')) {
    return 'deleted';
  }
  return code.trim() || 'changed';
}

function checkCommand(command, args) {
  const result = run(command, args, { allowFailure: true });
  return {
    command: [command].concat(args).join(' '),
    status: result.status,
  };
}

function isGitIgnored(path) {
  const result = run('git', ['check-ignore', '--quiet', '--', path], { allowFailure: true });
  return result.status === 0;
}

function privatePublishFindings(paths) {
  return paths.flatMap((path) => {
    const findings = [];
    if (privateArtifactPatterns.some((pattern) => pattern.test(path))) {
      findings.push({ artifact: path, reason: 'matches private revenue/ops artifact pattern' });
    }
    if (isGitIgnored(path)) {
      findings.push({ artifact: path, reason: 'gitignored artifact' });
    }
    return findings;
  });
}

function build() {
  const rows = statusRows(publicArtifacts);
  const rowByPath = new Map(rows.map((row) => [row.path, row]));
  const artifacts = publicArtifacts.map((artifact) => {
    const exists = fs.existsSync(artifact);
    const row = rowByPath.get(artifact);
    return {
      artifact,
      exists,
      status: row ? classifyStatus(row.code) : 'clean',
    };
  });
  const changed = artifacts.filter((item) => item.exists && item.status !== 'clean');
  const missing = artifacts.filter((item) => !item.exists);
  const privateFindings = privatePublishFindings(changed.map((item) => item.artifact));
  const checks = [
    checkCommand('node', ['tools/public-conversion-check.js']),
    checkCommand('node', ['tools/public-funnel-safety-scan.js']),
    checkCommand('node', ['tools/public-command-reference-check.js']),
    checkCommand('node', ['tools/github-issue-template-check.js']),
    checkCommand('node', ['tools/public-local-link-check.js']),
    checkCommand('node', ['tools/publication-readiness.js']),
  ];
  return {
    branch: branchState(),
    artifacts,
    changed,
    missing,
    privateFindings,
    checks,
  };
}

function renderMarkdown(data) {
  const addList = data.changed.map((item) => item.artifact);
  const lines = [
    `# Public Revenue Publish Plan - ${new Date().toISOString().slice(0, 10)}`,
    '',
    'Dry-run only. This report does not run git add, commit, push, or publish.',
    '',
    '## Current Git State',
    '',
    `- Branch: ${data.branch.branch}`,
    `- Upstream: ${data.branch.upstream}`,
    `- Ahead of upstream: ${Number.isFinite(data.branch.ahead) ? data.branch.ahead : 'unknown'}`,
    `- Behind upstream: ${Number.isFinite(data.branch.behind) ? data.branch.behind : 'unknown'}`,
    `- Public artifacts changed/untracked: ${data.changed.length}`,
    `- Public artifacts missing: ${data.missing.length}`,
    `- Private/ignored artifacts planned for add: ${data.privateFindings.length}`,
    '',
    '## Public Artifacts Considered',
    '',
    '| Artifact | Exists | Status |',
    '|---|---|---|',
  ];
  for (const item of data.artifacts) {
    lines.push(`| ${item.artifact} | ${item.exists ? 'yes' : 'no'} | ${item.status} |`);
  }
  lines.push(
    '',
    '## Required Checks Before Publishing',
    '',
    '| Command | Exit status |',
    '|---|---:|',
  );
  for (const check of data.checks) {
    lines.push(`| \`${check.command}\` | ${check.status} |`);
  }
  lines.push(
    '',
    '## Private Artifact Guard',
    '',
    '| Artifact | Reason |',
    '|---|---|',
  );
  if (data.privateFindings.length === 0) {
    lines.push('| none | none |');
  } else {
    for (const finding of data.privateFindings) {
      lines.push(`| ${finding.artifact} | ${finding.reason} |`);
    }
  }
  lines.push(
    '',
    '## Consent Required Before Mutation',
    '',
    'The commands below are intentionally dry-run instructions. Do not run `git add`, `git commit`, or `git push` until the operator explicitly approves publishing this public revenue-funnel scope.',
    '',
    `- Branch to publish: ${data.branch.branch}`,
    `- Push target if approved: ${data.branch.upstream === 'NONE' ? 'origin HEAD' : data.branch.upstream}`,
    `- Public artifacts in add list: ${addList.length}`,
    `- Private/ignored artifacts in add list: ${data.privateFindings.length}`,
  );
  lines.push('', '## Dry-Run Publish Commands', '');
  if (data.missing.length) {
    lines.push(`Do not publish yet. Missing public artifact(s): ${data.missing.map((item) => item.artifact).join(', ')}`);
  } else if (data.privateFindings.length) {
    lines.push('Do not publish yet. The planned add list contains private or ignored artifact(s).');
  } else if (data.checks.some((check) => check.status !== 0)) {
    lines.push('Do not publish yet. One or more required checks failed.');
  } else if (addList.length === 0 && data.branch.ahead === 0) {
    lines.push('No public revenue artifact changes or local commits need publishing from this worktree.');
  } else {
    lines.push('```sh');
    if (addList.length) {
      lines.push(`git add ${addList.map(shellQuote).join(' ')}`);
      lines.push("git commit -m 'Add public paid reliability funnel'");
    }
    if (data.branch.ahead > 0 || addList.length) {
      lines.push(`git push ${data.branch.upstream === 'NONE' ? 'origin HEAD' : data.branch.upstream}`);
    }
    lines.push('```');
  }
  lines.push('', 'This plan is not revenue proof. Publishing makes the public funnel visible; only cleared payments count as revenue.');
  return lines.join('\n');
}

function renderConsole(data) {
  console.log(`Publish plan branch: ${data.branch.branch}`);
  console.log(`Publish plan upstream: ${data.branch.upstream}`);
  console.log(`Publish plan ahead: ${Number.isFinite(data.branch.ahead) ? data.branch.ahead : 'unknown'}`);
  console.log(`Publish plan behind: ${Number.isFinite(data.branch.behind) ? data.branch.behind : 'unknown'}`);
  console.log(`Publish plan changed public artifacts: ${data.changed.length}`);
  console.log(`Publish plan missing public artifacts: ${data.missing.length}`);
  console.log(`Publish plan private/ignored add findings: ${data.privateFindings.length}`);
  console.log(`Publish plan checks failing: ${data.checks.filter((check) => check.status !== 0).length}`);
  console.log(`Publish plan status: ${data.missing.length === 0 && data.privateFindings.length === 0 && data.checks.every((check) => check.status === 0) ? 'READY_FOR_OPERATOR_REVIEW' : 'NOT_READY'}`);
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
    console.log(`Public revenue publish plan written: ${args.out}`);
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
