#!/usr/bin/env node
'use strict';

/**
 * Deliberate degradation policy — not accidental cascade thrash.
 *
 * Modes:
 *   normal     — preferred models in order
 *   degraded   — skip thrash/metered burn; KEEP SuperGrok flat plan + free/local
 *   emergency  — local/free only (swap thrash, all paid 429)
 *
 * SuperGrok / grok-4.5 is flat-rate subscription (policy pricing tier), not
 * per-token thrash. Degraded mode MUST NOT strip it — that was the 2026-08-05
 * live bug where HERMES_INFERENCE_MODE=degraded + HERMES_YOLO_MODEL=glm-coding
 * demoted SuperGrok to glm despite a ready SuperGrok path.
 *
 *   node tools/inference-eng/degradation.js --task "fix auth" --mode normal --json
 */

const { classifyTask, getTask } = require('./task-registry');

const MODES = Object.freeze(['normal', 'degraded', 'emergency']);

/** Models that are thrashy or pay-per-token burn under pressure — not SuperGrok. */
const DEGRADED_DROP = Object.freeze([
  /^gpt-/i,
  /^claude-/i,
  /^o[1-9]/i,
  /^kimi-k3$/i,
  /^kimi-k2\.7/i,
  /^muse-spark/i,
  /^sakana\//i,
  /^nvidia\/nemotron-3-ultra/i,
]);

/**
 * Operator wants SuperGrok as coding primary when backend is grok/auto or explicit prefer.
 * @param {NodeJS.ProcessEnv} env
 */
function wantsSuperGrok(env = process.env) {
  if (env.HERMES_PREFER_SUPERGROK === '0') return false;
  if (env.HERMES_PREFER_SUPERGROK === '1') return true;
  const backend = String(env.HERMES_YOLO_BACKEND || 'auto').toLowerCase();
  return backend === 'grok' || backend === 'auto' || backend === 'grok-4.5';
}

/**
 * SuperGrok is high-value plan quota. Only pin it for hard interactive work —
 * not smoke/draft/classify (those should burn free/local first).
 * 2026-08-05 ROI: stop spending SuperGrok on smoke/draft thrash.
 * @param {{ id?: string, modelClass?: string }} task
 */
function taskWantsSuperGrok(task) {
  if (!task) return false;
  const id = String(task.id || '');
  const cls = String(task.modelClass || '');
  if (id === 'code' || id === 'plan' || id === 'judge') return true;
  if (cls === 'coding' || cls === 'frontier') {
    // draft is modelClass coding but is batch content — exclude by id
    return id !== 'draft' && id !== 'smoke' && id !== 'classify' && id !== 'retrieve';
  }
  return false;
}

/**
 * Stale glm pin from pre-SuperGrok days should not defeat SuperGrok preference.
 * @param {string} pin
 */
function isStaleGlmPin(pin) {
  return /^(glm-coding|glm-5\.2|glm-5|glm-47|glm-4\.7)$/i.test(String(pin || ''));
}

/**
 * GLM agent-primary is measured dead for tool use (fleet-health dropDeadModels).
 * Keep available only when operator opts in.
 * @param {NodeJS.ProcessEnv} env
 */
function shouldDropDeadGlm(env = process.env) {
  if (env.HERMES_ALLOW_GLM === '1') return false;
  if (env.HERMES_DROP_DEAD_GLM === '0') return false;
  return true; // default: demote/drop from auto agent primary
}

/** Default dead agent models (tool noncompliance / dropped by fleet-health). */
const DEAD_AGENT_MODELS = Object.freeze(['glm-coding', 'glm-5.2', 'glm-5', 'glm-47', 'glm-turbo']);

/**
 * @param {NodeJS.ProcessEnv} env
 * @returns {Set<string>}
 */
