#!/usr/bin/env node
'use strict';

/**
 * CI gate for Deterministic Simulation Testing (Antithesis-inspired, local).
 *
 * Floors:
 *   - dst-core self-test determinism
 *   - task-routing exhaustive oracle (finite space) 100% green
 *   - task-routing random exploration: 30 seeds × 300 steps, 0 invariant violations
 *   - same seed twice ⇒ same transcript digest
 */

const assert = require('assert');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');

function runNode(rel, args = []) {
  const r = spawnSync(process.execPath, [path.join(REPO, rel), ...args], {
    cwd: REPO,
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  });
  return r;
}

function parseJson(stdout) {
  return JSON.parse(stdout);
}

function main() {
  // 1) Core PRNG determinism
  const self = runNode('tools/dst-core.js', ['--self-test']);
  assert.strictEqual(self.status, 0, `dst-core self-test failed: ${self.stderr || self.stdout}`);
  const selfBody = parseJson(self.stdout);
  assert.strictEqual(selfBody.ok, true);

  // 2) Exhaustive discrete oracle
  const exh = runNode('tools/dst-task-routing.js', ['--exhaustive']);
  assert.strictEqual(exh.status, 0, `exhaustive failed: ${exh.stdout}`);
  const exhBody = parseJson(exh.stdout);
  assert.strictEqual(exhBody.ok, true);
  assert.ok(exhBody.cases >= 40, 'exhaustive case count too small');

  // 3) Determinism of multi-step fault schedule
  const det = runNode('tools/dst-task-routing.js', ['--determinism', '--seed', '99', '--steps', '400']);
  assert.strictEqual(det.status, 0, `determinism failed: ${det.stdout}`);
  const detBody = parseJson(det.stdout);
  assert.strictEqual(detBody.ok, true);
  assert.ok(detBody.digest && detBody.digest.length === 16);

  // 4) Multi-seed exploration (guided fault injection)
  const multi = runNode('tools/dst-run.js', [
    '--scenario',
    'task-routing',
    '--seeds',
    '30',
    '--steps',
    '300',
    '--seed',
    '7',
  ]);
  assert.strictEqual(multi.status, 0, `multi-seed failed:\n${multi.stdout}\n${multi.stderr}`);
  const multiBody = parseJson(multi.stdout);
  assert.strictEqual(multiBody.ok, true);
  const results = multiBody.reports[0].results;
  assert.strictEqual(results.length, 30);
  const totalStates = results.reduce((s, r) => s + r.states, 0);
  assert.ok(totalStates > 50, `expected exploration across seeds, got totalStates=${totalStates}`);

  // 5) Golden lockstep with known hand cases (TS parity)
  const { decideTaskRoute } = require(path.join(REPO, 'tools/dst-task-routing.js'));
  const now = 1_000_000;
  assert.deepStrictEqual(
    decideTaskRoute({
      preference: 'cloud',
      device: { failoverMode: 'manual', lastSeenAt: now - 10_000 },
      now,
    }),
    { status: 'cloud_pending', route: 'cloud', preference: 'cloud' },
  );
  assert.strictEqual(
    decideTaskRoute({
      preference: 'local',
      device: { failoverMode: 'auto', lastSeenAt: now - 120_000 },
      now,
    }).route,
    'blocked',
  );
  assert.strictEqual(
    decideTaskRoute({
      preference: 'auto',
      device: { failoverMode: 'auto', lastSeenAt: now - 120_000 },
      now,
    }).route,
    'cloud',
  );

  console.log(
    `DST harness: PASS — exhaustive ${exhBody.cases} · multi-seed 30×300 · digest=${detBody.digest} · states≈${totalStates}`,
  );
}

main();
