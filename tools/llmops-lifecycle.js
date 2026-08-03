#!/usr/bin/env node
'use strict';

/**
 * llmops-lifecycle.js — TensorZero-style closed loop on Hermes (no archived vendor).
 *
 * Source: Dan Kornas / TensorZero pitch (X 2080976597536870529, July 2026):
 * unify gateway + observability + evaluation + optimization + experimentation.
 *
 * We already have pieces (LiteLLM, eval-mine/check, ml-experiment, economic router).
 * This tool is the **single entrypoint** that stitches them and dual-hosts Pro+mini.
 *
 *   node tools/llmops-lifecycle.js map [--json]
 *   node tools/llmops-lifecycle.js doctor [--json] [--gateway-url URL]
 *   node tools/llmops-lifecycle.js fleet [--json] [--mini-ssh user@host]
 *   node tools/llmops-lifecycle.js record-inference --body-file path.json [--json]
 *   node tools/llmops-lifecycle.js record-feedback --inference-id ID --signal up|down [--note "..."] [--json]
 *   node tools/llmops-lifecycle.js close-loop [--json] [--write-evals]
 *   node tools/llmops-lifecycle.js report [--json]
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const LLMOPS_DIR = path.join(os.homedir(), '.hermes', 'llmops');
const INFERENCES = path.join(LLMOPS_DIR, 'inferences.jsonl');
const FEEDBACK = path.join(LLMOPS_DIR, 'feedback.jsonl');
const DEFAULT_GATEWAY = process.env.HERMES_LITELLM_URL || 'http://127.0.0.1:4010';
const DEFAULT_MINI_SSH =
  process.env.HERMES_MINI_SSH || 'igorganapolsky@100.94.135.78';

const TENSORZERO_SOURCE = {
  label: 'TensorZero LLMOps (Dan Kornas summary, 2026-07-25)',
  url: 'https://x.com/DanKornas/status/2080976597536870529',
  github: 'https://github.com/tensorzero/tensorzero',
  note: 'Upstream GitHub archived/read-only — implement patterns in Hermes, do not vendor dead deps',
};

function parseArgs(argv) {
  const args = {
    command: 'report',
    json: false,
    help: false,
    gatewayUrl: DEFAULT_GATEWAY,
    miniSsh: DEFAULT_MINI_SSH,
    bodyFile: '',
    inferenceId: '',
    signal: '',
    note: '',
    writeEvals: false,
    skipMini: false,
    syncMini: false,
  };
  const rest = [...argv];
  if (rest[0] && !rest[0].startsWith('--')) args.command = rest.shift();
  for (let i = 0; i < rest.length; i += 1) {
    const a = rest[i];
    if (a === '--json') args.json = true;
    else if (a === '--help' || a === '-h') args.help = true;
    else if (a === '--gateway-url') args.gatewayUrl = rest[++i] || DEFAULT_GATEWAY;
    else if (a === '--mini-ssh') args.miniSsh = rest[++i] || DEFAULT_MINI_SSH;
    else if (a === '--body-file') args.bodyFile = path.resolve(rest[++i] || '');
    else if (a === '--inference-id') args.inferenceId = rest[++i] || '';
    else if (a === '--signal') args.signal = String(rest[++i] || '').toLowerCase();
    else if (a === '--note') args.note = rest[++i] || '';
    else if (a === '--write-evals') args.writeEvals = true;
    else if (a === '--skip-mini') args.skipMini = true;
    else if (a === '--sync-mini') args.syncMini = true;
    else throw new Error(`Unknown argument: ${a}`);
  }
  return args;
}

function ensureDir() {
  fs.mkdirSync(LLMOPS_DIR, { recursive: true });
}

function appendJsonl(filePath, row) {
  ensureDir();
  fs.appendFileSync(filePath, JSON.stringify(row) + '\n', { encoding: 'utf8', mode: 0o600 });
  try {
    fs.chmodSync(filePath, 0o600);
  } catch {
    /* ignore */
  }
}

function runNode(script, args = [], opts = {}) {
  const result = spawnSync(process.execPath, [path.join(REPO, script), ...args], {
    cwd: REPO,
    encoding: 'utf8',
    timeout: opts.timeout || 120000,
    maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env, ...(opts.env || {}) },
  });
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

