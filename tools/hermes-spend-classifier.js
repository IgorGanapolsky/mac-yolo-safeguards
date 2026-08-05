#!/usr/bin/env node
'use strict';

/**
 * hermes-spend-classifier.js — OpenRouter "Classifiers" steal (local, free)
 *
 * Newsletter: "Tag every generation … by department, task type, or agent,
 * then filter your logs and group Activity analytics by the result."
 *
 * We do NOT call OpenRouter Activity API. We attach classifier tags to route
 * receipts so LiteLLM / economic-router / yolo logs can answer "which agent
 * caused the spike?" without paid analytics.
 *
 * Usage:
 *   node tools/hermes-spend-classifier.js --task "fix pair" --agent grok --json
 *   node tools/hermes-spend-classifier.js --aggregate path/to/receipts.jsonl --json
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { classifyTaskType, autoRoute } = require('./hermes-yolo-auto-router');

const DEFAULT_RECEIPT =
  process.env.HERMES_SPEND_RECEIPT_PATH ||
  path.join(os.homedir(), '.hermes', 'spend-classifier-receipts.jsonl');

/**
 * Build classifier tags for a generation / route decision.
 */
function classifySpend(options = {}) {
  const task = options.task || '';
  const agent = String(options.agent || process.env.HERMES_AGENT_ID || 'unknown').slice(0, 64);
  const department = String(options.department || process.env.HERMES_DEPARTMENT || 'fleet').slice(0, 64);
  const route = options.route || autoRoute({
    task,
    tradeoff: options.tradeoff,
    agent,
    env: options.env || process.env,
  });
  const taskType = route.taskType || classifyTaskType(task).id;

  const tags = {
    schema: 'hermes-spend-classifier/v1',
    at: new Date().toISOString(),
    agent,
    department,
    task_type: taskType,
    tradeoff: route.costQualityTradeoff || options.tradeoff || 'balanced',
    model: route.model || options.model || null,
    turns: route.turnBudget?.turns ?? options.turns ?? null,
    route_id: options.routeId || route.taskType || null,
    // Never store secrets
  };

  // Dimensional keys for grouping (OR Activity-style)
  tags.dimensions = {
    by_agent: agent,
    by_task_type: taskType,
    by_model: tags.model,
    by_tradeoff: tags.tradeoff,
    by_department: department,
  };

  return { ok: true, tags, routeSummary: route.ok === false ? null : {
    model: route.model,
    chain: route.chain,
    reason: route.reason,
  } };
}

function appendReceipt(tags, filePath = DEFAULT_RECEIPT) {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  fs.appendFileSync(filePath, `${JSON.stringify(tags)}\n`, 'utf8');
  return { ok: true, path: filePath };
}

/**
 * Aggregate receipt lines: counts by agent / task_type / model.
 */
function aggregateReceipts(filePath = DEFAULT_RECEIPT, options = {}) {
  if (!fs.existsSync(filePath)) {
    return { ok: true, path: filePath, total: 0, by_agent: {}, by_task_type: {}, by_model: {}, spikes: [] };
  }
  const lines = fs.readFileSync(filePath, 'utf8').split(/\n/).filter(Boolean);
  const limit = options.limit || lines.length;
  const slice = lines.slice(-limit);
  const by_agent = {};
  const by_task_type = {};
  const by_model = {};
  let total = 0;

  for (const line of slice) {
    let row;
    try {
      row = JSON.parse(line);
    } catch {
      continue;
    }
    total += 1;
    const a = row.agent || row.dimensions?.by_agent || 'unknown';
    const t = row.task_type || row.dimensions?.by_task_type || 'unknown';
    const m = row.model || row.dimensions?.by_model || 'unknown';
    by_agent[a] = (by_agent[a] || 0) + 1;
    by_task_type[t] = (by_task_type[t] || 0) + 1;
    by_model[m] = (by_model[m] || 0) + 1;
  }

  // Spike = agent share > 40% when total >= 5
  const spikes = [];
  if (total >= 5) {
    for (const [agent, count] of Object.entries(by_agent)) {
      const share = count / total;
      if (share >= 0.4) {
        spikes.push({ agent, count, share: Math.round(share * 1000) / 1000, kind: 'agent_volume' });
      }
    }
  }

  return {
    ok: true,
    path: filePath,
    total,
    by_agent,
    by_task_type,
    by_model,
    spikes,
  };
}

function parseArgs(argv) {
  const args = { json: true, task: '', agent: null, aggregate: null, record: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--task') args.task = argv[++i] || '';
    else if (a === '--agent') args.agent = argv[++i] || '';
    else if (a === '--department') args.department = argv[++i] || '';
    else if (a === '--tradeoff') args.tradeoff = argv[++i] || '';
    else if (a === '--aggregate') args.aggregate = argv[++i] || DEFAULT_RECEIPT;
    else if (a === '--record') args.record = true;
    else if (a === '--json') args.json = true;
    else if (a === '--help' || a === '-h') args.help = true;
  }
  return args;
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    console.log(`Usage:
  node tools/hermes-spend-classifier.js --task "..." [--agent NAME] [--record] [--json]
  node tools/hermes-spend-classifier.js --aggregate [path] [--json]`);
    process.exit(0);
  }

  let out;
  if (args.aggregate != null) {
    out = aggregateReceipts(args.aggregate === true ? DEFAULT_RECEIPT : args.aggregate);
  } else {
    out = classifySpend({
      task: args.task,
      agent: args.agent,
      department: args.department,
      tradeoff: args.tradeoff,
    });
    if (args.record && out.tags) {
      appendReceipt(out.tags);
      out.recorded = true;
      out.receiptPath = DEFAULT_RECEIPT;
    }
  }

  process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
  process.exit(out && out.ok === false ? 1 : 0);
}

if (require.main === module) {
  main();
}

module.exports = {
  DEFAULT_RECEIPT,
  classifySpend,
  appendReceipt,
  aggregateReceipts,
};
