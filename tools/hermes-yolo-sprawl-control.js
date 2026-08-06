#!/usr/bin/env node
'use strict';

/**
 * hermes-yolo agentic sprawl control — YugabyteDB AMP (Agentic Multitenant Postgres)
 * patterns applied to coding-agent fleets.
 *
 * Source: https://thenewstack.io/yugabytedb-agentic-postgres-scaling/
 *   "The dimension of scale is shifting. It's not just large databases;
 *    it's also a proliferation of databases." → proliferation of agent runs.
 *
 * Steal map:
 *   Architect   → provision/route (model, env, worktree, toolsets)
 *   Voyager     → migrate/modernize (ports, refactors, schema moves)
 *   PerfAdvisor → diagnose thrash/timeouts/Mac freeze/identical retries
 *   Nexus       → connect external (MCP, gateway, browser — guarded)
 *   Decision traces → person said / context said / inferred / did
 *   Guarded freedom → dry-run + risk categories + ask-before
 *   Scale-to-zero   → idle/stale fleet reaping + sprawl registry
 *
 * CLI:
 *   node tools/hermes-yolo-sprawl-control.js --status --json
 *   node tools/hermes-yolo-sprawl-control.js --plan --task "fix pairing" --json
 *   node tools/hermes-yolo-sprawl-control.js --reap --dry-run --json
 *   node tools/hermes-yolo-sprawl-control.js --register --pid 123 --task "..."
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const HOME = os.homedir();

const DEFAULT_FLEET_DIR =
  process.env.HERMES_YOLO_FLEET_DIR || path.join(HOME, '.hermes', 'fleet', 'hermes-yolo');

/** Yugabyte AMP four-agent substrate mapped onto hermes-yolo roles. */
const ROLE_CATALOG = Object.freeze({
  architect: {
    id: 'architect',
    name: 'Architect',
    yugabyte: 'YugabyteDB Architect',
    job: 'Provision and route: model/provider selection, worktree/env policy, toolsets, fail-closed capability',
    triggers: [
      'provision', 'setup', 'install', 'route', 'model', 'provider', 'worktree',
      'branch', 'scaffold', 'bootstrap', 'new project', 'env',
    ],
  },
  voyager: {
    id: 'voyager',
    name: 'Voyager',
    yugabyte: 'YugabyteDB Voyager',
    job: 'Migrate and modernize: ports, refactors, schema/API moves, SDK upgrades without rewrite thrash',
    triggers: [
      'migrate', 'migration', 'port', 'upgrade', 'modernize', 'refactor',
      'rewrite', 'sdk', 'schema', 'codemod', 'deprecate',
    ],
  },
  perf_advisor: {
    id: 'perf_advisor',
    name: 'Perf Advisor',
    yugabyte: 'YugabyteDB Perf Advisor',
    job: 'Diagnose: thrash, timeouts, identical retries, Mac freeze, jetsam, runaway CPU',
    triggers: [
      'perf', 'performance', 'slow', 'timeout', 'thrash', 'freeze', 'jetsam',
      'memory', 'cpu', 'crash', 'hang', 'retry', 'loop', 'watchdog',
    ],
  },
  nexus: {
    id: 'nexus',
    name: 'Nexus',
    yugabyte: 'YugabyteDB Nexus',
    job: 'Connect ecosystem: MCP, LiteLLM gateway, keychain, browser/CDP (guarded autonomy)',
    triggers: [
      'mcp', 'gateway', 'litellm', 'keychain', 'chrome', 'browser', 'cdp',
      'wire', 'connect', 'oauth', 'secret', 'api key', 'pair',
    ],
  },
});