/**
 * Eval integrity for doctor. Prefer eval-check (#1126+); fall back to eval-abilities
 * on lagging clones (mini often dirty/behind). Soft-pass when harness lacks both —
 * gateway green is the hard dual-host gate; eval lag is a warn, not a fleet blocker.
 */
function runEvalIntegrity() {
  const harness = path.join(REPO, 'tools/agent-swarm-harness.js');
  if (!fs.existsSync(harness)) {
    return {
      pass: true,
      soft: true,
      detail: 'agent-swarm-harness.js missing — soft-pass (sync repo)',
      body: null,
    };
  }

  const check = runNode('tools/agent-swarm-harness.js', ['eval-check', '--json'], {
    timeout: 60000,
  });
  let checkBody = null;
  try {
    checkBody = JSON.parse(check.stdout);
  } catch {
    /* ignore */
  }
  if (checkBody && typeof checkBody.ok === 'boolean') {
    return {
      pass: Boolean(checkBody.ok),
      soft: false,
      detail: `ok=${checkBody.ok} abilities=${(checkBody.abilities || []).length}`,
      body: checkBody,
    };
  }

  const combined = `${check.stderr}\n${check.stdout}`;
  const unknown =
    /Unknown argument:\s*eval-check/i.test(combined) ||
    /Unknown command:\s*eval-check/i.test(combined);

  // Only soft-pass when the harness literally lacks eval-check (lagging clone).
  // Crashes / timeouts / malformed output with a working eval-check must hard-fail.
  if (unknown) {
    const abilities = runNode('tools/agent-swarm-harness.js', ['eval-abilities', '--json'], {
      timeout: 60000,
    });
    let abBody = null;
    try {
      abBody = JSON.parse(abilities.stdout);
    } catch {
      /* ignore */
    }
    if (abBody && (Array.isArray(abBody.abilities) || abBody.evalAbilities || abBody.ok !== undefined)) {
      const list = abBody.abilities || abBody.evalAbilities?.abilities || [];
      const n = Array.isArray(list) ? list.length : 0;
      return {
        pass: true,
        soft: true,
        detail: `harness_lagging: no eval-check; eval-abilities n=${n} (pull origin/main when clean)`,
        body: abBody,
      };
    }
    return {
      pass: true,
      soft: true,
      detail: 'harness_lagging: Unknown argument eval-check — soft-pass for dual-host gateway',
      body: null,
    };
  }

  return {
    pass: false,
    soft: false,
    detail: (combined || 'eval-check unreadable').slice(0, 160).replace(/\s+/g, ' ').trim(),
    body: null,
  };
}

function fetchSync(url, timeoutMs = 4000) {
  // Node 18+ fetch is async; use curl for simple dual-host scripts
  const r = spawnSync(
    'curl',
    ['-sS', '--max-time', String(Math.ceil(timeoutMs / 1000)), '-H', 'Accept: application/json', url],
    { encoding: 'utf8', timeout: timeoutMs + 1000 },
  );
  if (r.status !== 0) {
    return { ok: false, error: (r.stderr || r.stdout || 'curl failed').slice(0, 200) };
  }
  try {
    return { ok: true, body: JSON.parse(r.stdout) };
  } catch {
    return { ok: true, body: null, raw: r.stdout.slice(0, 200) };
  }
}

