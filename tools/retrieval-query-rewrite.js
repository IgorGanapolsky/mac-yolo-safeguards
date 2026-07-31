#!/usr/bin/env node
'use strict';

/**
 * Deterministic query rewrite for retrieval — NO LLM.
 *
 * Expands known failure-class phrases into synonym tokens so sparse + hybrid
 * indexes hit the same files agents mean. Does not invent free-form rewrites.
 *
 * Usage:
 *   node tools/retrieval-query-rewrite.js --query "session not found"
 *   node tools/retrieval-query-rewrite.js --query "..." --json
 */

const SYNONYM_RULES = [
  {
    id: 'session-not-found',
    match: /session\s+not\s+found|session_not_found|pruned\s+session/i,
    expand: ['mobile_', 'thumbgate_', 'isRecoverableSessionId', 'ensureWebHermesSession', 'sourceSessionId'],
  },
  {
    id: 'runaway-loop',
    match: /runaway|token\s*burn|infinite\s+loop|agent\s+loop/i,
    expand: ['TASK_TIMEOUT', 'hard stop', 'approval', 'lease', 'circuit'],
  },
  {
    id: 'continuity-offline',
    match: /continuity|lid\s*clos|offline\s+mac|vps\s+failover/i,
    expand: ['cloudAccess', 'routePreference', 'failover', 'local_pending'],
  },
  {
    id: 'tailscale-unreachable',
    match: /tailscale|can'?t\s+reach|unreachable\s+mac|derp/i,
    expand: ['gatewayDiscovery', 'tailscaleDiscovery', 'ConnectMacGate', '100.'],
  },
  {
    id: 'grepai-empty',
    match: /grepai|semantic\s+index|empty\s+index|zero.?result/i,
    expand: ['ensure-grepai', 'index.gob', 'nomic-embed', 'hybrid'],
  },
  {
    id: 'llm-judge',
    match: /llm.?as.?judge|groundedness|eval\s+suite|fabricated\s+score/i,
    expand: ['curate-eval-set', 'eval-benchmark-suite', 'llm-judge-policy', 'humanPositiveRate'],
  },
];

/**
 * @param {string} query
 * @returns {{ original: string, rewritten: string, expansions: string[], rulesFired: string[] }}
 */
function rewriteQuery(query) {
  const original = String(query || '').trim();
  if (!original) {
    return { original: '', rewritten: '', expansions: [], rulesFired: [] };
  }
  const expansions = [];
  const rulesFired = [];
  for (const rule of SYNONYM_RULES) {
    if (rule.match.test(original)) {
      rulesFired.push(rule.id);
      for (const term of rule.expand) {
        if (!original.toLowerCase().includes(String(term).toLowerCase())) {
          expansions.push(term);
        }
      }
    }
  }
  const rewritten = expansions.length
    ? `${original} ${expansions.join(' ')}`.replace(/\s+/g, ' ').trim()
    : original;
  return { original, rewritten, expansions, rulesFired };
}

/**
 * Multi-query variants for RRF fusion (deterministic — no LLM).
 * Includes original, synonym rewrite, per-expansion probes, and a HyDE-lite
 * "pseudo document" query when expansions exist.
 */
function multiQueryVariants(query, options = {}) {
  const max = Number.isInteger(options.max) && options.max > 0 ? options.max : 5;
  const rw = rewriteQuery(query);
  const variants = [];
  const push = (q, kind) => {
    const t = String(q || '').replace(/\s+/g, ' ').trim();
    if (!t) return;
    if (variants.some((v) => v.query === t)) return;
    variants.push({ query: t, kind });
  };
  push(rw.original, 'original');
  if (rw.rewritten && rw.rewritten !== rw.original) push(rw.rewritten, 'rewrite');
  for (const term of rw.expansions.slice(0, 3)) {
    push(`${rw.original} ${term}`, 'expansion');
  }
  // HyDE-lite: retrieve as if hunting an implementation doc that names the expansions.
  if (rw.expansions.length) {
    push(
      `documentation implementation ${rw.expansions.slice(0, 4).join(' ')} ${rw.original}`,
      'hyde_lite',
    );
  }
  // Token-decomposition multi-query for long asks (no synonym hit).
  if (variants.length === 1) {
    const tokens = rw.original.split(/\s+/).filter((t) => t.length >= 4);
    if (tokens.length >= 4) {
      push(tokens.slice(0, Math.ceil(tokens.length / 2)).join(' '), 'half_a');
      push(tokens.slice(Math.floor(tokens.length / 2)).join(' '), 'half_b');
    }
  }
  return {
    ...rw,
    variants: variants.slice(0, max),
  };
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  let query = '';
  let json = false;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--query') query = argv[++i] || '';
    else if (argv[i] === '--json') json = true;
  }
  if (!query) {
    console.error('Usage: node tools/retrieval-query-rewrite.js --query "..." [--json]');
    process.exit(2);
  }
  const out = rewriteQuery(query);
  if (json) console.log(JSON.stringify(out, null, 2));
  else {
    console.log(out.rewritten);
    if (out.rulesFired.length) {
      console.error(`# rules: ${out.rulesFired.join(', ')}`);
      console.error(`# expansions: ${out.expansions.join(', ') || '(none new)'}`);
    }
  }
}

module.exports = { rewriteQuery, multiQueryVariants, SYNONYM_RULES };
