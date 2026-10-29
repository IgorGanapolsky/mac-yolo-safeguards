#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const gate = require('../tools/gitlab-delivery-prompts-gate');

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`ok ${passed} ${name}`);
}

check('a logical review holds without intent and ignores a citation outside the diff', () => {
  const empty = gate.reviewLogical({ diff: '', intent: 'ship', findings: [{ citation: 'return 1' }] });
  assert.equal(empty.decision, 'empty');
  assert.deepEqual(empty.findings, []);
  const held = gate.reviewLogical({ diff: 'function a() { return 1; }' });
  assert.equal(held.decision, 'hold');
  assert.equal(held.reason, 'missing_intent');
  const stray = gate.reviewLogical({
    diff: 'function a() { return 1; }',
    intent: 'return one',
    findings: [{ citation: 'return 2', kind: 'logical' }],
  });
  assert.equal(stray.decision, 'hold');
  assert.equal(stray.reason, 'citation_not_in_diff');
  const cited = gate.reviewLogical({
    diff: 'function a() { return 1; }',
    intent: 'return one',
    findings: [{ citation: 'return 1', kind: 'logical' }],
  });
  assert.equal(cited.decision, 'findings');
  assert.equal(cited.findings[0].citation, 'return 1');
});

check('breaking changes are the five public classes and an added method is not one', () => {
  const added = gate.breakingReport({ publicMethods: [{ name: 'ship', change: 'added' }] });
  assert.equal(added.breaking, false);
  assert.deepEqual(added.classes, []);
  const report = gate.breakingReport({
    signatures: [{ name: 'ship', before: '(a)', after: '(a, b)' }],
    publicMethods: [{ name: 'oldShip', change: 'renamed' }],
    returnTypes: [{ name: 'ship', before: 'number', after: 'string' }],
    schemas: [{ name: 'orders', change: 'add column' }],
    config: [{ key: 'port', change: 'removed' }],
  });
  assert.equal(report.breaking, true);
  assert.deepEqual(report.classes, ['api_signature', 'public_method', 'return_type', 'schema', 'config']);
  const optional = gate.breakingReport({ config: [{ key: 'color', change: 'added', breaking: false }] });
  assert.equal(optional.breaking, false);
});

check('a scan finding stays open until the disposition is complete', () => {
  const empty = gate.triageFindings([]);
  assert.equal(empty.triaged, false);
  assert.equal(empty.reason, 'empty');
  assert.deepEqual(empty.findings, []);
  const dismissed = gate.triageFindings([{ id: '1', severity: 'high', disposition: 'false_positive' }]);
  assert.equal(dismissed.triaged, false);
  assert.equal(dismissed.reason, 'false_positive_without_reason');
  const incomplete = gate.triageFindings([{ id: '2', severity: 'critical', disposition: 'real', explanation: 'injection' }]);
  assert.equal(incomplete.reason, 'real_risk_incomplete');
  const ordered = gate.triageFindings([
    { id: 'low', severity: 'low', disposition: 'real', explanation: 'leaks a token', remediation: 'redact the log' },
    { id: 'crit', severity: 'critical', disposition: 'false_positive', reason: 'fixture string in a test' },
  ]);
  assert.equal(ordered.triaged, true);
  assert.equal(ordered.blocked, true);
  assert.deepEqual(ordered.findings.map((item) => item.id), ['crit', 'low']);
});

check('security review does not ship while a category is missing or a finding has no note', () => {
  const partial = gate.reviewSecurity({
    injection: { status: 'clear' },
    auth: { status: 'clear' },
    exposure: { status: 'clear' },
    dependency: { status: 'clear' },
  });
  assert.equal(partial.ship, false);
  assert.equal(partial.surface, 'crypto');
  const bare = gate.reviewSecurity({
    injection: { status: 'finding' },
    auth: { status: 'clear' },
    exposure: { status: 'clear' },
    dependency: { status: 'clear' },
    crypto: { status: 'clear' },
  });
  assert.equal(bare.reason, 'finding_without_note');
  const clear = gate.reviewSecurity({
    injection: { status: 'clear' },
    auth: { status: 'clear' },
    exposure: { status: 'finding', note: 'logs the request body' },
    dependency: { status: 'clear' },
    crypto: { status: 'clear' },
  });
  assert.equal(clear.ship, false);
  assert.equal(clear.reason, 'findings_remain');
});

