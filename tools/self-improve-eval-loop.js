#!/usr/bin/env node
'use strict';

/**
 * Self-improving eval loop — episode process steal, not an affiliate SKU.
 *
 * Source: YouTube Music Os-s26O_W08 ("Why Did OpenAI Pause AI Training?
 * Self-Improving AI Explained"). The page has no benchmarks. The transferable
 * mechanic is: measurable business output → eval feedback → propose prompt /
 * workflow / tool changes. Never auto-apply.
 *
 * Routing receipts are grok PR #2046 (`tools/router-receipt.js`). Do not
 * duplicate asked-vs-served. Do not productize an affiliate platform from
 * the headline. ECI: counsel_clearance=false → no $499 outreach.
 */

const SCHEMA = 'self-improve-eval/v1';
const COUNSEL_CLEARANCE = false;
const EPISODE_ID = 'Os-s26O_W08';
const MIN_N = 5;
const HOSTED_PRICE_USD = 10;
const AHLS_PRICE_USD = 149;

const RAILS = Object.freeze({
  agency_ahls: {
    id: 'agency_ahls',
    product: 'After-Hours Leak Score',
    priceUsd: AHLS_PRICE_USD,
    sellable: true,
    verticalTemplate: 'after_hours_leak_score',
  },
  hosted_vps: {
    id: 'hosted_vps',
    product: 'thumbgate.app hosted Hermes',
    priceUsd: HOSTED_PRICE_USD,
    sellable: true,
    verticalTemplate: null,
  },
  eval_observability: {
    id: 'eval_observability',
    product: 'router-receipt asked-vs-served (PR #2046)',
    priceUsd: 0,
    sellable: false,
    verticalTemplate: null,
  },
  knowledge_layer: {
    id: 'knowledge_layer',
    product: 'knowledge-graph-fuse + bitemporal edges',
    priceUsd: 0,
    sellable: false,
    verticalTemplate: null,
  },
});

function base() {
  return {
    schema: SCHEMA,
    episodeId: EPISODE_ID,
    episodeHasBenchmarks: false,
    counselClearance: COUNSEL_CLEARANCE,
    autoApply: false,
    apply: false,
    affiliateSku: false,
    clonedOpenRouter: false,
    inventedConversion: null,
    hostedPriceUsd: HOSTED_PRICE_USD,
  };
}

function deny(code, reason, extra) {
  return Object.assign(base(), {
    ok: false,
    promote: false,
    deny: code,
    reason,
  }, extra || {});
}

function textOf(input) {
  if (!input) return '';
  if (typeof input === 'string') return input.toLowerCase();
  return String(input.intent || input.opportunity || input.task || '').toLowerCase();
}

function mapOpportunity(input) {
  const t = textOf(input);
  if (!t.trim()) {
    return deny('empty_intent', 'intent required');
  }
  if (/\$499|partner pilot|paid diagnostic|thumbgate paid outreach/.test(t)) {
    return deny('eci_paid_pilot', 'ECI pauses ThumbGate paid-pilot outreach');
  }
  if (/openai paused|paused training|pause ai training|headline bet/.test(t)) {
    return deny('headline_bet', 'episode page has no underwriteable technical claim');
  }
  if (/affiliate|keyword discovery|product comparison draft|schema-ready publish|deal monitoring/.test(t)) {
    return deny('affiliate_sku_from_headline', 'no customer, no baseline; do not productize affiliate from the episode');
  }
  if (/generic (ai )?chatbot|ai chatbot for smbs|chatbot-as-a-service/.test(t)) {
    return deny('generic_chatbot', 'avoid generic chatbot work; need a named owner and baseline');
  }
  if (/invoice|document processing|support-ticket|compliance evidence/.test(t) && !/hvac|plumbing|after-hours|leak/.test(t)) {
    return deny('not_beachhead', 'AHLS HVAC/plumbing is the beachhead; do not invent a second SMB SKU');
  }
  if (/asked-vs-served|router receipt|eval harness|observability|quality, cost, latency|production monitoring/.test(t)
    || /eval and automation|evaluation and observability/.test(t)) {
    const rail = RAILS.eval_observability;
    return Object.assign(base(), {
      ok: true,
      rail: rail.id,
      product: rail.product,
      priceUsd: rail.priceUsd,
      sellable: rail.sellable,
      defer: 'router-receipt',
      promote: false,
      reason: 'routing eval is PR #2046; this CLI holdout-promotes prompt/workflow/tool only',
    });
  }
  if (/knowledge system|retrieval.*audit|bitemporal|graphify/.test(t)) {
    const rail = RAILS.knowledge_layer;
    return Object.assign(base(), {
      ok: true,
      rail: rail.id,
      product: rail.product,
      priceUsd: 0,
      sellable: false,
      defer: 'knowledge-layer-edges',
      promote: false,
      reason: 'vertical knowledge is PR #2029/#2054, not a new SKU',
    });
  }
  if (/hvac|plumbing|after-hours|leak score|missed.?call|lead qualification/.test(t)) {
    const rail = RAILS.agency_ahls;
    return Object.assign(base(), {
      ok: true,
      rail: rail.id,
      product: rail.product,
      priceUsd: rail.priceUsd,
      sellable: true,
      verticalTemplate: rail.verticalTemplate,
      promote: false,
      reason: 'productized template already exists; consulting rewrite is not the steal',
    });
  }
  if (/hosted vps|thumbgate\.app|fenced vps|hosted hermes/.test(t)) {
    const rail = RAILS.hosted_vps;
    return Object.assign(base(), {
      ok: true,
      rail: rail.id,
      product: rail.product,
      priceUsd: rail.priceUsd,
      sellable: true,
      promote: false,
      reason: 'hosted Hermes $10/mo is the packaged automation, not a new platform',
    });
  }
  return deny('unmapped_opportunity', 'map onto AHLS, hosted VPS, or the existing eval loop');
}

