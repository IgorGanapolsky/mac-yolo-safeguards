#!/usr/bin/env node
'use strict';

/**
 * hermes-gateway-router-bridge.js — Active integration between agent-harness-router
 * and hermes-inference-gateway.
 *
 * This bridge (a NEW file) wires the harness-router's budget enforcement, model
 * routing, and discovery capture into the gateway's trace/record pipeline WITHOUT
 * editing the existing hermes-inference-gateway.js (which is owned by T-INFERENCE-GATEWAY-ROI-20260728).
 *
 * Three integrations:
 *   1. bridgeRecord()  — wraps gateway.record(): enforces $10/mo budget, auto-captures
 *      successful patterns, fail-closed on budget exhaustion
 *   2. routeForTask()  — uses harness-router's routeModel() to select the optimal model
 *      before the gateway forwards a request to the upstream provider
 *   3. bridgeSummary() — augments gateway.summary() with harness-router budget + discovery metrics
 *
 * Usage as middleware (require from other tools):
 *   const bridge = require('./hermes-gateway-router-bridge.js');
 *   await bridge.bridgeRecord({ model, provider, route, ... });  // auto-enforces budget
 *   const model = bridge.routeForTask({ category: 'coding', preference: 'cost' });
 *
 * CLI:
 *   node tools/hermes-gateway-router-bridge.js route '{"category":"coding"}'
 *   node tools/hermes-gateway-router-bridge.js record '{"model":"openai/gpt-4.1","provider":"openai","inputTokens":100,"outputTokens":50,"latencyMs":500}'
 *   node tools/hermes-gateway-router-bridge.js summary --since 7d
 *   node tools/hermes-gateway-router-bridge.js health
 */

const path = require('path');
const fs = require('fs');

// ─── Import gateway + harness-router ──────────────────────────────
const GATEWAY = require(path.join(__dirname, 'hermes-inference-gateway.js'));
const ROUTER = require(path.join(__dirname, 'agent-harness-router.js'));

// ─── Bridge: record() with budget enforcement ─────────────────────

/**
 * bridgeRecord — drop-in replacement for gateway.record() that adds:
 *   - BudgetGuard enforcement ($10/mo fail-closed cap)
 *   - Auto-discovery capture on successful patterns
 *   - Cost tracking fed back into the harness-router's spend ledger
 *
 * If the budget is exhausted, the function fails fail-closed (throws).
 * The gateway JSONL trace is still written for observability, but no
 * upstream cost is permitted beyond the cap.
 *
 * @param {Object} recordInput - same format as gateway.makeRecord()
 * @param {Object} opts - { storageDir, ...gateway.record options }
 * @returns {Promise<Object>} the normalized trace record
 */
