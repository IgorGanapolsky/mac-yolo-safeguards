#!/usr/bin/env node
'use strict';

/**
 * agent-swarm-harness.js — High-ROI multi-agent swarm economics for this repo.
 *
 * Encodes the durable lessons from Cursor's agent-swarm model economics at
 * human-tempo scale (2–3 agents, not 1000 commits/sec):
 *   - planner vs worker role split (context efficiency)
 *   - thrash detection (multi-claimer / megafile contention)
 *   - Field Guide injection (stigmergy / shared successor context)
 *   - model economics defaults (frontier plans; cheap/local executes leaves)
 *   - stacked verification lenses + decision-id gate for hot files
 *
 * Usage:
 *   node tools/agent-swarm-harness.js [--json] [--plan path] [--role planner|worker]
 *   node tools/agent-swarm-harness.js check-hot-files --stdin [--body-file path]
 *   node tools/agent-swarm-harness.js field-guide
 */

const fs = require('fs');
const path = require('path');

const {
  snapshotPlan,
  parseActiveTasks,
  parseClaimedFiles,
  isClaimedPath,
} = require('./plan-coordination-snapshot');

const REPO = path.resolve(__dirname, '..');
const DEFAULT_PLAN = path.join(REPO, 'plan.md');
const FIELD_GUIDE = path.join(REPO, 'docs/agent-field-guide/index.md');
const FIELD_GUIDE_LINE_BUDGET = 80;
const CONCURRENCY_CAP = 3;

/** Files that historically thrash under multi-agent edits (megafile choke points). */
const MEGAFILES = Object.freeze([
  'hermes-mobile/src/context/GatewayContext.tsx',
  'hermes-mobile/src/screens/ChatScreen.tsx',
  'hermes-mobile/src/services/gatewayDiscovery.ts',
  'hermes-mobile/src/services/gatewayProfiles.ts',
  'hermes-mobile/src/services/tailscaleDiscovery.ts',
  'hermes-mobile/src/utils/gatewayProfilePicker.ts',
  'hermes-mobile/src/components/ConnectMacGate.tsx',
  'tools/hermes-cloud-connector.js',
  'apps/hermes-control-plane/app/dashboard/DashboardClient.tsx',
]);

const ROLE_GUIDANCE = Object.freeze({
  planner: [
    'Collapse ambiguity into leaf tasks + AcceptanceCheck + file claims before any implementation.',
    'Make design decisions yourself; never delegate the same design question to two subtrees.',
    'Record non-obvious decisions in plan.md §3 (Decisions Log) with a durable D- id when useful.',
    'Prefer frontier models for planning; do not implement worker leaves in the same context.',
    'Cap concurrent active owners at 2–3 on this mobile codebase.',
  ],
  worker: [
    'Implement only claimed free leaves; stop if a file is owned by another agent.',
    'Do not invent design decisions — escalate or append plan.md §3 and re-plan.',
    'Prefer cheap/local models (tinker-yolo / Composer-class) once AC is explicit.',
    'Never self-merge megafile conflicts; use a neutral rebase onto main + sequential merge.',
    'Ship only after stacked verification (unit + typecheck + E2E or honest skip + Greptile if sensitive).',
  ],
});

