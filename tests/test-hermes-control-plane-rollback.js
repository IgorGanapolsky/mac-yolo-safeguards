#!/usr/bin/env node
'use strict';

/**
 * Offline-first contract tests for tools/hermes-control-plane-rollback.js
 * Live Cloudflare probes only when CLOUDFLARE_API_TOKEN or HERMES_CP_LIVE_ROLLBACK_TEST=1.
 */

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('path');
const fs = require('fs');
const test = require('node:test');

const REPO = path.resolve(__dirname, '..');
const TOOL = path.join(REPO, 'tools/hermes-control-plane-rollback.js');
const {
  parseJsonOutput,
  currentTraffic,
  previousVersionId,
  parseArgs,
  requireExecute,
} = require(TOOL);

const liveOk = Boolean(process.env.CLOUDFLARE_API_TOKEN || process.env.HERMES_CP_LIVE_ROLLBACK_TEST === '1');

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

test('parseJsonOutput strips wrangler banner', () => {
  const raw = '⛅️ wrangler 4.x\n[{"id":"a","created_on":"2026-07-26T00:00:00Z","versions":[{"version_id":"v1","percentage":100}]}]\n';
  const rows = parseJsonOutput(raw);
  assert.equal(rows[0].id, 'a');
});

test('currentTraffic and previousVersionId from newest-first deployments', () => {
  const deployments = [
    {
      id: 'd2',
      created_on: '2026-07-26T18:00:00Z',
      versions: [{ version_id: 'curr', percentage: 100 }],
    },
    {
      id: 'd1',
      created_on: '2026-07-26T17:00:00Z',
      versions: [{ version_id: 'prev', percentage: 100 }],
    },
  ];
  const traffic = currentTraffic(deployments);
  assert.equal(traffic.versions[0].versionId, 'curr');
  assert.equal(previousVersionId(deployments), 'prev');
});

test('parseArgs understands execute/yes/pct', () => {
  const a = parseArgs(['canary', 'vid', '--pct', '15', '--execute', '-y', '-m', 'reason']);
  assert.equal(a.cmd, 'canary');
  assert.equal(a.versionId, 'vid');
  assert.equal(a.pct, 15);
  assert.equal(a.execute, true);
  assert.equal(a.yes, true);
  assert.equal(a.message, 'reason');
});

test('requireExecute blocks mutation without execute/yes', () => {
  const dry = requireExecute({ execute: false, yes: false }, { action: 'rollback' });
  assert.equal(dry.dryRun, true);
  assert.throws(
    () => requireExecute({ execute: true, yes: false }, { action: 'rollback' }),
    /without -y/,
  );
  assert.equal(requireExecute({ execute: true, yes: true }, { action: 'x' }), null);
});

test('source forbids silent execute without yes', () => {
  const src = fs.readFileSync(TOOL, 'utf8');
  assert.match(src, /Refusing to mutate production without -y/);
  assert.match(src, /probeHealth/);
  assert.match(src, /versions deploy/);
  assert.match(src, /rollback/);
  assert.match(src, /require\.main === module/);
});

test('live status/list/prev when Cloudflare token present', { skip: !liveOk }, () => {
  const status = run(['status']);
  assert.equal(status.status, 0, status.stderr + status.stdout);
  const body = JSON.parse(status.stdout);
  assert.equal(body.cmd, 'status');
  assert.ok(body.traffic.versions.length >= 1);

  const list = run(['list']);
  assert.equal(list.status, 0, list.stderr + list.stdout);
  assert.ok(JSON.parse(list.stdout).versions.length >= 1);

  const prev = run(['prev']);
  assert.equal(prev.status, 0, prev.stderr + prev.stdout);
  const plan = JSON.parse(prev.stdout);
  assert.equal(plan.dryRun, true);
  assert.equal(plan.plan.action, 'rollback');
});
