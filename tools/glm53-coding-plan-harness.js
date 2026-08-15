#!/usr/bin/env node
'use strict';

/**
 * glm53-coding-plan-harness.js — GLM-5.3 Z.ai Coding Plan & Smart Budget Controller
 * ---------------------------------------------------------------------------------
 * Manages GLM-5.3 on the Z.ai Coding Plan with a strict $10/mo API token budget.
 *
 * Core Capabilities:
 *   1. GLM-5.3 Frontier Model Gateway (1M context window, cyber + agentic capabilities)
 *   2. Smart $10/mo Token Budget Controller with daily pacing ($0.33/day target)
 *   3. Intelligent fallback to local $0 models when budget thresholds are reached
 *   4. Zero-credential leakage & macOS Keychain authentication
 *
 * Usage:
 *   node tools/glm53-coding-plan-harness.js --doctor
 *   node tools/glm53-coding-plan-harness.js --budget
 *   node tools/glm53-coding-plan-harness.js --doctor --json
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const HERMES_DIR = path.join(os.homedir(), '.hermes');
const HERMES_ENV = process.env.HERMES_ENV_PATH || path.join(HERMES_DIR, '.env');
const HERMES_CONFIG = process.env.HERMES_CONFIG_PATH || path.join(HERMES_DIR, 'config.yaml');
const SPEND_TRACKER_FILE = path.join(HERMES_DIR, 'glm-monthly-spend.json');

const MONTHLY_BUDGET_USD = 10.00;
const GLM53_INPUT_PER_M = 0.90;
const GLM53_OUTPUT_PER_M = 2.80;

function getCurrentMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function trackerPath(options = {}) {
  return options.trackerPath || process.env.GLM53_SPEND_TRACKER_FILE || SPEND_TRACKER_FILE;
}

function loadMonthlySpendData(options = {}) {
  const currentMonth = getCurrentMonthKey();
  let data = {
    month: currentMonth,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    totalCostUsd: 0.0,
    history: [],
  };

  const file = trackerPath(options);
  if (fs.existsSync(file)) {
    try {
      const raw = fs.readFileSync(file, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed.month === currentMonth) {
        data = parsed;
      }
    } catch (_) {}
  }

  return data;
}

function saveMonthlySpendData(data, options = {}) {
  const file = trackerPath(options);
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  fs.writeFileSync(file, JSON.stringify(data, null, 2), { encoding: 'utf8', mode: 0o600 });
}

function recordUsage(inputTokens = 0, outputTokens = 0, taskDesc = 'agent-task', options = {}) {
  if (options.providerConfirmed !== true) {
    throw new Error('GLM53_USAGE_UNCONFIRMED: usage may only be recorded from a successful provider receipt');
  }
  const data = loadMonthlySpendData(options);
  const cost = (inputTokens / 1_000_000) * GLM53_INPUT_PER_M + (outputTokens / 1_000_000) * GLM53_OUTPUT_PER_M;

  data.totalInputTokens += inputTokens;
  data.totalOutputTokens += outputTokens;
  data.totalCostUsd = Number((data.totalCostUsd + cost).toFixed(4));
  data.history.push({
    timestamp: new Date().toISOString(),
    inputTokens,
    outputTokens,
    costUsd: Number(cost.toFixed(4)),
    task: taskDesc.slice(0, 80),
  });

  // Keep last 100 entries in history
  if (data.history.length > 100) {
    data.history = data.history.slice(-100);
  }

  saveMonthlySpendData(data, options);
  return data;
}

function recordConfirmedCost(costUsd, taskDesc = 'agent-task', options = {}) {
  if (options.providerConfirmed !== true) {
    throw new Error('GLM53_USAGE_UNCONFIRMED: cost may only be recorded after a successful provider response');
  }
  const cost = Number(costUsd);
  if (!Number.isFinite(cost) || cost < 0) throw new Error('GLM53_COST_INVALID');
  const authorization = authorizeEstimatedCost(cost, options);
  if (!authorization.allowed) throw new Error(authorization.reason);
  const data = loadMonthlySpendData(options);
  data.totalCostUsd = Number((data.totalCostUsd + cost).toFixed(4));
  data.history.push({
    timestamp: new Date().toISOString(),
    inputTokens: 0,
    outputTokens: 0,
    costUsd: Number(cost.toFixed(4)),
    accountingMode: options.accountingMode || 'conservative_request_estimate',
    task: taskDesc.slice(0, 80),
  });
  if (data.history.length > 100) data.history = data.history.slice(-100);
  saveMonthlySpendData(data, options);
  return data;
}

function getBudgetPacingStatus(options = {}) {
  const data = loadMonthlySpendData(options);
  const now = new Date();
  const dayOfMonth = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();

  const targetDailyBudget = MONTHLY_BUDGET_USD / daysInMonth;
  const expectedPacedSpendToDate = targetDailyBudget * dayOfMonth;
  const remainingBudget = Math.max(0, MONTHLY_BUDGET_USD - data.totalCostUsd);

  let status = 'GREEN';
  let allowPaidCloud = true;
  let reason = 'Budget healthy and on pacing track';

  if (data.totalCostUsd >= MONTHLY_BUDGET_USD) {
    status = 'RED';
    allowPaidCloud = false;
    reason = 'Monthly $10 budget ceiling reached; routing automatically throttled to $0 local models';
  } else if (data.totalCostUsd > expectedPacedSpendToDate * 1.35) {
    status = 'AMBER';
    allowPaidCloud = true;
    reason = `Spend ($${data.totalCostUsd}) is pacing ahead of monthly target ($${expectedPacedSpendToDate.toFixed(2)}); reserve GLM-5.3 for high-value tasks only`;
  }

  return {
    month: data.month,
    dayOfMonth,
    daysInMonth,
    monthlyBudgetCapUsd: MONTHLY_BUDGET_USD,
    currentSpentUsd: Number(data.totalCostUsd.toFixed(4)),
    remainingBudgetUsd: Number(remainingBudget.toFixed(4)),
    expectedPacedSpendUsd: Number(expectedPacedSpendToDate.toFixed(2)),
    totalInputTokens: data.totalInputTokens,
    totalOutputTokens: data.totalOutputTokens,
    pacingStatus: status,
    allowPaidCloud,
    reason,
  };
}

function authorizeEstimatedCost(estimatedCostUsd, options = {}) {
  const estimate = Number(estimatedCostUsd);
  if (!Number.isFinite(estimate) || estimate < 0) {
    throw new Error('GLM53_BUDGET_INVALID_ESTIMATE');
  }
  const budget = getBudgetPacingStatus(options);
  const allowed = budget.allowPaidCloud && estimate <= budget.remainingBudgetUsd;
  return {
    allowed,
    estimatedCostUsd: estimate,
    remainingBudgetUsd: budget.remainingBudgetUsd,
    reason: allowed
      ? 'estimated request remains within the monthly cap'
      : 'GLM53_MONTHLY_BUDGET_BLOCK: estimated request would exceed the $10 monthly cap',
  };
}

function checkApiKeyPresent() {
  if (fs.existsSync(HERMES_ENV)) {
    try {
      const envContent = fs.readFileSync(HERMES_ENV, 'utf8');
      return /^Z_AI_API_KEY=\S+/m.test(envContent);
    } catch (_) {}
  }
  return false;
}

function probeProvider(options = {}) {
  const runner = options.runner || spawnSync;
  const marker = options.marker || `GLM53_PROBE_${Date.now()}`;
  const result = runner(process.execPath, [path.join(__dirname, '..', 'hermes-yolo-wrapper.js'), '-z', `Return exactly: ${marker}`], {
    cwd: path.join(__dirname, '..'),
    encoding: 'utf8',
    timeout: options.timeoutMs || 120000,
    env: {
      ...process.env,
      HERMES_YOLO_PROVIDER: 'custom:zai-coding-glm',
      HERMES_YOLO_MODEL: 'glm-5.3',
    },
  });
  const output = `${result.stdout || ''}\n${result.stderr || ''}`;
  const providerError = /HTTP\s+(?:401|403)|token expired|incorrect|authentication/i.test(output);
  const markerReturned = output.includes(marker);
  return {
    ok: result.status === 0 && markerReturned && !providerError,
    exitCode: result.status,
    markerReturned,
    providerError,
    error: providerError ? 'provider_authentication_failed' : markerReturned ? null : 'exact_marker_missing',
  };
}

function runDoctor(options = {}) {
  const keyPresent = checkApiKeyPresent();
  const configPresent = fs.existsSync(HERMES_CONFIG);
  let providerConfigured = false;

  if (configPresent) {
    try {
      const cfg = fs.readFileSync(HERMES_CONFIG, 'utf8');
      providerConfigured = cfg.includes('zai-coding-glm') && cfg.includes('glm-5.3');
    } catch (_) {}
  }

  const budget = getBudgetPacingStatus(options);
  const probe = options.probe ? probeProvider(options) : null;
  const authenticated = probe ? probe.ok : false;

  return {
    engine: 'GLM-5.3 Z.ai Coding Plan & Smart Budget Harness',
    version: '5.3.0',
    model: 'glm-5.3',
    endpoint: 'https://api.z.ai/api/coding/paas/v4',
    contextLength: 1000000,
    maxOutputTokens: 128000,
    hermesProviderConfigured: providerConfigured,
    monthlyBudgetCapUsd: MONTHLY_BUDGET_USD,
    budgetPacing: budget,
    authenticated,
    providerProbe: probe,
    status: !keyPresent
      ? 'REQUIRES_KEY'
      : !providerConfigured || !budget.allowPaidCloud
        ? 'READY_LOCAL_FALLBACK'
        : authenticated
          ? 'HEALTHY'
          : 'CONFIGURED_UNVERIFIED',
  };
}

async function main() {
  const argv = process.argv.slice(2);
  const jsonMode = argv.includes('--json');

  if (argv.includes('--doctor')) {
    const doc = runDoctor({ probe: argv.includes('--probe') });
    if (jsonMode) {
      console.log(JSON.stringify(doc, null, 2));
    } else {
      console.log(`\n🤖 GLM-5.3 Z.ai Coding Plan Status: ${doc.status}`);
      console.log(`   Model: ${doc.model} (1M context length)`);
      console.log(`   Endpoint: ${doc.endpoint}`);
      console.log(`   Budget: $${doc.budgetPacing.currentSpentUsd} / $${doc.budgetPacing.monthlyBudgetCapUsd} (${doc.budgetPacing.pacingStatus})`);
      console.log(`   Pacing: ${doc.budgetPacing.reason}\n`);
    }
    if (argv.includes('--probe') && !doc.authenticated) process.exitCode = 2;
    return;
  }

  if (argv.includes('--budget')) {
    const budget = getBudgetPacingStatus();
    if (jsonMode) {
      console.log(JSON.stringify(budget, null, 2));
    } else {
      console.log(`\n📊 GLM-5.3 Monthly API Token Budget Report (${budget.month})`);
      console.log(`   Budget Ceiling:   $${budget.monthlyBudgetCapUsd.toFixed(2)} / month`);
      console.log(`   Total Spent:      $${budget.currentSpentUsd.toFixed(4)}`);
      console.log(`   Remaining Budget: $${budget.remainingBudgetUsd.toFixed(4)}`);
      console.log(`   Pacing Status:    [${budget.pacingStatus}] ${budget.reason}`);
      console.log(`   Day of Month:     Day ${budget.dayOfMonth} / ${budget.daysInMonth}\n`);
    }
    return;
  }

  console.log('Usage: node tools/glm53-coding-plan-harness.js [--doctor] [--budget] [--json]');
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = {
  getBudgetPacingStatus,
  authorizeEstimatedCost,
  probeProvider,
  recordUsage,
  recordConfirmedCost,
  runDoctor,
  loadMonthlySpendData,
  saveMonthlySpendData,
  MONTHLY_BUDGET_USD,
};
