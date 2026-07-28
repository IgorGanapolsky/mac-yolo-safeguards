#!/usr/bin/env node
'use strict';

/**
 * ml-label-store.js — fail-closed training labels for revenue propensity ML.
 *
 * Sources (all optional; missing = skip, never invent paid labels):
 *   1. Pipeline prospects*.tsv + pipeline-status*.tsv under business_os/ (gitignored)
 *   2. Stripe revenue receipt ~/.hermes/receipts/tinker-brain/revenue-receipt.json
 *   3. Funnel attribution dump JSON (--attribution-file)
 *   4. Explicit fixture JSONL (--fixture) for offline tests only
 *
 * Writes ~/.hermes/ml/labels.jsonl (+ summary.json). Does not train.
 *
 *   node tools/ml-label-store.js export [--json]
 *   node tools/ml-label-store.js export --fixture tests/fixtures/ml/synthetic-labels.jsonl
 *   node tools/ml-label-store.js status [--json]
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const REPO = path.resolve(__dirname, '..');
const DEFAULT_ML_DIR = path.join(os.homedir(), '.hermes', 'ml');
const DEFAULT_LABELS = path.join(DEFAULT_ML_DIR, 'labels.jsonl');
const DEFAULT_SUMMARY = path.join(DEFAULT_ML_DIR, 'labels-summary.json');
const STRIPE_RECEIPT = path.join(
  os.homedir(),
  '.hermes',
  'receipts',
  'tinker-brain',
  'revenue-receipt.json',
);

const FEATURE_KEYS = [
  'agent_stack',
  'repeated_failure',
  'business_cost',
  'budget_owner',
  'workflow_context',
  'needs_repeatability',
  'segment_agency',
  'segment_consult',
  'source_inbound',
];

const PAID_STAGES = new Set([
  'paid',
  'cleared',
  'closed_won',
  'won',
  'subscribed',
  'active_paid',
]);

function parseArgs(argv) {
  const args = {
    command: 'status',
    json: false,
    help: false,
    fixture: '',
    attributionFile: '',
    out: DEFAULT_LABELS,
    summaryOut: DEFAULT_SUMMARY,
    businessOs: path.join(REPO, 'business_os', 'revenue'),
  };
  const rest = [...argv];
  if (rest[0] && !rest[0].startsWith('--')) {
    args.command = rest.shift();
  }
  for (let i = 0; i < rest.length; i += 1) {
    const a = rest[i];
    if (a === '--json') args.json = true;
    else if (a === '--help' || a === '-h') args.help = true;
    else if (a === '--fixture') args.fixture = path.resolve(rest[++i] || '');
    else if (a === '--attribution-file') args.attributionFile = path.resolve(rest[++i] || '');
    else if (a === '--out') args.out = path.resolve(rest[++i] || '');
    else if (a === '--summary-out') args.summaryOut = path.resolve(rest[++i] || '');
    else if (a === '--business-os') args.businessOs = path.resolve(rest[++i] || '');
    else throw new Error(`Unknown argument: ${a}`);
  }
  return args;
}

function parseBool(value) {
  const n = String(value || '')
    .trim()
    .toLowerCase();
  if (['yes', 'true', '1'].includes(n)) return 1;
  if (['no', 'false', '0', ''].includes(n)) return 0;
  return 0;
}

function parseTsv(filePath) {
  if (!fs.existsSync(filePath)) return [];
  const text = fs.readFileSync(filePath, 'utf8').trim();
  if (!text) return [];
  const lines = text.split(/\r?\n/);
  const headers = lines.shift().split('\t');
  return lines.map((line) => {
    const values = line.split('\t');
    const row = {};
    headers.forEach((h, i) => {
      row[h] = values[i] !== undefined ? values[i] : '';
    });
    return row;
  });
}

function loadJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function featureVectorFromProspect(row) {
  const segment = String(row.segment || '').toLowerCase();
  const source = String(row.source || '').toLowerCase();
  return {
    agent_stack: parseBool(row.agent_stack),
    repeated_failure: parseBool(row.repeated_failure),
    business_cost: parseBool(row.business_cost),
    budget_owner: parseBool(row.budget_owner),
    workflow_context: parseBool(row.workflow_context),
    needs_repeatability: parseBool(row.needs_repeatability),
    segment_agency: segment.includes('agency') || segment.includes('studio') ? 1 : 0,
    segment_consult: segment.includes('consult') || segment.includes('vendor') ? 1 : 0,
    source_inbound: source.includes('inbound') || source.includes('referral') ? 1 : 0,
  };
}

function featuresToArray(features) {
  return FEATURE_KEYS.map((k) => Number(features[k] || 0));
}

function listMatching(dir, prefix) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => name.startsWith(prefix) && name.endsWith('.tsv'))
    .map((name) => path.join(dir, name))
    .sort();
}

function labelsFromPipeline(businessOsDir) {
  const prospectFiles = listMatching(businessOsDir, 'prospects');
  const statusFiles = listMatching(businessOsDir, 'pipeline-status');
  const statusMap = new Map();
  for (const file of statusFiles) {
    for (const row of parseTsv(file)) {
      if (!row.prospect_label) continue;
      statusMap.set(row.prospect_label, {
        stage: String(row.stage || '').toLowerCase(),
        route: row.route || '',
        file,
      });
    }
  }
  const out = [];
  for (const file of prospectFiles) {
    for (const row of parseTsv(file)) {
      if (!row.prospect_label) continue;
      const status = statusMap.get(row.prospect_label) || { stage: 'new' };
      const stage = String(status.stage || row.status || '').toLowerCase();
      const paid = PAID_STAGES.has(stage) ? 1 : 0;
      const features = featureVectorFromProspect(row);
      out.push({
        schema_version: 'ml-label/1',
        id: `pipeline:${row.prospect_label}`,
        source: 'pipeline',
        features,
        x: featuresToArray(features),
        label_paid: paid,
        label_source: paid ? `stage:${stage}` : 'none',
        last_touch: row.last_touch || '',
        as_of: new Date().toISOString(),
        meta: { prospect_label: row.prospect_label, stage, file },
      });
    }
  }
  return out;
}

function labelsFromStripeReceipt(receiptPath = STRIPE_RECEIPT) {
  const receipt = loadJson(receiptPath);
  if (!receipt || typeof receipt.external_net_cents !== 'number') return [];
  // Aggregate only — no per-customer features without PII join. Emits one global
  // monetization label row for scorecard, not propensity training features.
  return [
    {
      schema_version: 'ml-label/1',
      id: 'stripe:external_net',
      source: 'stripe_receipt',
      features: null,
      x: null,
      label_paid: receipt.external_net_cents > 0 ? 1 : 0,
      label_source: 'stripe_external_net_cents',
      last_touch: (receipt.reconciled_at || '').slice(0, 10),
      as_of: new Date().toISOString(),
      meta: {
        external_net_cents: receipt.external_net_cents,
        owner_test_net_cents: receipt.owner_test_net_cents || 0,
        verified: Boolean(receipt.verified),
        source: receipt.source || 'unknown',
      },
      training_eligible: false,
    },
  ];
}

function labelsFromAttribution(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return [];
  const body = loadJson(filePath);
  if (!body) return [];
  const rows = Array.isArray(body)
    ? body
    : body.attributionToday || body.rows || body.events || [];
  const out = [];
  for (const row of rows) {
    if (!row || typeof row !== 'object') continue;
    const campaign = row.utmCampaign || row.utm_campaign || row.campaign || 'unknown';
    const event = String(row.event || row.name || '').toLowerCase();
    const count = Number(row.count || row.n || 1);
    const paidLike =
      event.includes('paid') ||
      event.includes('checkout') ||
      event.includes('subscription') ||
      event.includes('purchase');
    out.push({
      schema_version: 'ml-label/1',
      id: `attr:${campaign}:${event || 'event'}`,
      source: 'funnel_attribution',
      features: null,
      x: null,
      label_paid: paidLike && count > 0 ? 1 : 0,
      label_source: paidLike ? `attr:${event}` : 'attr_non_paid',
      last_touch: '',
      as_of: new Date().toISOString(),
      meta: { campaign, event, count },
      training_eligible: false,
    });
  }
  return out;
}

function labelsFromFixture(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return [];
  const text = fs.readFileSync(filePath, 'utf8').trim();
  if (!text) return [];
  // JSONL or JSON array
  if (text.startsWith('[')) {
    const arr = JSON.parse(text);
    return arr.map(normalizeFixtureRow);
  }
  return text
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => normalizeFixtureRow(JSON.parse(line)));
}

function normalizeFixtureRow(row) {
  const features = row.features || featureVectorFromProspect(row);
  const x = Array.isArray(row.x) ? row.x : featuresToArray(features);
  return {
    schema_version: 'ml-label/1',
    id: row.id || `fixture:${row.prospect_label || Math.random().toString(36).slice(2)}`,
    source: row.source || 'fixture',
    features,
    x,
    label_paid: Number(row.label_paid) ? 1 : 0,
    label_source: row.label_source || (row.label_paid ? 'fixture_paid' : 'fixture_unpaid'),
    last_touch: row.last_touch || '2026-07-01',
    as_of: row.as_of || new Date().toISOString(),
    meta: row.meta || {},
    training_eligible: row.training_eligible !== false,
  };
}

function summarize(labels) {
  const train = labels.filter((l) => l.training_eligible !== false && Array.isArray(l.x));
  const positives = train.filter((l) => l.label_paid === 1).length;
  const negatives = train.filter((l) => l.label_paid === 0).length;
  return {
    schema_version: 'ml-label-summary/1',
    total_rows: labels.length,
    training_eligible: train.length,
    positives,
    negatives,
    stripe_rows: labels.filter((l) => l.source === 'stripe_receipt').length,
    pipeline_rows: labels.filter((l) => l.source === 'pipeline').length,
    attribution_rows: labels.filter((l) => l.source === 'funnel_attribution').length,
    fixture_rows: labels.filter((l) => l.source === 'fixture').length,
    feature_keys: FEATURE_KEYS,
    min_for_train: { positives: 5, total: 20 },
    train_ready: positives >= 5 && train.length >= 20,
    generated_at: new Date().toISOString(),
  };
}

function writeLabels(labels, outPath, summaryPath) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  const body = labels.map((l) => JSON.stringify(l)).join('\n') + (labels.length ? '\n' : '');
  fs.writeFileSync(outPath, body, { encoding: 'utf8', mode: 0o600 });
  const summary = summarize(labels);
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2) + '\n', {
    encoding: 'utf8',
    mode: 0o600,
  });
  return summary;
}

function exportLabels(args) {
  const labels = [];
  labels.push(...labelsFromPipeline(args.businessOs));
  labels.push(...labelsFromStripeReceipt());
  labels.push(...labelsFromAttribution(args.attributionFile));
  labels.push(...labelsFromFixture(args.fixture));
  // de-dupe by id (last wins)
  const map = new Map();
  for (const row of labels) map.set(row.id, row);
  const deduped = [...map.values()];
  const summary = writeLabels(deduped, args.out, args.summaryOut);
  return { ok: true, out: args.out, summaryOut: args.summaryOut, summary, count: deduped.length };
}

function status(args) {
  const summary = loadJson(args.summaryOut) || {
    training_eligible: 0,
    positives: 0,
    train_ready: false,
    note: 'no summary yet; run export',
  };
  const hasLabels = fs.existsSync(args.out);
  return {
    ok: true,
    labels_path: args.out,
    labels_present: hasLabels,
    summary,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(`Usage:
  node tools/ml-label-store.js export [--fixture PATH] [--attribution-file PATH] [--json]
  node tools/ml-label-store.js status [--json]`);
    process.exit(0);
  }
  let result;
  if (args.command === 'export') result = exportLabels(args);
  else if (args.command === 'status') result = status(args);
  else throw new Error(`Unknown command: ${args.command}`);
  if (args.json) console.log(JSON.stringify(result, null, 2));
  else if (args.command === 'export') {
    const s = result.summary;
    console.log(
      `ml-label-store: wrote ${result.count} rows → ${result.out} (train_eligible=${s.training_eligible} pos=${s.positives} ready=${s.train_ready})`,
    );
  } else {
    const s = result.summary;
    console.log(
      `ml-label-store status: present=${result.labels_present} train_eligible=${s.training_eligible || 0} pos=${s.positives || 0} ready=${Boolean(s.train_ready)}`,
    );
  }
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(2);
  }
}

module.exports = {
  FEATURE_KEYS,
  featureVectorFromProspect,
  featuresToArray,
  labelsFromPipeline,
  labelsFromFixture,
  labelsFromStripeReceipt,
  summarize,
  exportLabels,
  writeLabels,
  PAID_STAGES,
};
