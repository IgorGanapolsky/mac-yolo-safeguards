#!/usr/bin/env node
'use strict';

/**
 * Architecture-first route policy for hermes-yolo (Andrew Ng: harness > model).
 *
 * Picks among *flat-rate / local* LiteLLM aliases only — never auto-routes to
 * per-token Moonshot kimi-k3 or OpenRouter burn paths. Those stay explicit opt-in.
 *
 * OpenRouter July 2026 steals (local only — see hermes-yolo-auto-router.js):
 *   - task-type classify + cost_quality_tradeoff
 *   - turn budget on the route receipt (harness > brand model)
 *   - spend tags (agent / task_type) for spike attribution
 *
 * Usage:
 *   node tools/hermes-yolo-route-policy.js --task "fix the auth bug" [--json]
 *   node tools/hermes-yolo-route-policy.js --task "smoke" --probe
 *   node tools/hermes-yolo-route-policy.js --task "..." --tradeoff cheap [--json]
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');
const { classifyTask } = require('./inference-eng/task-registry');
const {
  POLICY_VERSION,
  selectModelChain,
  inferMode,
  isStaleGlmPin,
  wantsSuperGrok,
  taskWantsSuperGrok,
  shouldDropDeadGlm,
} = require('./inference-eng/degradation');
const {
  autoRoute,
  isForbiddenModel,
  resolveTradeoff,
} = require('./hermes-yolo-auto-router');

const LITELLM_BASE = process.env.HERMES_LITELLM_BASE || 'http://127.0.0.1:4010/v1';
const PROVIDER = 'custom:litellm-gateway';

/** Flat-rate / free-safe model aliases registered on the local LiteLLM gateway. */
const ROUTES = Object.freeze({
  coding: {
    // 2026-08-05: SuperGrok is coding default; glm kept as opt-in alias (dead for tool use).
    id: 'coding_primary',
    model: 'grok-4.5',
    provider: 'grok-yolo',
    label: 'SuperGrok / grok-4.5 — default interactive coding',
    tier: 'subscription',
  },
  glm: {
    id: 'coding_glm',
    model: 'glm-coding',
    provider: PROVIDER,
    label: 'GLM Coding Plan (z.ai) — opt-in only (HERMES_ALLOW_GLM=1)',
    tier: 'subscription',
  },
  grok: {
    id: 'coding_grok',
    model: 'grok-4.5',
    provider: 'grok-yolo',
    label: 'SuperGrok / grok-4.5 — interactive coding (plan quota)',
    tier: 'subscription',
  },
  free_flash: {
    id: 'free_deepseek',
    model: 'deepseek-v4-flash',
    provider: PROVIDER,
    label: 'DeepSeek V4 Flash — free/promotional agent-capable',
    tier: 'free',
  },
  fast: {
    id: 'fast_kimi',
    model: 'kimi-code-fast',
    provider: PROVIDER,
    label: 'Kimi Code high-speed (Allegretto flat) — smoke/latency',
    tier: 'subscription',
  },
  quality_kimi: {
    id: 'quality_kimi',
    model: 'kimi-code',
    provider: PROVIDER,
    label: 'Kimi Code (Allegretto flat) — solid coding alt',
    tier: 'subscription',
  },
  long_context: {
    id: 'long_kimi_k3',
    model: 'kimi-code-k3',
    provider: PROVIDER,
    label: 'Kimi K3 via membership (1M flat) — long-context agentic',
    tier: 'subscription',
  },
  local: {
    id: 'local_fast',
    model: 'hermes-local',
    provider: PROVIDER,
    label: 'Local Ollama via gateway — offline / zero spend',
    tier: 'local',
  },
});

