#!/usr/bin/env node
'use strict';

/**
 * Local-first delivery stack — episode process steal, not a cancel-Claude SKU.
 *
 * Maps YouTube Music hk-xqhRLTBA opportunities onto rails we already run.
 * Hybrid routing (local_leaf vs glm-coding) is grok PR #2035 — do not duplicate.
 *
 * inventedUsd is always null. Episode $3000/mo is an anecdote, not our savings.
 * ECI: counsel_clearance=false → no ThumbGate paid diagnostic / $499 outreach.
 */

const SCHEMA = 'local-first-delivery/v1';
const EPISODE_ANECDOTE_USD = 3000;
const COUNSEL_CLEARANCE = false;

const RAILS = Object.freeze({
  agency_ahls: {
    id: 'agency_ahls',
    product: 'After-Hours Leak Score',
    priceUsd: 149,
    sellable: true,
    outcome: 'missed-call leak score for HVAC/plumbing shops',
  },
  hosted_vps: {
    id: 'hosted_vps',
    product: 'thumbgate.app hosted Hermes',
    priceUsd: 10,
    sellable: true,
    outcome: 'fenced VPS chat; you own the work, we own the machine',
  },
  hermes_yolo_hybrid: {
    id: 'hermes_yolo_hybrid',
    product: 'hermes-yolo hybrid (glm-coding + local_leaf)',
    priceUsd: 0,
    sellable: false,
    outcome: 'internal delivery stack; coding default glm-coding',
  },
  cost_autonomy_cli: {
    id: 'cost_autonomy_cli',
    product: 'hermes-yolo-cost-autonomy CLI (PR #2035)',
    priceUsd: 0,
    sellable: false,
    outcome: 'workload map; inventedUsd always null',
  },
});

function textOf(input) {
  return String(input.intent || input.task || '').toLowerCase();
}

function denial(code, reason) {
  return {
    ok: false,
    schema: SCHEMA,
    inventedUsd: null,
    episodeAnecdoteUsd: EPISODE_ANECDOTE_USD,
    episodeAnecdoteIsOurs: false,
    counselClearance: COUNSEL_CLEARANCE,
    deny: code,
    reason,
    sellable: false,
    codingDefault: 'glm-coding',
    clonedCancelClaudeSku: false,
  };
}

function pack(railId, extra = {}) {
  const rail = RAILS[railId];
  return {
    ok: true,
    schema: SCHEMA,
    inventedUsd: null,
    episodeAnecdoteUsd: EPISODE_ANECDOTE_USD,
    episodeAnecdoteIsOurs: false,
    counselClearance: COUNSEL_CLEARANCE,
    rail: rail.id,
    product: rail.product,
    priceUsd: rail.priceUsd,
    sellable: rail.sellable,
    outcome: rail.outcome,
    codingDefault: 'glm-coding',
    localLeaf: 'qwen3-hermes-tinker:q4',
    clonedCancelClaudeSku: false,
    gpuBuy: false,
    replaceAllHosted: false,
    ...extra,
  };
}

function classify(input = {}) {
  const t = textOf(input);

  if (/h100|a100|buy gpus?|speculative gpu|purchase gpu/i.test(t)) {
    return denial('gpu_speculative', 'Hardware only after sustained paying workloads. Utilization risk kills ROI.');
  }
  if (/\$\s*3,?000|3000 per month|save \$3000|cancel claude savings/i.test(t)) {
    return denial('invented_3000', 'Episode $3000/mo is an anecdote. inventedUsd stays null.');
  }
  if (/replace every hosted|replace all (hosted|cloud) models|cancel (all )?apis/i.test(t)) {
    return denial('replace_all_hosted', 'Hybrid routing is stronger. Local for predictable/sensitive; glm-coding for hard coding.');
  }
  if (/generic local llm consulting|local llm consulting/i.test(t)) {
    return denial('generic_consulting', 'Too broad. Package one operational outcome.');
  }
  if (/\$\s*499|thumbgate (paid )?pilot|paid diagnostic|cost ?(&|and) autonomy audit/i.test(t)
    && /sell|offer|checkout|outreach|pilot/i.test(t)) {
    return denial('eci_paid_pilot', 'counsel_clearance=false. No ThumbGate paid diagnostic outreach.');
  }
  if (/\$\s*499/.test(t) || /thumbgate paid|partner pilot/i.test(t)) {
    return denial('eci_paid_pilot', 'counsel_clearance=false. No ThumbGate $499 / paid-pilot outreach.');
  }

  if (/lead intake|crm follow-?up|support triage|missed call|after-hours|hvac|plumbing|leak score/i.test(t)) {
    return pack('agency_ahls', { verticalTemplate: 'after_hours_leak_score' });
  }
  if (/private agent|self-hosted agent|managed private|fenced vps|hosted hermes|thumbgate\.app/i.test(t)) {
    return pack('hosted_vps', { note: 'Existing $10/mo product. Not a new Continuity SKU.' });
  }
  if (/implement login|coding agent|agent implementation sprint|open-weight coding/i.test(t)) {
    return pack('hermes_yolo_hybrid', { note: 'Interactive coding stays glm-coding. local_leaf is PR #2035.' });
  }
  if (/fix typo|routine local|explicit local/i.test(t)) {
    return pack('hermes_yolo_hybrid', { lane: 'local_leaf', note: 'Predictable leaf via tinker-yolo q4 (PR #2035).' });
  }
  if (/cost audit|autonomy audit|vendor spend|observability|model routing|spend reduction|workload map/i.test(t)) {
    return pack('cost_autonomy_cli', {
      note: 'CLI workload map only. Not a paid ThumbGate audit SKU.',
      sellable: false,
    });
  }
  if (/content.?to.?lead|newsletter funnel|cancel claude video/i.test(t)) {
    return denial('eci_funnel', 'ThumbGate paid funnel paused. Agency AHLS drafts-only until send words.');
  }

  return pack('hermes_yolo_hybrid', { note: 'Default hybrid. No new SKU.' });
}

function catalog() {
  return {
    schema: SCHEMA,
    inventedUsd: null,
    episodeAnecdoteIsOurs: false,
    counselClearance: COUNSEL_CLEARANCE,
    rails: Object.values(RAILS),
    verticalTemplate: 'after_hours_leak_score',
    denials: [
      'gpu_speculative',
      'invented_3000',
      'replace_all_hosted',
      'generic_consulting',
      'eci_paid_pilot',
      'eci_funnel',
    ],
  };
}

function main(argv = process.argv.slice(2)) {
  const args = { json: true, catalog: false, intent: '' };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--json') args.json = true;
    else if (a === '--catalog') args.catalog = true;
    else if (a === '--intent' || a === '--task') args.intent = argv[++i];
    else if (a === '--help' || a === '-h') {
      process.stdout.write(
        'local-first-delivery — map episode opportunities onto existing rails\n' +
          '  --intent TEXT --json\n' +
          '  --catalog --json\n',
      );
      return 0;
    }
  }
  const payload = args.catalog ? catalog() : classify({ intent: args.intent });
  process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
  return payload.ok === false ? 2 : 0;
}

module.exports = {
  SCHEMA,
  RAILS,
  EPISODE_ANECDOTE_USD,
  COUNSEL_CLEARANCE,
  classify,
  catalog,
  main,
};

if (require.main === module) process.exit(main());
