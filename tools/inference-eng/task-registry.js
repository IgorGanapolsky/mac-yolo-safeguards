#!/usr/bin/env node
'use strict';

/**
 * Inference task registry — decompose agent/product workloads into tasks
 * with explicit I/O, latency, quality, concurrency, and model-class mapping.
 *
 * Latent Space / Baseten inference-eng playbook §1.
 *
 *   node tools/inference-eng/task-registry.js --list
 *   node tools/inference-eng/task-registry.js --classify "fix the auth bug" --json
 */

/** @typedef {'interactive'|'bursty'|'steady'|'batch'} ConcurrencyPattern */
/** @typedef {'frontier'|'coding'|'fast'|'local'|'free'|'vision'} ModelClass */

/**
 * @typedef {object} InferenceTaskSpec
 * @property {string} id
 * @property {string} description
 * @property {string} inputShape
 * @property {string} outputShape
 * @property {number} latencyBudgetMs  p95 wall budget for the model call
 * @property {number} qualityMin  0–1 subjective floor for acceptance
 * @property {ConcurrencyPattern} concurrency
 * @property {ModelClass} modelClass
 * @property {string[]} preferredModels  ordered fallbacks (LiteLLM aliases)
 * @property {string[]} match  lowercase substrings / regex sources
 * @property {string} businessKpi  linked business metric name
 */

/** @type {InferenceTaskSpec[]} */
const TASKS = Object.freeze([
  {
    id: 'route',
    description: 'Pick model / backend for a request',
    inputShape: '{ taskText, env, quotaHints }',
    outputShape: '{ model, provider, reason, taskId }',
    latencyBudgetMs: 200,
    qualityMin: 0.95,
    concurrency: 'interactive',
    modelClass: 'local',
    preferredModels: ['hermes-local-fast'],
    match: ['route policy', 'which model', 'pick model'],
    businessKpi: 'agent_start_success_rate',
  },
  {
    id: 'retrieve',
    description: 'Code/doc retrieval for agent context',
    inputShape: '{ query, k }',
    outputShape: '{ paths[], scores[] }',
    latencyBudgetMs: 3000,
    qualityMin: 0.85,
    concurrency: 'bursty',
    modelClass: 'local',
    preferredModels: ['hermes-local', 'nomic-embed-text'],
    match: ['retrieve', 'search codebase', 'find file', 'where is', 'grepai'],
    businessKpi: 'rag_recall_at_k',
  },
  {
    id: 'plan',
    description: 'Architecture / multi-step plan before code edits',
    inputShape: '{ goal, constraints }',
    outputShape: '{ steps[], risks[] }',
    latencyBudgetMs: 45000,
    qualityMin: 0.9,
    concurrency: 'interactive',
    modelClass: 'frontier',
    // 2026-08-05: demote glm-coding (tool noncompliance); SuperGrok first for hard plan.
    preferredModels: ['grok-4.5', 'kimi-code', 'deepseek-v4-flash', 'glm-coding'],
    match: ['plan', 'architecture', 'design', 'are you sure', 'root cause'],
    businessKpi: 'first_pass_pr_acceptance',
  },
  {
    id: 'code',
    description: 'Primary coding / tool-using agent turn',
    inputShape: '{ prompt, tools, context }',
    outputShape: '{ tool_calls | text, patches }',
    latencyBudgetMs: 120000,
    qualityMin: 0.88,
    concurrency: 'interactive',
    modelClass: 'coding',
    // SuperGrok primary; free/local before dead GLM (glm kept last for ALLOW_GLM opt-in).
    preferredModels: ['grok-4.5', 'kimi-code', 'deepseek-v4-flash', 'hermes-local', 'glm-coding'],
    match: ['fix', 'implement', 'refactor', 'write test', 'patch', 'debug', 'bug'],
    businessKpi: 'ship_cycle_time_hours',
  },
  {
    id: 'smoke',
    description: 'Cheap readiness / exact-marker checks',
    inputShape: '{ marker }',
    outputShape: '{ marker }',
    latencyBudgetMs: 8000,
    qualityMin: 0.99,
    concurrency: 'steady',
    modelClass: 'fast',
    // Never SuperGrok for smoke — save plan quota (ROI 2026-08-05).
    preferredModels: ['kimi-code-fast', 'deepseek-v4-flash-free', 'hermes-local-fast', 'deepseek-v4-flash'],
    match: ['smoke', 'ping', 'hermes-yolo-ready', 'reply with exactly', 'quick check'],
    businessKpi: 'fleet_uptime',
  },
  {
    id: 'draft',
    description: 'Long-form content / outreach draft',
    inputShape: '{ brief, tone, cta }',
    outputShape: '{ markdown }',
    latencyBudgetMs: 90000,
    qualityMin: 0.8,
    concurrency: 'batch',
    modelClass: 'coding',
    // Batch drafts: free/local first; SuperGrok last (workload split ROI).
    preferredModels: ['deepseek-v4-flash', 'hermes-local', 'kimi-code-fast', 'kimi-code', 'grok-4.5'],
    match: ['draft', 'write post', 'newsletter', 'outreach email', 'landing copy'],
    businessKpi: 'content_publish_throughput',
  },
  {
    id: 'classify',
    description: 'Lead qualify / funnel stage / spam triage',
    inputShape: '{ text, schema }',
    outputShape: '{ label, confidence }',
    latencyBudgetMs: 5000,
    qualityMin: 0.85,
    concurrency: 'bursty',
    modelClass: 'fast',
    preferredModels: ['deepseek-v4-flash-free', 'hermes-local-fast', 'kimi-code-fast'],
    match: ['classify', 'qualify lead', 'funnel stage', 'spam', 'intent'],
    businessKpi: 'lead_qualify_precision',
  },
  {
    id: 'judge',
    description: 'Eval / groundedness / LLM-as-judge',
    inputShape: '{ question, answer, context }',
    outputShape: '{ scores, rationale }',
    latencyBudgetMs: 30000,
    qualityMin: 0.9,
    concurrency: 'batch',
    modelClass: 'coding',
    preferredModels: ['glm-coding', 'kimi-code', 'deepseek-v4-flash'],
    match: ['judge', 'eval', 'groundedness', 'score answer', 'grade'],
    businessKpi: 'eval_suite_pass_rate',
  },
  {
    id: 'vision',
    description: 'Image / screenshot understanding',
    inputShape: '{ image, question }',
    outputShape: '{ description, answer }',
    latencyBudgetMs: 20000,
    qualityMin: 0.8,
    concurrency: 'bursty',
    modelClass: 'vision',
    preferredModels: ['glm-vision', 'vision-gemini', 'vision-free'],
    match: ['screenshot', 'image', 'vision', 'what does this ui'],
    businessKpi: 'mobile_qa_triage_speed',
  },
]);