function taskSignals(task) {
  const text = String(task || '').toLowerCase();
  return {
    smoke: /\bsmoke\b|\bping\b|hermes-yolo-ready|reply with exactly|quick check|\bhi\b$|^ok$/.test(text),
    asksGlm: /\bglm\b|z\.?ai|glm-coding|glm[- ]?5/.test(text),
    asksKimi: /\bkimi\b|moonshot|allegretto/.test(text),
    asksK3: /\bk3\b|kimi[- ]?k3|1m\s*ctx|million.?token/.test(text),
    asksLocal: /\blocal\b|ollama|offline|no.?spend|zero.?cost/.test(text),
    longContext: /long[- ]?context|large[- ]?repo|whole[- ]?repo|full.?codebase|multi[- ]?file|entire.?project/.test(text),
    hard: /are you sure|architecture|root cause|cross[- ]file|refactor|design|debug|why (is|does)|broken|regression/.test(text),
    routine: /lint|format|rename|typo|small fix|unit test only/.test(text),
  };
}

/**
 * Attach OpenRouter-style auto-router metadata (task type, turn budget, spend tags).
 * When tradeoff is explicitly cheap/quality (env or opts), may re-rank model
 * from the local flat pool — never openrouter/auto.
 */
function enrichWithAutoRouter(route, opts = {}) {
  const env = opts.env || process.env;
  const task = opts.task || '';
  const agent = opts.agent || env.HERMES_AGENT_ID || env.HERMES_AGENT || 'hermes-yolo';
  const auto = autoRoute({
    task,
    tradeoff: opts.tradeoff,
    agent,
    env,
    turnBudget: opts.turnBudget,
  });

  const explicitTradeoff =
    opts.tradeoff ||
    env.HERMES_COST_QUALITY ||
    env.HERMES_COST_QUALITY_TRADEOFF ||
    '';
  const tradeoff = resolveTradeoff(opts.tradeoff, { defaultTradeoff: auto.costQualityTradeoff }, env);

  let next = {
    ...route,
    taskType: auto.taskType,
    costQualityTradeoff: tradeoff,
    turnBudget: auto.turnBudget,
    spendTags: auto.spendTags,
    autoRouter: {
      ok: auto.ok,
      chain: auto.chain,
      ranked: auto.ranked,
      reason: auto.reason,
      source: auto.source,
    },
  };

  // Refuse forbidden models if something leaked them
  if (isForbiddenModel(next.model)) {
    next = {
      ...next,
      ...ROUTES.local,
      reason: `refused forbidden model ${route.model}; forced local (never openrouter/auto)`,
      model: ROUTES.local.model,
      provider: ROUTES.local.provider,
      id: 'forbidden_model_block',
    };
  }

  // Explicit tradeoff pin: lean auto-router primary for cheap/quality (not balanced default)
  // Skip when operator forced model, explicit env pin id, or long-context membership path.
  const skipRerank =
    next.id === 'explicit_env' ||
    next.id === 'forbidden_model_block' ||
    signalsLongContext(route) ||
    !explicitTradeoff ||
    tradeoff === 'balanced';

  if (!skipRerank && auto.ok && auto.model && auto.model !== next.model) {
    const fromRegistry = Object.values(ROUTES).find((r) => r.model === auto.model);
    next = {
      ...next,
      ...(fromRegistry || {
        id: `auto_${auto.taskType}`,
        model: auto.model,
        provider: /^grok/i.test(auto.model) ? 'grok-yolo' : PROVIDER,
        label: `Auto-router ${tradeoff} → ${auto.model}`,
        tier: 'mixed',
      }),
      reason: `${route.reason} | auto-router tradeoff=${tradeoff} → ${auto.model}`,
      taskType: auto.taskType,
      costQualityTradeoff: tradeoff,
      turnBudget: auto.turnBudget,
      spendTags: auto.spendTags,
      autoRouter: next.autoRouter,
      signals: route.signals,
      inferenceTask: route.inferenceTask,
      mode: route.mode,
      chain: auto.chain,
      latencyBudgetMs: route.latencyBudgetMs,
      businessKpi: route.businessKpi,
      policyVersion: route.policyVersion,
    };
  }

  return next;
}

function signalsLongContext(route) {
  return Boolean(route.signals?.longContext || route.signals?.asksK3 || route.model === 'kimi-code-k3');
}

/**
 * Select a route. Explicit env always wins (operator control).
 * @param {{ task?: string, env?: NodeJS.ProcessEnv, tradeoff?: string, agent?: string, turnBudget?: number }} opts
 */
