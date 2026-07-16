#!/usr/bin/env node
'use strict';

/**
 * agent-control-plane.js — Multi-agent health + claim gate (Meta control-plane theme).
 *
 * Aggregates plan.md ownership, LaunchAgent health, and continuous E2E proof into one
 * machine-readable dashboard. Not Meta-scale — local fleet control for this repo.
 *
 * Usage:
 *   node tools/agent-control-plane.js status [--json]
 *   node tools/agent-control-plane.js claim-check <relative-path> [--agent <id>] [--json]
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { snapshotPlan } = require('./plan-coordination-snapshot');

const REPO = path.resolve(__dirname, '..');
const LATEST_E2E = path.join(REPO, 'hermes-mobile/docs/proofs/continuous/latest.json');

const CRITICAL_AGENTS = [
  'com.igor.shutdown-simulators',
  'com.igor.hermes-mobile-continuous-e2e',
  'com.igor.hermes-usb-reverse-watchdog',
  'com.igor.repo-root-hygiene',
];

function parseArgs(argv) {
  const args = { cmd: 'status', json: false, agent: 'cursor-agent-conf', file: '' };
  const rest = [...argv];
  if (rest[0] && !rest[0].startsWith('-')) {
    args.cmd = rest.shift();
  }
  for (let i = 0; i < rest.length; i += 1) {
    const a = rest[i];
    if (a === '--json') args.json = true;
    else if (a === '--agent') args.agent = rest[++i] || args.agent;
    else if (!a.startsWith('-') && !args.file) args.file = a;
    else if (a === '--help' || a === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${a}`);
  }
  return args;
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function launchctlState(label) {
  const uid = process.getuid?.() ?? 0;
  const target = `gui/${uid}/${label}`;
  try {
    const out = execSync(`launchctl print ${target}`, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const state = out.match(/^\s*state = ([^\n]+)/m)?.[1]?.trim() ?? 'unknown';
    const lastExit = out.match(/last exit code = ([^\n]+)/)?.[1]?.trim() ?? null;
    const loaded = !/not found|Could not find/i.test(out);
    return { label, loaded: true, state, lastExit, ok: loaded && state !== 'not loaded' };
  } catch {
    return { label, loaded: false, state: 'not loaded', lastExit: null, ok: false };
  }
}

function parseLockOwner(lockLine) {
  const m = lockLine.match(/→\s*\*\*([^*]+)\*\*/);
  return m ? m[1].trim() : null;
}