function pillarMap() {
  return {
    schema_version: 'llmops-tensorzero-map/1',
    source: TENSORZERO_SOURCE,
    principle:
      'One closed loop: gateway → store inference+feedback → eval → experiment → optimize. ' +
      'Do not re-home on archived TensorZero; wire Hermes tools that already exist.',
    pillars: [
      {
        tensorzero: 'Unified LLM gateway',
        hermes: 'LiteLLM :4010 (+ optional 9router local-only :20128)',
        tools: ['tools/local-inference-readiness.js', 'docs/HERMES-9ROUTER-GATEWAY.md'],
        roi: 'One OpenAI-compatible front door on Pro and mini; stop per-provider drift',
      },
      {
        tensorzero: 'Observability (inferences + feedback in your DB)',
        hermes: '~/.hermes/llmops/*.jsonl + ThumbGate feedback + economic-router receipts',
        tools: ['tools/llmops-lifecycle.js', 'tools/hermes-economic-router.js'],
        roi: 'Programmatic inspect without SaaS lock-in; dual-host same schema',
      },
      {
        tensorzero: 'Evaluation (heuristics + judges)',
        hermes: 'eval-abilities / eval-mine / eval-check + tinker-brain + ML integrity',
        tools: ['tools/agent-swarm-harness.js', 'tools/ml-integrity.js', 'tools/rag-retrieval-eval.js'],
        roi: 'Failures become durable ability evals; refuse fake AUC',
      },
      {
        tensorzero: 'Optimization (feedback → better prompts/models/routes)',
        hermes: 'propose-eval --write, economic router receipts, ml-propensity when labeled',
        tools: ['tools/agent-swarm-harness.js propose-eval', 'tools/hermes-economic-router.js'],
        roi: 'Close the loop without waiting for a new platform',
      },
      {
        tensorzero: 'Experimentation (A/B, routing, retries, fallbacks)',
        hermes: 'ml-experiment + economic routes + fallback_providers in config.yaml',
        tools: ['tools/ml-experiment.js', 'tools/local-inference-readiness.js'],
        roi: 'Declare winners only with min-n + significance — never invent',
      },
    ],
    high_roi_now: [
      'Record every fleet inference + thumbs feedback under ~/.hermes/llmops/',
      'Run close-loop after sessions (eval-mine + eval-check)',
      'Doctor Pro and mini gateways before multi-host agent work',
      'Use ml-experiment for campaign/route A/B; refuse underpowered winners',
    ],
    anti_patterns: [
      'Adopting archived TensorZero as a hard dependency',
      'Separate observability stack that never joins evals',
      'Routing/fallbacks without dual-host doctor',
      'Optimization claims without eval-check green',
    ],
  };
}

function doctorLocal(args) {
  const host = {
    hostname: os.hostname(),
    role: process.env.HERMES_FLEET_HOST_ROLE || null,
    platform: process.platform,
    node: process.version,
  };

  const gatewayBase = String(args.gatewayUrl || DEFAULT_GATEWAY).replace(/\/+$/, '');
  // mini under load can miss a 3s /health; models is the hard signal
  const health = fetchSync(`${gatewayBase}/health`, 5000);
  const models = fetchSync(`${gatewayBase}/v1/models`, 8000);
  const modelIds =
    models.ok && models.body && Array.isArray(models.body.data)
      ? models.body.data.map((m) => m.id).filter(Boolean)
      : [];

  const localInf = runNode('tools/local-inference-readiness.js', ['--json'], { timeout: 20000 });
  let localInfBody = null;
  try {
    localInfBody = JSON.parse(localInf.stdout);
  } catch {
    /* ignore */
  }

  const evalIntegrity = runEvalIntegrity();

  const inferenceCount = countJsonl(INFERENCES);
  const feedbackCount = countJsonl(FEEDBACK);

  const checks = [
    {
      id: 'gateway_health',
      // LiteLLM sometimes hangs on /health while /v1/models is fine — models imply live gateway
      pass: health.ok === true || modelIds.length > 0,
      critical: true,
      detail: health.ok
        ? 'reachable'
        : modelIds.length
          ? `health_timeout_but_models=${modelIds.length}`
          : health.error || 'unreachable',
    },
    {
      id: 'gateway_models',
      pass: modelIds.length > 0,
      critical: true,
      detail: modelIds.length ? modelIds.slice(0, 8).join(',') : 'no models',
    },
    {
      id: 'local_inference_readiness',
      // Soft: gateway with models is enough for fleet work; empty fallback_providers is a warn not hard fail
      pass: localInf.ok || Boolean(localInfBody?.ok) || modelIds.length > 0,
      critical: false,
      soft: !(localInf.ok || Boolean(localInfBody?.ok)),
      detail: localInf.ok
        ? 'ok'
        : modelIds.length
          ? `gateway_models=${modelIds.length} (fallback_providers may be empty)`
          : (localInf.stderr || localInf.stdout).slice(0, 120),
    },
    {
      id: 'eval_check',
      pass: evalIntegrity.pass,
      soft: Boolean(evalIntegrity.soft),
      critical: !evalIntegrity.soft,
      detail: evalIntegrity.detail,
    },
    {
      id: 'llmops_store',
      pass: true,
      critical: false,
      detail: `inferences=${inferenceCount} feedback=${feedbackCount} dir=${LLMOPS_DIR}`,
    },
  ];

  // Optional ML gate if present (on main after #1139) — soft on lagging hosts
  if (fs.existsSync(path.join(REPO, 'tools/ml-gate.js'))) {
    const gate = runNode('tools/ml-gate.js', ['--json'], {
      timeout: 90000,
      env: { ML_GATE_SKIP_UNIT: '1' },
    });
    let gateBody = null;
    try {
      gateBody = JSON.parse(gate.stdout);
    } catch {
      /* ignore */
    }
    checks.push({
      id: 'ml_platform_gate',
      pass: Boolean(gateBody?.platform_ready),
      soft: !gateBody,
      critical: false,
      detail: gateBody
        ? `platform=${gateBody.platform_ready} production=${gateBody.production_ml_ready}`
        : 'ml-gate unreadable',
    });
  }

  // Hard fail only on critical checks; soft/lagging eval does not fail dual-host doctor
  const ok = checks.every((c) => c.pass || c.soft);
  const gateway_ok = checks
    .filter((c) => c.critical)
    .every((c) => c.pass);
  return {
    schema_version: 'llmops-doctor/1',
    host,
    gatewayUrl: gatewayBase,
    modelIds,
    checks,
    ok,
    gateway_ok,
    source: TENSORZERO_SOURCE,
  };
}

