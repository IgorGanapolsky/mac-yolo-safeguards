#!/usr/bin/env node
'use strict';

/**
 * Revenue senses tick — a 24/7 heartbeat that reports only when something CHANGES.
 *
 * Two things went unnoticed for days because nothing was watching them:
 *   - 2026-07-30: landingViewsToday=12 with signInClicksToday=0. Traffic arrived and
 *     converted nothing, across six campaigns, and no one saw it until it was read by hand.
 *   - 2026-07-29: every send from the domain alias silently failed. Six personalized
 *     emails to named humans were recorded as sent and never delivered.
 *
 * Design constraint that matters more than the feature: this repo has a documented
 * quota incident from crashlooping crons (2026-07-28) and a standing rule that a failing
 * cron gets disabled until fixed. So this tick is deliberately cheap and quiet — two HTTP
 * reads, no build, no model call — and it prints NOTHING on an unchanged state. A watcher
 * that shouts every tick gets muted, and a muted watcher protects nothing.
 *
 *   node tools/revenue-senses-tick.js            # tick; print only on change
 *   node tools/revenue-senses-tick.js --always   # print state even when unchanged
 *   node tools/revenue-senses-tick.js --json
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const HEALTH_URL = 'https://thumbgate.app/api/health';
const LEDGER = path.join(os.homedir(), '.hermes/receipts/outreach/delivery-ledger.json');
const STATE = path.join(os.homedir(), '.hermes/receipts/tinker-brain/senses-tick-state.json');
const LOG = path.join(os.homedir(), '.hermes/receipts/tinker-brain/senses-tick.jsonl');

// Cloudflare 403s a default user-agent — this is load-bearing, not cosmetic.
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36';

const WATCHED = [
  'landingViewsToday',
  'signInClicksToday',
  'cloudContinuityClicksToday',
  'pairingsLast24h',
  'checkoutCreatedLast24h',
  'usersTotal',
  'paidOrganizationsTotal',
];

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; }
}

function senderSummary(ledger) {
  if (!ledger) return { present: false };
  const aliases = ledger.aliases || {};
  let usable = 0;
  let broken = 0;
  for (const state of Object.values(aliases)) {
    if (!state || typeof state !== 'object') continue;
    const ok = state.lastSuccessAt;
    const fail = state.lastFailureAt;
    const cleared = Boolean(ok) && (!fail || String(ok) > String(fail));
    if (cleared) usable += 1; else broken += 1;
  }
  return {
    present: true,
    usableSenders: usable,
    brokenSenders: broken,
    hardBounced: Object.keys(ledger.hardBounced || {}).length,
  };
}

/**
 * What changed, and does it deserve a human's attention?
 * Pure so it is testable without network or filesystem.
 */
function diffState(prev, next) {
  const changes = [];
  const p = prev || {};
  const pf = p.funnel || {};
  const nf = next.funnel || {};

  // The money event. Nothing else in this repo fires on it.
  const paidBefore = pf.paidOrganizationsTotal;
  const paidAfter = nf.paidOrganizationsTotal;
  if (Number.isInteger(paidBefore) && Number.isInteger(paidAfter) && paidAfter > paidBefore) {
    changes.push({
      level: 'money',
      text: `paidOrganizationsTotal ${paidBefore} -> ${paidAfter} — verify in Stripe whether this is a NON-OWNER payment before calling it revenue`,
    });
  }

  // The falsifiable test set on 2026-07-30 after the landing-copy fix.
  if (pf.signInClicksToday === 0 && Number.isInteger(nf.signInClicksToday) && nf.signInClicksToday > 0) {
    changes.push({
      level: 'signal',
      text: `signInClicksToday moved off zero (0 -> ${nf.signInClicksToday}) — the landing fix converted someone`,
    });
  }

  for (const key of WATCHED) {
    if (key === 'paidOrganizationsTotal' || key === 'signInClicksToday') continue;
    if (Number.isInteger(pf[key]) && Number.isInteger(nf[key]) && pf[key] !== nf[key]) {
      changes.push({ level: 'info', text: `${key} ${pf[key]} -> ${nf[key]}` });
    }
  }

  const ps = p.sender || {};
  const ns = next.sender || {};
  if (Number.isInteger(ps.brokenSenders) && Number.isInteger(ns.brokenSenders) && ns.brokenSenders > ps.brokenSenders) {
    changes.push({ level: 'alert', text: `a sending identity started failing (${ps.brokenSenders} -> ${ns.brokenSenders}) — outreach is silently not arriving` });
  }
  if (Number.isInteger(ps.brokenSenders) && Number.isInteger(ns.brokenSenders) && ns.brokenSenders < ps.brokenSenders) {
    changes.push({ level: 'signal', text: `a sending identity recovered (${ps.brokenSenders} -> ${ns.brokenSenders})` });
  }
  if (Number.isInteger(ps.hardBounced) && Number.isInteger(ns.hardBounced) && ns.hardBounced > ps.hardBounced) {
    changes.push({ level: 'alert', text: `${ns.hardBounced - ps.hardBounced} new hard bounce(s) — sender reputation is being spent on bad addresses` });
  }

  // Reachability is only worth reporting on transition, not every tick.
  if (p.reachable === true && next.reachable === false) {
    changes.push({ level: 'alert', text: 'thumbgate.app /api/health unreachable' });
  }
  if (p.reachable === false && next.reachable === true) {
    changes.push({ level: 'signal', text: 'thumbgate.app /api/health reachable again' });
  }
  return changes;
}

async function fetchHealth() {
  try {
    const res = await fetch(HEALTH_URL, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(15000) });
    if (!res.ok) return { reachable: false, funnel: {} };
    const body = await res.json();
    const t = body.telemetry || {};
    const funnel = {};
    for (const key of WATCHED) funnel[key] = Number.isInteger(t[key]) ? t[key] : null;
    return { reachable: true, funnel };
  } catch {
    return { reachable: false, funnel: {} };
  }
}

async function main(argv) {
  const always = argv.includes('--always');
  const asJson = argv.includes('--json');

  const health = await fetchHealth();
  const next = {
    at: new Date().toISOString(),
    reachable: health.reachable,
    funnel: health.funnel,
    sender: senderSummary(readJson(LEDGER)),
  };

  const prev = readJson(STATE);
  const changes = diffState(prev, next);

  fs.mkdirSync(path.dirname(STATE), { recursive: true });
  fs.writeFileSync(STATE, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
  if (changes.length) {
    fs.appendFileSync(LOG, `${JSON.stringify({ at: next.at, changes })}\n`, { mode: 0o600 });
  }

  if (asJson) {
    console.log(JSON.stringify({ state: next, changes }, null, 2));
    return changes.some((c) => c.level === 'alert') ? 1 : 0;
  }
  if (!changes.length) {
    if (always) {
      console.log(`senses tick ${next.at}: no change (views=${next.funnel.landingViewsToday} signins=${next.funnel.signInClicksToday} brokenSenders=${next.sender.brokenSenders})`);
    }
    return 0; // silence is the normal case
  }
  console.log(`senses tick ${next.at}:`);
  for (const c of changes) console.log(`  [${c.level}] ${c.text}`);
  return changes.some((c) => c.level === 'alert') ? 1 : 0;
}

if (require.main === module) {
  main(process.argv.slice(2)).then((code) => process.exit(code)).catch((error) => {
    console.error(`senses tick failed: ${error.message}`);
    process.exit(2);
  });
}

module.exports = { diffState, senderSummary, WATCHED };
