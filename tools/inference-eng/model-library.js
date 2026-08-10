#!/usr/bin/env node
'use strict';

/**
 * Model library — Baseten-inspired catalog of deployable inference routes.
 *
 * Baseten: "Model Library" + Dedicated Inference vs Model APIs.
 * Hermes: catalog of *owned* routes (SuperGrok, LiteLLM aliases, local) with
 * tier, SLA class, agent capability, and recommended tasks — not GPU kernels.
 *
 *   node tools/inference-eng/model-library.js --list
 *   node tools/inference-eng/model-library.js --pick "fix auth" --json
 *   node tools/inference-eng/model-library.js --sla interactive --json
 */

const { classifyTask } = require('./task-registry');
const { selectModelChain, wantsSuperGrok } = require('./degradation');

/** @typedef {'frontier'|'subscription'|'free'|'local'|'vision'} RouteTier */
/** @typedef {'interactive'|'balanced'|'batch'|'smoke'} SlaClass */

/**
 * @typedef {object} LibraryRoute
 * @property {string} id
 * @property {string} model  LiteLLM alias or hermes-yolo backend model id
 * @property {string} provider
 * @property {RouteTier} tier
 * @property {SlaClass} slaClass
 * @property {boolean} agentCapable  tool-calling coding class
 * @property {string[]} bestFor  task ids
 * @property {string} basetenAnalog  which Baseten product this maps to
 * @property {string} note
 * @property {string[]} techniques  inference techniques we expect when available
 */

/** @type {LibraryRoute[]} */
const LIBRARY = Object.freeze([
  {
    id: 'supergrok-coding',
    model: 'grok-4.5',
    provider: 'grok-yolo',
    tier: 'subscription',
    slaClass: 'interactive',
    agentCapable: true,
    bestFor: ['code', 'plan', 'draft'],
    basetenAnalog: 'Dedicated interactive endpoint (plan quota, not GPU rent)',
    note: 'Primary coding path via hermes-yolo SuperGrok OAuth',
    techniques: ['stable-prefix-reuse', 'tool-use', 'fail-closed-agent-capable'],
  },
  {
    id: 'gateway-deepseek-flash',
    model: 'deepseek-v4-flash',
    provider: 'custom:litellm-gateway',
    tier: 'free',
    slaClass: 'balanced',
    agentCapable: true,
    bestFor: ['code', 'draft', 'classify'],
    basetenAnalog: 'Model APIs — pre-optimized open model (DeepSeek V4 Flash)',
    note: 'Default Hermes config recovery route when paid GLM is empty',
    techniques: ['quantized-friendly', 'high-throughput'],
  },
  {
    id: 'gateway-kimi-code',
    model: 'kimi-for-coding',
    provider: 'custom:litellm-gateway',
    tier: 'subscription',
    slaClass: 'interactive',
    agentCapable: true,
    bestFor: ['code', 'plan'],
    basetenAnalog: 'Model APIs — Kimi coding class',
    note: 'Flat membership when healthy; empty completions when quota thrash',
    techniques: ['long-context', 'tool-use'],
  },
  {
    id: 'gateway-glm-coding',
    model: 'glm-coding',
    provider: 'custom:litellm-gateway',
    tier: 'subscription',
    slaClass: 'interactive',
    agentCapable: true,
    bestFor: ['code'],
    basetenAnalog: 'Model APIs — GLM coding (z.ai plan)',
    note: 'DEAD often (empty) under z.ai weekly/monthly cap — drop from fleet grade',
    techniques: ['reasoning', 'tool-use'],
  },
  {
    id: 'local-hermes',
    model: 'hermes-local',
    provider: 'custom:litellm-gateway',
    tier: 'local',
    slaClass: 'batch',
    agentCapable: true,
    bestFor: ['retrieve', 'smoke', 'classify'],
    basetenAnalog: 'Self-hosted / on-prem dedicated',
    note: 'Ollama via LiteLLM — thrash-safe emergency',
    techniques: ['zero-spend', 'offline'],
  },
  {
    id: 'local-fast',
    model: 'hermes-local-fast',
    provider: 'custom:litellm-gateway',
    tier: 'local',
    slaClass: 'smoke',
    agentCapable: false,
    bestFor: ['smoke', 'route'],
    basetenAnalog: 'Cold-start / health probe replica',
    note: 'Tiny local for readiness — not coding primary',
    techniques: ['cold-start-probe'],
  },
  {
    id: 'baseten-model-api-slot',
    model: 'baseten-deepseek-v4-flash',
    provider: 'baseten',
    tier: 'subscription',
    slaClass: 'balanced',
    agentCapable: true,
    bestFor: ['code', 'draft', 'classify'],
    basetenAnalog: 'Baseten Model APIs (wire when BASETEN_API_KEY + spend authorized)',
    note: 'Catalog placeholder — not auto-routed until live probe green',
    techniques: ['provider-speculation', 'kv-cache-routing', 'quantization'],
  },
]);

const SLA_ORDER = Object.freeze({
  interactive: 0,
  balanced: 1,
  batch: 2,
  smoke: 3,
});

function listRoutes(options = {}) {
  let routes = [...LIBRARY];
  if (options.agentCapableOnly) routes = routes.filter((r) => r.agentCapable);
  if (options.tier) routes = routes.filter((r) => r.tier === options.tier);
  if (options.sla) routes = routes.filter((r) => r.slaClass === options.sla);
  return routes;
}

/**
 * Pick best library route for a task + SLA preference (Baseten: control SLAs and economics).
 * @param {{ taskText?: string, taskId?: string, sla?: SlaClass, env?: NodeJS.ProcessEnv, allowBasetenSlot?: boolean }} opts
 */
