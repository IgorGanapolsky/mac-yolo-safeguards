#!/usr/bin/env node
/**
 * hermes-paid-route-watch.js
 * Watches the LiteLLM gateway traffic log for spend patterns the burn/degraded
 * alerts don't cover — born from the 2026-07-12 incident where the fleet burned
 * the ENTIRE $175 OpenRouter balance and the z.ai weekly quota with no warning:
 *
 *   1. PAID-ROUTE VOLUME — per-token routes (NIM nemotron-49b, OpenRouter z-ai/glm)
 *      are meant as fallbacks, not workhorses. When daily calls on them cross a
 *      threshold, the fleet has silently shifted its burn onto a metered bill.
 *   2. GLM 5H-WINDOW PACE — the z.ai Coding Plan allows ~N prompts per rolling
 *      5 hours (tier-dependent) plus a weekly cap (docs.z.ai/devpack/faq, verified
 *      2026-07-12). Warn while there is still quota left to ration, instead of
 *      discovering exhaustion via error 1310.
 *
 * Read-only on the traffic log. State in ~/.hermes/paid-route-watch-state.json
 * (each alert class fires at most once per day). Run by LaunchAgent
 * com.igor.hermes-paid-route-watch (every 30 min). Alert failures never crash it.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const TRAFFIC = process.env.HERMES_TRAFFIC_PATH
  || path.join(os.homedir(), '.hermes', 'litellm-logs', 'traffic.jsonl');
const STATE = process.env.HERMES_PAID_WATCH_STATE_PATH
  || path.join(os.homedir(), '.hermes', 'paid-route-watch-state.json');
const NTFY = process.env.HERMES_NTFY_URL || 'https://ntfy.sh/yolo-guard-fdh8ktuw1vtxb5sb';
// Per-token served-model patterns. NOT the :free OpenRouter tier.
const PAID_PATTERNS = [
  { key: 'nim', re: /nemotron-super-49b/i, label: 'NVIDIA NIM nemotron-49b (per-token)' },
  { key: 'openrouter-paid', re: /^z-ai\//i, label: 'OpenRouter z-ai/glm (per-token)' },
];
const PAID_DAILY_CALL_CAP = Number(process.env.HERMES_PAID_DAILY_CALLS || 150);
// Conservative default: Pro tier is ~400 prompts / 5h and GLM-5.2 burns quota
// at a 2-3x multiplier, so 120 raw calls in 5h is already deep into the window.
const GLM_5H_WARN = Number(process.env.HERMES_GLM_5H_WARN || 120);
const FIVE_HOURS_MS = 5 * 3600 * 1000;

function parseLines(text) {
  const out = [];
  for (const line of String(text).split('\n')) {
    if (!line.trim()) continue;
    try { out.push(JSON.parse(line)); } catch (e) {}
  }
  return out;
}

// ts_end is local time "YYYY-MM-DD hh:mm:ss" (hermes_logger). Records without it
// (other log shapes) can't be time-bucketed and are skipped, same as burn-alert.
function tsMs(r) {
  const t = Date.parse(String(r.ts_end || '').replace(' ', 'T'));
  return Number.isFinite(t) ? t : null;
}

function countPaidToday(records, dayStr, patterns = PAID_PATTERNS) {
  const counts = {};
  for (const p of patterns) counts[p.key] = { calls: 0, tokens: 0, label: p.label };
  for (const r of records) {
    if (String(r.ts_end || '').slice(0, 10) !== dayStr) continue;
    const m = String(r.model || '');
    for (const p of patterns) {
      if (p.re.test(m)) {
        counts[p.key].calls += 1;
        counts[p.key].tokens += Number(r.total_tokens) || 0;
      }
    }
  }
  return counts;
}

function countGlmWindow(records, now, windowMs = FIVE_HOURS_MS) {
  let calls = 0;
  for (const r of records) {
    const t = tsMs(r);
    if (t === null || now - t > windowMs) continue;
    const m = String(r.model || '').toLowerCase();
    // Subscription routes only: glm-5.2 / glm-coding / glm-turbo served names.
    // OpenRouter's z-ai/glm-5.2 is per-token, not subscription quota.
    if (m.startsWith('glm') && r.status === 'success') calls += 1;
  }
  return calls;
}

function decideAlerts({ paid, glm5h, state, dayStr,
                        paidCap = PAID_DAILY_CALL_CAP, glmWarn = GLM_5H_WARN }) {
  const alerts = [];
  const next = { ...state };
  for (const [key, c] of Object.entries(paid)) {
    const latchKey = `paidAlertedDay_${key}`;
    if (c.calls > paidCap && state[latchKey] !== dayStr) {
      alerts.push({
        title: 'Hermes paid-route burn',
        priority: 'urgent',
        body: `${c.label}: ${c.calls} calls / ${(c.tokens / 1e6).toFixed(2)}M tokens today ` +
          `(cap ${paidCap} calls). A per-token fallback has become the workhorse — ` +
          `this is how $175 of OpenRouter credit vanished by 2026-07-12. ` +
          `Check which agent is burning: tail ~/.hermes/litellm-logs/traffic.jsonl`,
      });
      next[latchKey] = dayStr;
    }
  }
  if (glm5h > glmWarn && state.glmWindowAlertedDay !== dayStr) {
    alerts.push({
      title: 'GLM 5h-window pace',
      priority: 'high',
      body: `${glm5h} subscription GLM calls in the last 5h (warn >${glmWarn}). ` +
        `The Coding Plan caps prompts per 5h AND per week; GLM-5.2 burns 2-3x per prompt. ` +
        `Throttle cron agents now or the weekly quota dies again (it stops hard — no top-up).`,
    });
    next.glmWindowAlertedDay = dayStr;
  }
  return { alerts, next };
}

async function pushNtfy(alert, attempts = 3) {
  // Transient "fetch failed" observed live 2026-07-12; a money alert must not
  // die on one bad connection. Bounded retries, never crash the monitor.
  for (let i = 1; i <= attempts; i++) {
    try {
      await fetch(NTFY, {
        method: 'POST',
        headers: { Title: alert.title, Priority: alert.priority, Tags: 'warning,hermes,money' },
        body: alert.body,
      });
      return true;
    } catch (e) {
      console.error(`[paid-route-watch] ntfy push failed (attempt ${i}/${attempts}): ${e.message}`);
      if (i < attempts) await new Promise(r => setTimeout(r, 2000 * i));
    }
  }
  return false;
}

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE, 'utf8')); } catch (e) { return {}; }
}

async function main() {
  let text = '';
  try { text = fs.readFileSync(TRAFFIC, 'utf8'); } catch (e) {
    console.error(`[paid-route-watch] no traffic log at ${TRAFFIC}`);
    return;
  }
  const records = parseLines(text);
  const now = Date.now();
  const dayStr = new Date(now - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
  const paid = countPaidToday(records, dayStr);
  const glm5h = countGlmWindow(records, now);
  const { alerts, next } = decideAlerts({ paid, glm5h, state: loadState(), dayStr });
  for (const a of alerts) {
    const ok = await pushNtfy(a);
    console.log(`[paid-route-watch] ${ok ? 'sent' : 'FAILED'}: ${a.title} — ${a.body}`);
  }
  if (!alerts.length) {
    const summary = Object.values(paid).map(c => `${c.label.split(' ')[0]}=${c.calls}`).join(' ');
    console.log(`[paid-route-watch] ok: ${summary} glm5h=${glm5h}`);
  }
  try {
    fs.mkdirSync(path.dirname(STATE), { recursive: true });
    fs.writeFileSync(STATE, JSON.stringify(next));
  } catch (e) { console.error(`[paid-route-watch] state write failed: ${e.message}`); }
}

if (require.main === module) {
  main();
} else {
  module.exports = { parseLines, countPaidToday, countGlmWindow, decideAlerts };
}
