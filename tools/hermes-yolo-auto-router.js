#!/usr/bin/env node
'use strict';

/**
 * hermes-yolo-auto-router.js — OpenRouter Auto Router patterns on OUR flat/local pool
 *
 * Source: OpenRouter July 2026 recap ("Picking the model is the hard part now"):
 *   - Auto Router classifies into task types, routes by where spend actually moved
 *   - cost_quality_tradeoff filters candidates toward cheaper models
 *   - Fall back to a default set rather than failing the request
 *   - Turn budget matters more than brand model (BrowseComp: 1→5→25 turns)
 *
 * HARD rules (never-spend / fleet policy):
 *   - NEVER emit openrouter/auto, openrouter/auto-beta, or per-token burn defaults
 *   - Only flat-rate / free / local LiteLLM aliases
 *   - Community "spend priors" are local subscription usage weights, not OR marketplace
 *
 * Usage:
 *   node tools/hermes-yolo-auto-router.js --task "fix auth pairing" [--tradeoff cheap|balanced|quality] [--json]
 *   node tools/hermes-yolo-auto-router.js --list-types --json
 */

const { classifyTask } = require('./inference-eng/task-registry');

const POLICY_VERSION = 5;

/** OpenRouter-style task types mapped to Hermes product work (bounded set). */
const TASK_TYPES = Object.freeze({
  smoke: {
    id: 'smoke',
    description: 'Readiness / exact-marker / ping',
    turnBudget: { min: 1, default: 1, max: 2 },
    defaultTradeoff: 'cheap',
    pool: ['kimi-code-fast', 'deepseek-v4-flash', 'hermes-local'],
    match: [/\bsmoke\b/, /\bping\b/, /hermes-yolo-ready/, /reply with exactly/, /\bquick check\b/],
  },
  classify: {
    id: 'classify',
    description: 'Lead qualify / triage / spam',
    turnBudget: { min: 1, default: 2, max: 4 },
    defaultTradeoff: 'cheap',
    pool: ['deepseek-v4-flash', 'hermes-local', 'kimi-code-fast'],
    match: [/\bclassify\b/, /qualify lead/, /funnel stage/, /\bspam\b/, /\bintent\b/],
  },
  retrieve: {
    id: 'retrieve',
    description: 'Code/doc retrieval context pack',
    turnBudget: { min: 1, default: 3, max: 6 },
    defaultTradeoff: 'cheap',
    pool: ['hermes-local', 'deepseek-v4-flash', 'kimi-code-fast'],
    match: [/\bretrieve\b/, /search codebase/, /find file/, /where is/, /\bgrepai\b/],
  },
  draft: {
    id: 'draft',
    description: 'Content / outreach / landing draft',
    turnBudget: { min: 2, default: 5, max: 12 },
    defaultTradeoff: 'cheap',
    pool: ['deepseek-v4-flash', 'hermes-local', 'kimi-code-fast', 'kimi-code'],
    match: [/\bdraft\b/, /write post/, /newsletter/, /outreach email/, /landing copy/],
  },
  code: {
    id: 'code',
    description: 'Implement / fix / tool-using coding turn',
    turnBudget: { min: 3, default: 12, max: 25 },
    defaultTradeoff: 'balanced',
    pool: ['grok-4.5', 'kimi-code', 'deepseek-v4-flash', 'hermes-local'],
    match: [/\bfix\b/, /\bimplement\b/, /\brefactor\b/, /\bdebug\b/, /\bbug\b/, /write test/, /\bpatch\b/],
  },
  plan: {
    id: 'plan',
    description: 'Architecture / multi-step design',
    turnBudget: { min: 5, default: 15, max: 30 },
    defaultTradeoff: 'quality',
    pool: ['grok-4.5', 'kimi-code', 'deepseek-v4-flash'],
    match: [/\bplan\b/, /\barchitecture\b/, /\bdesign\b/, /are you sure/, /root cause/],
  },
  long_context: {
    id: 'long_context',
    description: 'Whole-repo / multi-file / 1M context',
    turnBudget: { min: 5, default: 18, max: 35 },
    defaultTradeoff: 'balanced',
    pool: ['kimi-code-k3', 'kimi-code', 'grok-4.5'],
    match: [/long[- ]?context/, /large[- ]?repo/, /whole[- ]?repo/, /multi[- ]?file/, /full.?codebase/, /\bk3\b/],
  },
  judge: {
    id: 'judge',
    description: 'Eval / groundedness / grade',
    turnBudget: { min: 2, default: 6, max: 12 },
    defaultTradeoff: 'balanced',
    pool: ['kimi-code', 'deepseek-v4-flash', 'hermes-local'],
    match: [/\bjudge\b/, /\beval\b/, /groundedness/, /score answer/, /\bgrade\b/],
  },
  vision: {
    id: 'vision',
    description: 'Screenshot / image understanding',
    turnBudget: { min: 1, default: 4, max: 8 },
    defaultTradeoff: 'balanced',
    pool: ['glm-vision', 'vision-gemini', 'vision-free'],
    match: [/\bscreenshot\b/, /\bimage\b/, /\bvision\b/, /what does this ui/],
  },
  mobile_pair: {
    id: 'mobile_pair',
    description: 'Hermes Mobile pair / connect / USB / Tailscale',
    turnBudget: { min: 2, default: 8, max: 16 },
    defaultTradeoff: 'balanced',
    pool: ['grok-4.5', 'kimi-code', 'deepseek-v4-flash'],
    match: [/\bpair\b/, /\busb\b/, /tailscale/, /gateway.*connect/, /can't reach/, /mobile connect/],
  },
  gates: {
    id: 'gates',
    description: 'ThumbGate gates / spend / never-spend / approval leash',
    turnBudget: { min: 2, default: 6, max: 12 },
    defaultTradeoff: 'quality',
    pool: ['grok-4.5', 'kimi-code', 'deepseek-v4-flash'],
    match: [/\bgate\b/, /thumbgate/, /never.?spend/, /spend.?guard/, /\bleash\b/, /approval/],
  },
  routine: {
    id: 'routine',
    description: 'Lint / rename / typo / small fix',
    turnBudget: { min: 1, default: 3, max: 6 },
    defaultTradeoff: 'cheap',
    pool: ['kimi-code-fast', 'deepseek-v4-flash', 'hermes-local'],
    match: [/\blint\b/, /\bformat\b/, /\brename\b/, /\btypo\b/, /small fix/, /unit test only/],
  },
});

/**
 * Local "community spend" priors — which models we actually want traffic on
 * for each tier (OpenRouter: trailing 7d spend by task type). Static + env override.
 * Higher weight = preferred when tradeoff allows.
 */
const DEFAULT_SPEND_PRIORS = Object.freeze({
  'grok-4.5': 100,
  'kimi-code': 70,
  'kimi-code-k3': 55,
  'kimi-code-fast': 50,
  'deepseek-v4-flash': 40,
  'hermes-local': 30,
  'deepseek-v4-flash-free': 25,
  'glm-coding': 5, // dead agent — low prior unless ALLOW_GLM
  'glm-vision': 20,
  'vision-gemini': 15,
  'vision-free': 10,
});

/** Tier cost rank (lower = cheaper). Used by cost_quality_tradeoff filter. */
const COST_RANK = Object.freeze({
  'hermes-local': 0,
  'deepseek-v4-flash-free': 1,
  'deepseek-v4-flash': 2,
  'kimi-code-fast': 3,
  'kimi-code': 4,
  'kimi-code-k3': 5,
  'grok-4.5': 6,
  'glm-coding': 6,
  'glm-vision': 5,
  'vision-gemini': 5,
  'vision-free': 2,
});

const TRADEOFFS = Object.freeze(['cheap', 'balanced', 'quality']);

const FORBIDDEN_MODELS = Object.freeze([
  /^openrouter\//i,
  /^openrouter\/auto/i,
  /\/auto-beta$/i,
  /^gpt-5/i,
  /^claude-opus/i,
  /^o[1-9]/i,
  /^kimi-k3$/i, // per-token moonshot — use kimi-code-k3 membership
]);

function isForbiddenModel(model) {
  const m = String(model || '');
  return FORBIDDEN_MODELS.some((re) => re.test(m));
}

function resolveTradeoff(raw, taskType, env = process.env) {
  const fromEnv = String(env.HERMES_COST_QUALITY || env.HERMES_COST_QUALITY_TRADEOFF || '').toLowerCase();
  const cand = String(raw || fromEnv || taskType.defaultTradeoff || 'balanced').toLowerCase();
  if (TRADEOFFS.includes(cand)) return cand;
  return 'balanced';
}

/**
 * Classify into Auto-Router-style task type (product-aware, not generic OR types).
 */
function classifyTaskType(taskText, options = {}) {
  const text = String(taskText || '').toLowerCase();
  if (!text.trim()) {
    return { ...TASK_TYPES.code, score: 0, source: 'empty→code' };
  }

  let best = null;
  let bestScore = 0;
  for (const type of Object.values(TASK_TYPES)) {
    let score = 0;
    for (const re of type.match) {
      if (re.test(text)) score += String(re).length;
    }
    if (score > bestScore) {
      bestScore = score;
      best = type;
    }
  }

  // Fall back to inference-eng registry if no keyword hit
  if (!best || bestScore === 0) {
    const inf = classifyTask(taskText);
    const mapped = TASK_TYPES[inf.id] || TASK_TYPES.code;
    return {
      ...mapped,
      score: 0,
      source: `inference-eng:${inf.id}`,
      inferenceTaskId: inf.id,
    };
  }

  return {
    ...best,
    score: bestScore,
    source: 'keyword',
    inferenceTaskId: classifyTask(taskText).id,
  };
}

function spendPriors(env = process.env) {
  const priors = { ...DEFAULT_SPEND_PRIORS };
  // Optional JSON override: HERMES_SPEND_PRIORS='{"grok-4.5":120,"hermes-local":50}'
  const raw = env.HERMES_SPEND_PRIORS;
  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      for (const [k, v] of Object.entries(parsed)) {
        if (typeof v === 'number' && Number.isFinite(v)) priors[k] = v;
      }
    } catch {
      /* ignore bad JSON */
    }
  }
  if (env.HERMES_ALLOW_GLM !== '1') {
    priors['glm-coding'] = Math.min(priors['glm-coding'] || 0, 5);
  }
  return priors;
}

