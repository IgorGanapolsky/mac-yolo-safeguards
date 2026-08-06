#!/usr/bin/env node
/**
 * tools/model-telemetry-logger.js
 *
 * Model Telemetry & Endpoint Drift Logger (Anti-AI-Washing Stack)
 *
 * Logs exact model execution parameters (model ID, provider, reasoning level,
 * token count, latency, workload tag) to detect silent provider endpoint drift
 * and benchmark performance over time.
 *
 * Usage:
 *   node tools/model-telemetry-logger.js --log --model "gemini-2.5-pro" --workload "code-gen" --latency 450 --tokens 520 [--revenue 499 --leads 2 --sales 1]
 *   node tools/model-telemetry-logger.js --summary
 *   node tools/model-telemetry-logger.js --budget-check | --value-audit [--json]
 */

const fs = require('fs');
const path = require('path');

const LOG_FILE = path.join(__dirname, '..', '.hermes', 'model-telemetry-log.jsonl');
const BUDGET_FILE = path.join(__dirname, '..', '.hermes', 'model-token-budgets.json');

// Default per-workflow token budgets (soft = warn, hard = fail/exit 1).
// Override per workflow via BUDGET_FILE: { "workloads": { "code-gen": { "soft": 3000, "hard": 5000 } } }
const DEFAULT_BUDGETS = {
  workloads: {
    'cold-email': { soft: 3000, hard: 5000 },
    'content-draft': { soft: 4000, hard: 8000 },
    'research': { soft: 8000, hard: 12000 },
    'code-gen': { soft: 5000, hard: 10000 },
    'funnel-optimize': { soft: 6000, hard: 10000 },
    'general': { soft: 5000, hard: 10000 },
  },
  // Alerts (soft = warn, hard = fail/exit 1). Applied across the whole system.
  alerts: {
    avgTokensPerRun: { soft: 4000, hard: 8000 }, // per-workflow avg token threshold
    dailyTotalTokens: 50000,                      // total tokens across all workflows per UTC day
  },
};

function loadBudgets() {
  if (fs.existsSync(BUDGET_FILE)) {
    try {
      const user = JSON.parse(fs.readFileSync(BUDGET_FILE, 'utf8'));
      const workloads = { ...DEFAULT_BUDGETS.workloads, ...(user.workloads || {}) };
      const alerts = { ...DEFAULT_BUDGETS.alerts, ...(user.alerts || {}) };
      return { workloads, alerts };
    } catch (e) {
      console.error(`[Telemetry] WARN: invalid budget file ${BUDGET_FILE}: ${e.message}`);
    }
  }
  return DEFAULT_BUDGETS;
}

function ensureLogDir() {
  const dir = path.dirname(LOG_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function logTelemetry(params) {
  ensureLogDir();
  const entry = {
    timestamp: new Date().toISOString(),
    modelId: params.model || 'unknown-model',
    provider: params.provider || 'default',
    workload: params.workload || 'general',
    latencyMs: Number(params.latency) || 0,
    promptTokens: Number(params.promptTokens) || 0,
    completionTokens: Number(params.completionTokens) || 0,
    totalTokens: Number(params.tokens) || (Number(params.promptTokens || 0) + Number(params.completionTokens || 0)),
    reasoningEffort: params.reasoningEffort || 'medium',
    toolsUsed: Array.isArray(params.tools) ? params.tools : [],
    status: params.status || 'success',
    // Value binding (tokens-per-dollar ROI): optional, pass only when known.
    revenueUsd: params.revenue !== undefined ? Number(params.revenue) : undefined,
    leads: params.leads !== undefined ? Number(params.leads) : undefined,
    sales: params.sales !== undefined ? Number(params.sales) : undefined,
  };

  fs.appendFileSync(LOG_FILE, JSON.stringify(entry) + '\n', 'utf8');
  return entry;
}

function readLogs() {
  if (!fs.existsSync(LOG_FILE)) return [];
  const lines = fs.readFileSync(LOG_FILE, 'utf8').trim().split('\n').filter(Boolean);
  return lines.map((line) => {
    try {
      return JSON.parse(line);
    } catch {
      return null;
    }
  }).filter(Boolean);
}

function summarizeTelemetry() {
  const logs = readLogs();
  if (logs.length === 0) {
    return { ok: true, count: 0, models: {}, message: 'No model telemetry logs recorded yet.' };
  }

  const modelStats = {};
  for (const log of logs) {
    const key = log.modelId;
    if (!modelStats[key]) {
      modelStats[key] = { count: 0, totalTokens: 0, totalLatencyMs: 0, errors: 0 };
    }
    modelStats[key].count += 1;
    modelStats[key].totalTokens += log.totalTokens;
    modelStats[key].totalLatencyMs += log.latencyMs;
    if (log.status !== 'success') modelStats[key].errors += 1;
  }

  const summary = {};
  for (const [model, stat] of Object.entries(modelStats)) {
    summary[model] = {
      totalRuns: stat.count,
      avgLatencyMs: Math.round(stat.totalLatencyMs / stat.count),
      avgTokens: Math.round(stat.totalTokens / stat.count),
      errorRatePct: Math.round((stat.errors / stat.count) * 100),
    };
  }

  return { ok: true, totalRuns: logs.length, models: summary };
}

function parseArgs() {
  const args = process.argv.slice(2);
  const parsed = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = args[i + 1];
      if (next && !next.startsWith('--')) {
        parsed[key] = next;
        i++;
      } else {
        parsed[key] = true;
      }
    }
  }
  return parsed;
}