check('release notes reject a breaking item filed as a feature and keep an empty list empty', () => {
  const empty = gate.releaseNotes([]);
  assert.equal(empty.ok, true);
  assert.deepEqual(empty.groups.features, []);
  assert.deepEqual(empty.groups.breaking, []);
  const misfiled = gate.releaseNotes([{ title: 'Faster boot', group: 'features', breaking: true }]);
  assert.equal(misfiled.ok, false);
  assert.equal(misfiled.reason, 'breaking_misfiled');
  assert.equal(misfiled.groups, null);
  const notes = gate.releaseNotes([
    { title: 'Window line', group: 'features' },
    { title: 'Null plan', group: 'fixes' },
    { title: 'Shorter brief', group: 'performance' },
    { title: 'Port bind', group: 'breaking', breaking: true },
    { title: 'Old flag', group: 'deprecations' },
  ]);
  assert.equal(notes.ok, true);
  assert.deepEqual(notes.groups.breaking, ['Port bind']);
  assert.equal(notes.groups.features.length, 1);
});

check('docs stay unreviewed until each surface is marked, and an API break needs an API update', () => {
  const none = gate.docDrift({ files: [] });
  assert.equal(none.current, true);
  assert.equal(none.reason, 'no_change');
  const skipped = gate.docDrift({
    files: ['tools/gitlab-delivery-prompts-gate.js'],
    surfaces: { readme: 'unchanged' },
  });
  assert.equal(skipped.current, false);
  assert.equal(skipped.reason, 'surface_unreviewed');
  const drift = gate.docDrift({
    files: ['tools/ship.js'],
    surfaces: { readme: 'unchanged', api: 'unchanged', architecture: 'unchanged', onboarding: 'unchanged' },
    breaking: { signatures: [{ name: 'ship', before: '()', after: '(id)' }] },
  });
  assert.equal(drift.current, false);
  assert.equal(drift.reason, 'api_drift');
  const current = gate.docDrift({
    files: ['tools/ship.js'],
    surfaces: { readme: 'unchanged', api: 'update', architecture: 'unchanged', onboarding: 'unchanged' },
    breaking: { signatures: [{ name: 'ship', before: '()', after: '(id)' }] },
  });
  assert.equal(current.current, true);
  assert.deepEqual(current.updates, ['api']);
});

check('an empty epic stays empty and issues follow dependencies', () => {
  const empty = gate.breakDownEpic({ description: '   ' });
  assert.equal(empty.ok, true);
  assert.deepEqual(empty.issues, []);
  const orphan = gate.breakDownEpic({
    issues: [{ id: 'a', acceptance: ['ships'], size: 1 }],
  });
  assert.equal(orphan.reason, 'issues_without_epic');
  const missing = gate.breakDownEpic({
    description: 'Pack the loopback service',
    issues: [{ id: 'a', acceptance: [], size: 1 }],
  });
  assert.equal(missing.reason, 'missing_acceptance');
  const huge = gate.breakDownEpic({
    description: 'Pack the loopback service',
    issues: [{ id: 'a', acceptance: ['binds loopback'], size: 6 }],
  });
  assert.equal(huge.reason, 'unreasonable_size');
  const cycle = gate.breakDownEpic({
    description: 'Pack the loopback service',
    issues: [
      { id: 'a', acceptance: ['binds'], size: 1, dependsOn: ['b'] },
      { id: 'b', acceptance: ['lists tools'], size: 1, dependsOn: ['a'] },
    ],
  });
  assert.equal(cycle.reason, 'dependency_cycle');
  const ordered = gate.breakDownEpic({
    description: 'Pack the loopback service',
    issues: [
      { id: 'menu', acceptance: ['polls health'], size: 2, dependsOn: ['service'] },
      { id: 'service', acceptance: ['binds 127.0.0.1'], size: 2 },
    ],
  });
  assert.equal(ordered.ok, true);
  assert.deepEqual(ordered.issues, ['service', 'menu']);
});