async function bridgeRecord(recordInput, opts = {}) {
  // Build the normalized record first (same as gateway.record)
  const r = GATEWAY.makeRecord(recordInput);

  // ─── 1. Budget enforcement — fail-closed ───────────
  // BudgetGuard(storageDir, monthlyCapUsd) — storageDir is first arg
  const storageDir = opts.storageDir || ROUTER.DEFAULT_STORAGE_DIR;
  const budget = new ROUTER.BudgetGuard(storageDir, ROUTER.DEFAULT_MONTHLY_CAP_USD);
  const budgetCheck = budget.checkBudget(r.model || '', r.cost_usd || 0);

  if (!budgetCheck.allowed) {
    // Budget exceeded — flag and fail closed
    r.budget_blocked = true;
    r.error = (r.error || '') + ' | BUDGET_EXCEEDED: monthly cap exhausted';
    // Write to gateway trace (for observability) but throw
    const traceFile = GATEWAY.ensureTraceFile(GATEWAY.today());
    fs.appendFileSync(traceFile, JSON.stringify(r) + '\n', 'utf8');
    throw new Error(
      `Budget exceeded: monthly cap of $${budgetCheck.cap} exhausted ` +
      `(spent: $${budgetCheck.spent.toFixed(4)}, remaining: $${budgetCheck.remaining.toFixed(4)}). ` +
      `Use 'node tools/agent-harness-router.js check' to inspect.`
    );
  }

  // ─── 2. Record the spend in the harness-router's ledger ────────
  if (r.cost_usd > 0) {
    const spent = budget.recordSpend({
      modelId: r.model,
      tokenCount: r.input_tokens + r.output_tokens,
      costUsd: r.cost_usd,
    });
    // recordSpend returns false if budget would be exceeded — fail closed
    if (spent === false) {
      r.budget_blocked = true;
      r.error = (r.error || '') + ' | BUDGET_EXCEEDED';
      const traceFile = GATEWAY.ensureTraceFile(GATEWAY.today());
      fs.appendFileSync(traceFile, JSON.stringify(r) + '\n', 'utf8');
      throw new Error(
        `Budget exceeded after recording spend. ` +
        `Use 'node tools/agent-harness-router.js check' to inspect.`
      );
    }
  }

  // ─── 3. Auto-discovery capture on HIGH-QUALITY patterns ────────
  // Criteria: success=true, latency < 2000ms, cost < $0.05 (or $0 for free models)
  const isHighQuality = r.success &&
    r.latency_ms < 2000 &&
    (r.cost_usd === 0 || r.cost_usd < 0.05);

  if (isHighQuality && r.model && r.route) {
    // DiscoveryCapture(storageDir) — takes a single path argument
    const discovery = new ROUTER.DiscoveryCapture(storageDir);
    // Use label as prompt (it's the closest field to a prompt description)
    const promptText = r.label || r.route || r.task_class || '';

    if (promptText && promptText.length > 3 && promptText !== r.task_class) {
      try {
        // DiscoveryCapture.capture() takes { prompt, modelId, taskType, ... }
        discovery.capture({
          prompt: promptText,
          modelId: r.model,
          taskType: r.task_class,
          outcome: 'success',
          tags: ['gateway', 'high-quality', r.provider, r.route].filter(Boolean),
          tokenCount: r.input_tokens + r.output_tokens,
          elapsedMs: r.latency_ms,
        });
      } catch (e) {
        // Silently skip — discovery capture failing shouldn't block recording
        // (e.g., secret detection, input-capture detection)
      }
    }
  }

  // ─── 4. Fall through to the original gateway.record() ──────────
  return GATEWAY.record(recordInput, opts);
}

// ─── Bridge: routeForTask() using harness-router's model registry ──

/**
 * routeForTask — Select the optimal model for a task using the harness-router's
 * MODEL_REGISTRY and routeModel().
 *
 * This is the ACTIVE routing decision point. Before the gateway forwards a
 * request to an upstream provider, call this to get the best model.
 *
 * @param {Object} taskSpec — { category, preference, requiresTools, sensitive }
 * @returns {Object} — route model result with modelId, score, reason, metadata
 */
function routeForTask(taskSpec = {}, opts = {}) {
  let authority = null;
  if (taskSpec.requiresTools === true) {
    if (!taskSpec.authorityRequest) {
      return {
        modelId: null,
        metadata: null,
        blocked: true,
        reason: 'Tool-capable routing requires a deterministic authority request',
      };
    }
    authority = ROUTER.authorizeAction(taskSpec.authorityRequest);
    if (!authority.allowed) {
      return {
        modelId: null,
        metadata: null,
        blocked: true,
        reason: `Action authority blocked: ${authority.reasons.join('; ')}`,
        authority,
      };
    }
  }

  const task = {
    category: taskSpec.category || 'coding',
    requiresTools: taskSpec.requiresTools === true,
    preference: taskSpec.preference || 'balance',
    privacyRequired: taskSpec.sensitive === true
      ? 'local'
      : taskSpec.privacyRequired,
    maxTokens: taskSpec.maxTokens,
    performanceBudget: {
      maxLatencyMs: taskSpec.maxLatencyMs ?? 5000,
      minQuality: taskSpec.minQuality ?? 0.7,
      ...(taskSpec.maxCostPer1kUsd === undefined
        ? {}
        : { maxCostPer1kUsd: taskSpec.maxCostPer1kUsd }),
    },
  };

  // budgetGuard is passed as an option for cost-based filtering
  // NOTE: routeModel reads `preference` from options, NOT from the task object
  const storageDir = opts.storageDir || ROUTER.DEFAULT_STORAGE_DIR;
  const budget = new ROUTER.BudgetGuard(storageDir, ROUTER.DEFAULT_MONTHLY_CAP_USD);

  const result = ROUTER.routeModel(task, { budgetGuard: budget, preference: task.preference });

  return authority ? { ...result, authority } : result;
}

// ─── Bridge: enriched summary ─────────────────────────────────────

