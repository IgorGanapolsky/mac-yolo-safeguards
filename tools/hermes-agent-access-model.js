#!/usr/bin/env node
'use strict';

/**
 * hermes-agent-access-model.js — Cloudflare Agent Access Model (AAM) free steal
 *
 * Source: https://blog.cloudflare.com/the-agent-access-model/ (Agents Week 2026)
 *
 * Core rule: "Do not trust the run. Authorize every action against the task
 * and its accumulated state."
 *
 * Five principles we implement locally (no Cloudflare product purchase):
 *   1. Short-lived, task-scoped credentials (opaque handles; model never gets secrets)
 *   2. Enforcement in the harness (this module), not the prompt
 *   3. Human oversight exceptional (ask only for critical / out-of-ceiling)
 *   4. Grants reviewed from evidence (Grant Review Loop)
 *   5. Trust Ratchet: capability state only narrows during a task
 *
 * Usage:
 *   node tools/hermes-agent-access-model.js --dispatch --template reconcile --principal igor --json
 *   node tools/hermes-agent-access-model.js --check --task-id TID --tool ledger_read --json
 *   node tools/hermes-agent-access-model.js --demo --json
 */

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const HOME = os.homedir();
const DEFAULT_STATE_DIR =
  process.env.HERMES_AAM_STATE_DIR || path.join(HOME, '.hermes', 'aam');

/** Risk-aligned ops (aligns with WriteGuard tiers). */
const OP = Object.freeze({
  READ: 'read',
  MINIMAL: 'minimal',
  WRITE: 'write',
  CRITICAL: 'critical',
  EGRESS: 'egress',
  SPEND: 'spend',
});

/**
 * Task templates = unit of configuration (AAM: policies track task types, not runs).
 * Ceiling is the max authority a dispatch can receive.
 */
const TASK_TEMPLATES = Object.freeze({
  smoke: {
    id: 'smoke',
    description: 'Readiness / exact-marker checks',
    maxLifetimeMs: 5 * 60 * 1000,
    ceiling: [
      { tool: 'chat.complete', op: OP.READ },
      { tool: 'fleet.status', op: OP.READ },
    ],
  },
  code_fix: {
    id: 'code_fix',
    description: 'Implement / fix / patch in a repo',
    maxLifetimeMs: 2 * 60 * 60 * 1000,
    ceiling: [
      { tool: 'fs.read', op: OP.READ },
      { tool: 'fs.write', op: OP.WRITE },
      { tool: 'git.status', op: OP.READ },
      { tool: 'git.commit', op: OP.WRITE },
      { tool: 'shell.run', op: OP.WRITE },
      { tool: 'test.run', op: OP.READ },
      { tool: 'gh.pr_create', op: OP.WRITE },
    ],
  },
  mobile_pair: {
    id: 'mobile_pair',
    description: 'Hermes Mobile pair / connect diagnostics',
    maxLifetimeMs: 30 * 60 * 1000,
    ceiling: [
      { tool: 'pair.mint', op: OP.WRITE },
      { tool: 'pair.redeem', op: OP.WRITE },
      { tool: 'gateway.health', op: OP.READ },
      { tool: 'adb.devices', op: OP.READ },
      { tool: 'fs.read', op: OP.READ },
    ],
  },
  gates_audit: {
    id: 'gates_audit',
    description: 'ThumbGate rules / spend guard inspection',
    maxLifetimeMs: 30 * 60 * 1000,
    ceiling: [
      { tool: 'thumbgate.rules', op: OP.READ },
      { tool: 'thumbgate.blocked', op: OP.READ },
      { tool: 'fleet.status', op: OP.READ },
      { tool: 'spend.journal', op: OP.READ },
    ],
  },
  reconcile_demo: {
    id: 'reconcile_demo',
    description: 'AAM blog-style recon: read protected, post summary only',
    maxLifetimeMs: 10 * 60 * 1000,
    ceiling: [
      { tool: 'processor.report', op: OP.READ, protected: true },
      { tool: 'ledger.read', op: OP.READ },
      { tool: 'ledger.read_b', op: OP.READ },
      { tool: 'support.case', op: OP.WRITE },
      { tool: 'finance.post_summary', op: OP.WRITE },
      { tool: 'http.egress', op: OP.EGRESS },
    ],
    /** After protected read: remove these tools (Trust Ratchet). */
    ratchetOnProtected: ['support.case', 'processor.report', 'http.egress'],
  },
  social_draft: {
    id: 'social_draft',
    description: 'Draft content only — no live publish',
    maxLifetimeMs: 45 * 60 * 1000,
    ceiling: [
      { tool: 'content.draft', op: OP.WRITE },
      { tool: 'fs.read', op: OP.READ },
      { tool: 'fs.write', op: OP.WRITE },
      // publish tools deliberately NOT in ceiling
    ],
  },
});