function selectRoute(opts = {}) {
  const env = opts.env || process.env;
  const task = opts.task || '';
  const signals = taskSignals(task);
  const inferenceTask = classifyTask(task);
  const mode = opts.mode || inferMode({
    env,
    recentFailRate: opts.recentFailRate,
    swapUsedPct: opts.swapUsedPct,
  });
  const chainPlan = selectModelChain({
    taskText: task,
    mode,
    env,
    probeFailures: opts.probeFailures,
  });

  /** @type {object} */
  let route;

  // Explicit operator pin — but ignore stale glm when SuperGrok preferred (unless FORCE/ALLOW_GLM).
  if (env.HERMES_YOLO_MODEL || env.HERMES_YOLO_PROVIDER) {
    const pin = env.HERMES_YOLO_MODEL || ROUTES.coding.model;
    const force = env.HERMES_YOLO_FORCE_MODEL === '1';
    const preferGrok =
      wantsSuperGrok(env) &&
      taskWantsSuperGrok(inferenceTask) &&
      mode !== 'emergency';
    const ignoreStaleGlm =
      preferGrok &&
      isStaleGlmPin(pin) &&
      !force &&
      env.HERMES_ALLOW_GLM !== '1' &&
      shouldDropDeadGlm(env);
    if (!ignoreStaleGlm) {
      const provider =
        env.HERMES_YOLO_PROVIDER ||
        (/^grok/i.test(pin) ? 'grok-yolo' : PROVIDER);
      route = {
        ...ROUTES.coding,
        model: pin,
        provider,
        id: 'explicit_env',
        label: 'Explicit HERMES_YOLO_* pin',
        reason: 'HERMES_YOLO_MODEL or HERMES_YOLO_PROVIDER set — policy defers to operator',
        signals,
        inferenceTask: inferenceTask.id,
        mode,
        chain: chainPlan.chain,
        latencyBudgetMs: inferenceTask.latencyBudgetMs,
        businessKpi: inferenceTask.businessKpi,
        policyVersion: POLICY_VERSION,
      };
      return enrichWithAutoRouter(route, opts);
    }
    // fall through to SuperGrok chain (stale glm pin ignored)
  }

  // Explicit "use glm" in task text (operator intent)
  if (signals.asksGlm && (env.HERMES_ALLOW_GLM === '1' || env.HERMES_YOLO_FORCE_MODEL === '1')) {
    route = {
      ...ROUTES.glm,
      reason: 'task asked for GLM + ALLOW/FORCE',
      signals,
      inferenceTask: inferenceTask.id,
      mode,
      chain: chainPlan.chain,
      latencyBudgetMs: inferenceTask.latencyBudgetMs,
      businessKpi: inferenceTask.businessKpi,
      policyVersion: POLICY_VERSION,
    };
    return enrichWithAutoRouter(route, opts);
  }

  // Long-context membership K3 before SuperGrok default (1M flat, not per-token)
  if (signals.longContext || signals.asksK3) {
    route = {
      ...ROUTES.long_context,
      reason: 'long-context / k3 signal → kimi-code-k3 membership',
      signals,
      inferenceTask: inferenceTask.id,
      mode,
      chain: chainPlan.chain,
      latencyBudgetMs: inferenceTask.latencyBudgetMs,
      businessKpi: inferenceTask.businessKpi,
      policyVersion: POLICY_VERSION,
    };
    return enrichWithAutoRouter(route, opts);
  }

  if (signals.asksKimi && !signals.asksK3) {
    route = {
      ...ROUTES.quality_kimi,
      reason: 'task asked for kimi',
      signals,
      inferenceTask: inferenceTask.id,
      mode,
      chain: chainPlan.chain,
      latencyBudgetMs: inferenceTask.latencyBudgetMs,
      businessKpi: inferenceTask.businessKpi,
      policyVersion: POLICY_VERSION,
    };
    return enrichWithAutoRouter(route, opts);
  }

  if (signals.smoke) {
    route = {
      ...ROUTES.fast,
      reason: 'smoke/latency path — not SuperGrok',
      signals,
      inferenceTask: inferenceTask.id,
      mode,
      chain: chainPlan.chain,
      latencyBudgetMs: inferenceTask.latencyBudgetMs,
      businessKpi: inferenceTask.businessKpi,
      policyVersion: POLICY_VERSION,
    };
    return enrichWithAutoRouter(route, opts);
  }

  const primary = chainPlan.primary;
  const fromRegistry = Object.values(ROUTES).find((r) => r.model === primary);
  if (fromRegistry) {
    route = {
      ...fromRegistry,
      reason: `${chainPlan.reason}; inferenceTask=${inferenceTask.id}`,
      signals,
      inferenceTask: inferenceTask.id,
      mode,
      chain: chainPlan.chain,
      latencyBudgetMs: inferenceTask.latencyBudgetMs,
      businessKpi: inferenceTask.businessKpi,
      policyVersion: POLICY_VERSION,
    };
    return enrichWithAutoRouter(route, opts);
  }

  if (primary === 'grok-4.5' || /^grok/.test(primary)) {
    route = {
      ...ROUTES.grok,
      model: primary,
      reason: `${chainPlan.reason}; SuperGrok preferred for task=${inferenceTask.id}`,
      signals,
      inferenceTask: inferenceTask.id,
      mode,
      chain: chainPlan.chain,
      latencyBudgetMs: inferenceTask.latencyBudgetMs,
      businessKpi: inferenceTask.businessKpi,
      policyVersion: POLICY_VERSION,
    };
    return enrichWithAutoRouter(route, opts);
  }

  if (signals.asksLocal) {
    route = {
      ...ROUTES.local,
      reason: 'task asked for local/offline',
      signals,
      inferenceTask: inferenceTask.id,
      mode,
      chain: chainPlan.chain,
      latencyBudgetMs: inferenceTask.latencyBudgetMs,
      businessKpi: inferenceTask.businessKpi,
      policyVersion: POLICY_VERSION,
    };
    return enrichWithAutoRouter(route, opts);
  }

  route = {
    id: `task_${inferenceTask.id}`,
    model: primary,
    provider: PROVIDER,
    label: `Inference task ${inferenceTask.id} → ${primary}`,
    tier: 'mixed',
    reason: chainPlan.reason,
    signals,
    inferenceTask: inferenceTask.id,
    mode,
    chain: chainPlan.chain,
    latencyBudgetMs: inferenceTask.latencyBudgetMs,
    businessKpi: inferenceTask.businessKpi,
    policyVersion: POLICY_VERSION,
  };
  return enrichWithAutoRouter(route, opts);
}