const BY_ID = Object.freeze(Object.fromEntries(TASKS.map((t) => [t.id, t])));

/**
 * @param {string} text
 * @returns {InferenceTaskSpec}
 */
function classifyTask(text) {
  const lower = String(text || '').toLowerCase();
  if (!lower.trim()) return BY_ID.code;
  let best = BY_ID.code;
  let bestScore = 0;
  for (const task of TASKS) {
    let score = 0;
    for (const m of task.match) {
      if (lower.includes(m)) score += m.length;
    }
    if (score > bestScore) {
      bestScore = score;
      best = task;
    }
  }
  return best;
}

function listTasks() {
  return TASKS.map((t) => ({ ...t }));
}

function getTask(id) {
  return BY_ID[id] || null;
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  let json = false;
  let classify = '';
  let list = false;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--json') json = true;
    else if (argv[i] === '--list') list = true;
    else if (argv[i] === '--classify') classify = argv[++i] || '';
  }
  if (list) {
    const out = listTasks();
    process.stdout.write(json ? `${JSON.stringify(out, null, 2)}\n` : out.map((t) => `${t.id}\t${t.modelClass}\t${t.latencyBudgetMs}ms\t${t.description}`).join('\n') + '\n');
    process.exit(0);
  }
  const task = classifyTask(classify || argv.filter((a) => !a.startsWith('--')).join(' '));
  if (json) process.stdout.write(`${JSON.stringify(task, null, 2)}\n`);
  else process.stdout.write(`${task.id} class=${task.modelClass} budget=${task.latencyBudgetMs}ms models=${task.preferredModels.join(',')}\n`);
}

module.exports = {
  TASKS,
  classifyTask,
  listTasks,
  getTask,
};
