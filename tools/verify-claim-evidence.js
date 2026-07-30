#!/usr/bin/env node
/**
 * verify-claim-evidence.js — Fail closed when an agent is about to claim "shipped /
 * works / E2E green" without machine evidence.
 *
 * Usage:
 *   node tools/verify-claim-evidence.js                  # full local gate
 *   node tools/verify-claim-evidence.js --json
 *   node tools/verify-claim-evidence.js --claim e2e
 *   node tools/verify-claim-evidence.js --claim ota
 *   node tools/verify-claim-evidence.js --claim merged --pr 1255
 *
 * Exit 0 = evidence supports the claim class.
 * Exit 1 = missing/stale/wrong evidence (do NOT claim success).
 * Exit 2 = usage / infra error.
 *
 * Standing rule (AGENTS Honesty Protocol + prevent-recurrence S25):
 *   e2e=skipped is NOT pass. Absence of a failure is not a pass.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const LATEST_JSON = path.join(REPO, 'hermes-mobile/docs/proofs/continuous/latest.json');

/** Continuous E2E pass older than this is "stale" for ship claims (minutes). */
const E2E_FRESH_MIN = Number(process.env.HERMES_EVIDENCE_E2E_FRESH_MIN || 45);

function parseArgs(argv) {
  const args = { json: false, claim: 'all', pr: null, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--json') args.json = true;
    else if (a === '--claim') args.claim = requireValue(argv, ++i, a);
    else if (a === '--pr') args.pr = requireValue(argv, ++i, a);
    else if (a === '--help' || a === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${a}`);
  }
  return args;
}

function requireValue(argv, index, flag) {
  if (!argv[index]) throw new Error(`${flag} requires a value`);
  return argv[index];
}

function readLatestE2e() {
  if (!fs.existsSync(LATEST_JSON)) {
    return {
      ok: false,
      reason: 'missing hermes-mobile/docs/proofs/continuous/latest.json',
      path: LATEST_JSON,
    };
  }
  let data;
  try {
    data = JSON.parse(fs.readFileSync(LATEST_JSON, 'utf8'));
  } catch (err) {
    return { ok: false, reason: `invalid JSON: ${err.message}`, path: LATEST_JSON };
  }
  const e2e = data.e2e;
  const unit = data.unit;
  const updatedAt = data.updatedAt;
  let ageMin = null;
  if (updatedAt) {
    const t = Date.parse(updatedAt);
    if (Number.isFinite(t)) {
      ageMin = (Date.now() - t) / 60000;
    }
  }
  const e2ePass = e2e === 'pass';
  const unitPass = unit === 'pass';
  const fresh = ageMin != null && ageMin <= E2E_FRESH_MIN;
  const skipped = e2e === 'skipped';
  const violations = [];
  if (skipped) {
    violations.push('e2e=skipped is NOT pass (S25 / OTA crisis amend)');
  }
  if (!e2ePass) {
    violations.push(`e2e=${JSON.stringify(e2e)} (need "pass")`);
  }
  if (!unitPass) {
    violations.push(`unit=${JSON.stringify(unit)} (need "pass" for full continuous cycle)`);
  }
  if (!fresh) {
    violations.push(
      ageMin == null
        ? 'updatedAt missing/unparseable'
        : `latest.json age ${ageMin.toFixed(1)}m > ${E2E_FRESH_MIN}m freshness budget`,
    );
  }
  return {
    ok: violations.length === 0,
    path: LATEST_JSON,
    data,
    ageMin,
    e2ePass,
    unitPass,
    fresh,
    skipped,
    violations,
  };
}

function checkPrMerged(prNumber) {
  const r = spawnSync(
    'gh',
    ['pr', 'view', String(prNumber), '--json', 'state,mergedAt,mergeCommit,url,title'],
    { encoding: 'utf8', cwd: REPO },
  );
  if (r.status !== 0) {
    return {
      ok: false,
      reason: `gh pr view failed: ${(r.stderr || r.stdout || '').trim().slice(0, 200)}`,
    };
  }
  let data;
  try {
    data = JSON.parse(r.stdout);
  } catch (err) {
    return { ok: false, reason: `gh JSON parse error: ${err.message}` };
  }
  const merged = data.state === 'MERGED' && Boolean(data.mergedAt);
  return {
    ok: merged,
    state: data.state,
    mergedAt: data.mergedAt || null,
    sha: data.mergeCommit?.oid || null,
    url: data.url,
    title: data.title,
    violations: merged ? [] : [`PR #${prNumber} state=${data.state} (need MERGED)`],
  };
}

/**
 * OTA claims need continuous e2e=pass OR stranger proof — never skipped alone.
 */
function checkOtaGateScript() {
  const gate = path.join(REPO, 'hermes-mobile/scripts/require-fresh-user-ota-gate.sh');
  if (!fs.existsSync(gate)) {
    return { ok: false, violations: ['missing require-fresh-user-ota-gate.sh'] };
  }
  const body = fs.readFileSync(gate, 'utf8');
  const violations = [];
  if (!body.includes('e2e=pass')) violations.push('OTA gate missing e2e=pass check');
  if (!body.includes('e2e=skipped is NOT pass') && !/skipped.*NOT pass/i.test(body)) {
    violations.push('OTA gate missing e2e=skipped is NOT pass');
  }
  return { ok: violations.length === 0, violations, path: gate };
}

function buildReport({ claim = 'all', pr = null } = {}) {
  const report = {
    ok: true,
    claim,
    checkedAt: new Date().toISOString(),
    checks: {},
  };
  const needE2e = claim === 'all' || claim === 'e2e' || claim === 'ship' || claim === 'ota';
  const needOta = claim === 'all' || claim === 'ota';
  const needMerged = claim === 'merged' || (claim === 'all' && pr);

  if (needE2e) {
    report.checks.continuousE2e = readLatestE2e();
    if (!report.checks.continuousE2e.ok) report.ok = false;
  }
  if (needOta) {
    report.checks.otaGateContract = checkOtaGateScript();
    if (!report.checks.otaGateContract.ok) report.ok = false;
    // OTA also needs continuous or stranger — continuous check already above for ota claim
  }
  if (needMerged) {
    if (!pr) {
      report.checks.merged = { ok: false, violations: ['--pr N required for merged claim'] };
      report.ok = false;
    } else {
      report.checks.merged = checkPrMerged(pr);
      if (!report.checks.merged.ok) report.ok = false;
    }
  }

  report.summary = report.ok
    ? 'evidence supports claim class'
    : 'evidence MISSING or STALE — do not claim success';
  return report;
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(err.message);
    process.exit(2);
  }
  if (args.help) {
    console.log(`Usage: node tools/verify-claim-evidence.js [--json] [--claim all|e2e|ota|ship|merged] [--pr N]
Fail closed without machine evidence. e2e=skipped is never pass.`);
    process.exit(0);
  }
  const report = buildReport({ claim: args.claim, pr: args.pr });
  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else if (report.ok) {
    console.log(`✓ ${report.summary}`);
    if (report.checks.continuousE2e?.data) {
      const d = report.checks.continuousE2e.data;
      console.log(
        `  continuous: unit=${d.unit} e2e=${d.e2e} age=${report.checks.continuousE2e.ageMin?.toFixed(1)}m slo=${d.slo || '?'}`,
      );
    }
    if (report.checks.merged?.sha) {
      console.log(`  merged: ${report.checks.merged.url} @ ${report.checks.merged.sha.slice(0, 10)}`);
    }
  } else {
    console.error(`✗ ${report.summary}`);
    for (const [name, check] of Object.entries(report.checks)) {
      if (check.ok) continue;
      const vs = check.violations || (check.reason ? [check.reason] : ['failed']);
      for (const v of vs) {
        console.error(`  [${name}] ${v}`);
      }
    }
  }
  process.exit(report.ok ? 0 : 1);
}

module.exports = {
  buildReport,
  readLatestE2e,
  checkPrMerged,
  checkOtaGateScript,
  E2E_FRESH_MIN,
  LATEST_JSON,
};

if (require.main === module) {
  main();
}
