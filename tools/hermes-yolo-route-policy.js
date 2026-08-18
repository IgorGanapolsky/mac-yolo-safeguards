#!/usr/bin/env node
'use strict';

/**
 * Architecture-first route policy for hermes-yolo (Andrew Ng: harness > model).
 *
 * Picks among *flat-rate / local* LiteLLM aliases only — never auto-routes to
 * per-token Moonshot kimi-k3 or OpenRouter burn paths. Those stay explicit opt-in.
 *
 * Usage:
 *   node tools/hermes-yolo-route-policy.js --task "fix the auth bug" [--json]
 *   node tools/hermes-yolo-route-policy.js --task "smoke" --probe
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
    cyber: /\b(cyber|cybergym|mythos|vulnerability|cve|exploitbench|security audit|code audit|pentest)\b/.test(text),
  };
}

/**
 * Select a route. Explicit env always wins (operator control).
 * @param {{ task?: string, env?: NodeJS.ProcessEnv }} opts
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
      return {
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
    }
    // fall through to SuperGrok chain (stale glm pin ignored)
  }

  // Explicit "use glm" in task text (operator intent)
  if (signals.asksGlm && (env.HERMES_ALLOW_GLM === '1' || env.HERMES_YOLO_FORCE_MODEL === '1')) {
    return {
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
  }

  // GLM-5.3 CyberGym (SCMP 2026-08-14): cyber/audit stays on Coding Plan ($0), never metered.
  if (signals.cyber && env.HERMES_PREFER_GLM53_CYBER === '1') {
    return {
      ...ROUTES.glm,
      reason: 'cyber/audit → GLM-5.3 Coding Plan (HERMES_PREFER_GLM53_CYBER)',
      signals,
      inferenceTask: inferenceTask.id,
      mode,
      chain: chainPlan.chain,
      latencyBudgetMs: inferenceTask.latencyBudgetMs,
      businessKpi: inferenceTask.businessKpi,
      policyVersion: POLICY_VERSION,
    };
  }

  // Long-context membership K3 before SuperGrok default (1M flat, not per-token)
  if (signals.longContext || signals.asksK3) {
    return {
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
  }

  if (signals.asksKimi && !signals.asksK3) {
    return {
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
  }

  if (signals.smoke) {
    return {
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
  }

  const primary = chainPlan.primary;
  const fromRegistry = Object.values(ROUTES).find((r) => r.model === primary);
  if (fromRegistry) {
    return {
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
  }

  if (primary === 'grok-4.5' || /^grok/.test(primary)) {
    return {
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
  }

  if (signals.asksLocal) {
    return {
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
  }

  return {
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
      return {
        ...candidate,
        reason: `${primary.model} probe failed (${probePrimary.status || probePrimary.error}); fell back to ${candidate.model}`,
        signals: primary.signals,
        policyVersion: POLICY_VERSION,
        probe: p,
        primaryFailed: probePrimary,
        fallbackUsed: true,
      };
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
  return {
    HERMES_YOLO_PROVIDER: route.provider,
    HERMES_YOLO_MODEL: route.model,
    HERMES_ROUTE_ID: route.id,
    HERMES_ROUTE_REASON: route.reason || '',
  };
}

function parseArgs(argv) {
  const out = { task: '', json: false, probe: false, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--task') out.task = argv[++i] || '';
    else if (a === '--json') out.json = true;
    else if (a === '--probe') out.probe = true;
    else if (a === '--help' || a === '-h') out.help = true;
    else if (!a.startsWith('-') && !out.task) out.task = a;
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(`Usage: node tools/hermes-yolo-route-policy.js --task "..." [--probe] [--json]`);
    process.exit(0);
  }
  const route = args.probe
    ? await selectRouteWithProbe({ task: args.task, probe: true })
    : selectRoute({ task: args.task });
  const payload = {
    schema: 'hermes-yolo/route-policy-v1',
    route,
    commandEnv: commandEnv(route),
    philosophy: 'Architecture > smartest model. Flat-rate routes only unless operator pins env.',
  };
  if (args.json) {
    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  } else {
    console.log(`${route.id} → ${route.provider} / ${route.model}`);
    console.log(`reason: ${route.reason}`);
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
};

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