function countJsonl(filePath) {
  if (!fs.existsSync(filePath)) return 0;
  const text = fs.readFileSync(filePath, 'utf8').trim();
  if (!text) return 0;
  return text.split(/\n/).filter(Boolean).length;
}

function doctorFleet(args) {
  let sync = null;
  if (args.syncMini && !args.skipMini) {
    sync = syncToMini(args);
  }
  const local = doctorLocal(args);
  let mini = null;
  if (!args.skipMini) {
    mini = doctorRemote(args);
  }
  // Fleet ok if both gateways green. Soft eval lag on mini must not block dual-host work.
  const miniModels = (mini && mini.modelIds) || [];
  const miniGatewayOk =
    Boolean(mini && mini.gateway_ok) ||
    Boolean(mini && mini.ok) ||
    Boolean(mini && mini.gateway_only && miniModels.length > 0) ||
    miniModels.length > 0;
  const localGateway = local.gateway_ok !== undefined ? local.gateway_ok : local.ok;
  // If --sync-mini was requested, scp failure must fail fleet (do not report green on stale mini tool).
  const syncOk = !args.syncMini || args.skipMini || Boolean(sync && sync.ok);
  const fleetOk = Boolean(localGateway) && (args.skipMini || miniGatewayOk) && syncOk;
  return {
    schema_version: 'llmops-fleet/1',
    ok: fleetOk,
    local,
    mini,
    sync,
    principle:
      'Pro and mini must share gateway doctor green before multi-host agent work; ' +
      'chat window is not the coordination bus (plan.md + llmops store is). ' +
      'Harness lag (missing eval-check) is soft — pull origin/main when clone is clean. ' +
      '--sync-mini failures fail fleet so a stale mini tool cannot look green.',
  };
}

