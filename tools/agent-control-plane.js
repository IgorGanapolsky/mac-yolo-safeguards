#!/usr/bin/env node
'use strict';

/**
 * agent-control-plane.js — Multi-agent health + claim gate (Meta control-plane theme).
 *
 * Aggregates plan.md ownership, LaunchAgent health, and continuous E2E proof into one
 * machine-readable dashboard. Not Meta-scale — local fleet control for this repo.
 *
 * Inspired by Island.io "Enterprise Agentic Control Plane" — code with vibes,
 * deploy with confidence. Every claim must pass all verification gates before
 * any "done" or "shipped" statement is emitted (Honesty Protocol).
 *
 * Usage:
 *   node tools/agent-control-plane.js status [--json]
 *   node tools/agent-control-plane.js claim-check <relative-path> [--agent <id>] [--json]
 *   node tools/agent-control-plane.js verify [--json]   # pre-flight all safety gates
 *   node tools/agent-control-plane.js pulse [--json]     # real-time swarm dashboard
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execSync, execFileSync } = require('child_process');
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
    const out = execFileSync('launchctl', ['print', target], {
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

const HARNESS_ROUTER = path.join(REPO, 'tools', 'agent-harness-router.js');
const COGNITIVE_DEBT_SCANNER = path.join(REPO, 'tools', 'cognitive-debt-scanner.js');
const ASYNC_MESSAGING = path.join(REPO, 'tools', 'async-agent-messaging.js');
const CHECKPOINT_GATE = path.join(REPO, 'tools', 'task-checkpoint-gate.js');
const KNOWNLEDGE_HANDOFF = path.join(REPO, 'tools', 'agent-knowledge-handoff.js');
const STORAGE_DIR = path.join(os.homedir(), '.mac-yolo-safeguards', 'harness-router');
const PENDING_FILE = path.join(STORAGE_DIR, 'async-pending-messages.jsonl');
const REPLIES_FILE = path.join(STORAGE_DIR, 'async-replies.jsonl');
const CHECKPOINT_FILE = path.join(STORAGE_DIR, 'task-checkpoints.jsonl');
const HANDOFF_FILE = path.join(STORAGE_DIR, 'agent-handoffs.jsonl');

function runNodeScript(scriptPath, args, opts = {}) {
  try {
    const out = execFileSync(
      process.execPath,
      [scriptPath, ...args],
      { cwd: REPO, encoding: 'utf8', maxBuffer: 1024 * 1024 * 10, ...opts },
    );
    return { ok: true, output: out };
  } catch (e) {
    return { ok: false, output: e.stdout || e.stderr || '', code: e.status || 1 };
  }
}

function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8')
    .trim().split('\n')
    .filter(Boolean)
    .map((line) => { try { return JSON.parse(line); } catch { return null; } })
    .filter(Boolean);
}

/**
 * verify — runs all safety gates before a "done/shipped" claim.
 *
 * Gates (blocking):
 *   1. codeql-pattern-gate --staged → must be 0 findings (exit 1 if violations)
 *
 * Gates (advisory):
 *   2. cognitive-debt-scanner --diff origin/main → shows cognitive debt patterns
 *   3. async-agent-messaging pending → unanswered questions block verification
 *   4. task-checkpoint-gate checkpoints → unresolved checkpoints mean
 *      dependent work may be stale (stale question / pending answer)
 *
 * Honest protocol: if any gate fails, exit 1 and print why.
 */