/**
 * Filter + rank candidate pool by cost_quality_tradeoff and local spend priors.
 * Mirrors OpenRouter: lean cheaper when tradeoff says so; never empty pool.
 */
function rankCandidates(pool, tradeoff, env = process.env) {
  const priors = spendPriors(env);
  let list = (pool || []).filter((m) => m && !isForbiddenModel(m));

  if (env.HERMES_ALLOW_GLM !== '1') {
    list = list.filter((m) => m !== 'glm-coding');
  }

  if (list.length === 0) {
    list = ['hermes-local', 'deepseek-v4-flash', 'kimi-code-fast'];
  }

  const maxCost = Math.max(...list.map((m) => COST_RANK[m] ?? 5));
  const minCost = Math.min(...list.map((m) => COST_RANK[m] ?? 0));

  // OpenRouter cost_quality_tradeoff: filter how far toward cheaper models
  let filtered = list;
  if (tradeoff === 'cheap') {
    const ceiling = minCost + Math.max(1, Math.floor((maxCost - minCost) * 0.4));
    filtered = list.filter((m) => (COST_RANK[m] ?? 5) <= ceiling);
  } else if (tradeoff === 'quality') {
    const floor = maxCost - Math.max(1, Math.floor((maxCost - minCost) * 0.45));
    filtered = list.filter((m) => (COST_RANK[m] ?? 0) >= floor);
  }
  // balanced: keep full pool
  if (filtered.length === 0) filtered = list;

  const scored = filtered.map((model) => {
    const cost = COST_RANK[model] ?? 5;
    const prior = priors[model] ?? 10;
    // Score: spend prior + tradeoff tilt
    let score = prior;
    if (tradeoff === 'cheap') score += (10 - cost) * 8;
    else if (tradeoff === 'quality') score += cost * 6;
    else score += (10 - Math.abs(cost - 4)) * 3; // mid preference
    return { model, score, costRank: cost, spendPrior: prior };
  });

  scored.sort((a, b) => b.score - a.score || a.costRank - b.costRank);
  return scored;
}