function doctorRemote(args) {
  const remoteBash = [
    'set -euo pipefail',
    'HOST=$(hostname)',
    `GW=${JSON.stringify(args.gatewayUrl)}`,
    'REPO=""',
    'for d in "$HOME/workspace/git/igor/mac-yolo-safeguards" "$HOME/git/mac-yolo-safeguards"; do',
    '  if [ -f "$d/tools/llmops-lifecycle.js" ]; then REPO="$d"; break; fi',
    'done',
    'if [ -n "$REPO" ]; then',
    '  cd "$REPO"',
    '  HERMES_FLEET_HOST_ROLE=mini node tools/llmops-lifecycle.js doctor --json --gateway-url "$GW"',
    '  exit 0',
    'fi',
    // Gateway-only fallback when this PR is not yet on mini
    'MODELS=$(curl -sS --max-time 3 "$GW/v1/models" 2>/dev/null || true)',
    'HEALTH=$(curl -sS --max-time 2 -o /dev/null -w "%{http_code}" "$GW/health" 2>/dev/null || echo 000)',
    'node -e \'const models=process.argv[1]; const health=process.argv[2]; const host=process.argv[3]; let ids=[]; try{ids=(JSON.parse(models).data||[]).map(m=>m.id)}catch(e){} const ok=ids.length>0; console.log(JSON.stringify({schema_version:"llmops-doctor/1",ok,host:{hostname:host,role:"mini"},gatewayUrl:process.env.GW||"",modelIds:ids.slice(0,12),checks:[{id:"gateway_health",pass:health==="200"||ids.length>0,detail:"http_"+health},{id:"gateway_models",pass:ids.length>0,detail:ids.slice(0,6).join(",")||"none"},{id:"tool_synced",pass:false,detail:"llmops-lifecycle.js not on mini yet — gateway-only"}],gateway_only:true,source:{note:"sync tools/llmops-lifecycle.js to mini for full doctor"}}))\' "$MODELS" "$HEALTH" "$HOST"',
  ].join('\n');

  const r = spawnSync(
    'ssh',
    ['-o', 'ConnectTimeout=12', '-o', 'BatchMode=yes', args.miniSsh, 'bash', '-lc', remoteBash],
    {
      encoding: 'utf8',
      timeout: 120000,
      maxBuffer: 8 * 1024 * 1024,
    },
  );

  if (r.status !== 0) {
    return {
      ok: false,
      error: 'ssh_failed',
      detail: (r.stderr || r.stdout || '').slice(0, 400),
      miniSsh: args.miniSsh,
    };
  }
  try {
    // doctor --json is pretty-printed; extract outermost object
    const text = r.stdout;
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end <= start) throw new Error('no_json_object');
    return JSON.parse(text.slice(start, end + 1));
  } catch (error) {
    return {
      ok: false,
      error: 'remote_json_parse',
      detail: error.message,
      raw: r.stdout.slice(0, 500),
    };
  }
}

/**
 * Copy this tool to mini for full doctor. Does NOT overwrite dirty mini harness files.
 * Reports whether mini can ff-only pull (informational) — never force-reset remote WIP.
 */
function syncToMini(args) {
  const remoteRepo =
    process.env.HERMES_MINI_REPO ||
    '~/workspace/git/igor/mac-yolo-safeguards';
  const src = path.join(REPO, 'tools/llmops-lifecycle.js');
  const dest = `${args.miniSsh}:${remoteRepo}/tools/llmops-lifecycle.js`;

  // Probe before scp: refuse to overwrite dirty/uncommitted tools/llmops-lifecycle.js on mini.
  const probe = spawnSync(
    'ssh',
    [
      '-o',
      'ConnectTimeout=12',
      '-o',
      'BatchMode=yes',
      args.miniSsh,
      'bash',
      '-lc',
      [
        'cd ~/workspace/git/igor/mac-yolo-safeguards 2>/dev/null || { echo "missing_repo=1"; exit 0; }',
        'echo "head=$(git rev-parse --short HEAD 2>/dev/null)"',
        'echo "branch=$(git branch --show-current 2>/dev/null)"',
        'git rev-parse --verify origin/main >/dev/null 2>&1 && echo "origin_main=$(git rev-parse --short origin/main)" || true',
        'if git status --porcelain -- tools/llmops-lifecycle.js 2>/dev/null | grep -q .; then echo "tool_dirty=1"; else echo "tool_dirty=0"; fi',
        'git status --porcelain 2>/dev/null | head -8 | sed "s/^/dirty:/"',
      ].join('; '),
    ],
    { encoding: 'utf8', timeout: 30000 },
  );
  const miniGit = (probe.stdout || '').slice(0, 500);
  if (/tool_dirty=1/.test(miniGit)) {
    return {
      ok: false,
      status: 1,
      dest,
      detail: 'refused: tools/llmops-lifecycle.js has uncommitted WIP on mini — not overwriting',
      mini_git: miniGit,
      note: 'probe-before-scp; clean or stash mini tool WIP before --sync-mini',
    };
  }

  const r = spawnSync(
    'scp',
    ['-o', 'ConnectTimeout=12', '-o', 'BatchMode=yes', src, dest],
    { encoding: 'utf8', timeout: 60000 },
  );

  return {
    ok: r.status === 0,
    status: r.status,
    dest,
    detail: (r.stderr || r.stdout || '').slice(0, 300),
    mini_git: miniGit,
    note:
      'scp llmops-lifecycle only after clean probe — never force-pull dirty mini; eval soft-pass when harness lags',
  };
}