function verify() {
  const gates = [];

  // Gate 1: CodeQL pattern gate (blocking — CI blocker)
  const g1 = runNodeScript(path.join(REPO, 'tools', 'codeql-pattern-gate.js'), ['--staged', '--json'], { stdio: 'pipe' });
  let g1Data = null;
  if (g1.ok) {
    try { g1Data = JSON.parse(g1.output); } catch { /* ignore */ }
  }
  gates.push({
    name: 'codeql-pattern-gate',
    blocking: true,
    passed: g1.ok && g1Data && g1Data.ok,
    findingCount: g1Data ? g1Data.findingCount : null,
    output: g1.output.trim().split('\n').slice(-3).join(' | '),
  });

  // Gate 2: Cognitive debt scanner (advisory)
  const g2 = runNodeScript(path.join(REPO, 'tools', 'cognitive-debt-scanner.js'), ['--diff', 'origin/main', '--json'], { stdio: 'pipe' });
  let g2Data = null;
  if (g2.ok) {
    try { g2Data = JSON.parse(g2.output); } catch { /* ignore */ }
  }
  gates.push({
    name: 'cognitive-debt-scanner',
    blocking: false,
    passed: true, // advisory — always passes, just informs
    findingCount: g2Data ? g2Data.findingCount : null,
    output: g2Data ? `${g2Data.findingCount} cognitive debt patterns` : 'unavailable',
  });

  // Gate 3: Pending async questions (blocking — unanswered questions)
  const pendingEntries = readJsonl(PENDING_FILE);
  const unanswered = pendingEntries.filter((e) => e.status !== 'answered');
  gates.push({
    name: 'async-questions-pending',
    blocking: true,
    passed: unanswered.length === 0,
    count: unanswered.length,
    output: unanswered.length === 0
      ? 'no unanswered developer questions'
      : `${unanswered.length} unanswered question(s): ${unanswered.slice(0, 3).map((q) => q.question.slice(0, 60)).join('; ')}`,
  });

  // Gate 4: Unresolved checkpoints (advisory — stale dependent work)
  const checkpoints = readJsonl(CHECKPOINT_FILE).filter((c) => c.status === 'active');
  gates.push({
    name: 'task-checkpoints-active',
    blocking: false,
    passed: true,
    count: checkpoints.length,
    output: checkpoints.length === 0
      ? 'no active checkpoints'
      : `${checkpoints.length} active checkpoint(s): ${checkpoints.slice(0, 3).map((c) => c.id).join(', ')}`,
  });

  // Gate 5: Budget check (from harness router health)
  // Check if any budget receipts exist showing exhaustion
  const spendGuardDir = path.join(os.homedir(), '.thumbgate', 'receipts', 'spend-guard');
  let budgetExhausted = false;
  try {
    if (fs.existsSync(spendGuardDir)) {
      const receipts = fs.readdirSync(spendGuardDir)
        .filter((f) => f.endsWith('.json')).slice(-5);
      for (const r of receipts) {
        const data = JSON.parse(fs.readFileSync(path.join(spendGuardDir, r), 'utf8'));
        if (data.state === 'exhausted' || data.state === 'blocked') {
          budgetExhausted = true;
          break;
        }
      }
    }
  } catch {
    // budget guard dir doesn't exist → not exhausted
  }
  gates.push({
    name: 'budget-guard',
    blocking: true,
    passed: !budgetExhausted,
    output: budgetExhausted ? 'BUDGET EXHAUSTED — routing blocked' : 'budget guard OK',
  });

  const allBlockingPassed = gates.filter((g) => g.blocking).every((g) => g.passed);
  const report = {
    ok: allBlockingPassed,
    checkedAt: new Date().toISOString(),
    gates,
  };

  return report;
}

function formatVerify(report) {
  const lines = ['=== Verify: pre-flight safety gates ==='];
  for (const g of report.gates) {
    const status = g.passed ? 'PASS' : 'FAIL';
    const block = g.blocking ? ' [BLOCKING]' : ' [advisory]';
    lines.push(`  ${status} ${g.name}${block} — ${g.output}`);
  }
  if (report.ok) {
    lines.push('\n✅ All blocking gates pass — safe to claim "done/shipped".');
  } else {
    lines.push('\n❌ One or more blocking gates FAILED — do not claim "done" or "shipped" until resolved.');
  }
  return lines.join('\n');
}

/**
 * pulse — real-time dashboard of the agent swarm state.
 *
 * Shows: plan.md active tasks, pending async questions, active checkpoints,
 *   recent knowledge handoffs, LaunchAgent health, continuous E2E status.
 * Maps to Island.io's real-time orchestration view ("code with vibes").
 */