// Enforce hard budget on a single run. Returns { violated: bool, message, exit }.
function checkBudget(workload, totalTokens) {
  const budgets = loadBudgets();
  const cfg = budgets.workloads[workload] || budgets.workloads.general;
  if (!cfg) return { violated: false, message: '', exit: 0 };
  const level = totalTokens > cfg.hard ? 'HARD' : totalTokens > cfg.soft ? 'SOFT' : 'OK';
  if (level === 'OK') return { violated: false, message: '', exit: 0 };
  const msg = `[Telemetry] ${level} BUDGET VIOLATION workload=${workload} tokens=${totalTokens} (soft=${cfg.soft} hard=${cfg.hard})`;
  return {
    violated: true,
    message: msg,
    exit: level === 'HARD' ? 1 : 0, // hard caps fail the run; soft budgets only warn
  };
}

// Audit all logged runs against budgets + value, aggregated per workflow, plus
// system-wide alert thresholds. Returns rows, anyHard, and alert info.
function auditBudgets() {
  const logs = readLogs();
  const budgets = loadBudgets();
  const byWorkload = {};
  const today = new Date().toISOString().slice(0, 10); // UTC date YYYY-MM-DD
  let dailyTokens = 0;
  for (const log of logs) {
    const wl = log.workload || 'general';
    if (!byWorkload[wl]) {
      byWorkload[wl] = { count: 0, totalTokens: 0, softBreaches: 0, hardBreaches: 0, maxTokens: 0, totalRevenue: 0, totalLeads: 0, totalSales: 0 };
    }
    byWorkload[wl].count += 1;
    byWorkload[wl].totalTokens += log.totalTokens;
    byWorkload[wl].maxTokens = Math.max(byWorkload[wl].maxTokens, log.totalTokens || 0);
    byWorkload[wl].totalRevenue += Number(log.revenueUsd) > 0 ? Number(log.revenueUsd) : 0;
    byWorkload[wl].totalLeads += Number(log.leads) > 0 ? Number(log.leads) : 0;
    byWorkload[wl].totalSales += Number(log.sales) > 0 ? Number(log.sales) : 0;
    const cfg = budgets.workloads[wl] || budgets.workloads.general;
    if (cfg && log.totalTokens > cfg.hard) byWorkload[wl].hardBreaches += 1;
    else if (cfg && log.totalTokens > cfg.soft) byWorkload[wl].softBreaches += 1;
    // Daily cap counts only runs logged today (UTC), so a cap isn't tripped by history.
    if (log.timestamp && String(log.timestamp).slice(0, 10) === today) {
      dailyTokens += log.totalTokens;
    }
  }
  const rows = Object.entries(byWorkload).map(([wl, s]) => {
    const tokensPerDollar = s.totalRevenue > 0 ? +(s.totalTokens / s.totalRevenue).toFixed(1) : null;
    const norms = budgets.workloads[wl] || budgets.workloads.general;
    const avgTokens = Math.round(s.totalTokens / Math.max(1, s.count));
    return {
      workload: wl,
      count: s.count,
      totalTokens: s.totalTokens,
      maxTokens: s.maxTokens,
      softBreaches: s.softBreaches,
      hardBreaches: s.hardBreaches,
      avgTokens,
      totalRevenue: s.totalRevenue,
      totalLeads: s.totalLeads,
      totalSales: s.totalSales,
      tokensPerDollar,
      budgetSoft: norms ? norms.soft : null,
      budgetHard: norms ? norms.hard : null,
    };
  }).sort((a, b) => b.totalTokens - a.totalTokens);
  const anyHard = rows.some((r) => r.hardBreaches > 0);

  // Alerts on averages + daily total.
  const alerts = { breaches: [] };
  const avgCfg = budgets.alerts.avgTokensPerRun;
  const dailyCap = budgets.alerts.dailyTotalTokens;
  for (const row of rows) {
    if (avgCfg && row.count >= 2 && row.avgTokens > avgCfg.hard) {
      alerts.breaches.push({ type: 'avg-tokens-hard', workload: row.workload, avgTokens: row.avgTokens, threshold: avgCfg.hard });
      alerts.anyHard = true;
    } else if (avgCfg && row.count >= 2 && row.avgTokens > avgCfg.soft) {
      alerts.breaches.push({ type: 'avg-tokens-soft', workload: row.workload, avgTokens: row.avgTokens, threshold: avgCfg.soft });
    }
  }
  if (dailyCap && dailyTokens > dailyCap) {
    alerts.breaches.push({ type: 'daily-total', tokens: dailyTokens, threshold: dailyCap });
    alerts.anyHard = true;
  }
  return { rows, anyHard: anyHard || !!alerts.anyHard, dailyTokens, alerts };
}

