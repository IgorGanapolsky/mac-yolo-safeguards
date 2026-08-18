#!/usr/bin/env node
'use strict';

/**
 * First-fail CI annotations (Buildkite process steal, not affiliated).
 * Name the failing STEP. Never dump logs. Do not migrate off GitHub Actions.
 *
 * Required contexts that are *absent* (not failing) are an outage signal —
 * check https://www.githubstatus.com/api/v2/summary.json before blaming code.
 */

const { spawnSync } = require('child_process');

const GITHUB_STATUS_URL = 'https://www.githubstatus.com/api/v2/summary.json';

const REQUIRED_CONTEXTS = [
  'Public funnel checks',
  'Socket Security: Project Report',
  'Hermes Mobile typecheck and tests',
  'Maestro ship-guard (Android emulator)',
  'macOS guard kit',
  'Maestro stranger cold-start',
  'Hermes Mobile iPad simulator gate',
];

function normalizeCheck(check) {
  return {
    name: String(check.name || check.context || ''),
    status: String(check.status || check.state || ''),
    conclusion: check.conclusion == null ? null : String(check.conclusion),
  };
}

function classifyCheck(check) {
  const row = normalizeCheck(check);
  const status = row.status.toUpperCase();
  const conclusion = (row.conclusion || '').toUpperCase();
  if (status && status !== 'COMPLETED' && status !== 'SUCCESS') return 'pending';
  if (conclusion === 'FAILURE' || conclusion === 'CANCELLED' || conclusion === 'TIMED_OUT' || conclusion === 'ACTION_REQUIRED') {
    return 'fail';
  }
  if (conclusion === 'SUCCESS' || conclusion === 'NEUTRAL' || conclusion === 'SKIPPED' || status === 'SUCCESS') {
    return 'ok';
  }
  if (!status && !conclusion) return 'missing';
  return 'pending';
}

function failingSteps(job) {
  return (job.steps || [])
    .filter((step) => String(step.conclusion || '').toLowerCase() === 'failure')
    .map((step) => String(step.name || ''));
}

function analyze(input) {
  const required = input.requiredContexts || REQUIRED_CONTEXTS;
  const checks = (input.checks || []).map(normalizeCheck);
  const jobs = input.jobs || [];
  const byName = new Map(checks.map((check) => [check.name, check]));

  const missingRequired = required.filter((name) => !byName.has(name));
  const present = required.map((name) => {
    const check = byName.get(name);
    return { name, class: check ? classifyCheck(check) : 'missing', check: check || null };
  });

  const failedRequired = present.filter((row) => row.class === 'fail').map((row) => row.name);
  const pendingRequired = present.filter((row) => row.class === 'pending').map((row) => row.name);

  const annotations = [];
  const failedJobs = [];
  for (const job of jobs) {
    const conclusion = String(job.conclusion || '').toLowerCase();
    if (conclusion !== 'failure' && conclusion !== 'cancelled' && conclusion !== 'timed_out') continue;
    const steps = failingSteps(job);
    const firstStep = steps[0] || null;
    failedJobs.push({
      job: job.name || job.id || 'unknown',
      conclusion,
      first_step: firstStep,
      failed_steps: steps,
    });
    annotations.push(firstStep
      ? `${job.name}: first fail → ${firstStep}`
      : `${job.name}: failed (no step names)`);
  }

  let verdict = 'green';
  if (missingRequired.length === required.length) verdict = 'missing_required';
  else if (failedRequired.length > 0 || failedJobs.length > 0) verdict = 'fail';
  else if (missingRequired.length > 0) verdict = 'missing_required';
  else if (pendingRequired.length > 0) verdict = 'pending';

  return {
    ok: verdict === 'green',
    schema: 'ci-first-fail/v1',
    inspired_by: 'https://buildkite.com/home/',
    affiliation: 'not affiliated',
    vendor_switch: 'do_not_migrate',
    reason: 'Public repo: GitHub Actions minutes are free. Branch protection is 7 GHA contexts. Buildkite themselves say stay on GHA until CI costs time or money.',
    verdict,
    required,
    fail: failedRequired,
    pending: pendingRequired,
    missing_required: missingRequired,
    check_github_status: verdict === 'missing_required',
    github_status_url: GITHUB_STATUS_URL,
    annotations,
    failed_jobs: failedJobs,
    dumped_logs: false,
  };
}

function parseArgs(argv) {
  const out = { json: false, help: false, pr: null, fixture: null };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') out.json = true;
    else if (arg === '--help' || arg === '-h') out.help = true;
    else if (arg === '--pr') out.pr = argv[++i];
    else if (arg === '--fixture') out.fixture = argv[++i];
    else if (arg === '--logs' || arg === '--log-failed') {
      throw new Error('refused: first-fail never dumps logs (use failing step names)');
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return out;
}

function usage() {
  return [
    'Usage: node tools/ci-first-fail.js [--json] [--pr N | --fixture path.json]',
    '',
    'Buildkite-style first-fail annotations. Stay on GitHub Actions.',
    'Never dumps logs. Missing required contexts → check GitHub Status first.',
  ].join('\n');
}

function ghJson(args) {
  const result = spawnSync('gh', args, { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error(`gh failed: ${(result.stderr || result.stdout || '').trim()}`);
  }
  return JSON.parse(result.stdout);
}

function loadFromPr(pr) {
  const view = ghJson([
    'pr', 'view', String(pr),
    '--json', 'url,headRefOid,statusCheckRollup',
  ]);
  const checks = view.statusCheckRollup || [];
  return { checks, jobs: [], url: view.url, sha: view.headRefOid };
}

function loadFixture(filePath) {
  const fs = require('fs');
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return {
    checks: data.checks || data.statusCheckRollup || [],
    jobs: data.jobs || [],
    requiredContexts: data.requiredContexts,
  };
}

function main(argv, io) {
  const args = parseArgs(argv || process.argv.slice(2));
  const stdout = (io && io.stdout) || process.stdout;
  const stderr = (io && io.stderr) || process.stderr;
  if (args.help) {
    stdout.write(`${usage()}\n`);
    return 0;
  }
  let payload;
  if (args.fixture) payload = loadFixture(args.fixture);
  else if (args.pr) payload = loadFromPr(args.pr);
  else {
    stderr.write(`${usage()}\n`);
    return 64;
  }
  const report = analyze(payload);
  if (args.json) stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  else {
    stdout.write(`ci-first-fail ${report.verdict}  migrate=${report.vendor_switch}\n`);
    for (const line of report.annotations) stdout.write(`  ${line}\n`);
    if (report.check_github_status) {
      stdout.write(`  required contexts missing — ${report.github_status_url}\n`);
    }
    if (report.fail.length) stdout.write(`  fail: ${report.fail.join(', ')}\n`);
    if (report.pending.length) stdout.write(`  pending: ${report.pending.join(', ')}\n`);
    if (report.missing_required.length && report.verdict !== 'green') {
      stdout.write(`  missing: ${report.missing_required.join(', ')}\n`);
    }
  }
  if (report.verdict === 'fail') return 1;
  if (report.verdict === 'missing_required') return 2;
  if (report.verdict === 'pending') return 3;
  return 0;
}

if (require.main === module) {
  try {
    process.exitCode = main();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  REQUIRED_CONTEXTS,
  analyze,
  classifyCheck,
  failingSteps,
  main,
  parseArgs,
};