function pulse() {
  const plan = snapshotPlan();
  const agents = CRITICAL_AGENTS.map(launchctlState);

  // Pending messages
  const pendingEntries = readJsonl(PENDING_FILE);
  const unanswered = pendingEntries.filter((e) => e.status !== 'answered');

  // Checkpoints
  const checkpoints = readJsonl(CHECKPOINT_FILE).filter((c) => c.status === 'active');

  // Recent handoffs
  const handoffs = readJsonl(HANDOFF_FILE).slice(-5).reverse();

  // Continuous E2E
  const e2e = readJson(LATEST_E2E) || {};

  return {
    checkedAt: new Date().toISOString(),
    plan: {
      activeTasks: (plan.activeTasks || []).slice(0, 8).map((t) => ({
        id: t.id, owner: t.owner, status: t.status, task: t.task,
      })),
      fileLockCount: plan.fileLocks ? plan.fileLocks.length : 0,
    },
    async: { pending: unanswered.length, total: pendingEntries.length },
    checkpoints: { active: checkpoints.length, items: checkpoints.slice(0, 5).map((c) => ({
      id: c.id, age: Math.round((Date.now() - new Date(c.timestamp).getTime()) / 60000) + 'm', scopes: c.scopes,
    })) },
    knowledge: { recent: handoffs.slice(0, 3).map((h) => ({
      task: h.task, taskType: h.taskType, decisions: h.decisions?.length || 0, bugs: h.bugsFound?.length || 0,
    })) },
    agents: agents.map((a) => ({ label: a.label, ok: a.ok, state: a.state })),
    continuousE2e: {
      e2e: e2e.e2e || 'missing',
      unit: e2e.unit || 'missing',
      shipClaimOk: e2e.e2e === 'pass',
      updatedAt: e2e.updatedAt || null,
    },
  };
}

function formatPulse(p) {
  const lines = ['=== Agent swarm pulse ==='];
  lines.push(`checkedAt: ${p.checkedAt}`);
  lines.push(`\nActive tasks (${p.plan.activeTasks.length}):`);
  for (const t of p.plan.activeTasks) {
    lines.push(`  [${t.status}] ${t.owner || '?'}: ${t.task?.slice(0, 80)}`);
  }
  lines.push(`\nFile locks: ${p.plan.fileLockCount}`);
  lines.push(`\nPending questions: ${p.async.pending} (${p.async.total} total)`);
  lines.push(`\nActive checkpoints: ${p.checkpoints.active}`);
  for (const c of p.checkpoints.items) {
    lines.push(`  [${c.id}] age=${c.age} scopes=${c.scopes?.join(', ')}`);
  }
  lines.push(`\nRecent handoffs: ${p.knowledge.recent.length}`);
  for (const h of p.knowledge.recent) {
    lines.push(`  ${h.taskType} | ${h.task} | decisions:${h.decisions} bugs:${h.bugs}`);
  }
  lines.push(`\nLaunchAgents:`);
  for (const a of p.agents) {
    lines.push(`  ${a.ok ? 'OK' : 'DOWN'} ${a.label}: ${a.state}`);
  }
  const e = p.continuousE2e;
  lines.push(`\nContinuous E2E: ${e.e2e} (unit=${e.unit}) shipClaimOk=${e.shipClaimOk}`);
  return lines.join('\n');
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
  node tools/agent-control-plane.js claim-check <path> [--agent id] [--json]
  node tools/agent-control-plane.js verify [--json]     # pre-flight all safety gates before "done" claims
  node tools/agent-control-plane.js pulse [--json]      # real-time swarm dashboard`);
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

  if (args.cmd === 'verify') {
    const report = verify();
    if (args.json) console.log(JSON.stringify(report, null, 2));
    else console.log(formatVerify(report));
    process.exit(report.ok ? 0 : 1);
  }

  if (args.cmd === 'pulse') {
    const p = pulse();
    if (args.json) console.log(JSON.stringify(p, null, 2));
    else console.log(formatPulse(p));
    process.exit(0);
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
  verify,
  pulse,
  runNodeScript,
  readJsonl,
};

if (require.main === module) {
  main();
}