/** Risk categories for guarded autonomy (Yugabyte: "guarded amount of freedom"). */
const RISK_CATEGORIES = Object.freeze({
  destructive: {
    id: 'destructive',
    patterns: [
      /\brm\s+(-[a-zA-Z]*r[a-zA-Z]*f|-[a-zA-Z]*f[a-zA-Z]*r)/i,
      /\bgit\s+push\s+.*--force/i,
      /\bgit\s+reset\s+--hard/i,
      /\bdrop\s+(table|database|schema)\b/i,
      /\bmkfs\b/i,
      /\bdd\s+if=/i,
    ],
    defaultAction: 'ask', // always ask unless HERMES_YOLO_ALLOW_DESTRUCTIVE=1
  },
  spend: {
    id: 'spend',
    patterns: [
      /\b(checkout|purchase|buy\s+credits|upgrade\s+plan|add\s+payment)\b/i,
      /\bstripe\s+(charge|payment_intent)\b/i,
      /\bapollo\s+pro\b/i,
    ],
    defaultAction: 'block', // hard never-spend
  },
  publish: {
    id: 'publish',
    patterns: [
      /\b(post|publish|tweet|toot)\b.*\b(linkedin|twitter|x\.com|bluesky|threads|reddit|medium)\b/i,
      /\bgh\s+release\s+create\b/i,
      /\bnpm\s+publish\b/i,
    ],
    defaultAction: 'ask',
  },
  browser: {
    id: 'browser',
    patterns: [
      /\b(computer_use|playwright|chrome|cdp|osascript.*chrome)\b/i,
      /\bdrive.?logged.?in.?chrome\b/i,
    ],
    defaultAction: 'ask', // desktop hijack ban unless explicit
  },
  production: {
    id: 'production',
    patterns: [
      /\b(production|prod\b|main\b.*deploy|fly\s+deploy|kubectl\s+apply)\b/i,
      /\b--prod\b/i,
    ],
    defaultAction: 'ask',
  },
});

function fleetPaths(dir = DEFAULT_FLEET_DIR) {
  return {
    dir,
    registryPath: path.join(dir, 'registry.json'),
    historyPath: path.join(dir, 'history.jsonl'),
    latestTracePath: path.join(dir, 'decision-trace-latest.json'),
  };
}

function ensureFleetDir(dir = DEFAULT_FLEET_DIR) {
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  return fleetPaths(dir);
}

function readRegistry(dir = DEFAULT_FLEET_DIR) {
  const { registryPath } = ensureFleetDir(dir);
  if (!fs.existsSync(registryPath)) {
    return { schema: 'hermes-yolo/fleet-registry-v1', runs: [], updatedAt: null };
  }
  try {
    const raw = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    if (!raw || !Array.isArray(raw.runs)) {
      return { schema: 'hermes-yolo/fleet-registry-v1', runs: [], updatedAt: null };
    }
    return raw;
  } catch {
    return { schema: 'hermes-yolo/fleet-registry-v1', runs: [], updatedAt: null };
  }
}

