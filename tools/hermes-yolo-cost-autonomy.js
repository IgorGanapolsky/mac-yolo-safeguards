#!/usr/bin/env node
'use strict';

/**
 * hermes-yolo cost & autonomy audit — fleet-internal hybrid routing.
 *
 * Steal from the "cancel Claude / local-first" episode: the ROI is a
 * repeatable local-first delivery stack, not canceling a vendor.
 *
 *   node tools/hermes-yolo-cost-autonomy.js --task "implement login" [--json]
 *   node tools/hermes-yolo-cost-autonomy.js --audit [--json]
 *   node tools/hermes-yolo-cost-autonomy.js --intent "buy H100 GPUs" [--json]
 *
 * Never: invent $3000/mo savings, buy GPUs speculatively, replace every
 * hosted model, generic local-LLM consulting, ThumbGate paid outreach.
 * Agency cash path remains $149 AHLS. glm-coding stays coding default.
 */

const fs = require('fs');
const path = require('path');
const { selectRoute, ROUTES } = require('./hermes-yolo-route-policy');

const SCHEMA = 'hermes-yolo/cost-autonomy-v1';
const EPISODE_ANECDOTE_USD = 3000;
const AGENCY_CASH_PATH = '149_AHLS';

const CLEAN_ENV = Object.freeze({
  HERMES_YOLO_BACKEND: 'auto',
  HERMES_DROP_DEAD_GLM: '1',
});

const DEFAULT_WORKLOADS = Object.freeze([
  'implement the login form validation',
  'fix typo in README',
  'format the file',
  'run this locally with ollama',
  'are you sure this architecture is right?',
  'analyze the whole large-repo codebase multi-file',
  'Reply with exactly HERMES-YOLO-READY',
]);

const REFUSAL_RULES = Object.freeze([
  {
    id: 'speculative_gpu',
    re: /\b(buy|purchase|order|speculat)\b[\s\S]{0,80}\b(gpu|gpus|a100|h100|h200|b200|mi300|graphics cards?)\b/i,
    message:
      'Hardware is only attractive after sustained workloads or paying managed clients; speculative GPUs kill ROI.',
  },
  {
    id: 'replace_all_hosted',
    re: /replace (every|all|each) (hosted|cloud|claude|openai|anthropic|subscription)|\bcancel (claude|openai|all (apis|models))\b/i,
    message:
      'Hybrid routing is stronger — local for predictable/sensitive/high-volume; premium APIs for hard edge cases. Do not replace every hosted model.',
  },
  {
    id: 'generic_consulting',
    re: /generic local[ -]?llm consulting/i,
    message:
      'Too broad and easy to commoditize. Package a specific operational outcome, not generic local LLM consulting.',
  },
  {
    id: 'invented_3000',
    re: /(\$\s*3,?000|3000(?:\s*usd)?(?:\s*per\s*month|\/mo)?)[\s\S]{0,60}(sav|cut spend|cancel)/i,
    message:
      'Do not invent $3000/mo savings from an episode anecdote. Quote measured receipts only.',
  },
  {
    id: 'thumbgate_paid_outreach',
    re: /thumbgate[\s\S]{0,80}(pilot|outreach|buyer|\$499|\$1,?500)/i,
    message:
      'ThumbGate paid pilot / buyer outreach paused until counsel_clearance. Agency cash path is $149 AHLS.',
  },
  {
    id: 'cancel_claude_wedge_not_sku',
    re: /\bcancel claude\b|\bswitch off claude\b/i,
    message:
      'Episode wedge is not a SKU. Reduce vendor spend via hybrid routing; do not productize cancel-Claude or invent savings.',
  },
]);

const RECOMMENDATIONS = Object.freeze([
  'Keep glm-coding as hermes-yolo interactive coding default (quality lock).',
  'Route routine / explicit-local leaves to qwen3-hermes-tinker:q4 via tinker-yolo.',
  'Keep premium/subscription APIs for hard, long-context, and cyber work.',
  'Do not buy GPUs until sustained load or a paying managed client exists.',
  'Do not replace every hosted model.',
  'Do not quote $3000/mo episode savings as ours.',
  'ThumbGate paid outreach stays paused; agency cash is $149 AHLS.',
]);

function classifyIntent(text) {
  const hay = String(text || '');
  const hits = [];
  for (const rule of REFUSAL_RULES) {
    if (rule.re.test(hay)) hits.push({ id: rule.id, message: rule.message });
  }
  return {
    refused: hits.length > 0,
    refusals: hits,
  };
}

function classifyLane(route) {
  if (!route) return 'subscription';
  if (route.id === 'local_leaf' || route.tier === 'local') return 'local_leaf';
  const blob = `${route.model || ''} ${route.provider || ''} ${route.label || ''} ${route.tier || ''}`;
  if (/openrouter|per-token|moonshot.*meter/i.test(blob) && route.tier !== 'subscription') {
    return 'paid_opt_in';
  }
  if (route.tier === 'subscription' || route.tier === 'free') return 'subscription';
  if (route.tier === 'mixed' && /openrouter/i.test(blob)) return 'paid_opt_in';
  return 'subscription';
}