check('a test suite is incomplete until every kind is present', () => {
  const missingFn = gate.reviewTests({ cases: [{ kind: 'happy', title: 'adds' }] });
  assert.equal(missingFn.complete, false);
  assert.equal(missingFn.reason, 'missing_function');
  const partial = gate.reviewTests({
    fn: 'function add(a, b) { return a + b; }',
    cases: [
      { kind: 'happy', title: 'adds' },
      { kind: 'edge', title: 'zero' },
      { kind: 'error', title: 'throws' },
      { kind: 'boundary', title: 'max' },
    ],
  });
  assert.equal(partial.complete, false);
  assert.deepEqual(partial.missing, ['invalid']);
  const full = gate.reviewTests({
    fn: 'function add(a, b) { return a + b; }',
    cases: [
      { kind: 'happy', title: 'adds' },
      { kind: 'edge', title: 'zero' },
      { kind: 'error', title: 'throws' },
      { kind: 'boundary', title: 'max' },
      { kind: 'invalid', title: 'rejects a string' },
    ],
  });
  assert.equal(full.complete, true);
  assert.deepEqual(full.missing, []);
});

check('a caller coverage percentage does not clear an untested name', () => {
  const gaps = gate.coverageGaps({ functions: ['add', 'sub'], tested: ['add'], callerPercent: 100 });
  assert.equal(gaps.covered, false);
  assert.equal(gaps.callerPercent, 100);
  assert.deepEqual(gaps.gaps, ['sub']);
  assert.deepEqual(gaps.priority, ['sub']);
  const none = gate.coverageGaps({ functions: [], callerPercent: 100 });
  assert.equal(none.covered, false);
  assert.deepEqual(none.gaps, []);
  const done = gate.coverageGaps({ functions: ['add'], tested: ['add'], callerPercent: 10 });
  assert.equal(done.covered, true);
  assert.equal(done.callerPercent, 10);
});

check('a pipeline explanation requires the cause to appear in the log', () => {
  const missing = gate.debugPipeline({ job: 'test', error: 'ENOENT' });
  assert.equal(missing.explained, false);
  assert.equal(missing.reason, 'missing_failure');
  const invented = gate.debugPipeline({
    job: 'test',
    stage: 'verify',
    error: 'Error: ENOENT missing file',
    cause: 'disk full',
    fix: 'free space',
    why: 'the cache grew',
    prevention: 'cap the cache',
  });
  assert.equal(invented.explained, false);
  assert.equal(invented.reason, 'cause_not_in_log');
  const explained = gate.debugPipeline({
    job: 'test',
    stage: 'verify',
    error: 'Error: ENOENT missing file',
    cause: 'ENOENT',
    fix: 'restore the fixture file',
    why: 'the path was deleted',
    prevention: 'keep the fixture in the worktree',
  });
  assert.equal(explained.explained, true);
  assert.equal(explained.job, 'test');
});

check('the fixture command exits 0 only for the fail-closed report', () => {
  const root = path.resolve(__dirname, '..');
  const script = path.join(root, 'tools/gitlab-delivery-prompts-gate.js');
  const src = fs.readFileSync(script, 'utf8');
  assert.doesNotMatch(src, /child_process|execFileSync|execSync/);
  assert.doesNotMatch(src, /20%|80%/);
  const usage = spawnSync(process.execPath, [script], { cwd: root, encoding: 'utf8' });
  assert.equal(usage.status, 2);
  const run = spawnSync(process.execPath, [script, '--json'], { cwd: root, encoding: 'utf8' });
  assert.equal(run.status, 0, run.stderr);
  const report = JSON.parse(run.stdout);
  assert.equal(report.fixtures, true);
  assert.equal(report.ok, true);
});

console.log(`gitlab-delivery-prompts-gate: ${passed} checks passed`);
