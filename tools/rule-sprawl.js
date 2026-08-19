#!/usr/bin/env node
'use strict';

/**
 * New Stack process steal (TNS webinar email 2026-08-19):
 * alert-on-everything vs budget; retrieval under concurrent agents;
 * human review volume is not the control.
 *
 *   node tools/rule-sprawl.js [--json] [--retrieve|--review]
 *
 * Does NOT clone OpenSearch, PPL, or Unified Alert Manager (PR #1868).
 * capturedRevenueUsd is always 0. autoApply is always false.
 */

const SEV_RANK = { P0: 0, P1: 1, P2: 2, P3: 3 };

const DEMO_RULES = [
  { id: 'secrets-exfil', severity: 'P0', evalCost: 1, tokenCost: 80, value: 10 },
  { id: 'destructive-git', severity: 'P0', evalCost: 1, tokenCost: 60, value: 9 },
  { id: 'spend-guard', severity: 'P0', evalCost: 2, tokenCost: 120, value: 8 },
  { id: 'desktop-hijack', severity: 'P1', evalCost: 1, tokenCost: 40, value: 7 },
  { id: 'send-outbound', severity: 'P1', evalCost: 2, tokenCost: 90, value: 6 },
  { id: 'force-push', severity: 'P1', evalCost: 1, tokenCost: 50, value: 6 },
  { id: 'host-mouse', severity: 'P2', evalCost: 3, tokenCost: 200, value: 3 },
  { id: 'noise-info-alert', severity: 'P3', evalCost: 4, tokenCost: 400, value: 1 },
  { id: 'dup-notify-slack', severity: 'P3', evalCost: 4, tokenCost: 350, value: 1 },
  { id: 'dup-notify-email', severity: 'P3', evalCost: 4, tokenCost: 350, value: 1 },
  { id: 'load-all-telemetry', severity: 'P3', evalCost: 8, tokenCost: 900, value: 1 },
  { id: 'vanity-dashboard', severity: 'P3', evalCost: 5, tokenCost: 500, value: 1 },
];

function knapsackRules(rules, opts = {}) {
  const evalBudget = Number.isFinite(opts.evalBudget) ? opts.evalBudget : 8;
  const tokenBudget = Number.isFinite(opts.tokenBudget) ? opts.tokenBudget : 2000;
  const list = Array.isArray(rules) ? rules : [];
  const ranked = [...list].sort((a, b) => {
    const ds = (SEV_RANK[a.severity] ?? 9) - (SEV_RANK[b.severity] ?? 9);
    if (ds !== 0) return ds;
    const va = (a.value || 1) / Math.max(1, a.evalCost || 1);
    const vb = (b.value || 1) / Math.max(1, b.evalCost || 1);
    return vb - va;
  });
  const selected = [];
  let evalUsed = 0;
  let tokenUsed = 0;
  for (const rule of ranked) {
    const evalCost = rule.evalCost || 1;
    const tokenCost = rule.tokenCost || 0;
    if (evalUsed + evalCost > evalBudget) continue;
    if (tokenUsed + tokenCost > tokenBudget) continue;
    selected.push({
      id: rule.id,
      severity: rule.severity,
      evalCost,
      tokenCost,
      autoApply: false,
    });
    evalUsed += evalCost;
    tokenUsed += tokenCost;
  }
  const loadAllEval = list.reduce((sum, rule) => sum + (rule.evalCost || 1), 0);
  const loadAllTokens = list.reduce((sum, rule) => sum + (rule.tokenCost || 0), 0);
  return {
    selected,
    skipped: list.length - selected.length,
    load_all_eval_cost: loadAllEval,
    load_all_token_cost: loadAllTokens,
    selected_eval_cost: evalUsed,
    selected_token_cost: tokenUsed,
    eval_budget: evalBudget,
    token_budget: tokenBudget,
    load_all_exceeds_budget: loadAllEval > evalBudget,
    autoApply: false,
    capturedRevenueUsd: 0,
  };
}

function normalizeQuery(intent, domain = 'lessons', topK = 5) {
  const clean = String(intent || '')
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
  return `${domain}:${topK}:${clean}`;
}