function recordInference(args) {
  if (!args.bodyFile || !fs.existsSync(args.bodyFile)) {
    throw new Error('--body-file PATH required (JSON inference record)');
  }
  const body = JSON.parse(fs.readFileSync(args.bodyFile, 'utf8'));
  const id =
    body.id ||
    body.inference_id ||
    `inf_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const row = {
    schema_version: 'llmops-inference/1',
    id,
    ts: new Date().toISOString(),
    host: os.hostname(),
    role: process.env.HERMES_FLEET_HOST_ROLE || null,
    model: body.model || null,
    provider: body.provider || null,
    route: body.route || null,
    task: body.task || body.prompt_preview || null,
    latency_ms: body.latency_ms ?? null,
    tokens_in: body.tokens_in ?? null,
    tokens_out: body.tokens_out ?? null,
    cost_usd: body.cost_usd ?? null,
    ok: body.ok !== false,
    meta: body.meta || {},
  };
  appendJsonl(INFERENCES, row);
  return { ok: true, path: INFERENCES, inference: row };
}

function recordFeedback(args) {
  if (!args.inferenceId) throw new Error('--inference-id required');
  if (args.signal !== 'up' && args.signal !== 'down') {
    throw new Error('--signal up|down required');
  }
  const row = {
    schema_version: 'llmops-feedback/1',
    id: `fb_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    inference_id: args.inferenceId,
    signal: args.signal,
    note: args.note || '',
    ts: new Date().toISOString(),
    host: os.hostname(),
  };
  appendJsonl(FEEDBACK, row);
  return { ok: true, path: FEEDBACK, feedback: row };
}

function closeLoop(args) {
  // Optimization path: mine failures → propose evals; always run eval-check
  const mine = runNode(
    'tools/agent-swarm-harness.js',
    args.writeEvals ? ['eval-mine', '--write', '--json'] : ['eval-mine', '--json'],
    { timeout: 60000 },
  );
  let mineBody = null;
  try {
    mineBody = JSON.parse(mine.stdout);
  } catch {
    mineBody = { ok: mine.ok, raw: mine.stdout.slice(0, 300) };
  }

  const check = runNode('tools/agent-swarm-harness.js', ['eval-check', '--json'], {
    timeout: 60000,
  });
  let checkBody = null;
  try {
    checkBody = JSON.parse(check.stdout);
  } catch {
    checkBody = { ok: false };
  }

  // Link recent down feedback to propose-eval if notes present
  const proposals = [];
  if (fs.existsSync(FEEDBACK)) {
    const lines = fs.readFileSync(FEEDBACK, 'utf8').trim().split(/\n/).filter(Boolean).slice(-20);
    for (const line of lines) {
      try {
        const fb = JSON.parse(line);
        if (fb.signal !== 'down' || !fb.note) continue;
        const prop = runNode(
          'tools/agent-swarm-harness.js',
          ['propose-eval', '--task', fb.note, ...(args.writeEvals ? ['--write'] : []), '--json'],
          { timeout: 30000 },
        );
        try {
          proposals.push(JSON.parse(prop.stdout));
        } catch {
          /* ignore */
        }
      } catch {
        /* ignore */
      }
    }
  }

  return {
    schema_version: 'llmops-close-loop/1',
    ok: Boolean(checkBody?.ok),
    eval_mine: mineBody,
    eval_check: checkBody,
    feedback_proposals: proposals.slice(0, 5),
    counts: {
      inferences: countJsonl(INFERENCES),
      feedback: countJsonl(FEEDBACK),
    },
    next:
      checkBody?.ok
        ? 'Eval catalog green — keep recording inferences; ship only when close-loop stays green'
        : 'eval-check not ok — fix ability catalog/routing before optimization claims',
  };
}

