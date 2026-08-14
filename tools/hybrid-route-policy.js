#!/usr/bin/env node
'use strict';

/**
 * hybrid-route-policy — Lemonade-router-inspired rules for Hermes economic routes.
 *
 * High-ROI steal from amd/skills lemonade-router-builder: explicit candidates,
 * default fallback, keyword/rules routing, PII/sensitivity → local, no invent.
 * Maps onto hermes-economic-router ROUTES ids (does not require Lemonade).
 *
 * Usage:
 *   node tools/hybrid-route-policy.js example
 *   node tools/hybrid-route-policy.js validate path.json
 *   node tools/hybrid-route-policy.js decide --task "..." [--paid-ok]
 *   node tools/hybrid-route-policy.js self-test
 */

const fs = require('fs');
const path = require('path');

/**
 * Canonical economic-router route ids (must match tools/hermes-economic-router.js ROUTES).
 * Prefer live export when available so this file cannot drift into fictional ids.
 */
function loadKnownRoutes() {
  const fallback = [
    'local_fast',
    'local_coder_candidate',
    'local_qwen36_candidate',
    'glm52_reasoning',
    'grok45_verifier_candidate',
    'parallel_search_candidate',
    'fugu_escalation',
    'nemotron3_ultra_escalation',
    'kimi_k3_agentic_specialist',
    'openrouter_fusion',
    'openrouter_advisor',
    'openrouter_subagent',
    'mobile_e2e_gate',
  ];
  try {
    // eslint-disable-next-line import/no-dynamic-require, global-require
    const eco = require('./hermes-economic-router.js');
    const ids = (eco.ROUTES || []).map((r) => r && r.id).filter(Boolean);
    if (ids.length) return new Set(ids);
  } catch {
    /* offline / partial tree */
  }
  return new Set(fallback);
}

const KNOWN_ROUTES = loadKnownRoutes();

const DEFAULT_POLICY = {
  name: 'fleet-hybrid-default',
  version: 2,
  source: 'amd/skills lemonade-router-builder pattern → hermes-economic-router',
  default_route: 'local_fast',
  // Only real ROUTES ids — never cloud_general/cloud_coder fiction.
  candidates: [
    'local_fast',
    'local_coder_candidate',
    'local_qwen36_candidate',
    'glm52_reasoning',
    'fugu_escalation',
    'openrouter_fusion',
  ],
  rules: [
    {
      id: 'sensitive-local',
      match: { keywords_any: ['ssn', 'password', 'secret', 'api key', 'private key', 'pii', 'passport'] },
      route: 'local_fast',
      reason: 'Sensitive content stays on local zero-cost route',
    },
    {
      id: 'coding-local-candidate',
      match: { keywords_any: ['implement', 'refactor', 'fix bug', 'unit test', 'typescript', 'pull request'] },
      route: 'local_coder_candidate',
      reason: 'Coding tasks prefer measured local coding candidate first',
    },
    {
      id: 'paid-when-allowed',
      match: { keywords_any: ['production incident', 'security audit', 'architecture review'] },
      route: 'glm52_reasoning',
      requires_paid_ok: true,
      reason: 'Hard review tasks may use glm52_reasoning when --paid-ok',
    },
  ],
};

function examplePolicy() {
  return JSON.parse(JSON.stringify(DEFAULT_POLICY));
}

function validatePolicy(policy) {
  const errors = [];
  const warnings = [];
  if (!policy || typeof policy !== 'object') {
    return { ok: false, errors: ['policy must be object'], warnings };
  }
  if (!policy.default_route) errors.push('missing default_route');
  if (!Array.isArray(policy.candidates) || policy.candidates.length === 0) {
    errors.push('candidates must be non-empty array');
  }
  const cands = new Set(policy.candidates || []);
  if (policy.default_route && !cands.has(policy.default_route)) {
    errors.push(`default_route ${policy.default_route} not in candidates`);
  }
  for (const id of cands) {
    if (!KNOWN_ROUTES.has(id)) warnings.push(`unknown route id for this fleet: ${id}`);
  }
  if (policy.router && (policy.rules || policy.classifiers)) {
    errors.push('router (LLM-as-router) is mutually exclusive with rules/classifiers (AMD Lemonade shape)');
  }
  if (Array.isArray(policy.rules)) {
    policy.rules.forEach((r, i) => {
      if (!r || !r.route) errors.push(`rules[${i}] missing route`);
      else if (!cands.has(r.route)) errors.push(`rules[${i}] route ${r.route} not in candidates`);
      if (!r.match || (!r.match.keywords_any && !r.match.regex_any)) {
        errors.push(`rules[${i}] needs match.keywords_any or match.regex_any`);
      }
    });
  }
  return { ok: errors.length === 0, errors, warnings };
}

