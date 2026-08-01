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
  {
    id: 'cloud-connector',
    match: /cloud\s+connector|cloud\s+failover|hermes\s+cloud|vps\s+runner/i,
    expand: ['hermes-cloud-connector', 'HERMES-CLOUD-FAILOVER', 'cloudAccess', 'failover'],
  },
  {
    id: 'pair-gateway',
    match: /pair(ing)?|gateway\s+url|usb\s+reverse|adb\s+reverse|localIp/i,
    expand: ['hermes-mobile-pair', 'gatewayDiscovery', 'gatewayProfiles', 'pairCode'],
  },
  {
    id: 'ota-billing',
    match: /\bota\b|over.?the.?air|expo\s+update|billing\s+freeze/i,
    expand: ['appOtaUpdate', 'otaClientPromptPolicy', 'checkAutomatically', 'EAS'],
  },
  {
    id: 'moe-routing',
    match: /\bmoe\b|mixture\s+of\s+experts|dead\s+expert|economic\s+router|model\s+route/i,
    expand: ['hermes-economic-router', 'moe-expert-health', 'retired-experts', 'route-quality'],
  },
  {
    id: 'rag-rerank',
    match: /rerank|cross.?encoder|colbert|dual.?path|retrieval\s+fusion/i,
    expand: ['retrieval-rerank', 'retrieval-dual-path', 'rrfFuse', 'colbert_lite'],
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

module.exports = { rewriteQuery, SYNONYM_RULES };