/**
 * Turn budget for a task type (BrowseComp insight: turns dominate accuracy).
 * Operator can pin HERMES_TURN_BUDGET.
 */
function resolveTurnBudget(taskType, options = {}, env = process.env) {
  const pin = options.turnBudget != null ? Number(options.turnBudget) : Number(env.HERMES_TURN_BUDGET);
  const tb = taskType.turnBudget || { min: 1, default: 8, max: 25 };
  if (Number.isFinite(pin) && pin > 0) {
    return {
      turns: Math.min(tb.max, Math.max(tb.min, Math.round(pin))),
      source: 'pin',
      min: tb.min,
      max: tb.max,
      default: tb.default,
    };
  }
  // quality tradeoff → lean higher turn budget; cheap → lean lower
  const tradeoff = options.tradeoff || 'balanced';
  let turns = tb.default;
  if (tradeoff === 'cheap') turns = Math.max(tb.min, Math.round(tb.default * 0.5));
  if (tradeoff === 'quality') turns = Math.min(tb.max, Math.round(tb.default * 1.35));
  return {
    turns,
    source: 'task_type',
    min: tb.min,
    max: tb.max,
    default: tb.default,
  };
}

/**
 * Full auto-route decision (local only).
 * @param {{ task?: string, tradeoff?: string, agent?: string, env?: NodeJS.ProcessEnv, turnBudget?: number }} opts
 */
