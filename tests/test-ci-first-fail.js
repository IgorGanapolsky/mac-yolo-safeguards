#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  REQUIRED_CONTEXTS,
  analyze,
  classifyCheck,
  failingSteps,
  main,
  parseArgs,
} = require('../tools/ci-first-fail');

let passed = 0;
function ok(name) {
  passed += 1;
  console.log(`ok  ${passed}  ${name}`);
}

assert.equal(REQUIRED_CONTEXTS.length, 7);
ok('tracks the 7 required branch-protection contexts');

{
  assert.equal(classifyCheck({ status: 'COMPLETED', conclusion: 'FAILURE' }), 'fail');
  assert.equal(classifyCheck({ status: 'IN_PROGRESS', conclusion: null }), 'pending');
  assert.equal(classifyCheck({ status: 'COMPLETED', conclusion: 'SUCCESS' }), 'ok');
  ok('classifies fail vs pending vs ok without reading logs');
}

{
  const steps = failingSteps({
    steps: [
      { name: 'Checkout', conclusion: 'success' },
      { name: 'Node tool unit tests', conclusion: 'failure' },
      { name: 'Post Checkout', conclusion: 'success' },
    ],
  });
  assert.deepEqual(steps, ['Node tool unit tests']);
  ok('extracts the failing STEP name, not teardown');
}

{
  const report = analyze({
    requiredContexts: ['macOS guard kit', 'Public funnel checks'],
    checks: [
      { name: 'macOS guard kit', status: 'COMPLETED', conclusion: 'FAILURE' },
      { name: 'Public funnel checks', status: 'COMPLETED', conclusion: 'SUCCESS' },
    ],
    jobs: [{
      name: 'macOS guard kit',
      conclusion: 'failure',
      steps: [
        { name: 'JavaScript syntax', conclusion: 'success' },
        { name: 'Node tool unit tests', conclusion: 'failure' },
      ],
    }],
  });
  assert.equal(report.verdict, 'fail');
  assert.equal(report.dumped_logs, false);
  assert.equal(report.vendor_switch, 'do_not_migrate');
  assert.equal(report.failed_jobs[0].first_step, 'Node tool unit tests');
  assert.ok(report.annotations[0].includes('Node tool unit tests'));
  assert.equal(report.affiliation, 'not affiliated');
  ok('annotates first fail and refuses a Buildkite vendor switch');
}

{
  const required = ['macOS guard kit', 'Public funnel checks'];
  const report = analyze({
    requiredContexts: required,
    checks: [{ name: 'Socket Security: Project Report', status: 'COMPLETED', conclusion: 'SUCCESS' }],
    jobs: [],
  });
  assert.equal(report.verdict, 'missing_required');
  assert.equal(report.check_github_status, true);
  assert.deepEqual(report.missing_required, required);
  assert.match(report.github_status_url, /githubstatus\.com/);
  ok('absent required contexts are an outage signal, not a code blame');
}

{
  const report = analyze({
    requiredContexts: ['macOS guard kit'],
    checks: [{ name: 'macOS guard kit', status: 'QUEUED', conclusion: null }],
    jobs: [],
  });
  assert.equal(report.verdict, 'pending');
  assert.equal(report.check_github_status, false);
  ok('queued required check is pending, not missing');
}

{
  const report = analyze({
    requiredContexts: ['macOS guard kit'],
    checks: [{ name: 'macOS guard kit', status: 'COMPLETED', conclusion: 'SUCCESS' }],
    jobs: [],
  });
  assert.equal(report.ok, true);
  assert.equal(report.verdict, 'green');
  ok('green when required checks completed successfully');
}

{
  assert.throws(() => parseArgs(['--log-failed']), /never dumps logs/);
  assert.throws(() => parseArgs(['--logs']), /never dumps logs/);
  ok('CLI refuses --logs / --log-failed');
}

{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ci-first-fail-'));
  const fixture = path.join(tmp, 'pr.json');
  fs.writeFileSync(fixture, JSON.stringify({
    requiredContexts: ['macOS guard kit'],
    checks: [{ name: 'macOS guard kit', status: 'COMPLETED', conclusion: 'FAILURE' }],
    jobs: [{
      name: 'macOS guard kit',
      conclusion: 'failure',
      steps: [{ name: 'Node tool unit tests', conclusion: 'failure' }],
    }],
  }));
  const chunks = [];
  const code = main(['--fixture', fixture, '--json'], {
    stdout: { write: (s) => chunks.push(s) },
    stderr: { write: () => {} },
  });
  assert.equal(code, 1);
  const report = JSON.parse(chunks.join(''));
  assert.equal(report.failed_jobs[0].first_step, 'Node tool unit tests');
  assert.equal(report.dumped_logs, false);
  fs.rmSync(tmp, { recursive: true, force: true });
  ok('CLI --fixture prints first-fail JSON without logs');
}

{
  const source = fs.readFileSync(path.join(__dirname, '..', 'tools', 'ci-first-fail.js'), 'utf8');
  assert.doesNotMatch(source, /run view --log-failed/);
  assert.match(source, /do_not_migrate/);
  ok('source never shells gh run view --log-failed');
}

console.log(`\n${passed} ci-first-fail tests passed`);