function writeRegistry(registry, dir = DEFAULT_FLEET_DIR) {
  const { registryPath } = ensureFleetDir(dir);
  const next = {
    ...registry,
    schema: 'hermes-yolo/fleet-registry-v1',
    updatedAt: new Date().toISOString(),
  };
  const tmp = `${registryPath}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(tmp, registryPath);
  try { fs.chmodSync(registryPath, 0o600); } catch { /* ignore */ }
  return next;
}

function isPidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function pidState(pid) {
  try {
    const { execFileSync } = require('child_process');
    return execFileSync('ps', ['-o', 'state=', '-p', String(pid)], {
      encoding: 'utf8',
    }).trim();
  } catch {
    return '';
  }
}

function taskDigest(taskText) {
  return crypto.createHash('sha256').update(String(taskText || '')).digest('hex').slice(0, 16);
}

/**
 * Pick primary + secondary roles from task text (AMP four-agent substrate).
 */
function resolveRoles(taskText, env = process.env) {
  const forced = String(env.HERMES_YOLO_ROLE || '').trim().toLowerCase();
  if (forced && ROLE_CATALOG[forced]) {
    return {
      primary: ROLE_CATALOG[forced],
      secondary: [],
      reason: 'env-HERMES_YOLO_ROLE',
    };
  }
  const t = String(taskText || '').toLowerCase();
  const scored = Object.values(ROLE_CATALOG).map((role) => {
    let score = 0;
    for (const trig of role.triggers) {
      if (t.includes(trig)) score += trig.length >= 6 ? 3 : 2;
    }
    return { role, score };
  }).sort((a, b) => b.score - a.score);

  const primary = scored[0].score > 0 ? scored[0].role : ROLE_CATALOG.architect;
  const secondary = scored
    .slice(1)
    .filter((x) => x.score > 0)
    .slice(0, 2)
    .map((x) => x.role);
  return {
    primary,
    secondary,
    reason: scored[0].score > 0 ? 'task-triggers' : 'default-architect',
    scores: Object.fromEntries(scored.map((s) => [s.role.id, s.score])),
  };
}

/**
 * Classify risk categories present in task/command text.
 */
function classifyRisks(text) {
  const hay = String(text || '');
  const hits = [];
  for (const cat of Object.values(RISK_CATEGORIES)) {
    for (const re of cat.patterns) {
      if (re.test(hay)) {
        hits.push({ id: cat.id, defaultAction: cat.defaultAction, pattern: String(re) });
        break;
      }
    }
  }
  return hits;
}

/**
 * Guarded autonomy policy (Yugabyte: dry-run / ask-before by category).
 * @returns {{ mode: 'execute'|'dry_run'|'ask'|'block', reasons: string[], risks: object[] }}
 */
function resolveAutonomy(taskText, env = process.env) {
  const risks = classifyRisks(taskText);
  const dryRun =
    env.HERMES_YOLO_DRY_RUN === '1'
    || env.HERMES_YOLO_DRY_RUN === 'true'
    || /\b--dry-run\b/.test(String(taskText || ''));

  if (dryRun) {
    return {
      mode: 'dry_run',
      reasons: ['HERMES_YOLO_DRY_RUN or --dry-run'],
      risks,
      askCategories: [],
    };
  }

  const askCategories = [];
  const reasons = [];
  let mode = 'execute';

  for (const risk of risks) {
    if (risk.id === 'spend' && env.HERMES_YOLO_ALLOW_SPEND !== '1') {
      mode = 'block';
      reasons.push('spend risk: hard block (never-spend policy)');
      continue;
    }
    if (risk.id === 'browser' && env.HERMES_ALLOW_INTERACTIVE_CHROME !== '1' && env.HERMES_YOLO_ALLOW_COMPUTER_USE !== '1') {
      // Don't hard-block the whole run; mark ask for browser toolsets.
      askCategories.push('browser');
      reasons.push('browser risk: require HERMES_ALLOW_INTERACTIVE_CHROME=1 or HERMES_YOLO_ALLOW_COMPUTER_USE=1 for computer_use');
      continue;
    }
    if (risk.defaultAction === 'block') {
      mode = 'block';
      reasons.push(`${risk.id}: block`);
    } else if (risk.defaultAction === 'ask') {
      askCategories.push(risk.id);
      if (env.HERMES_YOLO_AUTONOMY === 'strict' || env.HERMES_YOLO_ASK_BEFORE === '1') {
        if (mode !== 'block') mode = 'ask';
        reasons.push(`${risk.id}: ask-before (strict autonomy)`);
      } else {
        reasons.push(`${risk.id}: elevated risk (logged; set HERMES_YOLO_ASK_BEFORE=1 to hard-stop)`);
      }
    }
  }

  // Production-like cwd heuristic
  if (/production|prod-deploy/i.test(String(env.HERMES_YOLO_ENVIRONMENT || ''))) {
    askCategories.push('production');
    if (env.HERMES_YOLO_ASK_BEFORE === '1' && mode === 'execute') {
      mode = 'ask';
      reasons.push('HERMES_YOLO_ENVIRONMENT=production + ASK_BEFORE');
    }
  }

  return { mode, reasons, risks, askCategories: [...new Set(askCategories)] };
}

/**
 * Yugabyte/Meko-style decision trace:
 * "what the person said / what context said / what I inferred / what I did"
 */
function buildDecisionTrace(options = {}) {
  const taskText = options.taskText || '';
  const roles = options.roles || resolveRoles(taskText, options.env || process.env);
  const autonomy = options.autonomy || resolveAutonomy(taskText, options.env || process.env);
  const context = options.context || {};
  return {
    schema: 'hermes-yolo/decision-trace-v1',
    source: 'yugabytedb-amp-decision-trace',
    generatedAt: options.generatedAt || new Date().toISOString(),
    runId: options.runId || crypto.randomBytes(8).toString('hex'),
    personSaid: {
      taskDigest: taskDigest(taskText),
      argCount: options.argCount ?? null,
      // Never store full prompt plaintext in fleet registry by default
      taskPreview: String(taskText).slice(0, 120),
    },
    contextSaid: {
      cwdDigest: options.cwd
        ? crypto.createHash('sha256').update(path.resolve(options.cwd)).digest('hex').slice(0, 16)
        : null,
      host: options.host || os.hostname(),
      orgHints: context.orgHints || [
        'SuperGrok preferred when doctor-ready',
        'agent_capable fail-closed for coding models',
        'slim toolsets default; computer_use/vision opt-in',
        'never-spend hard ban for agent',
      ],
      env: {
        backend: context.backend || null,
        model: context.model || null,
        leanContext: context.leanContext || null,
      },
    },
    inferred: {
      primaryRole: roles.primary.id,
      secondaryRoles: (roles.secondary || []).map((r) => r.id),
      roleReason: roles.reason,
      autonomyMode: autonomy.mode,
      autonomyReasons: autonomy.reasons,
      riskCategories: (autonomy.risks || []).map((r) => r.id),
      askCategories: autonomy.askCategories || [],
    },
    did: options.did || {
      status: 'planned',
      actions: [],
    },
  };
}

function writeDecisionTrace(trace, dir = DEFAULT_FLEET_DIR) {
  const { latestTracePath, historyPath } = ensureFleetDir(dir);
  const serialized = `${JSON.stringify(trace)}\n`;
  fs.writeFileSync(latestTracePath, `${JSON.stringify(trace, null, 2)}\n`, { mode: 0o600 });
  fs.appendFileSync(historyPath, serialized, { mode: 0o600 });
  try {
    fs.chmodSync(latestTracePath, 0o600);
    fs.chmodSync(historyPath, 0o600);
  } catch { /* ignore */ }
  return { latestTracePath, historyPath };
}

/**
 * Register an active hermes-yolo run in the fleet registry (proliferation tracking).
 */
function registerRun(options = {}) {
  const dir = options.dir || DEFAULT_FLEET_DIR;
  const registry = readRegistry(dir);
  const pid = Number(options.pid || process.pid);
  const now = new Date().toISOString();
  // Drop dead pids
  registry.runs = (registry.runs || []).filter((r) => isPidAlive(r.pid));
  const entry = {
    pid,
    runId: options.runId || crypto.randomBytes(8).toString('hex'),
    startedAt: now,
    lastHeartbeatAt: now,
    cwdDigest: options.cwd
      ? crypto.createHash('sha256').update(path.resolve(options.cwd)).digest('hex').slice(0, 16)
      : null,
    taskDigest: taskDigest(options.taskText || ''),
    role: options.role || 'architect',
    backend: options.backend || null,
    model: options.model || null,
    autonomyMode: options.autonomyMode || 'execute',
    host: options.host || os.hostname(),
  };
  // Replace same pid if re-register
  registry.runs = registry.runs.filter((r) => r.pid !== pid);
  registry.runs.push(entry);
  writeRegistry(registry, dir);
  return entry;
}

function heartbeatRun(pid = process.pid, dir = DEFAULT_FLEET_DIR) {
  const registry = readRegistry(dir);
  const now = new Date().toISOString();
  let found = false;
  for (const r of registry.runs || []) {
    if (r.pid === pid) {
      r.lastHeartbeatAt = now;
      found = true;
    }
  }
  if (found) writeRegistry(registry, dir);
  return found;
}

function unregisterRun(pid = process.pid, dir = DEFAULT_FLEET_DIR) {
  const registry = readRegistry(dir);
  const before = (registry.runs || []).length;
  registry.runs = (registry.runs || []).filter((r) => r.pid !== pid);
  writeRegistry(registry, dir);
  return { removed: before - registry.runs.length, remaining: registry.runs.length };
}

/**
 * Scale-to-zero: classify fleet runs as live / idle / dead / suspended.
 * Idle = no heartbeat beyond threshold; dead = pid gone; suspended = T/Z state.
 */
function assessFleet(options = {}) {
  const dir = options.dir || DEFAULT_FLEET_DIR;
  const idleMs = Number(options.idleMs ?? process.env.HERMES_YOLO_IDLE_MS ?? 30 * 60 * 1000);
  const registry = readRegistry(dir);
  const now = Date.now();
  const assessed = [];
  for (const run of registry.runs || []) {
    const alive = isPidAlive(run.pid);
    const state = alive ? pidState(run.pid) : '';
    const lastHb = run.lastHeartbeatAt ? Date.parse(run.lastHeartbeatAt) : Date.parse(run.startedAt || 0);
    const ageMs = Number.isFinite(lastHb) ? now - lastHb : Infinity;
    let status = 'live';
    if (!alive) status = 'dead';
    else if (state.includes('T') || state.includes('Z')) status = 'suspended';
    else if (ageMs > idleMs) status = 'idle';
    assessed.push({
      ...run,
      alive,
      state: state || null,
      heartbeatAgeMs: Number.isFinite(ageMs) ? ageMs : null,
      status,
      scaleToZeroCandidate: status === 'dead' || status === 'suspended' || status === 'idle',
    });
  }
  return {
    schema: 'hermes-yolo/fleet-assessment-v1',
    source: 'yugabytedb-amp-scale-to-zero',
    generatedAt: new Date().toISOString(),
    idleMs,
    total: assessed.length,
    live: assessed.filter((r) => r.status === 'live').length,
    idle: assessed.filter((r) => r.status === 'idle').length,
    dead: assessed.filter((r) => r.status === 'dead').length,
    suspended: assessed.filter((r) => r.status === 'suspended').length,
    runs: assessed,
  };
}

/**
 * Reap scale-to-zero candidates. dryRun=true by default for safety.
 */
function reapFleet(options = {}) {
  const dryRun = options.dryRun !== false; // default true
  const dir = options.dir || DEFAULT_FLEET_DIR;
  const assessment = assessFleet({ dir, idleMs: options.idleMs });
  const reaped = [];
  const kept = [];
  for (const run of assessment.runs) {
    if (!run.scaleToZeroCandidate) {
      kept.push(run);
      continue;
    }
    const action = {
      pid: run.pid,
      runId: run.runId,
      status: run.status,
      killed: false,
      removedFromRegistry: false,
    };
    if (!dryRun) {
      if (run.status === 'suspended' || (run.status === 'idle' && options.killIdle)) {
        try {
          process.kill(run.pid, 'SIGKILL');
          action.killed = true;
        } catch { /* may already be dead */ }
      }
      // Always drop dead/suspended from registry when not dry-run
      action.removedFromRegistry = true;
    }
    reaped.push(action);
  }
  if (!dryRun) {
    const registry = readRegistry(dir);
    const reapedPids = new Set(reaped.map((r) => r.pid));
    registry.runs = (registry.runs || []).filter((r) => {
      if (!reapedPids.has(r.pid)) return true;
      // keep idle-live if we didn't killIdle
      const a = assessment.runs.find((x) => x.pid === r.pid);
      if (a && a.status === 'idle' && !options.killIdle) return true;
      return false;
    });
    // Also drop any still-dead
    registry.runs = registry.runs.filter((r) => isPidAlive(r.pid));
    writeRegistry(registry, dir);
  }
  return {
    schema: 'hermes-yolo/fleet-reap-v1',
    dryRun,
    killIdle: Boolean(options.killIdle),
    reaped,
    keptCount: kept.length,
    assessmentSummary: {
      total: assessment.total,
      live: assessment.live,
      idle: assessment.idle,
      dead: assessment.dead,
      suspended: assessment.suspended,
    },
  };
}

/**
 * Full run plan: roles + autonomy + decision trace (no side effects except optional register).
 */
function planRun(options = {}) {
  const env = options.env || process.env;
  const taskText = options.taskText || '';
  const roles = resolveRoles(taskText, env);
  const autonomy = resolveAutonomy(taskText, env);
  const fleet = assessFleet({ dir: options.dir, idleMs: options.idleMs });
  const trace = buildDecisionTrace({
    taskText,
    roles,
    autonomy,
    env,
    cwd: options.cwd || process.cwd(),
    runId: options.runId,
    host: options.host,
    context: options.context || {},
    argCount: options.argCount,
    did: {
      status: autonomy.mode === 'execute' ? 'ready' : autonomy.mode,
      actions: [
        `primary_role=${roles.primary.id}`,
        `autonomy=${autonomy.mode}`,
        `fleet_live=${fleet.live}`,
        `fleet_idle=${fleet.idle}`,
        `fleet_dead=${fleet.dead}`,
      ],
    },
  });
  return {
    schema: 'hermes-yolo/sprawl-plan-v1',
    source: 'yugabytedb-agentic-postgres-scaling',
    roles: {
      primary: roles.primary.id,
      primaryJob: roles.primary.job,
      secondary: roles.secondary.map((r) => r.id),
      reason: roles.reason,
      scores: roles.scores,
    },
    autonomy,
    fleet: {
      total: fleet.total,
      live: fleet.live,
      idle: fleet.idle,
      dead: fleet.dead,
      suspended: fleet.suspended,
      sprawlWarning: fleet.live + fleet.idle >= Number(env.HERMES_YOLO_SPRAWL_WARN || 4),
    },
    decisionTrace: trace,
    proceed: autonomy.mode === 'execute' || autonomy.mode === 'dry_run',
    blockReason: autonomy.mode === 'block' ? autonomy.reasons.join('; ') : null,
    askReason: autonomy.mode === 'ask' ? autonomy.reasons.join('; ') : null,
  };
}

function renderDryRunMarkdown(plan) {
  const lines = [
    '# hermes-yolo dry-run plan (Yugabyte AMP guarded autonomy)',
    '',
    `**Primary role:** ${plan.roles.primary} — ${plan.roles.primaryJob}`,
    plan.roles.secondary.length
      ? `**Secondary:** ${plan.roles.secondary.join(', ')}`
      : '**Secondary:** (none)',
    `**Autonomy:** ${plan.autonomy.mode}`,
    plan.autonomy.reasons.length ? `**Reasons:** ${plan.autonomy.reasons.join('; ')}` : '',
    '',
    '## Decision trace',
    `- Person said (preview): ${plan.decisionTrace.personSaid.taskPreview || '(empty)'}`,
    `- Context: backend=${plan.decisionTrace.contextSaid.env.backend || 'n/a'} model=${plan.decisionTrace.contextSaid.env.model || 'n/a'}`,
    `- Inferred role=${plan.decisionTrace.inferred.primaryRole} risks=${(plan.decisionTrace.inferred.riskCategories || []).join(',') || 'none'}`,
    `- Would do: ${plan.decisionTrace.did.actions.join('; ')}`,
    '',
    '## Fleet sprawl',
    `- live=${plan.fleet.live} idle=${plan.fleet.idle} dead=${plan.fleet.dead} suspended=${plan.fleet.suspended}`,
    plan.fleet.sprawlWarning ? '- **WARNING:** concurrent run count high — consider reap --dry-run' : '',
    '',
    '_No child agent was spawned (dry-run). Unset HERMES_YOLO_DRY_RUN / drop --dry-run to execute._',
  ].filter(Boolean);
  return lines.join('\n');
}

// --- CLI ---
if (require.main === module) {
  const argv = process.argv.slice(2);
  let json = false;
  let status = false;
  let plan = false;
  let reap = false;
  let register = false;
  let unregister = false;
  let dryRun = true;
  let killIdle = false;
  let task = '';
  let pid = process.pid;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--json') json = true;
    else if (argv[i] === '--status' || argv[i] === 'status') status = true;
    else if (argv[i] === '--plan' || argv[i] === 'plan') plan = true;
    else if (argv[i] === '--reap' || argv[i] === 'reap') reap = true;
    else if (argv[i] === '--register') register = true;
    else if (argv[i] === '--unregister') unregister = true;
    else if (argv[i] === '--execute') dryRun = false;
    else if (argv[i] === '--dry-run') dryRun = true;
    else if (argv[i] === '--kill-idle') killIdle = true;
    else if (argv[i] === '--task') task = argv[++i] || '';
    else if (argv[i] === '--pid') pid = parseInt(argv[++i], 10) || process.pid;
  }

  if (register) {
    const entry = registerRun({ pid, taskText: task, role: resolveRoles(task).primary.id });
    process.stdout.write(json ? `${JSON.stringify(entry, null, 2)}\n` : `registered pid=${entry.pid} run=${entry.runId}\n`);
    process.exit(0);
  }
  if (unregister) {
    const r = unregisterRun(pid);
    process.stdout.write(json ? `${JSON.stringify(r, null, 2)}\n` : `unregistered removed=${r.removed} remaining=${r.remaining}\n`);
    process.exit(0);
  }
  if (reap) {
    const result = reapFleet({ dryRun, killIdle });
    if (json) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    else {
      console.log(
        `reap dryRun=${result.dryRun} reaped=${result.reaped.length} kept=${result.keptCount} `
        + `live=${result.assessmentSummary.live} idle=${result.assessmentSummary.idle} `
        + `dead=${result.assessmentSummary.dead} suspended=${result.assessmentSummary.suspended}`,
      );
      for (const r of result.reaped) {
        console.log(`  ${r.status} pid=${r.pid} killed=${r.killed} removed=${r.removedFromRegistry}`);
      }
    }
    process.exit(0);
  }
  if (plan || task) {
    const p = planRun({ taskText: task || 'general coding task' });
    if (json) process.stdout.write(`${JSON.stringify(p, null, 2)}\n`);
    else {
      console.log(
        `plan role=${p.roles.primary} autonomy=${p.autonomy.mode} `
        + `fleet_live=${p.fleet.live} proceed=${p.proceed}`,
      );
      if (p.autonomy.mode === 'dry_run' || process.env.HERMES_YOLO_DRY_RUN === '1') {
        console.log(renderDryRunMarkdown(p));
      }
    }
    process.exit(p.proceed || p.autonomy.mode === 'ask' ? 0 : 3);
  }
  // default / --status
  const assessment = assessFleet();
  if (json) process.stdout.write(`${JSON.stringify(assessment, null, 2)}\n`);
  else {
    console.log(
      `fleet total=${assessment.total} live=${assessment.live} idle=${assessment.idle} `
      + `dead=${assessment.dead} suspended=${assessment.suspended}`,
    );
    for (const r of assessment.runs) {
      console.log(
        `  ${r.status}\tpid=${r.pid}\trole=${r.role || '?'}\tage_ms=${r.heartbeatAgeMs ?? '?'}\trun=${r.runId}`,
      );
    }
  }
  process.exit(0);
}

module.exports = {
  ROLE_CATALOG,
  RISK_CATEGORIES,
  DEFAULT_FLEET_DIR,
  fleetPaths,
  ensureFleetDir,
  readRegistry,
  writeRegistry,
  isPidAlive,
  taskDigest,
  resolveRoles,
  classifyRisks,
  resolveAutonomy,
  buildDecisionTrace,
  writeDecisionTrace,
  registerRun,
  heartbeatRun,
  unregisterRun,
  assessFleet,
  reapFleet,
  planRun,
  renderDryRunMarkdown,
};
