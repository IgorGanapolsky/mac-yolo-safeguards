#!/usr/bin/env node
/**
 * hermes-burn-alert.js
 * Watches the LiteLLM gateway traffic log (~/.hermes/litellm-logs/traffic.jsonl)
 * and pushes a phone notification via ntfy when:
 *   1. BURN — today's total tokens cross HERMES_BURN_DAILY_TOKENS (default 8M).
 *      One 27.8M-token day (2026-07-06) exhausted the z.ai GLM WEEKLY quota with
 *      zero warning; this fires at ~30% of that so there's time to react.
 *   2. DEGRADED — recent GLM-family calls are all failing (quota 429 / outage),
 *      meaning agents are being served by weaker local fallbacks that can
 *      confabulate. Same heuristic as hermes-yolo-wrapper's detectDegradedRoute.
 *
 * Read-only on the traffic log. State in ~/.hermes/burn-alert-state.json
 * (burn alerts once per day; degraded re-alerts at most every 6h).
 * Run by LaunchAgent com.igor.hermes-burn-alert (every 30 min).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const TRAFFIC = process.env.HERMES_TRAFFIC_PATH
  || path.join(os.homedir(), '.hermes', 'litellm-logs', 'traffic.jsonl');
const STATE = process.env.HERMES_BURN_STATE_PATH
  || path.join(os.homedir(), '.hermes', 'burn-alert-state.json');
const NTFY = process.env.HERMES_NTFY_URL || 'https://ntfy.sh/yolo-guard-fdh8ktuw1vtxb5sb';
const DAILY_TOKEN_CAP = Number(process.env.HERMES_BURN_DAILY_TOKENS || 8_000_000);
const DEGRADED_REALERT_MS = Number(process.env.HERMES_DEGRADED_REALERT_MS || 6 * 3600 * 1000);

function parseLines(text) {
  const out = [];
  for (const line of String(text).split('\n')) {
    if (!line.trim()) continue;
    try { out.push(JSON.parse(line)); } catch (e) {}
  }
  return out;
}

// Tokens are logged per-call on total_tokens; ts_end is local time "YYYY-MM-DD hh:mm:ss".
function summarizeDay(records, dayStr) {
  let totalTokens = 0;
  const byModel = {};
  for (const r of records) {
    if (String(r.ts_end || '').slice(0, 10) !== dayStr) continue;
    const t = Number(r.total_tokens) || 0;
    totalTokens += t;
    const m = String(r.model || '?');
    byModel[m] = (byModel[m] || 0) + t;
  }
  return { totalTokens, byModel };
}

// Same signal as hermes-yolo-wrapper detectDegradedRoute: newest GLM outcome
// failed AND failures dominate the recent window.
function detectDegraded(records) {
  const glm = records.filter(r => String(r.model || '').toLowerCase().includes('glm')).slice(-5);
  const fails = glm.filter(r => r.status === 'failure').length;
  return glm.length >= 3 && glm[glm.length - 1].status === 'failure' && fails >= 3;
}

function decideAlerts({ summary, degraded, state, now, dayStr, cap = DAILY_TOKEN_CAP,
                        degradedRealertMs = DEGRADED_REALERT_MS }) {
  const alerts = [];
  const next = { ...state };
  if (summary.totalTokens > cap && state.burnAlertedDay !== dayStr) {
    const top = Object.entries(summary.byModel).sort((a, b) => b[1] - a[1])[0];
    alerts.push({
      title: 'Hermes token burn',
      priority: 'high',
      body: `${(summary.totalTokens / 1e6).toFixed(1)}M tokens today (cap ${(cap / 1e6).toFixed(0)}M). ` +
        `Top model: ${top ? `${top[0]} ${(top[1] / 1e6).toFixed(1)}M` : 'n/a'}. ` +
        `A 27.8M day killed the GLM weekly quota on 2026-07-06 — check for a runaway agent.`,
    });
    next.burnAlertedDay = dayStr;
  }
  if (degraded && (!state.degradedAlertedAt || now - state.degradedAlertedAt > degradedRealertMs)) {
    alerts.push({
      title: 'Hermes DEGRADED mode',
      priority: 'high',
      body: 'Cloud GLM is failing (quota/outage) — agents are answering from weaker local fallbacks ' +
        'that may overstate what they did. Check: tail ~/.hermes/litellm-logs/traffic.jsonl',
    });
    next.degradedAlertedAt = now;
  }
  if (!degraded) next.degradedAlertedAt = null;
  return { alerts, next };
}

async function pushNtfy(alert) {
  // Best-effort: an alerting failure must never crash the monitor.
  try {
    await fetch(NTFY, {
      method: 'POST',
      headers: { Title: alert.title, Priority: alert.priority, Tags: 'warning,hermes' },
      body: alert.body,
    });
    return true;
  } catch (e) {
    console.error(`[burn-alert] ntfy push failed: ${e.message}`);
    return false;
  }
}

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch (e) { return {}; }
}

async function main() {
  let text = '';
  try { text = fs.readFileSync(TRAFFIC, 'utf8'); } catch (e) {
    console.error(`[burn-alert] no traffic log at ${TRAFFIC}`);
    return;
  }
  const records = parseLines(text);
  const now = Date.now();
  const dayStr = new Date(now - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const summary = summarizeDay(records, dayStr);
  const degraded = detectDegraded(records);
  const { alerts, next } = decideAlerts({ summary, degraded, state: loadState(), now, dayStr });
  for (const a of alerts) {
    const ok = await pushNtfy(a);
    console.log(`[burn-alert] ${ok ? 'sent' : 'FAILED'}: ${a.title} — ${a.body}`);
  }
  if (!alerts.length) {
    console.log(`[burn-alert] ok: ${(summary.totalTokens / 1e6).toFixed(2)}M tokens today, degraded=${degraded}`);
  }
  try {
    fs.mkdirSync(path.dirname(STATE), { recursive: true });
    fs.writeFileSync(STATE, JSON.stringify(next));
  } catch (e) { console.error(`[burn-alert] state write failed: ${e.message}`); }
}

if (require.main === module) {
  main();
} else {
  module.exports = { parseLines, summarizeDay, detectDegraded, decideAlerts };
}
