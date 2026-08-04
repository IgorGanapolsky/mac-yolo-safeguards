#!/usr/bin/env node
'use strict';

/**
 * Deliberate degradation policy — not accidental cascade thrash.
 *
 * Modes:
 *   normal     — preferred models in order
 *   degraded   — skip frontier/subscription; coding→fast/free/local
 *   emergency  — local/free only (swap thrash, all paid 429)
 *
 *   node tools/inference-eng/degradation.js --task "fix auth" --mode normal --json
 */

const { classifyTask, getTask } = require('./task-registry');

const MODES = Object.freeze(['normal', 'degraded', 'emergency']);

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

  if (mode === 'degraded') {
    // Drop frontier; keep coding/fast/local/free
    chain = chain.filter((m) => !/^grok-4/.test(m));
    if (!chain.includes('deepseek-v4-flash')) chain.push('deepseek-v4-flash');
    if (!chain.includes('hermes-local')) chain.push('hermes-local');
  } else if (mode === 'emergency') {
    chain = ['hermes-local-fast', 'hermes-local', 'deepseek-v4-flash-free'].filter(Boolean);
  }

  // Operator env pin wins as head of chain except in emergency (thrash / total paid outage)
  // where we refuse to re-pin a dead glm/kimi primary.
  if (env.HERMES_YOLO_MODEL && mode !== 'emergency') {
    chain = [env.HERMES_YOLO_MODEL, ...chain.filter((m) => m !== env.HERMES_YOLO_MODEL)];
  }

  // Drop known probe failures
  chain = chain.filter((m) => !failures.has(m));
  if (chain.length === 0) {
    chain = mode === 'emergency' ? ['hermes-local'] : ['deepseek-v4-flash', 'hermes-local'];
  }

  return {
    taskId: task.id,
    mode,
    primary: chain[0],
    chain,
    latencyBudgetMs: task.latencyBudgetMs,
    modelClass: task.modelClass,
    businessKpi: task.businessKpi,
    reason:
      mode === 'normal'
        ? `normal chain for task=${task.id}`
        : `${mode} degradation for task=${task.id} (skipped ${[...failures].join(',') || 'none'})`,
    policyVersion: 2,
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
  process.stdout.write(json ? `${JSON.stringify(result, null, 2)}\n` : `${result.primary} ← [${result.chain.join(' → ')}] (${result.reason})\n`);
}

module.exports = {
  MODES,
  selectModelChain,
  inferMode,
};
