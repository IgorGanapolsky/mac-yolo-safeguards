#!/usr/bin/env node
'use strict';

/**
 * Contract tests for tools/hermes-control-plane-rollback.js
 * Does not mutate production — only dry-run / source contracts.
 */

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('path');
const fs = require('fs');
const test = require('node:test');

const REPO = path.resolve(__dirname, '..');
const TOOL = path.join(REPO, 'tools/hermes-control-plane-rollback.js');

function run(args, env = {}) {
  return spawnSync(process.execPath, [TOOL, ...args], {
    encoding: 'utf8',
    cwd: REPO,
    env: { ...process.env, ...env },
    timeout: 90_000,
  });
}

test('tool is present and --help exits 0', () => {
  assert.ok(fs.existsSync(TOOL));
  const r = run(['--help']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /prev/);
  assert.match(r.stdout, /canary/);
  assert.match(r.stdout, /promote/);
});

test('status returns JSON with traffic + health (live read-only)', () => {
  const r = run(['status']);
  assert.equal(r.status, 0, `${r.stderr}\n${r.stdout}`);
  const body = JSON.parse(r.stdout);
  assert.equal(body.cmd, 'status');
  assert.equal(body.worker, 'hermes-control-plane');
  assert.ok(body.healthBefore);
  assert.ok(body.traffic);
  assert.ok(Array.isArray(body.traffic.versions));
  assert.ok(body.traffic.versions.length >= 1);
  assert.ok(body.healthBefore.ok === true || body.healthBefore.status === 200);
});

test('list returns versions array', () => {
  const r = run(['list']);
  assert.equal(r.status, 0, `${r.stderr}\n${r.stdout}`);
  const body = JSON.parse(r.stdout);
  assert.ok(Array.isArray(body.versions));
  assert.ok(body.versions.length >= 1);
  assert.ok(body.previousVersionId || body.traffic);
});

test('prev without --execute is dry-run only', () => {
  const r = run(['prev']);
  assert.equal(r.status, 0, `${r.stderr}\n${r.stdout}`);
  const body = JSON.parse(r.stdout);
  assert.equal(body.dryRun, true);
  assert.equal(body.plan.action, 'rollback');
  assert.ok(body.plan.to);
  assert.match(body.note || '', /--execute/);
});

test('to without -y refuses even with --execute', () => {
  const r = run(['to', '00000000-0000-0000-0000-000000000000', '--execute']);
  assert.notEqual(r.status, 0);
  assert.match(`${r.stderr}${r.stdout}`, /without -y|--yes|version|fail|Error|Refusing/i);
});

test('source forbids silent execute without yes', () => {
  const src = fs.readFileSync(TOOL, 'utf8');
  assert.match(src, /Refusing to mutate production without -y/);
  assert.match(src, /probeHealth/);
  assert.match(src, /versions deploy/);
  assert.match(src, /wrangler rollback|rollback/);
});