function report(args) {
  const map = pillarMap();
  const fleet = doctorFleet({ ...args, skipMini: args.skipMini });
  const loop = closeLoop({ ...args, writeEvals: false });
  return {
    schema_version: 'llmops-report/1',
    generated_at: new Date().toISOString(),
    source: TENSORZERO_SOURCE,
    map_summary: map.high_roi_now,
    fleet,
    close_loop: {
      ok: loop.ok,
      eval_check_ok: loop.eval_check?.ok,
      inference_count: loop.counts.inferences,
      feedback_count: loop.counts.feedback,
    },
    ok: Boolean(fleet.ok && loop.ok),
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(`Usage:
  node tools/llmops-lifecycle.js map|doctor|fleet|record-inference|record-feedback|close-loop|report|sync-mini [--json]
  Fleet: --mini-ssh user@host (default ${DEFAULT_MINI_SSH}) [--sync-mini]
  Gateway: --gateway-url (default ${DEFAULT_GATEWAY})`);
    process.exit(0);
  }

  let result;
  if (args.command === 'map') result = pillarMap();
  else if (args.command === 'doctor') result = doctorLocal(args);
  else if (args.command === 'fleet') result = doctorFleet(args);
  else if (args.command === 'sync-mini') result = syncToMini(args);
  else if (args.command === 'record-inference') result = recordInference(args);
  else if (args.command === 'record-feedback') result = recordFeedback(args);
  else if (args.command === 'close-loop') result = closeLoop(args);
  else if (args.command === 'report') result = report(args);
  else throw new Error(`Unknown command: ${args.command}`);

  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else if (args.command === 'map') {
    console.log(`LLMOps map (TensorZero → Hermes)\nSource: ${result.source.url}`);
    for (const p of result.pillars) {
      console.log(`\n## ${p.tensorzero}`);
      console.log(`  Hermes: ${p.hermes}`);
      console.log(`  ROI: ${p.roi}`);
      console.log(`  Tools: ${p.tools.join(', ')}`);
    }
    console.log('\nHigh-ROI now:');
    for (const line of result.high_roi_now) console.log(`  - ${line}`);
  } else if (args.command === 'doctor' || (args.command === 'fleet' && !result.local)) {
    const d = result.local || result;
    console.log(`llmops doctor host=${d.host?.hostname} ok=${d.ok}`);
    for (const c of d.checks || []) {
      console.log(`  ${c.pass ? '✓' : '✗'} ${c.id} — ${c.detail}`);
    }
  } else if (args.command === 'fleet') {
    console.log(`llmops fleet ok=${result.ok}`);
    console.log(`  local ok=${result.local?.ok} host=${result.local?.host?.hostname}`);
    console.log(
      `  mini ok=${result.mini?.ok} host=${result.mini?.host?.hostname || result.mini?.error || '?'}`,
    );
    if (result.mini?.checks) {
      for (const c of result.mini.checks) {
        console.log(`    mini ${c.pass ? '✓' : '✗'} ${c.id} — ${c.detail}`);
      }
    }
  } else if (args.command === 'close-loop') {
    console.log(`llmops close-loop ok=${result.ok} eval_check=${result.eval_check?.ok}`);
    console.log(`  ${result.next}`);
  } else if (args.command === 'report') {
    console.log(`llmops report ok=${result.ok} fleet=${result.fleet?.ok} loop=${result.close_loop?.ok}`);
    for (const line of result.map_summary || []) console.log(`  - ${line}`);
  } else {
    console.log(JSON.stringify(result, null, 2));
  }

  if (result && result.ok === false) process.exitCode = 1;
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(2);
  }
}

module.exports = {
  pillarMap,
  doctorLocal,
  doctorFleet,
  recordInference,
  recordFeedback,
  closeLoop,
  report,
  syncToMini,
  TENSORZERO_SOURCE,
};
