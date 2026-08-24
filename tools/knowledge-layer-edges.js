#!/usr/bin/env node
'use strict';

/**
 * Knowledge-layer edge overlay (Cekikj TDS 2026-08-20 residual).
 *
 * PR #2029 already always-fuses grepai hits with graphify hops. This module
 * does the leftover cheap mechanics without Cosmos Gremlin or an LLM resolver:
 *   - two-threshold entity resolution (auto / needs_review / create)
 *   - bitemporal expire-and-open (never rewrite)
 *   - ingest-time contradiction (different authorities, both current)
 *
 * Time is a FILTER on our overlay edges. graphify AST edges still have no
 * validity window — that honesty stays in knowledge-graph-fuse.
 */

const fs = require('fs');
const path = require('path');

const SCHEMA = 'knowledge-layer-edges/v1';
const T_HIGH = 0.72;
const T_LOW = 0.4;
const DEFAULT_FIXTURE = path.join(__dirname, '..', 'evals', 'knowledge-layer-edges', 'fixture.json');

function tokenize(text) {
  return [...new Set(String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length >= 3))];
}

function jaccard(a, b) {
  const left = new Set(tokenize(a));
  const right = new Set(tokenize(b));
  if (!left.size && !right.size) return 1;
  if (!left.size || !right.size) return 0;
  let inter = 0;
  for (const t of left) if (right.has(t)) inter += 1;
  return inter / (left.size + right.size - inter);
}

function aliasesOf(entity) {
  const out = [entity.id, entity.title, ...(entity.aliases || [])];
  return out.map((s) => String(s || '').trim()).filter(Boolean);
}

function scoreMention(mention, entity) {
  const text = String(mention.text || mention.id || '');
  let best = 0;
  for (const alias of aliasesOf(entity)) {
    if (text.toLowerCase() === alias.toLowerCase()) return 1;
    best = Math.max(best, jaccard(text, alias));
  }
  return Number(best.toFixed(4));
}

function resolveMention(mention, canonicals, thresholds = {}) {
  const high = Number.isFinite(thresholds.high) ? thresholds.high : T_HIGH;
  const low = Number.isFinite(thresholds.low) ? thresholds.low : T_LOW;
  const ranked = (canonicals || [])
    .map((entity) => ({ entity, score: scoreMention(mention, entity) }))
    .sort((a, b) => b.score - a.score);
  const best = ranked[0] || { entity: null, score: 0 };
  if (best.entity && best.score >= high) {
    return {
      action: 'same_as',
      entityId: best.entity.id,
      score: best.score,
      auto: true,
      paidLlm: false,
    };
  }
  if (!best.entity || best.score <= low) {
    return {
      action: 'create',
      entityId: `prov-${tokenize(mention.text || mention.id).slice(0, 4).join('-') || 'unnamed'}`,
      score: best.score,
      auto: true,
      paidLlm: false,
    };
  }
  return {
    action: 'needs_review',
    entityId: null,
    score: best.score,
    candidates: ranked.slice(0, 3).map((row) => ({ id: row.entity.id, score: row.score })),
    auto: false,
    paidLlm: false,
  };
}

function resolveAll(mentions, canonicals, thresholds) {
  return (mentions || []).map((mention) => ({
    mention: mention.id || mention.text,
    ...resolveMention(mention, canonicals, thresholds),
  }));
}

function fragmentation(resolutions) {
  const ids = new Set();
  let review = 0;
  for (const row of resolutions) {
    if (row.action === 'needs_review') review += 1;
    else ids.add(row.entityId);
  }
  return { uniqueEntities: ids.size, needsReview: review, rows: resolutions.length };
}

function ablateResolution(fixture) {
  const canonicals = fixture.canonicals || [];
  const mentions = fixture.mentions || [];
  const two = resolveAll(mentions, canonicals);
  const aliasOnly = resolveAll(mentions, canonicals, { high: 1, low: 0.999 });
  return {
    schema: SCHEMA,
    clonedGremlin: false,
    paidLlm: false,
    twoThreshold: fragmentation(two),
    aliasOnly: fragmentation(aliasOnly),
    improved: fragmentation(aliasOnly).uniqueEntities > fragmentation(two).uniqueEntities,
    resolutions: two,
  };
}