function fileMentionedInLock(lockLine, relPath) {
  const normalized = relPath.replace(/^\.\//, '');
  // Lock lines quote paths with backticks
  const re = new RegExp(
    '`' + normalized.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '`',
  );
  return re.test(lockLine);
}

function claimCheck(planSnapshot, relPath, agentId) {
  const normalized = String(relPath || '').replace(/^\.\//, '');
  if (!normalized) {
    return { ok: false, allowed: false, reason: 'missing-path' };
  }
  const activeLocks = (planSnapshot.fileLocks || []).filter((line) =>
    fileMentionedInLock(line, normalized),
  );
  if (activeLocks.length === 0) {
    return {
      ok: true,
      allowed: true,
      path: normalized,
      agent: agentId,
      reason: 'free',
      owners: [],
    };
  }
  const owners = activeLocks.map(parseLockOwner).filter(Boolean);
  const mine = owners.every((o) => o === agentId);
  if (mine) {
    return {
      ok: true,
      allowed: true,
      path: normalized,
      agent: agentId,
      reason: 'owned-by-self',
      owners,
    };
  }
  return {
    ok: true,
    allowed: false,
    path: normalized,
    agent: agentId,
    reason: 'owned-by-other',
    owners,
    locks: activeLocks,
  };
}

function evaluateE2e(latest) {
  const e2e = latest?.e2e || 'missing';
  const unit = latest?.unit || 'missing';
  const updatedAt = latest?.updatedAt || null;
  const ageMs = updatedAt ? Date.now() - Date.parse(updatedAt) : null;
  return {
    e2e,
    unit,
    updatedAt,
    ageMs,
    shipClaimOk: e2e === 'pass',
    honestNote:
      e2e === 'skipped'
        ? 'e2e=skipped is not pass — do not claim device UX verified'
        : e2e === 'fail'
          ? 'e2e=fail — investigate before ship language'
          : null,
  };
}

function scoreHealth({ plan, agents, e2e }) {
  let score = 100;
  const findings = [];
  if (!plan.ok) {
    score -= 40;
    findings.push({ severity: 'error', code: 'plan-missing', detail: plan.error });
  }
  const active = plan.activeTasks?.length || 0;
  if (active > 25) {
    score -= 15;
    findings.push({
      severity: 'warn',
      code: 'task-saturation',
      detail: `${active} in_progress/blocked tasks (cap guidance: 2–3 concurrent agents)`,
    });
  } else if (active > 12) {
    score -= 8;
    findings.push({
      severity: 'warn',
      code: 'task-busy',
      detail: `${active} active tasks`,
    });
  }
  const badAgents = agents.filter((a) => !a.ok);
  if (badAgents.length) {
    score -= 10 * badAgents.length;
    findings.push({
      severity: 'error',
      code: 'launchagent-down',
      detail: badAgents.map((a) => a.label).join(', '),
    });
  }
  if (e2e.e2e === 'fail') {
    score -= 25;
    findings.push({ severity: 'error', code: 'e2e-fail', detail: e2e.updatedAt });
  } else if (e2e.e2e === 'skipped') {
    score -= 5;
    findings.push({
      severity: 'info',
      code: 'e2e-skipped',
      detail: e2e.honestNote,
    });
  } else if (e2e.e2e === 'missing') {
    score -= 15;
    findings.push({ severity: 'warn', code: 'e2e-missing', detail: LATEST_E2E });
  }
  if (e2e.ageMs != null && e2e.ageMs > 2 * 60 * 60 * 1000) {
    score -= 10;
    findings.push({
      severity: 'warn',
      code: 'e2e-stale',
      detail: `proof age ${Math.round(e2e.ageMs / 60000)}m`,
    });
  }
  return { score: Math.max(0, Math.min(100, score)), findings };
}

function buildStatus(opts = {}) {
  const plan = snapshotPlan(opts.planPath);
  const agents = CRITICAL_AGENTS.map(launchctlState);
  const latest = readJson(LATEST_E2E) || {};
  const e2e = evaluateE2e(latest);
  const health = scoreHealth({ plan, agents, e2e });
  return {
    ok: true,
    checkedAt: new Date().toISOString(),
    theme: 'agent-control-plane',
    plan: {
      ok: plan.ok,
      updated: plan.meta?.updated || null,
      activeTaskCount: plan.activeTasks?.length || 0,
      fileLockCount: plan.fileLocks?.length || 0,
      activeTasks: (plan.activeTasks || []).slice(0, 12).map((t) => ({
        id: t.id,
        owner: t.owner,
        status: t.status,
        task: t.task,
      })),
    },
    launchAgents: agents,
    continuousE2e: e2e,
    health,
  };
}

function formatHuman(status) {
  const lines = [
    '=== Agent control plane ===',
    `checkedAt: ${status.checkedAt}`,
    `health.score: ${status.health.score}/100`,
  ];
  for (const f of status.health.findings) {
    lines.push(`  [${f.severity}] ${f.code}: ${f.detail}`);
  }
  lines.push(
    `plan: activeTasks=${status.plan.activeTaskCount} locks=${status.plan.fileLockCount} updated=${status.plan.updated || '?'}`,
  );
  lines.push('LaunchAgents:');
  for (const a of status.launchAgents) {
    lines.push(
      `  ${a.ok ? 'OK' : 'DOWN'} ${a.label}: ${a.state}` +
        (a.lastExit != null ? ` (last exit ${a.lastExit})` : ''),
    );
  }
  const e = status.continuousE2e;
  lines.push(
    `continuousE2e: e2e=${e.e2e} unit=${e.unit} shipClaimOk=${e.shipClaimOk}` +
      (e.updatedAt ? ` updatedAt=${e.updatedAt}` : ''),
  );
  if (e.honestNote) lines.push(`  note: ${e.honestNote}`);
  lines.push('claim-check: node tools/agent-control-plane.js claim-check <path> --agent <id>');
  return lines.join('\n');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(`Usage:
  node tools/agent-control-plane.js status [--json]
  node tools/agent-control-plane.js claim-check <path> [--agent id] [--json]`);
    process.exit(0);
  }

  if (args.cmd === 'claim-check') {
    const plan = snapshotPlan();
    const result = claimCheck(plan, args.file, args.agent);
    if (args.json) console.log(JSON.stringify(result, null, 2));
    else {
      console.log(
        `claim-check path=${result.path || '?'} allowed=${result.allowed} reason=${result.reason}` +
          (result.owners?.length ? ` owners=${result.owners.join(',')}` : ''),
      );
      if (!result.allowed) {
        console.error('STRICT: file owned by another agent in plan.md §2 — stop, do not edit.');
      }
    }
    process.exit(result.allowed ? 0 : 2);
  }

  const status = buildStatus();
  if (args.json) console.log(JSON.stringify(status, null, 2));
  else console.log(formatHuman(status));
  process.exit(status.health.score >= 50 ? 0 : 1);
}

module.exports = {
  buildStatus,
  claimCheck,
  evaluateE2e,
  scoreHealth,
  parseLockOwner,
  fileMentionedInLock,
};

if (require.main === module) {
  main();
}