/** Hard-deny tools — never in any ceiling (never-spend / desktop hijack). */
const GLOBAL_DENY = Object.freeze([
  'spend.authorize',
  'spend.purchase',
  'checkout.open',
  'chrome.hijack',
  'desktop.activate',
  'wallet.pay',
  'x402.pay',
]);

function nowMs(clock) {
  return typeof clock === 'function' ? clock() : Date.now();
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function activityLogPath(dir = DEFAULT_STATE_DIR) {
  return path.join(ensureDir(dir), 'activity.jsonl');
}

function appendActivity(event, dir = DEFAULT_STATE_DIR) {
  const row = {
    schema: 'hermes-aam/activity-v1',
    at: new Date().toISOString(),
    ...event,
  };
  // Scrub secrets
  const raw = JSON.stringify(row);
  if (/sk[_-]|password|api[_-]?key|bearer\s/i.test(raw) && !event.allowSecretScan) {
    row.scrubbed = true;
    delete row.secret;
    delete row.token;
    delete row.apiKey;
  }
  fs.appendFileSync(activityLogPath(dir), `${JSON.stringify(row)}\n`, 'utf8');
  return row;
}

/**
 * Mint short-lived task-scoped credential (handle only — no model-held secret).
 * Sender-constrained: proofKey stays in harness memory, never returned to model path.
 */
function mintTaskCredential(options = {}) {
  const clock = options.clock || (() => Date.now());
  const templateId = options.template || options.templateId || 'code_fix';
  const template = TASK_TEMPLATES[templateId];
  if (!template) {
    return { ok: false, error: 'unknown_template', templateId };
  }

  const principal = String(options.principal || options.agent || 'igor').slice(0, 64);
  const agentId = String(options.agentId || options.agent || 'hermes-yolo').slice(0, 64);
  const taskId = `task_${crypto.randomBytes(8).toString('hex')}`;
  const proofKey = crypto.randomBytes(32).toString('hex'); // harness-only
  const expiresAt = nowMs(clock) + (options.lifetimeMs || template.maxLifetimeMs);

  // Intersect template with optional principal reductions
  let ceiling = template.ceiling.map((c) => ({ ...c }));
  if (Array.isArray(options.denyTools)) {
    const deny = new Set(options.denyTools);
    ceiling = ceiling.filter((c) => !deny.has(c.tool));
  }
  // Always strip global deny
  ceiling = ceiling.filter((c) => !GLOBAL_DENY.includes(c.tool));

  const graph = {
    taskId,
    templateId: template.id,
    principal,
    agentId,
    createdAt: nowMs(clock),
    expiresAt,
    trustState: 'baseline', // baseline | restricted
    trustVersion: 1,
    ceiling,
    removed: [], // tools removed by ratchet
    proofKeyFingerprint: crypto.createHash('sha256').update(proofKey).digest('hex').slice(0, 16),
    // proofKey stored only in returned harness object, not in activity log
  };

  appendActivity(
    {
      kind: 'dispatch',
      taskId,
      templateId: template.id,
      principal,
      agentId,
      ceilingTools: ceiling.map((c) => c.tool),
      expiresAt,
      trustState: graph.trustState,
    },
    options.stateDir,
  );

  return {
    ok: true,
    taskId,
    // Public credential handle (safe to log)
    credential: {
      taskId,
      principal,
      agentId,
      templateId: template.id,
      expiresAt,
      trustState: graph.trustState,
      trustVersion: graph.trustVersion,
      proofKeyFingerprint: graph.proofKeyFingerprint,
    },
    // Harness-only material (never give to the model)
    harness: {
      proofKey,
      graph,
      template,
    },
  };
}

function isExpired(graph, clock) {
  return nowMs(clock) >= graph.expiresAt;
}

function activeCeiling(graph) {
  const removed = new Set(graph.removed || []);
  return (graph.ceiling || []).filter((c) => !removed.has(c.tool));
}

/**
 * Trust Ratchet: after protected data enters the graph, remove capabilities.
 * Capability state only narrows (AAM principle 5).
 */
function applyTrustRatchet(harness, options = {}) {
  const graph = harness.graph;
  const template = harness.template || TASK_TEMPLATES[graph.templateId];
  const toRemove = options.removeTools || template.ratchetOnProtected || [];
  if (!toRemove.length) {
    return { ok: true, changed: false, trustState: graph.trustState };
  }

  const before = new Set(graph.removed || []);
  let changed = false;
  for (const tool of toRemove) {
    if (!before.has(tool)) {
      graph.removed.push(tool);
      changed = true;
    }
  }
  if (changed) {
    graph.trustState = 'restricted';
    graph.trustVersion += 1;
    appendActivity(
      {
        kind: 'trust_ratchet',
        taskId: graph.taskId,
        trustState: graph.trustState,
        trustVersion: graph.trustVersion,
        removed: toRemove,
      },
      options.stateDir,
    );
  }
  return {
    ok: true,
    changed,
    trustState: graph.trustState,
    trustVersion: graph.trustVersion,
    removed: [...graph.removed],
  };
}

/**
 * Authorize one tool action against task ceiling + ratchet + global deny.
 * Prompt text never grants authority.
 */
function authorizeAction(harness, action, options = {}) {
  const clock = options.clock || (() => Date.now());
  const graph = harness.graph;
  const tool = String(action.tool || '');
  const op = String(action.op || OP.READ);
  const proof = action.proofKey || options.proofKey;

  const deny = (reason, extra = {}) => {
    const event = {
      kind: 'authorize',
      result: 'deny',
      reason,
      taskId: graph.taskId,
      tool,
      op,
      trustState: graph.trustState,
      trustVersion: graph.trustVersion,
      ...extra,
    };
    appendActivity(event, options.stateDir);
    return { allowed: false, ...event };
  };

  if (!tool) return deny('missing_tool');
  if (GLOBAL_DENY.includes(tool) || op === OP.SPEND) {
    return deny('global_deny_never_spend', { hardDeny: true });
  }
  if (isExpired(graph, clock)) return deny('task_expired');

  // Sender-constrained: require harness proof key
  if (proof !== harness.proofKey) {
    return deny('proof_key_mismatch', { message: 'Replay without harness proof blocked (DPoP-style)' });
  }

  const ceiling = activeCeiling(graph);
  const grant = ceiling.find((c) => c.tool === tool);
  if (!grant) {
    return deny('outside_ceiling', {
      message: `Tool ${tool} not in task ceiling (template=${graph.templateId})`,
    });
  }

  // Protected read → ratchet before releasing data to model path
  if (grant.protected && (op === OP.READ || action.protected === true)) {
    applyTrustRatchet(harness, {
      stateDir: options.stateDir,
      removeTools: options.ratchetRemove || harness.template?.ratchetOnProtected,
    });
  }

  // Critical ops may require human flag
  if (op === OP.CRITICAL || grant.op === OP.CRITICAL) {
    if (options.humanApproved !== true && action.humanApproved !== true) {
      return deny('human_oversight_required', {
        message: 'Critical action requires explicit human approval (not prompt text)',
      });
    }
  }

  const event = {
    kind: 'authorize',
    result: 'allow',
    taskId: graph.taskId,
    tool,
    op: grant.op || op,
    trustState: graph.trustState,
    trustVersion: graph.trustVersion,
    principal: graph.principal,
    agentId: graph.agentId,
  };
  appendActivity(event, options.stateDir);
  return { allowed: true, ...event, grant };
}

/**
 * Grant Review Loop: propose template changes from activity evidence.
 * Never widens the active task — future templates only.
 */
function grantReviewFromActivity(options = {}) {
  const dir = options.stateDir || DEFAULT_STATE_DIR;
  const logPath = activityLogPath(dir);
  if (!fs.existsSync(logPath)) {
    return { ok: true, proposals: [], totalEvents: 0 };
  }
  const lines = fs.readFileSync(logPath, 'utf8').split('\n').filter(Boolean);
  const limit = options.limit || 500;
  const slice = lines.slice(-limit);
  const allows = {};
  const denials = {};
  let total = 0;
  for (const line of slice) {
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }
    total += 1;
    if (row.kind !== 'authorize') continue;
    const key = `${row.templateId || ''}:${row.tool}`;
    if (row.result === 'allow') allows[row.tool] = (allows[row.tool] || 0) + 1;
    if (row.result === 'deny') denials[row.tool] = (denials[row.tool] || 0) + 1;
  }

  const proposals = [];
  // Over-permissioned signal: tools never used (from a named template's ceiling)
  const templateId = options.templateId || 'code_fix';
  const template = TASK_TEMPLATES[templateId];
  if (template) {
    for (const c of template.ceiling) {
      if (!allows[c.tool] && !denials[c.tool]) {
        proposals.push({
          kind: 'revoke_unused',
          templateId,
          tool: c.tool,
          evidence: 'unused_across_window',
          appliesTo: 'future_templates_only',
        });
      }
    }
  }
  // Under-permissioned: repeated denials
  for (const [tool, count] of Object.entries(denials)) {
    if (count >= (options.denialThreshold || 3)) {
      proposals.push({
        kind: 'consider_widen',
        tool,
        denialCount: count,
        evidence: 'recurring_denial',
        appliesTo: 'future_templates_only',
        note: 'Human review required — never auto-widen active task',
      });
    }
  }

  return { ok: true, totalEvents: total, proposals, allows, denials };
}