/**
 * bridgeSummary — Augment gateway.summary() with harness-router budget + discovery metrics.
 *
 * @param {Object} opts — same as gateway.summary(): { since, by }
 * @returns {string} — JSON string with gateway summary + harness-router metrics
 */
function bridgeSummary(opts = {}) {
  const storageDir = opts.storageDir || ROUTER.DEFAULT_STORAGE_DIR;

  // Get gateway summary (as object)
  let gatewaySummary = {};
  try {
    const gwJson = GATEWAY.summary(opts);
    gatewaySummary = JSON.parse(gwJson);
  } catch (e) {
    gatewaySummary = { raw: GATEWAY.summary(opts) };
  }

  // Get harness-router budget + discovery state
  const budget = new ROUTER.BudgetGuard(storageDir, ROUTER.DEFAULT_MONTHLY_CAP_USD);
  const stats = budget.getStats();

  // Read discovery count
  let discoveryCount = 0;
  const discPath = path.join(storageDir, 'discoveries.jsonl');
  if (fs.existsSync(discPath)) {
    discoveryCount = fs.readFileSync(discPath, 'utf8')
      .split('\n').filter(Boolean).length;
  }

  // Read benchmark result count
  let benchmarkCount = 0;
  const bmPath = path.join(storageDir, 'benchmark-results.jsonl');
  if (fs.existsSync(bmPath)) {
    benchmarkCount = fs.readFileSync(bmPath, 'utf8')
      .split('\n').filter(Boolean).length;
  }

  const enriched = {
    gateway: gatewaySummary,
    harness_router: {
      budget: {
        monthlyCapUsd: stats.monthlyCapUsd,
        spentUsd: stats.spentUsd,
        remainingUsd: stats.remainingUsd,
        billingPeriod: stats.billingPeriod,
        exhausted: stats.exhausted,
      },
      discovery: {
        total: discoveryCount,
        storagePath: storageDir,
      },
      benchmark: {
        results: benchmarkCount,
        storagePath: storageDir,
      },
      model_count: Object.keys(ROUTER.MODEL_REGISTRY).length,
      free_models: Array.from(ROUTER.FREE_MODELS),
    },
  };

  return JSON.stringify(enriched, null, 2);
}

// ─── CLI ──────────────────────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  const cmd = args[0];

  if (!cmd) {
    console.error('Usage: node tools/hermes-gateway-router-bridge.js <command>');
    console.error('Commands:');
    console.error('  route <taskSpec>     Select best model for a task');
    console.error('  record <json>         Record an inference trace (with budget enforcement)');
    console.error('  summary [--since N]   Show gateway + harness-router metrics');
    console.error('  health                Show budget + model health');
    process.exit(1);
  }

  switch (cmd) {
    case 'route': {
      const taskSpec = args[1] ? JSON.parse(args[1]) : {};
      const result = routeForTask(taskSpec);
      console.log(ROUTER.formatRouteResult(result));
      break;
    }
    case 'record': {
      const recordInput = args[1] ? JSON.parse(args[1]) : {};
      bridgeRecord(recordInput).then((r) => {
        console.log(JSON.stringify(r, null, 2));
      }).catch((e) => {
        console.error(e.message);
        process.exit(1);
      });
      break;
    }
    case 'summary': {
      const since = args.includes('--since') ? args[args.indexOf('--since') + 1] : undefined;
      console.log(bridgeSummary(since ? { since } : {}));
      break;
    }
    case 'health': {
      // BudgetGuard(storageDir, monthlyCapUsd)
      const budget = new ROUTER.BudgetGuard(undefined, ROUTER.DEFAULT_MONTHLY_CAP_USD);
      const stats = budget.getStats();
      const result = {
        budget_ok: !stats.exhausted,
        spent: stats.spentUsd,
        cap: stats.monthlyCapUsd,
        remaining: stats.remainingUsd,
        billing_period: stats.billingPeriod,
        model_count: Object.keys(ROUTER.MODEL_REGISTRY).length,
      };
      console.log(JSON.stringify(result, null, 2));
      process.exit(result.budget_ok ? 0 : 1);
    }
    default:
      console.error(`Unknown command: ${cmd}`);
      console.error('Commands: route, record, summary, health');
      process.exit(1);
  }
}

module.exports = {
  bridgeRecord,
  routeForTask,
  bridgeSummary,
  main,
  GATEWAY,
  ROUTER,
};

if (require.main === module) {
  main();
}