function isCurrent(edge, asOf) {
  const t = asOf ? Date.parse(asOf) : Date.now();
  const from = Date.parse(edge.validFrom || '1970-01-01');
  const to = edge.validTo ? Date.parse(edge.validTo) : Infinity;
  return Number.isFinite(from) && Number.isFinite(t) && t >= from && t < to;
}

function incompatible(a, b) {
  return a.subject === b.subject && a.predicate === b.predicate && a.object !== b.object;
}

function ingestEdge(store, incoming) {
  const edge = {
    id: incoming.id || `e-${Date.now().toString(36)}`,
    subject: incoming.subject,
    predicate: incoming.predicate,
    object: incoming.object,
    validFrom: incoming.validFrom,
    validTo: incoming.validTo || null,
    ingestedAt: incoming.ingestedAt || incoming.validFrom,
    source: incoming.source,
    authority: incoming.authority,
    expired: false,
  };
  store.edges = store.edges || [];
  store.contradictions = store.contradictions || [];

  const current = store.edges.filter((row) => isCurrent(row) && incompatible(row, edge));
  if (!current.length) {
    store.edges.push(edge);
    return { ok: true, action: 'open', edge, declinesToSettle: false };
  }

  const sameAuthority = current.filter((row) => row.authority === edge.authority);
  const otherAuthority = current.filter((row) => row.authority !== edge.authority);

  if (sameAuthority.length && !otherAuthority.length) {
    for (const row of sameAuthority) {
      row.validTo = edge.validFrom;
      row.expired = true;
    }
    store.edges.push(edge);
    return { ok: true, action: 'supersede', edge, expired: sameAuthority.map((r) => r.id), declinesToSettle: false };
  }

  store.edges.push(edge);
  const contradiction = {
    id: `con-${edge.subject}-${edge.predicate}`,
    status: 'unresolved',
    subject: edge.subject,
    statements: [...current, edge].map((row) => ({
      source: row.source,
      authority: row.authority,
      validFrom: row.validFrom,
      statement: `${row.subject} ${row.predicate} ${row.object}`,
    })),
    whyNotResolved: 'Both sources are current and come from different authorities; the system does not pick a side.',
  };
  store.contradictions.push(contradiction);
  return {
    ok: true,
    action: 'contradiction',
    edge,
    contradiction,
    declinesToSettle: true,
  };
}

function asOf(store, timestamp) {
  return (store.edges || []).filter((edge) => isCurrent(edge, timestamp));
}

function timeline(store, subject) {
  return (store.edges || [])
    .filter((edge) => edge.subject === subject)
    .sort((a, b) => String(a.validFrom).localeCompare(String(b.validFrom)));
}

function loadFixture(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function parseArgs(argv) {
  const args = { json: false, ablate: false, help: false, fixture: DEFAULT_FIXTURE };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--json') args.json = true;
    else if (a === '--ablate') args.ablate = true;
    else if (a === '--help' || a === '-h') args.help = true;
    else if (a === '--fixture') args.fixture = argv[++i];
    else if (a === '--ingest') args.ingest = argv[++i];
  }
  return args;
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write(
      'knowledge-layer-edges — two-threshold ER + bitemporal overlay + ingest contradiction\n' +
        '  --ablate --json [--fixture PATH]\n' +
        '  --ingest JSON --json\n' +
        'No Cosmos/Gremlin. Gray zone is needs_review, not an LLM call.\n',
    );
    return 0;
  }
  const fixture = loadFixture(args.fixture);
  let payload;
  if (args.ingest) {
    const store = { edges: fixture.edges || [], contradictions: [] };
    payload = ingestEdge(store, JSON.parse(args.ingest));
    payload.store = store;
  } else {
    payload = ablateResolution(fixture);
  }
  process.stdout.write(`${JSON.stringify(payload, null, args.json ? 2 : 0)}\n`);
  return payload.ok === false ? 2 : 0;
}

module.exports = {
  SCHEMA,
  T_HIGH,
  T_LOW,
  tokenize,
  jaccard,
  resolveMention,
  resolveAll,
  ablateResolution,
  ingestEdge,
  asOf,
  timeline,
  isCurrent,
  loadFixture,
  DEFAULT_FIXTURE,
  main,
};

if (require.main === module) process.exit(main());