function autoRoute(opts = {}) {
  const env = opts.env || process.env;
  const task = opts.task || '';
  const taskType = classifyTaskType(task, opts);
  const tradeoff = resolveTradeoff(opts.tradeoff, taskType, env);
  const ranked = rankCandidates(taskType.pool, tradeoff, env);
  const primary = ranked[0]?.model || 'hermes-local';
  const chain = ranked.map((r) => r.model);
  const turnBudget = resolveTurnBudget(taskType, { ...opts, tradeoff }, env);

  // Hard refuse any forbidden primary
  if (isForbiddenModel(primary)) {
    return {
      ok: false,
      error: 'forbidden_model',
      message: `Auto-router refused ${primary} (OpenRouter/auto and per-token burn blocked)`,
      policyVersion: POLICY_VERSION,
    };
  }

  const agent = String(opts.agent || env.HERMES_AGENT_ID || env.HERMES_AGENT || 'hermes-yolo').slice(0, 64);

  return {
    ok: true,
    schema: 'hermes-yolo/auto-router-v1',
    policyVersion: POLICY_VERSION,
    source: 'openrouter-july-2026-steal-local-only',
    taskType: taskType.id,
    taskTypeSource: taskType.source,
    inferenceTaskId: taskType.inferenceTaskId,
    costQualityTradeoff: tradeoff,
    turnBudget,
    model: primary,
    chain,
    ranked,
    agent,
    spendTags: {
      agent,
      task_type: taskType.id,
      tradeoff,
      model: primary,
      turns: turnBudget.turns,
    },
    philosophy:
      'Task-type classify → local spend priors → cost_quality filter. Never openrouter/auto. Harness/turns > brand model.',
    reason:
      `taskType=${taskType.id} tradeoff=${tradeoff} turns=${turnBudget.turns} → ${primary} ` +
      `(chain ${chain.slice(0, 4).join('→')})`,
  };
}

/**
 * Synthetic multi-setup eval (BrowseComp lesson): fix model, vary turns.
 * Offline — no network, deterministic scores for CI.
 */
function evaluateTurnBudgetSetups(options = {}) {
  const model = options.model || 'fixed-harness-model';
  // Simulated accuracy curve: diminishing returns, cost linear in turns
  // Inspired by OR: 36% @1, 58% @5, 75% @25
  const setups = (options.turns || [1, 5, 12, 25]).map((turns) => {
    const accuracy = Math.min(0.92, 0.28 + 0.22 * Math.log2(1 + turns));
    const costUnits = turns * (options.costPerTurn || 1);
    const efficiency = accuracy / Math.max(0.01, costUnits);
    return {
      model,
      turns,
      accuracyPct: Math.round(accuracy * 1000) / 10,
      costUnits,
      efficiency: Math.round(efficiency * 1000) / 1000,
    };
  });

  // Cost does not track quality: pick max efficiency, not max cost
  const byAccuracy = [...setups].sort((a, b) => b.accuracyPct - a.accuracyPct)[0];
  const byEfficiency = [...setups].sort((a, b) => b.efficiency - a.efficiency)[0];
  const mostExpensive = [...setups].sort((a, b) => b.costUnits - a.costUnits)[0];

  return {
    ok: true,
    schema: 'hermes-yolo/turn-budget-eval-v1',
    modelFixed: model,
    setups,
    winners: {
      accuracy: byAccuracy,
      efficiency: byEfficiency,
      // Prove expensive can lose efficiency
      expensiveIsNotAlwaysBest: mostExpensive.turns !== byEfficiency.turns,
    },
    lesson:
      'Hold model fixed; vary turn budget. Cost does not track quality (OpenRouter DeepSearchQA lesson).',
  };
}