/** End-to-end AAM demo matching Cloudflare recon exfiltration story. */
function runDemo(options = {}) {
  const steps = [];
  const dispatched = mintTaskCredential({
    template: 'reconcile_demo',
    principal: 'finance-scheduler',
    agentId: 'recon-agent',
    stateDir: options.stateDir,
  });
  steps.push({ step: 'dispatch', ok: dispatched.ok, taskId: dispatched.taskId });

  const h = dispatched.harness;

  // t=1 protected processor report
  const readProc = authorizeAction(
    h,
    { tool: 'processor.report', op: OP.READ, proofKey: h.proofKey, protected: true },
    { stateDir: options.stateDir },
  );
  steps.push({
    step: 'protected_read',
    allowed: readProc.allowed,
    trustState: h.graph.trustState,
    removed: h.graph.removed,
  });

  // t=2 exfiltration via support.case — must deny after ratchet
  const exfil = authorizeAction(
    h,
    { tool: 'support.case', op: OP.WRITE, proofKey: h.proofKey },
    { stateDir: options.stateDir },
  );
  steps.push({
    step: 'exfil_attempt',
    allowed: exfil.allowed,
    reason: exfil.reason,
  });

  // Typed summary still allowed
  const summary = authorizeAction(
    h,
    { tool: 'finance.post_summary', op: OP.WRITE, proofKey: h.proofKey },
    { stateDir: options.stateDir },
  );
  steps.push({ step: 'typed_summary', allowed: summary.allowed });

  // Spend always denied
  const spend = authorizeAction(
    h,
    { tool: 'spend.authorize', op: OP.SPEND, proofKey: h.proofKey },
    { stateDir: options.stateDir },
  );
  steps.push({ step: 'never_spend', allowed: spend.allowed, reason: spend.reason });

  // Replay without proof key
  const replay = authorizeAction(
    h,
    { tool: 'ledger.read', op: OP.READ, proofKey: 'stolen' },
    { stateDir: options.stateDir },
  );
  steps.push({ step: 'replay_blocked', allowed: replay.allowed, reason: replay.reason });

  const ok =
    readProc.allowed &&
    !exfil.allowed &&
    summary.allowed &&
    !spend.allowed &&
    !replay.allowed &&
    h.graph.trustState === 'restricted';

  return { ok, steps, taskId: dispatched.taskId, trustState: h.graph.trustState };
}