function createRetrievalBudget(opts = {}) {
  const ttlMs = Number.isFinite(opts.ttlMs) ? opts.ttlMs : 60_000;
  const budgetMs = Number.isFinite(opts.budgetMs) ? opts.budgetMs : 50;
  const cache = opts.cache || new Map();
  const inFlight = opts.inFlight || new Map();
  const metrics = {
    totalRequests: 0,
    cacheHits: 0,
    coalescedHits: 0,
    underlyingExecutions: 0,
    timeouts: 0,
    staleFallbacks: 0,
  };

  async function retrieve(intent, fetchFn, extra = {}) {
    metrics.totalRequests += 1;
    const domain = extra.domain || opts.domain || 'lessons';
    const topK = extra.topK || opts.topK || 5;
    const key = normalizeQuery(intent, domain, topK);
    const now = extra.now || Date.now();
    const hit = cache.get(key);
    if (hit && now - hit.ts <= ttlMs) {
      metrics.cacheHits += 1;
      return {
        results: hit.results,
        source: 'cache',
        latencyMs: 0,
        stale: false,
        key,
      };
    }
    if (inFlight.has(key)) {
      metrics.coalescedHits += 1;
      const shared = await inFlight.get(key);
      return { ...shared, source: shared.source === 'fresh' ? 'coalesced' : shared.source };
    }

    const work = (async () => {
      metrics.underlyingExecutions += 1;
      const t0 = Date.now();
      let timer;
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => {
          const err = new Error('latency_budget');
          err.code = 'LATENCY_BUDGET';
          reject(err);
        }, extra.budgetMs || budgetMs);
      });
      try {
        const results = await Promise.race([Promise.resolve(fetchFn(intent, extra)), timeout]);
        cache.set(key, { results, ts: Date.now() });
        return {
          results,
          source: 'fresh',
          latencyMs: Date.now() - t0,
          stale: false,
          key,
        };
      } catch (err) {
        if (err && err.code === 'LATENCY_BUDGET') {
          metrics.timeouts += 1;
          if (hit) {
            metrics.staleFallbacks += 1;
            return {
              results: hit.results,
              source: 'stale_cache',
              latencyMs: Date.now() - t0,
              stale: true,
              reason: 'latency_budget',
              key,
            };
          }
          return {
            results: [],
            source: 'timeout',
            latencyMs: Date.now() - t0,
            stale: true,
            reason: 'latency_budget',
            key,
          };
        }
        throw err;
      } finally {
        if (timer) clearTimeout(timer);
        inFlight.delete(key);
      }
    })();

    inFlight.set(key, work);
    return work;
  }

  return { retrieve, metrics, cache, inFlight, ttlMs, budgetMs };
}

const defaultGuard = createRetrievalBudget();

function retrieveWithLatencyBudget(intent, fetchFn, opts = {}) {
  const guard = opts.guard || defaultGuard;
  return guard.retrieve(intent, fetchFn, opts);
}

function reviewVolumeIsNotControl(input = {}) {
  const testsPassed = input.testsPassed === true;
  const receiptOk = input.receiptOk === true;
  const shipAllowed = testsPassed && receiptOk;
  let reason = 'tests_and_receipt';
  if (!testsPassed) reason = 'tests_not_pass';
  else if (!receiptOk) reason = 'receipt_missing';
  return {
    ship_allowed: shipAllowed,
    autoApply: false,
    control: 'verified_pipeline',
    not_control: 'review_volume',
    prDelta: Number(input.prDelta) || 0,
    bugsCited: input.bugsCited == null ? null : input.bugsCited,
    reason,
    tns_bugs_up_54_is_not_ours: true,
    capturedRevenueUsd: 0,
  };
}

function runCli(argv = process.argv.slice(2), stdinRules) {
  const retrieve = argv.includes('--retrieve');
  const review = argv.includes('--review');
  if (retrieve) {
    return {
      ok: true,
      mode: 'retrieve',
      note: 'use retrieveWithLatencyBudget(intent, fetchFn, { guard, budgetMs, ttlMs })',
      budgetMs: defaultGuard.budgetMs,
      ttlMs: defaultGuard.ttlMs,
      capturedRevenueUsd: 0,
    };
  }
  if (review) {
    return reviewVolumeIsNotControl({
      testsPassed: argv.includes('--tests-pass'),
      receiptOk: argv.includes('--receipt-ok'),
      prDelta: 2,
      bugsCited: 'tns_marketing_not_ours',
    });
  }
  const rules = Array.isArray(stdinRules) && stdinRules.length ? stdinRules : DEMO_RULES;
  return knapsackRules(rules);
}

module.exports = {
  DEMO_RULES,
  knapsackRules,
  createRetrievalBudget,
  retrieveWithLatencyBudget,
  normalizeQuery,
  reviewVolumeIsNotControl,
  runCli,
};

if (require.main === module) {
  let stdinRules = null;
  if (process.argv.includes('-')) {
    const raw = require('fs').readFileSync(0, 'utf8').trim();
    if (raw) {
      try {
        const parsed = JSON.parse(raw);
        stdinRules = parsed.rules || parsed;
      } catch {
        stdinRules = null;
      }
    }
  }
  const out = runCli(process.argv.slice(2), stdinRules);
  process.stdout.write(`${JSON.stringify(out)}\n`);
}