/**
 * Multi-setup harness board: same task, different (tradeoff, turns) — offline.
 */
function evaluateHarnessBoard(taskText, options = {}) {
  const tradeoffs = options.tradeoffs || TRADEOFFS;
  const rows = [];
  for (const tradeoff of tradeoffs) {
    const route = autoRoute({ task: taskText, tradeoff, env: options.env || {}, agent: options.agent });
    const tb = evaluateTurnBudgetSetups({
      model: route.model,
      turns: [route.turnBudget.min, route.turnBudget.turns, route.turnBudget.max],
    });
    rows.push({
      tradeoff,
      taskType: route.taskType,
      model: route.model,
      turnBudget: route.turnBudget.turns,
      chainHead: (route.chain || []).slice(0, 3),
      efficiencyAtDefault: tb.setups.find((s) => s.turns === route.turnBudget.turns) || tb.setups[0],
      board: tb,
    });
  }

  // Prefer efficiency winner among balanced unless quality forced
  const bestEff = [...rows].sort(
    (a, b) => (b.efficiencyAtDefault?.efficiency || 0) - (a.efficiencyAtDefault?.efficiency || 0),
  )[0];

  return {
    ok: true,
    schema: 'hermes-yolo/harness-board-v1',
    task: taskText,
    rows,
    recommend: {
      tradeoff: bestEff.tradeoff,
      model: bestEff.model,
      turns: bestEff.turnBudget,
      reason: 'highest efficiency at default turn budget for this task',
    },
  };
}

function parseArgs(argv) {
  const args = {
    task: '',
    json: false,
    tradeoff: null,
    listTypes: false,
    evalTurns: false,
    board: false,
    agent: null,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--task') args.task = argv[++i] || '';
    else if (a === '--tradeoff') args.tradeoff = argv[++i] || '';
    else if (a === '--agent') args.agent = argv[++i] || '';
    else if (a === '--json') args.json = true;
    else if (a === '--list-types') args.listTypes = true;
    else if (a === '--eval-turns') args.evalTurns = true;
    else if (a === '--board') args.board = true;
    else if (a === '--help' || a === '-h') args.help = true;
    else if (!a.startsWith('-') && !args.task) args.task = a;
  }
  return args;
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    console.log(`Usage:
  node tools/hermes-yolo-auto-router.js --task "..." [--tradeoff cheap|balanced|quality] [--agent NAME] [--json]
  node tools/hermes-yolo-auto-router.js --list-types [--json]
  node tools/hermes-yolo-auto-router.js --eval-turns [--json]
  node tools/hermes-yolo-auto-router.js --board --task "..." [--json]`);
    process.exit(0);
  }

  let out;
  if (args.listTypes) {
    out = { ok: true, types: Object.values(TASK_TYPES).map((t) => ({
      id: t.id,
      description: t.description,
      turnBudget: t.turnBudget,
      defaultTradeoff: t.defaultTradeoff,
      pool: t.pool,
    })) };
  } else if (args.evalTurns) {
    out = evaluateTurnBudgetSetups();
  } else if (args.board) {
    out = evaluateHarnessBoard(args.task || 'implement the login form', {
      agent: args.agent,
    });
  } else {
    out = autoRoute({
      task: args.task,
      tradeoff: args.tradeoff,
      agent: args.agent,
    });
  }

  if (args.json || true) {
    process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
  }
  process.exit(out && out.ok === false ? 1 : 0);
}

if (require.main === module) {
  main();
}

module.exports = {
  POLICY_VERSION,
  TASK_TYPES,
  TRADEOFFS,
  DEFAULT_SPEND_PRIORS,
  COST_RANK,
  FORBIDDEN_MODELS,
  isForbiddenModel,
  classifyTaskType,
  resolveTradeoff,
  resolveTurnBudget,
  rankCandidates,
  spendPriors,
  autoRoute,
  evaluateTurnBudgetSetups,
  evaluateHarnessBoard,
};