function classifyTask(task, opts = {}) {
  const env = opts.env || CLEAN_ENV;
  const route = selectRoute({ task, env });
  const lane = classifyLane(route);
  return {
    task,
    lane,
    routeId: route.id,
    model: route.model,
    provider: route.provider,
    tier: route.tier,
    reason: route.reason,
    signals: route.signals,
  };
}

function savingsHonesty() {
  return {
    inventedUsd: null,
    episodeAnecdoteUsd: EPISODE_ANECDOTE_USD,
    quoteEpisodeAsMeasured: false,
    measuredUsd: null,
    note:
      'Do not quote $3000/mo savings. GLM Coding Plan is already-paid $0 marginal. local_leaf is $0 after existing Mac/Ollama. Measure from receipts only.',
  };
}

function eciPosture() {
  return {
    thumbgatePaidOutreach: 'paused',
    counselClearance: false,
    agencyCashPath: AGENCY_CASH_PATH,
  };
}

function loadTasksFile(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(raw);
  if (Array.isArray(parsed)) return parsed.map((t) => String(t));
  if (parsed && Array.isArray(parsed.tasks)) return parsed.tasks.map((t) => String(t));
  throw new Error('--tasks-file must be a JSON array or { tasks: [...] }');
}

function audit(opts = {}) {
  const env = opts.env || CLEAN_ENV;
  const intent = classifyIntent(opts.intent || '');
  let tasks = Array.isArray(opts.tasks) && opts.tasks.length
    ? opts.tasks.map((t) => String(t))
    : DEFAULT_WORKLOADS.slice();
  if (opts.task) tasks = [String(opts.task), ...tasks.filter((t) => t !== opts.task)];

  const workloads = tasks.map((task) => classifyTask(task, { env }));
  const counts = { local_leaf: 0, subscription: 0, paid_opt_in: 0 };
  for (const row of workloads) {
    counts[row.lane] = (counts[row.lane] || 0) + 1;
  }

  return {
    schema: SCHEMA,
    hybrid: true,
    replaceAllHosted: false,
    speculativeGpu: false,
    defaultCodingModel: ROUTES.coding.model,
    localLeafModel: ROUTES.local_leaf.model,
    localLeafBackend: ROUTES.local_leaf.backend,
    savings: savingsHonesty(),
    eci: eciPosture(),
    refused: intent.refused,
    refusals: intent.refusals,
    counts,
    workloads,
    recommendations: RECOMMENDATIONS.slice(),
  };
}

function parseArgs(argv = process.argv.slice(2)) {
  const out = {
    task: '',
    intent: '',
    tasksFile: '',
    audit: false,
    json: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--task') out.task = argv[++i] || '';
    else if (a === '--intent') out.intent = argv[++i] || '';
    else if (a === '--tasks-file') out.tasksFile = argv[++i] || '';
    else if (a === '--audit') out.audit = true;
    else if (a === '--json') out.json = true;
    else if (a === '--help' || a === '-h') out.help = true;
    else if (!a.startsWith('-') && !out.task) out.task = a;
  }
  if (out.tasksFile) out.audit = true;
  if (!out.task && !out.intent && !out.audit) out.audit = true;
  return out;
}

function printHuman(report) {
  if (report.refused) {
    console.log('REFUSED');
    for (const r of report.refusals) console.log(`- ${r.id}: ${r.message}`);
  }
  console.log(`default coding: ${report.defaultCodingModel}`);
  console.log(`local_leaf: ${report.localLeafModel} (${report.localLeafBackend})`);
  console.log(
    `lanes: local_leaf=${report.counts.local_leaf} subscription=${report.counts.subscription} paid_opt_in=${report.counts.paid_opt_in}`,
  );
  console.log(`inventedUsd: ${report.savings.inventedUsd}`);
  console.log(`eci.thumbgatePaidOutreach: ${report.eci.thumbgatePaidOutreach}`);
  for (const row of report.workloads) {
    console.log(`- [${row.lane}] ${row.model} :: ${row.task}`);
  }
}

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    console.log(`Usage: node tools/hermes-yolo-cost-autonomy.js [--task "..."] [--audit] [--intent "..."] [--json]`);
    return 0;
  }
  const tasks = args.tasksFile ? loadTasksFile(path.resolve(args.tasksFile)) : undefined;
  const report = audit({
    task: args.task,
    intent: args.intent || args.task,
    tasks,
    env: args.task && !args.audit ? CLEAN_ENV : CLEAN_ENV,
  });
  // Single-task mode: shrink workloads to that task unless --audit.
  if (args.task && !args.audit && !args.tasksFile) {
    report.workloads = [classifyTask(args.task, { env: CLEAN_ENV })];
    report.counts = { local_leaf: 0, subscription: 0, paid_opt_in: 0 };
    report.counts[report.workloads[0].lane] = 1;
  }
  if (args.json) process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  else printHuman(report);
  return report.refused ? 2 : 0;
}

module.exports = {
  SCHEMA,
  EPISODE_ANECDOTE_USD,
  CLEAN_ENV,
  DEFAULT_WORKLOADS,
  REFUSAL_RULES,
  classifyIntent,
  classifyLane,
  classifyTask,
  audit,
  parseArgs,
  main,
};

if (require.main === module) {
  main().then((code) => {
    process.exitCode = code;
  }).catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