function num(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function sample(block) {
  if (!block || typeof block !== 'object') return null;
  const value = num(block.value);
  const n = num(block.n);
  const metric = block.metric == null ? null : String(block.metric);
  if (value == null || n == null || !metric) return null;
  return { metric, value, n };
}

function beats(candidate, baseline, direction) {
  if (direction === 'lower') return candidate < baseline;
  return candidate > baseline;
}

function promoteChange(input) {
  const raw = input && typeof input === 'object' ? input : {};
  const kind = String(raw.kind || '').toLowerCase();
  if (!kind) return deny('kind_required', 'kind must be prompt, workflow, tool, template, or route');
  if (kind === 'route') {
    return Object.assign(base(), {
      ok: true,
      kind: 'route',
      defer: 'router-receipt',
      promote: false,
      reason: 'routing proposals live in PR #2046; never auto-apply remap here',
    });
  }
  if (!['prompt', 'workflow', 'tool', 'template'].includes(kind)) {
    return deny('kind_unknown', `unsupported kind ${kind}`);
  }

  const baseline = sample(raw.baseline);
  const candidate = sample(raw.candidate);
  const holdout = sample(raw.holdout);
  const direction = raw.direction === 'lower' ? 'lower' : 'higher';

  if (!baseline) {
    return deny('insufficient_evidence', 'baseline metric/value/n required', { kind, evidence: 'INSUFFICIENT_EVIDENCE' });
  }
  if (baseline.n < MIN_N) {
    return deny('insufficient_evidence', `baseline n<${MIN_N}`, { kind, evidence: 'INSUFFICIENT_EVIDENCE' });
  }
  if (!candidate) {
    return deny('insufficient_evidence', 'candidate metric/value/n required', { kind, evidence: 'INSUFFICIENT_EVIDENCE' });
  }
  if (candidate.metric !== baseline.metric) {
    return deny('metric_mismatch', 'candidate metric must match baseline', { kind });
  }
  if (candidate.n < MIN_N) {
    return deny('insufficient_evidence', `candidate n<${MIN_N}`, { kind, evidence: 'INSUFFICIENT_EVIDENCE' });
  }
  if (!holdout) {
    return Object.assign(base(), {
      ok: true,
      kind,
      promote: false,
      evidence: 'NEEDS_HOLDOUT',
      reason: 'candidate without holdout cannot promote (overfit risk)',
      baseline,
      candidate,
    });
  }
  if (holdout.metric !== baseline.metric) {
    return deny('metric_mismatch', 'holdout metric must match baseline', { kind });
  }
  if (holdout.n < MIN_N) {
    return deny('insufficient_evidence', `holdout n<${MIN_N}`, { kind, evidence: 'INSUFFICIENT_EVIDENCE' });
  }

  const candidateBeats = beats(candidate.value, baseline.value, direction);
  const holdoutBeats = beats(holdout.value, baseline.value, direction);
  if (candidateBeats && !holdoutBeats) {
    return Object.assign(base(), {
      ok: true,
      kind,
      promote: false,
      evidence: 'OVERFIT',
      reason: 'candidate beat baseline but holdout did not',
      baseline,
      candidate,
      holdout,
      direction,
    });
  }
  if (!holdoutBeats) {
    return Object.assign(base(), {
      ok: true,
      kind,
      promote: false,
      evidence: 'HOLDOUT_NO_GAIN',
      reason: 'holdout did not beat baseline',
      baseline,
      candidate,
      holdout,
      direction,
    });
  }

  return Object.assign(base(), {
    ok: true,
    kind,
    promote: true,
    apply: false,
    evidence: 'HOLDOUT_BEATS_BASELINE',
    reason: 'holdout beat baseline; still apply=false (human PR)',
    baseline,
    candidate,
    holdout,
    direction,
  });
}

function catalog() {
  return Object.assign(base(), {
    ok: true,
    rails: Object.keys(RAILS),
    denials: [
      'affiliate_sku_from_headline',
      'headline_bet',
      'generic_chatbot',
      'eci_paid_pilot',
      'not_beachhead',
    ],
    minN: MIN_N,
    kinds: ['prompt', 'workflow', 'tool', 'template', 'route'],
    complementaryTo: ['PR #2046 router-receipt'],
  });
}

function parseArgs(argv) {
  const out = { json: false, honesty: false, map: false, promote: false, catalog: false, intent: '', kind: '', payload: null, direction: null };
  const baseline = {};
  const candidate = {};
  const holdout = {};
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const next = argv[i + 1];
    if (a === '--json') out.json = true;
    else if (a === '--honesty') out.honesty = true;
    else if (a === '--map') out.map = true;
    else if (a === '--promote') out.promote = true;
    else if (a === '--catalog') out.catalog = true;
    else if (a === '--intent' && next) { out.intent = next; i += 1; }
    else if (a === '--kind' && next) { out.kind = next; i += 1; }
    else if (a === '--payload' && next) { out.payload = next; i += 1; }
    else if (a === '--direction' && next) { out.direction = next; i += 1; }
    else if (a === '--baseline-metric' && next) { baseline.metric = next; i += 1; }
    else if (a === '--baseline-value' && next) { baseline.value = next; i += 1; }
    else if (a === '--baseline-n' && next) { baseline.n = next; i += 1; }
    else if (a === '--candidate-metric' && next) { candidate.metric = next; i += 1; }
    else if (a === '--candidate-value' && next) { candidate.value = next; i += 1; }
    else if (a === '--candidate-n' && next) { candidate.n = next; i += 1; }
    else if (a === '--holdout-metric' && next) { holdout.metric = next; i += 1; }
    else if (a === '--holdout-value' && next) { holdout.value = next; i += 1; }
    else if (a === '--holdout-n' && next) { holdout.n = next; i += 1; }
  }
  out.baseline = baseline;
  out.candidate = candidate;
  out.holdout = holdout;
  return out;
}

