#!/usr/bin/env node
'use strict';

/**
 * CI gate: maturity tools exist and offline scorecard / RAG eval / MCP health pass.
 */
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const REPO = path.resolve(__dirname, '..');

function run(script, args = []) {
  return spawnSync(process.execPath, [path.join(REPO, script), ...args], {
    cwd: REPO,
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  });
}

test('maturity tooling files exist', () => {
  for (const rel of [
    'tools/system-maturity-scorecard.js',
    'tools/rag-retrieval-eval.js',
    'tools/mcp-health-check.js',
    'docs/SYSTEM-MATURITY.md',
    'tests/fixtures/rag-eval/cases.json',
  ]) {
    assert.ok(fs.existsSync(path.join(REPO, rel)), rel);
  }
});

test('MCP health check passes structurally and can write inventory', () => {
  const result = run('tools/mcp-health-check.js', ['--write-docs', '--json']);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const body = JSON.parse(result.stdout);
  assert.ok(body.ok);
  assert.ok(body.serverCount >= 1);
  assert.ok(fs.existsSync(path.join(REPO, 'docs/MCP-INVENTORY.md')));
});

test('RAG retrieval eval passes fixed fixtures', () => {
  const result = run('tools/rag-retrieval-eval.js', ['--json']);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const body = JSON.parse(result.stdout);
  assert.ok(body.ok, JSON.stringify(body.results?.filter((r) => !r.pass)));
  assert.ok(body.meanRecallAtK >= 0.99);
});

test('system maturity scorecard overall is at least 3.5 with no pillar under 3.5', () => {
  const result = run('tools/system-maturity-scorecard.js', ['--json']);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const body = JSON.parse(result.stdout);
  assert.ok(body.overall >= 3.5, `overall ${body.overall}`);
  for (const pillar of body.pillars) {
    assert.ok(pillar.score >= 3.5, `${pillar.id} score ${pillar.score}`);
  }
});

test('production maturity requires current device-verified E2E proof, not just a gate file', () => {
  const result = run('tools/system-maturity-scorecard.js', ['--json']);
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const body = JSON.parse(result.stdout);
  const production = body.pillars.find((pillar) => pillar.id === 'production_eval');
  assert.ok(production, 'production_eval pillar');

  const gateTool = production.checks.find(
    (check) => check.id === 'observability-gate-tool',
  );
  const deviceProof = production.checks.find(
    (check) => check.id === 'observability-device-proof',
  );
  assert.equal(gateTool?.pass, true, 'observability tool must exist');
  assert.ok(deviceProof, 'device proof check must exist');

  const latest = JSON.parse(
    fs.readFileSync(
      path.join(REPO, 'hermes-mobile/docs/proofs/continuous/latest.json'),
      'utf8',
    ),
  );
  if (latest.e2e !== 'pass') {
    assert.equal(deviceProof.pass, false, deviceProof.detail);
    assert.ok(
      production.score < 5,
      `production score must be below 5 without device proof, got ${production.score}`,
    );
  }
});