function probeModel(model, base = LITELLM_BASE, timeoutMs = 8000) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    try {
      const url = new URL(`${base.replace(/\/$/, '')}/chat/completions`);
      const body = JSON.stringify({
        model,
        messages: [{ role: 'user', content: `Reply with exactly OK-${model}` }],
        max_tokens: 12,
      });
      const lib = url.protocol === 'https:' ? https : http;
      const req = lib.request(
        {
          hostname: url.hostname,
          port: url.port || (url.protocol === 'https:' ? 443 : 80),
          path: url.pathname,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${process.env.HERMES_LITELLM_KEY || 'sk-local'}`,
            'Content-Length': Buffer.byteLength(body),
          },
          timeout: timeoutMs,
        },
        (res) => {
          const chunks = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => {
            const text = Buffer.concat(chunks).toString('utf8');
            finish({
              model,
              ok: res.statusCode >= 200 && res.statusCode < 300,
              status: res.statusCode,
              snippet: text.slice(0, 120),
            });
          });
        },
      );
      req.on('error', (err) => finish({ model, ok: false, status: 0, error: err.message }));
      req.on('timeout', () => {
        req.destroy();
        finish({ model, ok: false, status: 0, error: 'timeout' });
      });
      req.write(body);
      req.end();
    } catch (err) {
      finish({ model, ok: false, status: 0, error: err.message });
    }
  });
}

/**
 * If primary probe fails, try subscription fallbacks in order (never per-token).
 */
async function selectRouteWithProbe(opts = {}) {
  const primary = selectRoute(opts);
  if (opts.probe === false || process.env.HERMES_YOLO_PROBE === '0') {
    return { ...primary, probe: null, fallbackUsed: false };
  }
  const probePrimary = await probeModel(primary.model);
  if (probePrimary.ok) {
    return { ...primary, probe: probePrimary, fallbackUsed: false };
  }
  const chain = [ROUTES.quality_kimi, ROUTES.fast, ROUTES.free_flash, ROUTES.local, ROUTES.grok]
    .filter((r) => r.model !== primary.model);
  for (const candidate of chain) {
    const p = await probeModel(candidate.model);
    if (p.ok) {
      return enrichWithAutoRouter(
        {
          ...candidate,
          reason: `${primary.model} probe failed (${probePrimary.status || probePrimary.error}); fell back to ${candidate.model}`,
          signals: primary.signals,
          inferenceTask: primary.inferenceTask,
          mode: primary.mode,
          policyVersion: POLICY_VERSION,
          probe: p,
          primaryFailed: probePrimary,
          fallbackUsed: true,
        },
        opts,
      );
    }
  }
  return {
    ...primary,
    reason: `${primary.reason} (probe failed; no healthy fallback — launching primary anyway)`,
    probe: probePrimary,
    fallbackUsed: false,
    degraded: true,
  };
}

function commandEnv(route) {
  const env = {
    HERMES_YOLO_PROVIDER: route.provider,
    HERMES_YOLO_MODEL: route.model,
    HERMES_ROUTE_ID: route.id,
    HERMES_ROUTE_REASON: route.reason || '',
  };
  if (route.taskType) env.HERMES_TASK_TYPE = route.taskType;
  if (route.costQualityTradeoff) env.HERMES_COST_QUALITY = route.costQualityTradeoff;
  if (route.turnBudget && route.turnBudget.turns != null) {
    env.HERMES_TURN_BUDGET = String(route.turnBudget.turns);
  }
  if (route.spendTags && route.spendTags.agent) {
    env.HERMES_AGENT_TAG = route.spendTags.agent;
  }
  return env;
}

function parseArgs(argv) {
  const out = { task: '', json: false, probe: false, help: false, tradeoff: null, agent: null };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--task') out.task = argv[++i] || '';
    else if (a === '--json') out.json = true;
    else if (a === '--probe') out.probe = true;
    else if (a === '--tradeoff') out.tradeoff = argv[++i] || '';
    else if (a === '--agent') out.agent = argv[++i] || '';
    else if (a === '--help' || a === '-h') out.help = true;
    else if (!a.startsWith('-') && !out.task) out.task = a;
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(
      `Usage: node tools/hermes-yolo-route-policy.js --task "..." [--tradeoff cheap|balanced|quality] [--agent NAME] [--probe] [--json]`,
    );
    process.exit(0);
  }
  const selectOpts = { task: args.task, tradeoff: args.tradeoff, agent: args.agent };
  const route = args.probe
    ? await selectRouteWithProbe({ ...selectOpts, probe: true })
    : selectRoute(selectOpts);
  const payload = {
    schema: 'hermes-yolo/route-policy-v1',
    route,
    commandEnv: commandEnv(route),
    philosophy:
      'Architecture > smartest model. Flat-rate routes only. Auto-router steals (task type, turn budget, cost_quality) are local — never openrouter/auto.',
  };
  if (args.json) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  } else {
    console.log(`${route.id} → ${route.provider} / ${route.model}`);
    console.log(`reason: ${route.reason}`);
    if (route.taskType) {
      console.log(
        `auto: taskType=${route.taskType} tradeoff=${route.costQualityTradeoff} turns=${route.turnBudget?.turns}`,
      );
    }
    if (route.probe) console.log(`probe: ${route.probe.ok ? 'ok' : 'fail'} status=${route.probe.status}`);
  }
  process.exitCode = route.degraded ? 2 : 0;
}

module.exports = {
  LITELLM_BASE,
  PROVIDER,
  ROUTES,
  taskSignals,
  selectRoute,
  selectRouteWithProbe,
  probeModel,
  commandEnv,
  enrichWithAutoRouter,
};

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