function pickRoute(opts = {}) {
  const env = opts.env || process.env;
  const task = opts.taskId
    ? { id: opts.taskId }
    : classifyTask(opts.taskText || 'fix the bug');
  const sla = opts.sla || (task.id === 'smoke' ? 'smoke' : task.id === 'classify' ? 'balanced' : 'interactive');
  const chain = selectModelChain({
    taskId: task.id,
    taskText: opts.taskText,
    mode: env.HERMES_INFERENCE_MODE || 'normal',
    env,
  });

  const candidates = LIBRARY.filter((r) => {
    if (r.id === 'baseten-model-api-slot' && !opts.allowBasetenSlot && env.HERMES_BASETEN_READY !== '1') {
      return false;
    }
    if (r.model === 'glm-coding' && env.HERMES_ALLOW_DEAD_GLM !== '1') {
      // Prefer not to pick known-empty glm unless forced
      return false;
    }
    return r.bestFor.includes(task.id) || r.model === chain.primary;
  });

  // Prefer SuperGrok for interactive coding when ready
  if (wantsSuperGrok(env) && (task.id === 'code' || task.id === 'plan' || sla === 'interactive')) {
    const grok = LIBRARY.find((r) => r.id === 'supergrok-coding');
    if (grok) {
      return {
        taskId: task.id,
        sla,
        route: grok,
        reason: 'SuperGrok preferred for interactive coding (Baseten: dedicated interactive endpoint analog)',
        chainPrimary: chain.primary,
        chain: chain.chain,
      };
    }
  }

  // Score: agentCapable, sla match, tier preference for economics
  const scored = candidates
    .map((r) => {
      let score = 0;
      if (r.agentCapable) score += 10;
      if (r.slaClass === sla) score += 5;
      if (SLA_ORDER[r.slaClass] <= SLA_ORDER[sla]) score += 2;
      if (r.model === chain.primary) score += 8;
      if (r.tier === 'local' && sla === 'smoke') score += 6;
      if (r.tier === 'free' && sla === 'balanced') score += 3;
      return { r, score };
    })
    .sort((a, b) => b.score - a.score);

  const best = scored[0]?.r || LIBRARY.find((r) => r.id === 'local-hermes');
  return {
    taskId: task.id,
    sla,
    route: best,
    reason: `library pick for task=${task.id} sla=${sla}`,
    chainPrimary: chain.primary,
    chain: chain.chain,
    candidates: scored.slice(0, 5).map((s) => ({ id: s.r.id, score: s.score })),
  };
}

/**
 * Inference technique checklist (Baseten Runtime features we track as enablement).
 */
function techniqueChecklist() {
  return [
    {
      id: 'stable-prefix-reuse',
      baseten: 'KV cache / cache-aware routing',
      hermes: 'Stable system/soul prompts; avoid dynamic dates in prefix',
      owned: true,
    },
    {
      id: 'fail-closed-agent-capable',
      baseten: 'Structured output + tool use',
      hermes: 'hermes-yolo MODEL_CAPABILITY_REGISTRY + assertAgentCapableModel',
      owned: true,
    },
    {
      id: 'degradation-sla',
      baseten: 'Control SLAs and economics (latency vs throughput)',
      hermes: 'normal/degraded/emergency + task latency budgets',
      owned: true,
    },
    {
      id: 'compound-chains',
      baseten: 'Baseten Chains multi-stage compound AI',
      hermes: 'tools/inference-eng/pipeline.js multi-step pipelines',
      owned: true,
    },
    {
      id: 'readiness-probe',
      baseten: 'Cold start / replica health',
      hermes: 'grok-yolo --doctor + hermes-yolo ready probe + fleet-health',
      owned: true,
    },
    {
      id: 'provider-speculation',
      baseten: 'Speculative decoding / Medusa / Eagle',
      hermes: 'Provider-side when available (Baseten Model APIs, etc.)',
      owned: false,
    },
    {
      id: 'quantization',
      baseten: 'PTQ / NVFP4 / KV quant',
      hermes: 'Use quantized local models for smoke/batch; cloud on provider',
      owned: 'partial',
    },
    {
      id: 'prefill-priority',
      baseten: 'Request prioritization (prefill over decode)',
      hermes: 'Task latency budgets + smoke vs code route split',
      owned: 'partial',
    },
  ];
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  let json = false;
  let list = false;
  let techniques = false;
  let task = '';
  let sla = '';
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--json') json = true;
    else if (argv[i] === '--list') list = true;
    else if (argv[i] === '--techniques') techniques = true;
    else if (argv[i] === '--pick') task = argv[++i] || '';
    else if (argv[i] === '--sla') sla = argv[++i] || '';
  }
  if (techniques) {
    const t = techniqueChecklist();
    process.stdout.write(json ? `${JSON.stringify(t, null, 2)}\n` : t.map((x) => `${x.id}: owned=${x.owned} ← ${x.baseten}`).join('\n') + '\n');
    process.exit(0);
  }
  if (list || (!task && !sla)) {
    const routes = listRoutes({ sla: sla || undefined });
    if (json) process.stdout.write(`${JSON.stringify(routes, null, 2)}\n`);
    else {
      for (const r of routes) {
        console.log(`${r.id}\t${r.model}\ttier=${r.tier}\tsla=${r.slaClass}\tagent=${r.agentCapable}\t← ${r.basetenAnalog}`);
      }
    }
    process.exit(0);
  }
  const pick = pickRoute({ taskText: task || 'fix the bug', sla: sla || undefined });
  process.stdout.write(json ? `${JSON.stringify(pick, null, 2)}\n` : `${pick.route.id} → ${pick.route.model} (${pick.reason})\n`);
}

module.exports = {
  LIBRARY,
  listRoutes,
  pickRoute,
  techniqueChecklist,
};