function parseArgs(argv) {
  const args = { json: true };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--dispatch') args.dispatch = true;
    else if (a === '--check') args.check = true;
    else if (a === '--demo') args.demo = true;
    else if (a === '--review') args.review = true;
    else if (a === '--template') args.template = argv[++i];
    else if (a === '--principal') args.principal = argv[++i];
    else if (a === '--agent') args.agentId = argv[++i];
    else if (a === '--tool') args.tool = argv[++i];
    else if (a === '--op') args.op = argv[++i];
    else if (a === '--json') args.json = true;
    else if (a === '--list-templates') args.list = true;
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    console.log(`Usage:
  node tools/hermes-agent-access-model.js --list-templates [--json]
  node tools/hermes-agent-access-model.js --dispatch --template code_fix --principal igor [--json]
  node tools/hermes-agent-access-model.js --demo [--json]
  node tools/hermes-agent-access-model.js --review [--json]`);
    process.exit(0);
  }

  let out;
  if (args.list) {
    out = {
      ok: true,
      templates: Object.values(TASK_TEMPLATES).map((t) => ({
        id: t.id,
        description: t.description,
        maxLifetimeMs: t.maxLifetimeMs,
        tools: t.ceiling.map((c) => c.tool),
      })),
    };
  } else if (args.demo) {
    out = runDemo();
  } else if (args.review) {
    out = grantReviewFromActivity({ templateId: args.template });
  } else if (args.dispatch) {
    const d = mintTaskCredential({
      template: args.template || 'code_fix',
      principal: args.principal,
      agentId: args.agentId,
    });
    // Never print proofKey to stdout in CLI — only fingerprint
    out = {
      ok: d.ok,
      taskId: d.taskId,
      credential: d.credential,
      ceiling: d.harness?.graph?.ceiling?.map((c) => c.tool),
    };
  } else {
    out = { ok: false, error: 'use --dispatch, --demo, --review, or --list-templates' };
  }

  process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
  process.exit(out && out.ok === false ? 1 : 0);
}

if (require.main === module) {
  main();
}

module.exports = {
  OP,
  TASK_TEMPLATES,
  GLOBAL_DENY,
  DEFAULT_STATE_DIR,
  mintTaskCredential,
  authorizeAction,
  applyTrustRatchet,
  grantReviewFromActivity,
  appendActivity,
  activityLogPath,
  runDemo,
  activeCeiling,
};