function deadModelSet(env = process.env) {
  return new Set([
    ...DEAD_AGENT_MODELS,
    ...String(env.HERMES_DEAD_MODELS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
  ]);
}

/**
 * Remove dead GLM agent models from auto chains (fleet-health toolCompliance=0).
 * @param {string[]} chain
 * @param {NodeJS.ProcessEnv} env
 */
function applyDeadModelPolicy(chain, env) {
  if (!shouldDropDeadGlm(env)) return [...chain];
  const dead = deadModelSet(env);
  return chain.filter((m) => !dead.has(m));
}

/**
 * @param {{ taskId?: string, taskText?: string, mode?: string, env?: NodeJS.ProcessEnv, probeFailures?: string[] }} opts
 */
function selectModelChain(opts = {}) {
  const env = opts.env || process.env;
  const mode = String(opts.mode || env.HERMES_INFERENCE_MODE || 'normal').toLowerCase();
  if (!MODES.includes(mode)) {
    throw new Error(`Unknown degradation mode: ${mode}`);
  }
  const task = opts.taskId ? getTask(opts.taskId) : classifyTask(opts.taskText || '');
  if (!task) throw new Error('unknown task');

  const failures = new Set((opts.probeFailures || []).map(String));
  let chain = [...task.preferredModels];
  const preferGrok =
    wantsSuperGrok(env) &&
    taskWantsSuperGrok(task) &&
    mode !== 'emergency' &&
    !failures.has('grok-4.5');

  chain = applyDeadModelPolicy(chain, env);

  if (mode === 'degraded') {
    // Drop thrash/metered burn models; KEEP SuperGrok + coding flat + free + local.
    chain = chain.filter((m) => !DEGRADED_DROP.some((re) => re.test(m)));
    if (!chain.includes('deepseek-v4-flash')) chain.push('deepseek-v4-flash');
    if (!chain.includes('hermes-local')) chain.push('hermes-local');
    // Ensure SuperGrok stays available for coding/plan even if registry order shifts.
    if (preferGrok && !chain.includes('grok-4.5')) {
      chain = ['grok-4.5', ...chain];
    }
  } else if (mode === 'emergency') {
    chain = ['hermes-local-fast', 'hermes-local', 'deepseek-v4-flash-free'].filter(Boolean);
  }

  // Operator env pin wins as head of chain except:
  // - emergency (refuse re-pinning a dead glm/kimi primary)
  // - stale glm pin when SuperGrok is preferred for this task (2026-08-05)
  // - dead-GLM pin without HERMES_ALLOW_GLM or FORCE
  // - HERMES_YOLO_FORCE_MODEL=1 always wins
  if (env.HERMES_YOLO_MODEL && mode !== 'emergency') {
    const pin = env.HERMES_YOLO_MODEL;
    const force = env.HERMES_YOLO_FORCE_MODEL === '1';
    // When SuperGrok is preferred for this task, ignore stale glm pins (unless FORCE/ALLOW_GLM).
    const ignoreStaleGlm =
      preferGrok &&
      isStaleGlmPin(pin) &&
      !force &&
      env.HERMES_ALLOW_GLM !== '1' &&
      shouldDropDeadGlm(env);
    if (force || !ignoreStaleGlm) {
      chain = [pin, ...chain.filter((m) => m !== pin)];
    }
  }

  if (preferGrok) {
    chain = ['grok-4.5', ...chain.filter((m) => m !== 'grok-4.5')];
  }

  // Drop known probe failures
  chain = chain.filter((m) => !failures.has(m));
  if (chain.length === 0) {
    chain = mode === 'emergency' ? ['hermes-local'] : ['deepseek-v4-flash', 'hermes-local'];
  }

  let reason;
  if (mode === 'normal') {
    reason = preferGrok
      ? `normal chain for task=${task.id} (SuperGrok preferred)`
      : `normal chain for task=${task.id}`;
  } else {
    reason = `${mode} degradation for task=${task.id} (skipped ${[...failures].join(',') || 'none'}${
      preferGrok ? '; SuperGrok kept' : ''
    })`;
  }
  if (shouldDropDeadGlm(env)) {
    reason += '; dead-GLM demoted';
  }

  return {
    taskId: task.id,
    mode,
    primary: chain[0],
    chain,
    latencyBudgetMs: task.latencyBudgetMs,
    modelClass: task.modelClass,
    businessKpi: task.businessKpi,
    preferSuperGrok: preferGrok,
    deadGlmDemoted: shouldDropDeadGlm(env),
    reason,
    policyVersion: 4,
  };
}

/**
 * Infer mode from live signals (swap pressure, recent fail rates).
 * @param {{ swapUsedPct?: number, recentFailRate?: number, env?: NodeJS.ProcessEnv }} signals
 */
function inferMode(signals = {}) {
  const env = signals.env || process.env;
  if (env.HERMES_INFERENCE_MODE) return String(env.HERMES_INFERENCE_MODE).toLowerCase();
  const swap = Number(signals.swapUsedPct);
  const fail = Number(signals.recentFailRate);
  if ((Number.isFinite(swap) && swap >= 90) || (Number.isFinite(fail) && fail >= 0.6)) {
    return 'emergency';
  }
  if ((Number.isFinite(swap) && swap >= 75) || (Number.isFinite(fail) && fail >= 0.35)) {
    return 'degraded';
  }
  return 'normal';
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  let task = '';
  let mode = 'normal';
  let json = false;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--task') task = argv[++i] || '';
    else if (argv[i] === '--mode') mode = argv[++i] || 'normal';
    else if (argv[i] === '--json') json = true;
  }
  const result = selectModelChain({ taskText: task, mode });
  process.stdout.write(
    json
      ? `${JSON.stringify(result, null, 2)}\n`
      : `${result.primary} ← [${result.chain.join(' → ')}] (${result.reason})\n`,
  );
}

module.exports = {
  MODES,
  DEGRADED_DROP,
  DEAD_AGENT_MODELS,
  wantsSuperGrok,
  taskWantsSuperGrok,
  isStaleGlmPin,
  shouldDropDeadGlm,
  deadModelSet,
  applyDeadModelPolicy,
  selectModelChain,
  inferMode,
};
