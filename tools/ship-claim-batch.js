#!/usr/bin/env node
'use strict';

/**
 * ship-claim-batch.js — Evaluate many ship/LIVE claims (honesty panel input).
 *
 *   node tools/ship-claim-batch.js --claims-file claims.json [--json]
 *   node tools/ship-claim-batch.js --self-test
 *
 * claims.json:
 * [
 *   { "id": "reddit-1", "claim": "3 replies LIVE", "resultsJson": "/tmp/r.json" },
 *   { "id": "device", "claim": "works on device", "device": true }
 * ]
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const gate = path.join(REPO, 'tools/ship-claim-gate.js');

function parseArgs(argv) {
  const out = { claimsFile: null, json: false, selfTest: false, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') out.json = true;
    else if (a === '--self-test') out.selfTest = true;
    else if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--claims-file') out.claimsFile = argv[++i];
  }
  return out;
}

function resolveRepoPath(p) {
  if (!p) return p;
  return path.isAbsolute(p) ? p : path.resolve(REPO, p);
}

function evaluateOne(entry) {
  const args = [gate, '--claim', String(entry.claim || ''), '--json'];
  if (entry.device) args.push('--device');
  if (entry.resultsJson) args.push('--results-json', resolveRepoPath(entry.resultsJson));
  if (entry.matrixFile) args.push('--matrix-file', resolveRepoPath(entry.matrixFile));
  if (entry.e2ePath) args.push('--e2e-path', resolveRepoPath(entry.e2ePath));
  if (entry.requireSha) args.push('--require-sha', entry.requireSha);
  if (entry.requireUrl) args.push('--require-url', entry.requireUrl);

  const r = spawnSync(process.execPath, args, {
    cwd: REPO,
    encoding: 'utf8',
    timeout: 30000,
  });
  let parsed = null;
  try {
    parsed = JSON.parse(r.stdout || '{}');
  } catch {
    parsed = { ok: false, raw: (r.stdout || r.stderr || '').slice(0, 500) };
  }
  return {
    id: entry.id || entry.claim || 'anon',
    claim: entry.claim,
    exitCode: r.status,
    ok: r.status === 0 && parsed && parsed.ok !== false,
    gate: parsed,
  };
}

function evaluateBatch(claims) {
  const results = (claims || []).map(evaluateOne);
  const allowed = results.filter((x) => x.ok).length;
  const blocked = results.length - allowed;
  return {
    ok: blocked === 0,
    total: results.length,
    allowed,
    blocked,
    results,
  };
}

function selfTest() {
  const tmpDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'ship-batch-'));
  const e2ePass = path.join(tmpDir, 'e2e-pass.json');
  const e2eFail = path.join(tmpDir, 'e2e-fail.json');
  const resultsPartial = path.join(tmpDir, 'results.json');
  fs.writeFileSync(e2ePass, JSON.stringify({ e2e: 'pass', unit: 'pass', updatedAt: '2026-08-03' }));
  fs.writeFileSync(e2eFail, JSON.stringify({ e2e: 'fail', unit: 'pass' }));
  fs.writeFileSync(
    resultsPartial,
    JSON.stringify([
      { ok: true, comment_id: 't1_a' },
      { ok: false, error: 'rate' },
    ]),
  );

  const report = evaluateBatch([
    {
      id: 'partial-all',
      claim: 'all replies LIVE on reddit',
      resultsJson: resultsPartial,
    },
    {
      id: 'device-ok',
      claim: 'works on device',
      device: true,
      e2ePath: e2ePass,
    },
    {
      id: 'device-bad',
      claim: 'works on device',
      device: true,
      e2ePath: e2eFail,
    },
  ]);

  const byId = Object.fromEntries(report.results.map((r) => [r.id, r]));
  const checks = [
    ['partial-all blocked', byId['partial-all'] && !byId['partial-all'].ok],
    ['device-ok allowed', byId['device-ok'] && byId['device-ok'].ok],
    ['device-bad blocked', byId['device-bad'] && !byId['device-bad'].ok],
  ];
  let failed = 0;
  for (const [name, pass] of checks) {
    if (pass) console.log(`PASS ${name}`);
    else {
      console.error(`FAIL ${name}`);
      failed++;
    }
  }
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
  if (failed) process.exitCode = 1;
  else console.log('ship-claim-batch self-test: all passed');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(`ship-claim-batch — multi-claim honesty gate

Usage:
  node tools/ship-claim-batch.js --claims-file claims.json [--json]
  node tools/ship-claim-batch.js --self-test
`);
    return;
  }
  if (args.selfTest) return selfTest();
  if (!args.claimsFile) {
    console.error('--claims-file required (or --self-test)');
    process.exitCode = 2;
    return;
  }
  const claims = JSON.parse(fs.readFileSync(args.claimsFile, 'utf8'));
  const list = Array.isArray(claims) ? claims : claims.claims || [];
  const report = evaluateBatch(list);
  if (args.json) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(`\n=== ship-claim-batch total=${report.total} allowed=${report.allowed} blocked=${report.blocked} ===`);
    for (const r of report.results) {
      console.log(`  ${r.ok ? 'ALLOW' : 'BLOCK'} ${r.id}: ${(r.claim || '').slice(0, 60)}`);
    }
  }
  if (!report.ok) process.exitCode = 1;
}

if (require.main === module) main();

module.exports = { evaluateBatch, evaluateOne };
