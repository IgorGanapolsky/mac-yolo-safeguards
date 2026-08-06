#!/usr/bin/env node
'use strict';

/**
 * Multi-step, multi-model pipelines (compound AI).
 * Each stage is a task id with optional model override from degradation policy.
 *
 *   node tools/inference-eng/pipeline.js --name coding-fix --json
 *   node tools/inference-eng/pipeline.js --list
 */

const { selectModelChain, inferMode, POLICY_VERSION } = require('./degradation');
const { getTask } = require('./task-registry');

/** @type {Record<string, { id: string, description: string, stages: string[], businessKpi: string }>} */
const PIPELINES = Object.freeze({
  'coding-fix': {
    id: 'coding-fix',
    description: 'Retrieve → plan → code (agent engineering loop)',
    stages: ['retrieve', 'plan', 'code'],
    businessKpi: 'ship_cycle_time_hours',
  },
  'content-factory': {
    id: 'content-factory',
    description: 'Classify → draft → judge (affiliate/content funnel)',
    stages: ['classify', 'draft', 'judge'],
    businessKpi: 'content_publish_throughput',
  },
  'lead-qualify': {
    id: 'lead-qualify',
    description: 'Classify lead then cheap follow-up draft',
    stages: ['classify', 'draft'],
    businessKpi: 'lead_qualify_precision',
  },
  'mobile-qa': {
    id: 'mobile-qa',
    description: 'Vision triage then code fix plan',
    stages: ['vision', 'plan', 'code'],
    businessKpi: 'mobile_qa_triage_speed',
  },
  smoke: {
    id: 'smoke',
    description: 'Single-stage readiness',
    stages: ['smoke'],
    businessKpi: 'fleet_uptime',
  },
});

/**
 * Expand a pipeline into stage plans with model chains.
 * @param {string} name
 * @param {{ mode?: string, env?: NodeJS.ProcessEnv, probeFailures?: string[] }} opts
 */
function expandPipeline(name, opts = {}) {
  const pipe = PIPELINES[name];
  if (!pipe) {
    throw new Error(`Unknown pipeline: ${name}. Known: ${Object.keys(PIPELINES).join(', ')}`);
  }
  const mode = opts.mode || inferMode({ env: opts.env });
  const stages = pipe.stages.map((taskId, index) => {
    const task = getTask(taskId);
    const route = selectModelChain({
      taskId,
      mode,
      env: opts.env,
      probeFailures: opts.probeFailures,
    });
    return {
      index,
      taskId,
      description: task ? task.description : taskId,
      latencyBudgetMs: task ? task.latencyBudgetMs : null,
      modelClass: task ? task.modelClass : null,
      primary: route.primary,
      chain: route.chain,
      reason: route.reason,
    };
  });
  const totalBudgetMs = stages.reduce((s, st) => s + (st.latencyBudgetMs || 0), 0);
  return {
    pipelineId: pipe.id,
    description: pipe.description,
    businessKpi: pipe.businessKpi,
    mode,
    stages,
    totalLatencyBudgetMs: totalBudgetMs,
    policyVersion: POLICY_VERSION,
  };
}

function listPipelines() {
  return Object.values(PIPELINES).map((p) => ({
    id: p.id,
    description: p.description,
    stages: p.stages,
    businessKpi: p.businessKpi,
  }));
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  let name = '';
  let json = false;
  let list = false;
  let mode = '';
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--name') name = argv[++i] || '';
    else if (argv[i] === '--json') json = true;
    else if (argv[i] === '--list') list = true;
    else if (argv[i] === '--mode') mode = argv[++i] || '';
  }
  if (list) {
    const out = listPipelines();
    process.stdout.write(json ? `${JSON.stringify(out, null, 2)}\n` : out.map((p) => `${p.id}\t${p.stages.join('→')}\t${p.description}`).join('\n') + '\n');
    process.exit(0);
  }
  const plan = expandPipeline(name || 'coding-fix', { mode: mode || undefined });
  if (json) process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
  else {
    console.log(`pipeline=${plan.pipelineId} mode=${plan.mode} budget=${plan.totalLatencyBudgetMs}ms kpi=${plan.businessKpi}`);
    for (const s of plan.stages) {
      console.log(`  [${s.index}] ${s.taskId} → ${s.primary} (${s.latencyBudgetMs}ms)`);
    }
  }
}

module.exports = {
  PIPELINES,
  expandPipeline,
  listPipelines,
};
