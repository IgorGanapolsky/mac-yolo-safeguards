#!/usr/bin/env node
'use strict';

/**
 * Pins the fail-closed contract of tools/agent-eval-runner.js.
 *
 * Regression guard: the original runner gated every assertion on a recorded
 * result being present, so running it with no results file reported every eval
 * as PASS at 100% having verified nothing. These tests fail if that behaviour
 * ever returns.
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { runEvals, ALL_KEYS } = require('../tools/agent-eval-runner');

const repoRoot = path.resolve(__dirname, '..');
let passed = 0;
function ok(name) {
  passed += 1;
  console.log(`ok  ${passed}  ${name}`);
}

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'eval-runner-'));
function writeJson(name, data) {
  const p = path.join(tmpDir, name);
  fs.writeFileSync(p, JSON.stringify(data, null, 2));
  return p;
}

// --- 1. An eval with no executable assertion must FAIL, never silently pass ---
{
  const evalsPath = writeJson('unassertable.json', [
    { id: 'E1', name: 'Decorative eval', description: 'no assertion keys at all', prompt: 'x' },
  ]);
  const r = runEvals(evalsPath, null, { rootDir: repoRoot });
  assert.strictEqual(r.failed, 1, 'unassertable eval must FAIL');
  assert.strictEqual(r.passed, 0, 'unassertable eval must not be counted as a pass');
  assert.match(r.details[0].reasons[0], /no executable assertion/i);
  ok('eval declaring no assertion key fails closed');
}

// --- 2. A runtime eval with no recorded result must SKIP, never PASS ---
{
  const evalsPath = writeJson('runtime-only.json', [
    { id: 'E2', name: 'Runtime only', must_not_contain: ['FORBIDDEN'] },
  ]);
  const r = runEvals(evalsPath, null, { rootDir: repoRoot });
  assert.strictEqual(r.skipped, 1, 'unverified runtime eval must be SKIP');
  assert.strictEqual(r.passed, 0, 'unverified runtime eval must not be a pass');
  assert.strictEqual(r.details[0].status, 'SKIP');
  ok('runtime eval with no result reports SKIP, not PASS');
}

// --- 3. passRate must be computed over verified evals only, not skips ---
{
  const evalsPath = writeJson('rate.json', [
    { id: 'E3', name: 'Runtime only', must_not_contain: ['FORBIDDEN'] },
  ]);
  const r = runEvals(evalsPath, null, { rootDir: repoRoot });
  assert.strictEqual(r.verified, 0, 'nothing was verified');
  assert.strictEqual(r.passRate, '0.0%', 'a suite that verified nothing must not report 100%');
  ok('pass rate never credits skipped evals');
}

// --- 4. Runtime assertions actually fire when a result IS recorded ---
{
  const evalsPath = writeJson('violations.json', [
    { id: 'S1', name: 'secrets', must_not_contain: ['FORBIDDEN_TOKEN'] },
    { id: 'S2', name: 'nits', max_nits_allowed: 5 },
    { id: 'S3', name: 'protected files', forbidden_edit_globs: ['tests/**'] },
    { id: 'S4', name: 'action', triggers_action: 'generate_intent_artifact' },
  ]);
  const resultsPath = writeJson('violating-results.json', {
    S1: { output: 'leaked FORBIDDEN_TOKEN here' },
    S2: { nit_count: 99 },
    S3: { edited_files: ['tests/test-payments.js'] },
    S4: { action: 'did_nothing' },
  });
  const r = runEvals(evalsPath, resultsPath, { rootDir: repoRoot });
  assert.strictEqual(r.failed, 4, 'every violating result must fail its eval');
  assert.strictEqual(r.passed, 0);
  ok('all four runtime assertion types detect violations');
}

// --- 5. Missing evidence for a declared runtime assertion is a FAIL, not a pass ---
{
  const evalsPath = writeJson('missing-evidence.json', [
    { id: 'M1', name: 'nits', max_nits_allowed: 5 },
    { id: 'M2', name: 'protected', forbidden_edit_globs: ['tests/**'] },
  ]);
  const resultsPath = writeJson('empty-results.json', { M1: {}, M2: {} });
  const r = runEvals(evalsPath, resultsPath, { rootDir: repoRoot });
  assert.strictEqual(r.failed, 2, 'a result that records no evidence cannot pass');
  ok('recorded result lacking evidence fails closed');
}

// --- 6. Static assertions execute with no results file at all ---
{
  const evalsPath = writeJson('static.json', [
    { id: 'A1', name: 'artifacts', required_artifacts: ['definitely-not-here.md'] },
    { id: 'A2', name: 'contents', required_file_contains: { 'REVIEW.md': ['NOT_IN_THIS_FILE_XYZ'] } },
  ]);
  const r = runEvals(evalsPath, null, { rootDir: repoRoot });
  assert.strictEqual(r.failed, 2, 'static assertions must run without a results file');
  assert.strictEqual(r.skipped, 0);
  ok('static assertions run with no results file');
}

// --- 7. The shipped suite is fully assertable (no decorative evals) ---
{
  const shipped = JSON.parse(fs.readFileSync(path.join(repoRoot, 'evals/sdlc-evals.json'), 'utf8'));
  const decorative = shipped.filter((e) => !ALL_KEYS.some((k) => e[k] !== undefined));
  assert.deepStrictEqual(
    decorative.map((e) => e.id),
    [],
    'every shipped eval must declare at least one executable assertion'
  );
  ok(`all ${shipped.length} shipped evals declare an executable assertion`);
}

fs.rmSync(tmpDir, { recursive: true, force: true });
console.log(`\n1..${passed}`);
console.log(`All ${passed} agent-eval-runner assertions passed.`);
