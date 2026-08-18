#!/usr/bin/env node
'use strict';

/**
 * zai-api-budget-guard.js — $10/mo HARD cap for METERED Z.AI / OpenRouter GLM tokens
 *
 * Coding Plan (`api.z.ai/api/coding/paas/v4`) is the already-paid subscription and
 * costs $0 against this budget. Only general API (`/api/paas/v4`) and OpenRouter
 * `z-ai/glm-5.3` spend counts. Fail closed at $10.00/month.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const HERMES_DIR = path.join(os.homedir(), '.hermes');
const DEFAULT_MONTHLY_BUDGET_USD = 10;

function spendFilePath() {
  return process.env.ZAI_API_SPEND_FILE || path.join(HERMES_DIR, 'zai-api-monthly-spend.json');
}

const METERED_HOST_MARKERS = ['api.z.ai/api/paas/v4', 'openrouter.ai', 'z-ai/glm-5.3'];
const CODING_PLAN_MARKERS = ['api.z.ai/api/coding/paas/v4', 'zai-coding-glm', 'glm-coding'];

function monthKey(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function isMeteredRoute(route = {}) {
  const hay = `${route.baseUrl || ''} ${route.provider || ''} ${route.model || ''} ${route.costTier || ''}`.toLowerCase();
  if (CODING_PLAN_MARKERS.some((m) => hay.includes(m.toLowerCase()))) return false;
  if (route.costTier === 'subscription_coding_plan' || route.marginalTokenCostUsd === 0) {
    if (hay.includes('/api/coding/')) return false;
  }
  return METERED_HOST_MARKERS.some((m) => hay.includes(m.toLowerCase())) || route.costTier === 'metered' || route.costTier === 'native_metered';
}

function emptyState(now = new Date()) {
  return {
    month: monthKey(now),
    monthlyBudgetCapUsd: DEFAULT_MONTHLY_BUDGET_USD,
    currentSpentUsd: 0,
    totalInputTokens: 0,
    totalOutputTokens: 0,
    history: [],
  };
}

function loadSpendState() {
  const fresh = emptyState();
  const file = spendFilePath();
  if (!fs.existsSync(file)) return fresh;
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (parsed.month !== fresh.month) return fresh;
    return { ...fresh, ...parsed, month: fresh.month };
  } catch {
    return fresh;
  }
}

function saveSpendState(state) {
  const file = spendFilePath();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, `${JSON.stringify(state, null, 2)}\n`);
}

function getBudgetPacingStatus() {
  const state = loadSpendState();
  const now = new Date();
  const dayOfMonth = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const dailyTarget = state.monthlyBudgetCapUsd / daysInMonth;
  const expectedPacedSpend = Number((dailyTarget * dayOfMonth).toFixed(2));
  const remaining = Math.max(0, state.monthlyBudgetCapUsd - state.currentSpentUsd);
  let pacingStatus = 'GREEN';
  let allowPaid = true;
  let reason = 'Z.AI metered API budget healthy';
  if (state.currentSpentUsd >= state.monthlyBudgetCapUsd) {
    pacingStatus = 'RED';
    allowPaid = false;
    reason = `Monthly Z.AI metered API $${state.monthlyBudgetCapUsd.toFixed(2)} exhausted; Coding Plan + local only`;
  } else if (state.currentSpentUsd > expectedPacedSpend * 1.35) {
    pacingStatus = 'AMBER';
    reason = `Z.AI metered spend $${state.currentSpentUsd.toFixed(2)} ahead of pace $${expectedPacedSpend.toFixed(2)}`;
  }
  return {
    month: state.month,
    dayOfMonth,
    daysInMonth,
    monthlyBudgetCapUsd: state.monthlyBudgetCapUsd,
    currentSpentUsd: Number(state.currentSpentUsd.toFixed(4)),
    remainingBudgetUsd: Number(remaining.toFixed(4)),
    dailyTargetPaceUsd: Number(dailyTarget.toFixed(2)),
    expectedPacedSpendUsd: expectedPacedSpend,
    pacingStatus,
    allowPaid,
    reason,
  };
}

function recordSpend(costUsd, meta = {}) {
  const state = loadSpendState();
  const cost = Number(costUsd) || 0;
  state.currentSpentUsd = Number((state.currentSpentUsd + cost).toFixed(4));
  state.totalInputTokens += Number(meta.tokensIn) || 0;
  state.totalOutputTokens += Number(meta.tokensOut) || 0;
  state.history.push({
    timestamp: new Date().toISOString(),
    costUsd: cost,
    model: meta.model || 'glm-5.3',
    route: meta.route || 'metered',
  });
  if (state.history.length > 200) state.history = state.history.slice(-200);
  saveSpendState(state);
  return getBudgetPacingStatus();
}

function checkGate(estimatedCostUsd = 0.01, route = {}) {
  if (!isMeteredRoute(route) && route.forceMetered !== true) {
    return { allowed: true, pacingStatus: 'GREEN', remainingBudgetUsd: getBudgetPacingStatus().remainingBudgetUsd, reason: 'Coding Plan / $0 route — not counted against $10 API budget' };
  }
  const pacing = getBudgetPacingStatus();
  const cost = Number(estimatedCostUsd) || 0;
  if (!pacing.allowPaid || pacing.currentSpentUsd + cost > pacing.monthlyBudgetCapUsd) {
    return {
      allowed: false,
      pacingStatus: 'RED',
      remainingBudgetUsd: pacing.remainingBudgetUsd,
      reason: `Metered GLM-5.3 call $${cost.toFixed(4)} would exceed $${pacing.monthlyBudgetCapUsd.toFixed(2)}/mo API budget`,
    };
  }
  return { allowed: true, pacingStatus: pacing.pacingStatus, remainingBudgetUsd: pacing.remainingBudgetUsd, reason: pacing.reason };
}

function estimateCostUsd(tokensIn, tokensOut, pricing = { inputPerMillionUsd: 0.9, outputPerMillionUsd: 2.8 }) {
  return (Number(tokensIn) / 1e6) * pricing.inputPerMillionUsd + (Number(tokensOut) / 1e6) * pricing.outputPerMillionUsd;
}

function pickEffort(taskText = '') {
  const t = String(taskText).toLowerCase();
  if (/\b(architecture|security|audit|cyber|refactor entire|wide research)\b/.test(t)) return 'max';
  if (/\b(code|fix|implement|agent|debug|test)\b/.test(t)) return 'high';
  return 'low';
}

function thinkingBody(effort = 'high') {
  const level = ['low', 'high', 'max'].includes(effort) ? effort : 'high';
  return { thinking: { type: 'enabled' }, reasoning_effort: level };
}

function rewriteThinking(payload = {}) {
  const next = { ...payload };
  const thinking = next.thinking || {};
  const disabled = ['disabled', 'false', 'none', 'off'].includes(String(thinking.type || '').toLowerCase());
  const effort = next.reasoning_effort || (disabled ? 'low' : 'high');
  next.thinking = { type: 'enabled' };
  next.reasoning_effort = ['low', 'high', 'max'].includes(String(effort)) ? effort : 'low';
  return next;
}

module.exports = {
  DEFAULT_MONTHLY_BUDGET_USD,
  spendFilePath,
  isMeteredRoute,
  loadSpendState,
  saveSpendState,
  getBudgetPacingStatus,
  recordSpend,
  checkGate,
  estimateCostUsd,
  pickEffort,
  thinkingBody,
  rewriteThinking,
  monthKey,
};

if (require.main === module) {
  const argv = process.argv.slice(2);
  const json = argv.includes('--json');
  if (argv.includes('--status') || argv.includes('--doctor')) {
    const out = getBudgetPacingStatus();
    console.log(json ? JSON.stringify(out, null, 2) : `${out.pacingStatus} spent=$${out.currentSpentUsd} remaining=$${out.remainingBudgetUsd}`);
    process.exit(0);
  }
  if (argv.includes('--check')) {
    const i = argv.indexOf('--cost');
    const gate = checkGate(i >= 0 ? Number(argv[i + 1]) : 0.01, { forceMetered: true });
    console.log(json ? JSON.stringify(gate, null, 2) : `${gate.allowed ? 'ALLOW' : 'DENY'} ${gate.reason}`);
    process.exit(gate.allowed ? 0 : 1);
  }
  console.log('usage: node tools/zai-api-budget-guard.js --status|--check --cost N [--json]');
}
