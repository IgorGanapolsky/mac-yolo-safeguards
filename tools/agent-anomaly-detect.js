#!/usr/bin/env node
'use strict';

/**
 * agent-anomaly-detect.js — District "Anomaly Detection" pillar for agent fleets.
 *
 * Unifies signals: CodeQL pattern gate, open-alert budget (optional), coord/locks,
 * ship-claim honesty. Outputs ranked anomalies + next actions (diagnostic-ready).
 *
 *   node tools/agent-anomaly-detect.js
 *   node tools/agent-anomaly-detect.js --json
 *   node tools/agent-anomaly-detect.js --strict   # exit 1 if any high anomaly
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');

function runNode(script, args = [], timeout = 120000) {
  const r = spawnSync(process.execPath, [path.join(REPO, script), ...args], {
    cwd: REPO,
    encoding: 'utf8',
    timeout,
    env: process.env,
  });
  return {
    status: r.status,
    ok: r.status === 0,
    stdout: r.stdout || '',
    stderr: r.stderr || '',
  };
}

function parseJson(stdout) {
  try {
    return JSON.parse((stdout || '').trim());
  } catch {
    return null;
  }
}

function collect() {
  const anomalies = [];
  const evidence = {};

  // 1) Offline CodeQL pattern gate (always)
  if (fs.existsSync(path.join(REPO, 'tools/codeql-pattern-gate.js'))) {
    const r = runNode('tools/codeql-pattern-gate.js', ['--json']);
    const j = parseJson(r.stdout);
    evidence.patternGate = j || { ok: r.ok, raw: r.stdout.slice(0, 200) };
    if (j && j.findingCount > 0) {
      anomalies.push({
        id: 'codeql_pattern_findings',
        severity: 'high',
        count: j.findingCount,
        title: 'Banned CodeQL-debt patterns present in tree',
        action: 'node tools/codeql-pattern-gate.js  # fix each FAIL line',
        sample: (j.findings || []).slice(0, 5),
      });
    }
  } else {
    anomalies.push({
      id: 'pattern_gate_missing',
      severity: 'medium',
      title: 'codeql-pattern-gate.js not on this checkout',
      action: 'Merge security burn-down PR or cherry-pick tools/codeql-pattern-gate.js',
    });
  }

  // 2) Live CodeQL open alerts (optional network)
  if (fs.existsSync(path.join(REPO, 'tools/codeql-alert-sync.js'))) {
    const r = runNode('tools/codeql-alert-sync.js', ['--json'], 90000);
    const j = parseJson(r.stdout);
    evidence.codeqlOpen = j;
    if (j && typeof j.open === 'number') {
      if ((j.highish || 0) > 0) {
        anomalies.push({
          id: 'codeql_open_highish',
          severity: 'high',
          count: j.highish,
          title: `Open Code scanning highish alerts: ${j.highish} (open=${j.open})`,
          action: 'Fix or dismiss with evidence; node tools/codeql-alert-sync.js --gate',
        });
      } else if (j.open > 15) {
        anomalies.push({
          id: 'codeql_open_backlog',
          severity: 'medium',
          count: j.open,
          title: `Code scanning open backlog: ${j.open}`,
          action: 'Burn down open alerts; write baseline when clean',
        });
      }
    }
  }

  // 3) Coord / locks
  if (fs.existsSync(path.join(REPO, 'tools/linear-agent-bridge.js'))) {
    const r = runNode('tools/linear-agent-bridge.js', ['--coord-status', '--json'], 90000);
    const j = parseJson(r.stdout);
    evidence.coord = j && j.ok ? { agentLocked: j.agentLockedCount, ghosts: (j.ghosts || []).length, inProgress: j.inProgressCount } : { ok: false };
    if (j && j.ok) {
      if ((j.ghosts || []).length > 0) {
        anomalies.push({
          id: 'coord_ghost_locks',
          severity: 'high',
          count: j.ghosts.length,
          title: 'Linear In Progress + vault says done (ghost locks)',
          action: 'node tools/linear-agent-bridge.js --scrub-stale --safe-only --apply',
        });
      }
      const scrub = runNode('tools/linear-agent-bridge.js', ['--scrub-stale', '--safe-only', '--json'], 90000);
      const s = parseJson(scrub.stdout);
      evidence.scrub = s;
      if (s && s.candidateCount > 0) {
        anomalies.push({
          id: 'coord_stale_locks',
          severity: 'medium',
          count: s.candidateCount,
          title: `Safe-scrub stale agent-lock candidates: ${s.candidateCount}`,
          action: 'node tools/linear-agent-bridge.js --scrub-stale --safe-only --apply',
        });
      }
    }
  }

  // 4) Ship-claim honesty self-test
  if (fs.existsSync(path.join(REPO, 'tools/ship-claim-gate.js'))) {
    const r = runNode('tools/ship-claim-gate.js', ['--self-test']);
    evidence.shipClaimSelfTest = { ok: r.ok };
    if (!r.ok) {
      anomalies.push({
        id: 'ship_claim_self_test',
        severity: 'high',
        title: 'ship-claim-gate self-test failed',
        action: 'node tools/ship-claim-gate.js --self-test',
      });
    }
  }

  // 5) Sample overclaim (always should block)
  if (fs.existsSync(path.join(REPO, 'tools/ship-claim-gate.js'))) {
    const r = runNode('tools/ship-claim-gate.js', [
      '--claim',
      'all 5 posts LIVE everywhere',
      '--json',
    ]);
    const j = parseJson(r.stdout);
    evidence.shipClaimOverclaim = j;
    if (j && j.ok === true) {
      anomalies.push({
        id: 'ship_claim_allows_overclaim',
        severity: 'critical',
        title: 'ship-claim-gate ALLOWED theatrical all-LIVE claim',
        action: 'Fix tools/ship-claim-gate.js immediately',
      });
    }
  }

  // Rank
  const order = { critical: 0, high: 1, medium: 2, low: 3 };
  anomalies.sort((a, b) => (order[a.severity] ?? 9) - (order[b.severity] ?? 9));

  return {
    ok: anomalies.filter((a) => a.severity === 'critical' || a.severity === 'high').length === 0,
    generatedAt: new Date().toISOString(),
    districtAnalog: 'Anomaly Detection (District Cyber AI services)',
    serviceId: 'agent-anomaly-detection',
    anomalyCount: anomalies.length,
    highCount: anomalies.filter((a) => a.severity === 'high' || a.severity === 'critical').length,
    anomalies,
    evidence,
    offers: {
      diagnostic: 'Agent Reliability Diagnostic $499',
      next: anomalies[0]?.action || 'node tools/ai-services-catalog.js',
    },
  };
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    console.log(`agent-anomaly-detect — District-style anomaly pillar for agent fleets

Usage:
  node tools/agent-anomaly-detect.js
  node tools/agent-anomaly-detect.js --json
  node tools/agent-anomaly-detect.js --strict
`);
    return;
  }
  const report = collect();
  if (args.includes('--json')) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`\n=== Agent anomaly detect ok=${report.ok} anomalies=${report.anomalyCount} high=${report.highCount} ===`);
    console.log(`District analog: ${report.districtAnalog}`);
    if (!report.anomalies.length) console.log('No anomalies detected.');
    for (const a of report.anomalies) {
      console.log(`  [${a.severity}] ${a.id}: ${a.title}`);
      console.log(`           → ${a.action}`);
    }
    console.log(`\nNext offer: ${report.offers.diagnostic}`);
    console.log(`Top action: ${report.offers.next}`);
  }
  try {
    const out = path.join(REPO, 'coordination', 'agent-anomaly-latest.json');
    fs.mkdirSync(path.dirname(out), { recursive: true });
    fs.writeFileSync(out, JSON.stringify(report, null, 2) + '\n');
  } catch {
    /* ignore */
  }
  if (args.includes('--strict') && !report.ok) process.exitCode = 1;
}

if (require.main === module) main();
module.exports = { collect };