function main() {
  const args = parseArgs();

  if (args.log) {
    const entry = logTelemetry(args);
    const budget = checkBudget(entry.workload, entry.totalTokens);
    if (args.json) {
      console.log(JSON.stringify({ log: entry, budget: { workload: entry.workload, status: budget.violated ? 'VIOLATION' : 'OK', soft: loadBudgets().workloads[entry.workload] || loadBudgets().workloads.general } }, null, 2));
    } else {
      console.log(`[Telemetry] Logged run for model=${entry.modelId} latency=${entry.latencyMs}ms tokens=${entry.totalTokens}`);
      if (budget.message) console.log(budget.message);
    }
    process.exit(budget.exit);
    return;
  }

  if (args['budget-check'] || args['value-audit']) {
    const audit = auditBudgets();
    if (args.json) {
      console.log(JSON.stringify(audit, null, 2));
    } else {
      console.log(`\n💸 Per-Workflow Token Budget Audit`);
      console.log(`===================================`);
      if (audit.rows.length === 0) {
        console.log('No telemetry logged yet.');
      }
      for (const row of audit.rows) {
        const flag = row.hardBreaches > 0 ? ' 🔴' : row.softBreaches > 0 ? ' 🟡' : '';
        const busVal = row.tokensPerDollar !== null
          ? ` | tokens/\$${row.tokensPerDollar} | rev\$${row.totalRevenue} leads${row.totalLeads} sales${row.totalSales}`
          : '';
        console.log(`- ${row.workload}${flag}: ${row.count} runs | ${row.totalTokens} tokens total | avg ${row.avgTokens} | soft⚠${row.softBreaches} hard⛔${row.hardBreaches} | budget soft=${row.budgetSoft} hard=${row.budgetHard}${busVal}`);
      }
      console.log(`\nDaily Total: ${audit.dailyTokens} tokens`);
      if (audit.alerts.breaches.length === 0) {
        console.log('Alerts: none fired.');
      } else {
        for (const b of audit.alerts.breaches) {
          if (b.type === 'daily-total') console.log(`⛔ ALERT daily-total ${b.tokens} > ${b.threshold}`);
          else if (b.type === 'avg-tokens-hard') console.log(`⛔ ALERT avg-tokens-hard ${b.workload} avg ${b.avgTokens} > ${b.threshold}`);
          else if (b.type === 'avg-tokens-soft') console.log(`🟡 ALERT avg-tokens-soft ${b.workload} avg ${b.avgTokens} > ${b.threshold}`);
        }
      }
    }
    process.exit(audit.anyHard ? 1 : 0);
    return;
  }

  const summary = summarizeTelemetry();
  if (args.json) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log(`\n📊 Model Execution & Drift Summary`);
    console.log(`==================================`);
    console.log(`Total Logged Runs: ${summary.totalRuns || 0}`);
    if (summary.models) {
      for (const [model, stats] of Object.entries(summary.models)) {
        console.log(`- Model: ${model}`);
        console.log(`  Runs: ${stats.totalRuns} | Avg Latency: ${stats.avgLatencyMs}ms | Avg Tokens: ${stats.avgTokens} | Errors: ${stats.errorRatePct}%`);
      }
    }
  }
}

if (require.main === module) {
  main();
}

module.exports = { logTelemetry, readLogs, summarizeTelemetry, auditBudgets, checkBudget, loadBudgets };