function honesty() {
  return Object.assign(base(), {
    ok: true,
    steal: [
      'measurable output then eval feedback',
      'holdout before promote',
      'productized template not consulting (AHLS $149)',
    ],
    skip: [
      'affiliate-content intelligence platform',
      'OpenAI paused training as a product bet',
      'generic SMB chatbot',
      'clone OpenRouter / auto-apply remaps (PR #2046)',
    ],
  });
}

function main(argv = process.argv) {
  const args = parseArgs(Array.isArray(argv) ? argv.slice(2) : process.argv.slice(2));
  let result;
  if (args.honesty) result = honesty();
  else if (args.catalog) result = catalog();
  else if (args.promote) {
    let payload = {};
    if (args.payload) {
      try { payload = JSON.parse(args.payload); } catch {
        result = deny('invalid_json', 'payload is not JSON');
      }
    }
    if (!result) {
      if (args.kind) payload.kind = args.kind;
      if (args.direction) payload.direction = args.direction;
      if (args.baseline.metric) payload.baseline = Object.assign({}, payload.baseline, args.baseline);
      if (args.candidate.value != null && args.candidate.value !== '') {
        payload.candidate = Object.assign(
          { metric: (payload.baseline && payload.baseline.metric) || args.candidate.metric },
          payload.candidate,
          args.candidate,
        );
      }
      if (args.holdout.value != null && args.holdout.value !== '') {
        payload.holdout = Object.assign(
          { metric: (payload.baseline && payload.baseline.metric) || args.holdout.metric },
          payload.holdout,
          args.holdout,
        );
      }
      result = promoteChange(payload);
    }
  } else if (args.map || args.intent) {
    result = mapOpportunity({ intent: args.intent });
  } else {
    result = catalog();
  }
  const json = args.json || true;
  if (json) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.ok === false) return 2;
  return 0;
}

module.exports = {
  SCHEMA,
  COUNSEL_CLEARANCE,
  MIN_N,
  mapOpportunity,
  promoteChange,
  catalog,
  honesty,
  main,
};

if (require.main === module) {
  process.exit(main(process.argv) ?? 0);
}