function parseArgs(argv) {
  const args = {
    command: 'brief',
    json: false,
    planPath: DEFAULT_PLAN,
    role: process.env.AGENT_ROLE || process.env.SWARM_ROLE || null,
    bodyFile: null,
    stdin: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === 'check-hot-files' || arg === 'field-guide' || arg === 'brief') {
      args.command = arg;
    } else if (arg === '--json') {
      args.json = true;
    } else if (arg === '--stdin') {
      args.stdin = true;
    } else if (arg === '--plan') {
      args.planPath = path.resolve(argv[++i] || '');
    } else if (arg === '--role') {
      args.role = String(argv[++i] || '').trim() || null;
    } else if (arg === '--body-file') {
      args.bodyFile = path.resolve(argv[++i] || '');
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function normalizeClaim(claim) {
  return String(claim || '')
    .trim()
    .replace(/^\.\//, '')
    .replace(/\/\*\*$/, '')
    .replace(/\/\*$/, '')
    .replace(/\/+$/, '');
}

function claimsOverlap(a, b) {
  const left = normalizeClaim(a);
  const right = normalizeClaim(b);
  if (!left || !right) return false;
  if (left === right) return true;
  return isClaimedPath(left, right) || isClaimedPath(right, left);
}

function findFileContention(activeTasks) {
  const hits = [];
  for (let i = 0; i < activeTasks.length; i += 1) {
    for (let j = i + 1; j < activeTasks.length; j += 1) {
      const left = activeTasks[i];
      const right = activeTasks[j];
      if (!left.owner || !right.owner || left.owner === right.owner) continue;
      const leftFiles = left.claimedFiles || parseClaimedFiles(left.files);
      const rightFiles = right.claimedFiles || parseClaimedFiles(right.files);
      for (const lf of leftFiles) {
        if (lf === 'plan.md') continue;
        for (const rf of rightFiles) {
          if (rf === 'plan.md') continue;
          if (!claimsOverlap(lf, rf)) continue;
          hits.push({
            path: normalizeClaim(lf) === normalizeClaim(rf) ? normalizeClaim(lf) : `${normalizeClaim(lf)} ↔ ${normalizeClaim(rf)}`,
            left: { id: left.id, owner: left.owner, claim: lf },
            right: { id: right.id, owner: right.owner, claim: rf },
            severity: 'contention',
          });
        }
      }
    }
  }
  return hits;
}

function findMegafileHits(activeTasks) {
  const hits = [];
  for (const mega of MEGAFILES) {
    const claimants = [];
    for (const task of activeTasks) {
      const files = task.claimedFiles || parseClaimedFiles(task.files);
      if (files.some((claim) => claimsOverlap(claim, mega))) {
        claimants.push({ id: task.id, owner: task.owner, status: task.status });
      }
    }
    if (claimants.length > 0) {
      hits.push({
        path: mega,
        claimants,
        multiOwner: new Set(claimants.map((c) => c.owner)).size > 1,
        severity: claimants.length > 1 ? 'hot' : 'watch',
      });
    }
  }
  return hits;
}

function activeOwnerCount(activeTasks) {
  return new Set(
    activeTasks
      .filter((t) => t.status === 'in_progress')
      .map((t) => t.owner)
      .filter(Boolean),
  ).size;
}

function loadFieldGuide(guidePath = FIELD_GUIDE) {
  if (!fs.existsSync(guidePath)) {
    return {
      ok: false,
      path: guidePath,
      lineCount: 0,
      overBudget: false,
      budget: FIELD_GUIDE_LINE_BUDGET,
      body: '',
      error: 'field guide missing',
    };
  }
  const body = fs.readFileSync(guidePath, 'utf8');
  const lineCount = body.split('\n').length;
  return {
    ok: true,
    path: guidePath,
    lineCount,
    overBudget: lineCount > FIELD_GUIDE_LINE_BUDGET,
    budget: FIELD_GUIDE_LINE_BUDGET,
    body,
  };
}

function resolveRole(requested) {
  const role = String(requested || 'worker').toLowerCase();
  if (role === 'planner' || role === 'worker') return role;
  return 'worker';
}

function modelEconomics() {
  return {
    principle: 'Harness quality beats model mix; thrash is not productivity.',
    planner: 'Frontier judgment for decomposition, design decisions, and AcceptanceCheck quality.',
    worker: 'Cheap/local execution (tinker-yolo q4, Composer-class) once leaves are explicit.',
    antiPattern: 'Five frontier agents re-deriving the same design on a megafile.',
    measure: 'Finished AC per $, multi-claimer count, megafile contention — not commit count.',
  };
}

function verificationStack() {
  return [
    'unit/focused tests for claimed surface',
    'typecheck when TS/mobile touched',
    'continuous E2E proof or honest skip reason (phone lease / no device)',
    'Greptile on onboarding/auth/OTA/pairing PRs',
    'sequential merge onto main only when required checks green',
  ];
}

function buildActions(report) {
  const actions = [];
  if (report.concurrency.overCap) {
    actions.push(
      `Concurrency ${report.concurrency.activeOwners} > cap ${report.concurrency.cap}: finish or block before starting another in_progress owner.`,
    );
  }
  if (report.contention.length > 0) {
    actions.push(
      `File contention detected (${report.contention.length}): mark blocked + STOP rather than editing overlapping claims.`,
    );
  }
  const multiMega = report.megafileHits.filter((h) => h.multiOwner);
  if (multiMega.length > 0) {
    actions.push(
      `Megafile multi-owner: ${multiMega.map((h) => h.path).join(', ')} — split work or serialize; no parallel design.`,
    );
  }
  if (report.fieldGuide.overBudget) {
    actions.push(
      `Field Guide over line budget (${report.fieldGuide.lineCount}/${report.fieldGuide.budget}): prune stale lines before adding surprises.`,
    );
  }
  if (report.fieldGuide.ok) {
    actions.push('Read docs/agent-field-guide/index.md (injected below) before expanding scope.');
  }
  actions.push(
    report.role === 'planner'
      ? 'Planner mode: write leaf AC + claims first; do not implement.'
      : 'Worker mode: implement only free claimed leaves; escalate design questions.',
  );
  return actions;
}

function buildHarnessReport({ planPath = DEFAULT_PLAN, role = null } = {}) {
  const snapshot = snapshotPlan(planPath);
  if (!snapshot.ok) {
    return {
      ok: false,
      error: snapshot.error,
      planPath,
      checkedAt: new Date().toISOString(),
    };
  }

  // Re-parse with claimedFiles (snapshot may be from older callers without the field).
  const planText = fs.readFileSync(planPath, 'utf8');
  const activeTasks = parseActiveTasks(planText);
  const resolvedRole = resolveRole(role);
  const contention = findFileContention(activeTasks);
  const megafileHits = findMegafileHits(activeTasks);
  const owners = activeOwnerCount(activeTasks);
  const fieldGuide = loadFieldGuide();
  const report = {
    ok: true,
    planPath,
    checkedAt: new Date().toISOString(),
    role: resolvedRole,
    roleGuidance: ROLE_GUIDANCE[resolvedRole],
    activeTasks,
    activeTaskCount: activeTasks.length,
    concurrency: {
      activeOwners: owners,
      cap: CONCURRENCY_CAP,
      overCap: owners > CONCURRENCY_CAP,
    },
    contention,
    megafileHits,
    megafiles: MEGAFILES,
    modelEconomics: modelEconomics(),
    verificationStack: verificationStack(),
    fieldGuide: {
      ok: fieldGuide.ok,
      path: fieldGuide.path,
      lineCount: fieldGuide.lineCount,
      budget: fieldGuide.budget,
      overBudget: fieldGuide.overBudget,
      error: fieldGuide.error || null,
    },
    docs: [
      'AGENTS.md (planner/worker + multi-agent Never list)',
      'docs/agent-field-guide/index.md',
      'docs/AGENT-SWARM-HARNESS.md',
      'plan.md',
    ],
  };
  report.actions = buildActions(report);
  report.fieldGuideBody = fieldGuide.ok ? fieldGuide.body : '';
  return report;
}

function formatHuman(report) {
  if (!report.ok) {
    return `=== Agent swarm harness ===\nERROR: ${report.error}`;
  }
  const lines = [
    '=== Agent swarm harness (planner/worker economics) ===',
    `Role: ${report.role} | active tasks: ${report.activeTaskCount} | owners in_progress: ${report.concurrency.activeOwners}/${report.concurrency.cap}`,
  ];
  if (report.concurrency.overCap) {
    lines.push('WARN: concurrency over cap — serialize before claiming more work.');
  }
  if (report.contention.length === 0) {
    lines.push('Contention: none detected across distinct owners');
  } else {
    lines.push(`Contention (${report.contention.length}):`);
    for (const hit of report.contention.slice(0, 8)) {
      lines.push(
        `  ${hit.path}: ${hit.left.owner}(${hit.left.id}) vs ${hit.right.owner}(${hit.right.id})`,
      );
    }
    if (report.contention.length > 8) {
      lines.push(`  … +${report.contention.length - 8} more`);
    }
  }
  if (report.megafileHits.length === 0) {
    lines.push('Megafiles: no active claims on known choke points');
  } else {
    lines.push('Megafile watch:');
    for (const hit of report.megafileHits.slice(0, 8)) {
      const owners = [...new Set(hit.claimants.map((c) => c.owner))].join(', ');
      lines.push(
        `  ${hit.multiOwner ? 'HOT' : 'watch'} ${hit.path} → ${owners} (${hit.claimants.map((c) => c.id).join(', ')})`,
      );
    }
  }
  lines.push('Model economics: frontier plans; cheap/local executes explicit leaves.');
  lines.push('Role guidance:');
  for (const tip of report.roleGuidance) {
    lines.push(`  - ${tip}`);
  }
  lines.push('Actions:');
  for (const action of report.actions) {
    lines.push(`  → ${action}`);
  }
  if (report.fieldGuideBody) {
    lines.push('');
    lines.push('--- Field Guide (docs/agent-field-guide/index.md) ---');
    lines.push(report.fieldGuideBody.trimEnd());
    if (report.fieldGuide.overBudget) {
      lines.push(`(over budget: ${report.fieldGuide.lineCount}/${report.fieldGuide.budget} lines)`);
    }
  }
  return lines.join('\n');
}

function extractDecisionRefs(body) {
  if (!body) return [];
  const refs = new Set();
  for (const match of body.matchAll(/\bD-\d{4}-\d{2}-\d{2}-[A-Za-z0-9-]+\b/g)) {
    refs.add(match[0]);
  }
  for (const match of body.matchAll(/\bDecision(?:s)?\s*(?:Log\s*)?(?:#|id[:\s]+)?([A-Za-z0-9._-]+)/gi)) {
    if (match[1]) refs.add(match[1]);
  }
  if (/plan\.md\s*§\s*3|Decisions Log/i.test(body)) {
    refs.add('plan.md§3');
  }
  return [...refs];
}

function checkHotFiles({ files, body }) {
  const hot = files
    .map((f) => f.trim())
    .filter(Boolean)
    .filter((file) => MEGAFILES.some((mega) => claimsOverlap(file, mega)));
  const decisionRefs = extractDecisionRefs(body || '');
  const ok = hot.length === 0 || decisionRefs.length > 0;
  return {
    ok,
    hotFiles: hot,
    decisionRefs,
    message: ok
      ? hot.length === 0
        ? 'No megafiles in change set.'
        : `Megafiles present with decision refs: ${decisionRefs.join(', ')}`
      : `Megafile edit without decision ref: ${hot.join(', ')}. Add a plan.md §3 Decision id (D-YYYY-MM-DD-…) or "Decisions Log" pointer in the PR body.`,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(`Usage:
  node tools/agent-swarm-harness.js [--json] [--plan path] [--role planner|worker]
  node tools/agent-swarm-harness.js check-hot-files --stdin [--body-file path]
  node tools/agent-swarm-harness.js field-guide`);
    process.exit(0);
  }

  if (args.command === 'field-guide') {
    const guide = loadFieldGuide();
    if (!guide.ok) {
      console.error(guide.error);
      process.exit(1);
    }
    process.stdout.write(guide.body);
    if (!guide.body.endsWith('\n')) process.stdout.write('\n');
    process.exit(guide.overBudget ? 2 : 0);
  }

  if (args.command === 'check-hot-files') {
    const files = args.stdin
      ? fs.readFileSync(0, 'utf8').split('\n').map((f) => f.trim()).filter(Boolean)
      : [];
    const body = args.bodyFile && fs.existsSync(args.bodyFile)
      ? fs.readFileSync(args.bodyFile, 'utf8')
      : '';
    const result = checkHotFiles({ files, body });
    if (args.json) {
      console.log(JSON.stringify(result, null, 2));
    } else if (result.ok) {
      console.log(`✓ ${result.message}`);
    } else {
      console.error(`✗ ${result.message}`);
    }
    process.exit(result.ok ? 0 : 1);
  }

  const report = buildHarnessReport({ planPath: args.planPath, role: args.role });
  if (args.json) {
    const jsonSafe = { ...report };
    // Keep JSON payloads bounded for session tooling.
    if (jsonSafe.fieldGuideBody && jsonSafe.fieldGuideBody.length > 4000) {
      jsonSafe.fieldGuideBody = `${jsonSafe.fieldGuideBody.slice(0, 4000)}\n…`;
    }
    console.log(JSON.stringify(jsonSafe, null, 2));
    process.exit(report.ok ? 0 : 1);
  }
  console.log(formatHuman(report));
  process.exit(report.ok ? 0 : 1);
}

module.exports = {
  MEGAFILES,
  FIELD_GUIDE_LINE_BUDGET,
  CONCURRENCY_CAP,
  ROLE_GUIDANCE,
  normalizeClaim,
  claimsOverlap,
  findFileContention,
  findMegafileHits,
  loadFieldGuide,
  buildHarnessReport,
  formatHuman,
  checkHotFiles,
  extractDecisionRefs,
  modelEconomics,
  parseArgs,
};

if (require.main === module) {
  main();
}
