#!/usr/bin/env node
'use strict';

/**
 * api-token-budget-sync.js — automated $10/mo metered-spend sync (2026-08-15).
 *
 * The router's $10/mo gate (tools/openrouter-budget-guard.js) is only as good as
 * the spend state it reads. Before this tool, spend was recorded ONLY via manual
 * `--record` calls — nothing reconciled against real provider billing, so the
 * gate could stay GREEN while OpenRouter actually burned.
 *
 * This sync closes that loop:
 *   1. OpenRouter: GET /api/v1/auth/key returns real cumulative key usage.
 *      We add the DELTA since the last sync to the monthly spend state.
 *      (OpenRouter usage is lifetime; month rollover resets the delta baseline.)
 *   2. Traffic-log audit: counts this-month calls on metered routes (z-ai/*,
 *      NIM nemotron, sakana/fugu, paid gemini) so per-token providers without a
 *      usage API still surface as spend telemetry (cost unknown -> flag).
 *
 * Read-mostly: the only write is the shared spend state (via the budget guard)
 * and the small sync watermark. Never crashes the caller; exits 0 unless --strict.
 *
 * Usage:
 *   node tools/api-token-budget-sync.js            # sync + report
 *   node tools/api-token-budget-sync.js --json     # machine-readable
 *   node tools/api-token-budget-sync.js --strict   # exit 1 if cap reached
 *
 * Run by LaunchAgent com.igor.api-token-budget-sync (every 30 min).
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');

const guard = require('./openrouter-budget-guard');

const HERMES_DIR = path.join(os.homedir(), '.hermes');
const WATERMARK = path.join(HERMES_DIR, 'api-budget-sync-watermark.json');
const TRAFFIC = process.env.HERMES_TRAFFIC_PATH
  || path.join(HERMES_DIR, 'litellm-logs', 'traffic.jsonl');

// Per-token (metered) served-model patterns. Free tiers excluded by design.
const METERED_PATTERNS = [
  { key: 'openrouter-zai', re: /^z-ai\//i },
  { key: 'nim-nemotron', re: /nemotron-super-49b/i },
  { key: 'sakana-fugu', re: /^sakana\/fugu/i },
];

function monthKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function loadWatermark() {
  try {
    const raw = JSON.parse(fs.readFileSync(WATERMARK, 'utf8'));
    if (raw.month === monthKey()) return raw;
  } catch (_) {}
  // New month (or missing): baseline the delta at current usage, spend 0.
  return { month: monthKey(), lastOpenRouterUsage: null, lastSyncAt: null };
}

function saveWatermark(wm) {
  try {
    fs.mkdirSync(HERMES_DIR, { recursive: true });
    fs.writeFileSync(WATERMARK, JSON.stringify(wm, null, 2));
  } catch (_) {}
}

async function syncOpenRouter() {
  const live = await guard.queryOpenRouterLiveKey();
  if (live.error || live.statusCode !== 200 || typeof live.usage !== 'number') {
    return { synced: false, reason: live.error || `auth endpoint status ${live.statusCode}` };
  }
  const wm = loadWatermark();
  let delta = 0;
  if (wm.lastOpenRouterUsage !== null) {
    delta = Math.max(0, live.usage - wm.lastOpenRouterUsage);
  }
  wm.lastOpenRouterUsage = live.usage;
  wm.lastSyncAt = new Date().toISOString();
  saveWatermark(wm);
  if (delta > 0) {
    guard.recordSpend(delta, 'openrouter-sync', 'api-token-budget-sync');
  }
  return { synced: true, liveUsage: live.usage, deltaUsd: Number(delta.toFixed(6)) };
}

function countMeteredCallsThisMonth() {
  const counts = {};
  const month = monthKey(); // "YYYY-MM"; rows compare on the same 7-char prefix
  let scanned = 0;
  try {
    const data = fs.readFileSync(TRAFFIC, 'utf8');
    for (const line of data.split('\n')) {
      if (!line.trim()) continue;
      let d;
      try { d = JSON.parse(line); } catch (_) { continue; }
      if (!d || typeof d !== 'object') continue;
      const ts = String(d.ts_end || d.startTime || '');
      if (ts && ts.slice(0, 7) < month) continue;
      scanned += 1;
      const model = String(d.model || '');
      for (const p of METERED_PATTERNS) {
        if (p.re.test(model)) {
          counts[p.key] = (counts[p.key] || 0) + 1;
          break;
        }
      }
    }
  } catch (_) {}
  return { scanned, counts };
}

async function main() {
  const argv = process.argv.slice(2);
  const jsonMode = argv.includes('--json');
  const strict = argv.includes('--strict');

  const or = await syncOpenRouter();
  const audit = countMeteredCallsThisMonth();
  const budget = guard.getBudgetPacingStatus();

  const report = {
    tool: 'api-token-budget-sync',
    month: budget.month,
    monthlyCapUsd: budget.monthlyBudgetCapUsd,
    currentSpentUsd: budget.currentSpentUsd,
    remainingUsd: budget.remainingBudgetUsd,
    pacingStatus: budget.pacingStatus,
    openrouterSync: or,
    meteredCallsThisMonth: audit.counts,
    trafficRowsScanned: audit.scanned,
  };

  if (jsonMode) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`API token budget sync ${report.month}: spent $${report.currentSpentUsd.toFixed(4)} / $${report.monthlyCapUsd.toFixed(2)} [${report.pacingStatus}]`);
    console.log(`  OpenRouter sync: ${or.synced ? `OK (live usage $${or.liveUsage}, delta +$${or.deltaUsd})` : `SKIPPED (${or.reason})`}`);
    const metered = Object.entries(audit.counts);
    console.log(`  Metered-route calls this month: ${metered.length ? metered.map(([k, v]) => `${k}=${v}`).join(', ') : 'none'}`);
  }

  if (strict && !budget.allowPaid) process.exit(1);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(`api-token-budget-sync error: ${err.message}`);
    process.exit(0); // never crash the LaunchAgent; state survives
  });
}

module.exports = { syncOpenRouter, countMeteredCallsThisMonth, loadWatermark, saveWatermark, monthKey };