function matchRule(rule, taskLower) {
  const m = rule.match || {};
  if (Array.isArray(m.keywords_any)) {
    if (m.keywords_any.some((k) => taskLower.includes(String(k).toLowerCase()))) return true;
  }
  if (Array.isArray(m.regex_any)) {
    for (const pat of m.regex_any) {
      try {
        if (new RegExp(pat, 'i').test(taskLower)) return true;
      } catch {
        /* ignore bad regex */
      }
    }
  }
  return false;
}

function decide(task, opts = {}, policy = DEFAULT_POLICY) {
  const v = validatePolicy(policy);
  if (!v.ok) {
    return { ok: false, errors: v.errors, route: null };
  }
  const taskLower = String(task || '').toLowerCase();
  const paidOk = Boolean(opts.paidOk);
  for (const rule of policy.rules || []) {
    if (!matchRule(rule, taskLower)) continue;
    if (rule.requires_paid_ok && !paidOk) {
      return {
        ok: true,
        route: policy.default_route,
        matched_rule: rule.id,
        reason: `${rule.reason} (paid not ok → default)`,
        paid_ok: paidOk,
      };
    }
    return {
      ok: true,
      route: rule.route,
      matched_rule: rule.id,
      reason: rule.reason || rule.id,
      paid_ok: paidOk,
    };
  }
  return {
    ok: true,
    route: policy.default_route,
    matched_rule: null,
    reason: 'no rule matched; default_route',
    paid_ok: paidOk,
  };
}

function selfTest() {
  const v = validatePolicy(DEFAULT_POLICY);
  if (!v.ok) throw new Error(JSON.stringify(v.errors));
  const sens = decide('please handle this password reset token', {});
  if (sens.route !== 'local_fast') throw new Error(`expected local_fast got ${sens.route}`);
  const code = decide('implement unit test for hermes router', {});
  if (code.route !== 'local_coder_candidate') throw new Error(`expected local_coder got ${code.route}`);
  const paidBlocked = decide('production incident root cause', { paidOk: false });
  if (paidBlocked.route !== 'local_fast') throw new Error('paid-blocked should fall back');
  const paid = decide('production incident root cause', { paidOk: true });
  if (paid.route !== 'glm52_reasoning') throw new Error(`expected glm52_reasoning got ${paid.route}`);
  for (const id of DEFAULT_POLICY.candidates) {
    if (!KNOWN_ROUTES.has(id)) throw new Error(`candidate not in economic ROUTES: ${id}`);
  }
  const bad = validatePolicy({
    default_route: 'x',
    candidates: ['y'],
    router: {},
    rules: [],
  });
  if (bad.ok) throw new Error('bad policy should fail');
  return { ok: true, cases: 5 };
}

function main(argv = process.argv.slice(2)) {
  const cmd = argv[0] || 'example';
  if (cmd === 'example') {
    console.log(JSON.stringify(examplePolicy(), null, 2));
    return 0;
  }
  if (cmd === 'self-test') {
    console.log(JSON.stringify(selfTest()));
    return 0;
  }
  if (cmd === 'validate') {
    const file = argv[1];
    if (!file) {
      console.error('usage: hybrid-route-policy.js validate <file.json>');
      return 2;
    }
    const policy = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
    const r = validatePolicy(policy);
    console.log(JSON.stringify(r, null, 2));
    return r.ok ? 0 : 1;
  }
  if (cmd === 'decide') {
    let task = '';
    let paidOk = false;
    let policyPath = null;
    for (let i = 1; i < argv.length; i++) {
      if (argv[i] === '--task' && argv[i + 1]) task = argv[++i];
      else if (argv[i] === '--paid-ok') paidOk = true;
      else if (argv[i] === '--policy' && argv[i + 1]) policyPath = argv[++i];
    }
    const policy = policyPath
      ? JSON.parse(fs.readFileSync(path.resolve(policyPath), 'utf8'))
      : DEFAULT_POLICY;
    const r = decide(task, { paidOk }, policy);
    console.log(JSON.stringify(r, null, 2));
    return r.ok ? 0 : 1;
  }
  console.error('usage: hybrid-route-policy.js [example|validate|decide|self-test]');
  return 2;
}

if (require.main === module) {
  process.exitCode = main();
}

module.exports = {
  KNOWN_ROUTES,
  DEFAULT_POLICY,
  examplePolicy,
  validatePolicy,
  decide,
  selfTest,
  main,
};
