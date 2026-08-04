#!/usr/bin/env node
'use strict';

// Curate a REAL labeled eval set from ThumbGate's human feedback log.
//
// Why this exists: the fleet had 1,792 feedback records and an eval suite that
// reported fabricated scores (see tools/eval-benchmark-suite.js). The records
// are the genuine asset — every one carries a human thumbs signal — but most
// are not usable as eval items:
//   measured 2026-07-28 over ~/.thumbgate/feedback-log.jsonl (1,792 records)
//     1,102  tagged auto-capture-fallback  (captured by tooling, not a judgment)
//       394  context === whatWorked         (echo of the prompt, no added signal)
//     1,187  context under 40 chars         (too thin to evaluate against)
//       390  SURVIVE                        (the real labeled pool)
//
// Labels here come from the human who pressed the button. This tool never
// invents a label, a score, or a rationale — it selects, dedupes, and splits.
//
// Determinism: the train/holdout split is a hash of the record id, not RNG, so
// the same log always yields the same split and an eval number is comparable
// across runs.
//
// Usage:
//   node tools/curate-eval-set.js                       # report only
//   node tools/curate-eval-set.js --out data/evalset    # write set + manifest
//   node tools/curate-eval-set.js --json

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const AUTO_CAPTURE_TAG = 'auto-capture-fallback';
const DEFAULT_MIN_CONTEXT = 40;
const DEFAULT_HOLDOUT_PCT = 30;

function nullish(v) {
  // The log serialises absent fields as the STRING "None", so a plain falsy
  // check silently accepts them.
  if (v === undefined || v === null) return true;
  const s = String(v).trim();
  return s === '' || s === 'None';
}

function clean(v) {
  return nullish(v) ? null : String(v).trim();
}

function normalizeForDedupe(s) {
  return s.toLowerCase().replace(/\s+/g, ' ').trim();
}

function splitFor(id, holdoutPct) {
  // Deterministic: first 8 hex of sha256(id) -> 0..99
  const h = crypto.createHash('sha256').update(String(id)).digest('hex').slice(0, 8);
  return (parseInt(h, 16) % 100) < holdoutPct ? 'holdout' : 'train';
}

function parseLog(text) {
  const records = [];
  let malformed = 0;
  for (const line of text.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    try {
      records.push(JSON.parse(t));
    } catch {
      malformed += 1;
    }
  }
  return { records, malformed };
}

function curateEvalSet(options = {}) {
  const minContext = options.minContextChars ?? DEFAULT_MIN_CONTEXT;
  const holdoutPct = options.holdoutPct ?? DEFAULT_HOLDOUT_PCT;
  const logPath = options.logPath || path.join(os.homedir(), '.thumbgate', 'feedback-log.jsonl');

  if (!fs.existsSync(logPath)) {
    return { ok: false, error: `no feedback log at ${logPath}`, logPath };
  }

  const { records, malformed } = parseLog(fs.readFileSync(logPath, 'utf8'));

  // Every drop is counted and reported. Silent truncation would make a small
  // curated set look like the whole story.
  const rejected = {
    malformedJson: malformed,
    noLabel: 0,
    autoCapture: 0,
    echoOfPrompt: 0,
    contextTooShort: 0,
    duplicate: 0,
  };

  const seen = new Set();
  const kept = [];

  for (const r of records) {
    const label = clean(r.signal);
    if (label !== 'positive' && label !== 'negative') {
      rejected.noLabel += 1;
      continue;
    }
    const tags = String(r.tags || '');
    if (tags.includes(AUTO_CAPTURE_TAG)) {
      // Captured by tooling on the user's behalf — not a deliberate judgment.
      rejected.autoCapture += 1;
      continue;
    }
    const context = clean(r.context);
    if (!context) {
      rejected.contextTooShort += 1;
      continue;
    }
    const whatWorked = clean(r.whatWorked);
    if (whatWorked && normalizeForDedupe(whatWorked) === normalizeForDedupe(context)) {
      // The rationale just echoes the prompt; nothing to learn from.
      rejected.echoOfPrompt += 1;
      continue;
    }
    if (context.length < minContext) {
      rejected.contextTooShort += 1;
      continue;
    }
    const key = normalizeForDedupe(context);
    if (seen.has(key)) {
      rejected.duplicate += 1;
      continue;
    }
    seen.add(key);

    const id = clean(r.id) || crypto.createHash('sha256').update(key).digest('hex').slice(0, 16);
    kept.push({
      id,
      label,
      context,
      whatWentWrong: clean(r.whatWentWrong),
      whatToChange: clean(r.whatToChange),
      whatWorked,
      failureType: clean(r.failureType),
      tags: clean(r.tags),
      timestamp: clean(r.timestamp),
      split: splitFor(id, holdoutPct),
    });
  }

  const counts = {
    totalRecords: records.length,
    kept: kept.length,
    keptPositive: kept.filter((k) => k.label === 'positive').length,
    keptNegative: kept.filter((k) => k.label === 'negative').length,
    train: kept.filter((k) => k.split === 'train').length,
    holdout: kept.filter((k) => k.split === 'holdout').length,
  };

  const serialized = kept.map((k) => JSON.stringify(k)).join('\n');
  const sha256 = crypto.createHash('sha256').update(serialized).digest('hex');

  return {
    ok: true,
    logPath,
    counts,
    rejected,
    // Provenance so a score computed against this set is traceable to an exact
    // set of human-labeled rows.
    manifest: {
      schema: 'hermes/eval-set-v1',
      source: logPath,
      minContextChars: minContext,
      holdoutPct,
      labelSource: 'human thumbs signal (ThumbGate feedback log) — never model-generated',
      sha256,
      ...counts,
    },
    items: kept,
  };
}

function writeEvalSet(result, outDir) {
  fs.mkdirSync(outDir, { recursive: true });
  const setPath = path.join(outDir, 'eval-set.jsonl');
  const manifestPath = path.join(outDir, 'manifest.json');
  fs.writeFileSync(setPath, result.items.map((k) => JSON.stringify(k)).join('\n') + '\n');
  fs.writeFileSync(manifestPath, JSON.stringify(result.manifest, null, 2) + '\n');
  return { setPath, manifestPath };
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  const outIdx = argv.indexOf('--out');
  const res = curateEvalSet({});
  if (!res.ok) {
    console.error(`curate-eval-set: ${res.error}`);
    process.exit(1);
  }
  if (argv.includes('--json')) {
    console.log(JSON.stringify({ ...res, items: undefined }, null, 2));
  } else {
    console.log('\n=== CURATED EVAL SET (human labels only) ===');
    console.log(`source: ${res.logPath}`);
    console.log(`\nkept ${res.counts.kept} of ${res.counts.totalRecords} records`);
    console.log(`  positive=${res.counts.keptPositive}  negative=${res.counts.keptNegative}`);
    console.log(`  train=${res.counts.train}  holdout=${res.counts.holdout}`);
    console.log('\ndropped (every exclusion counted — nothing silently truncated):');
    for (const [k, v] of Object.entries(res.rejected)) console.log(`  ${k}: ${v}`);
    console.log(`\nsha256: ${res.manifest.sha256}`);
  }
  if (outIdx !== -1 && argv[outIdx + 1]) {
    const { setPath, manifestPath } = writeEvalSet(res, argv[outIdx + 1]);
    console.log(`\nwrote ${setPath}\nwrote ${manifestPath}`);
  }
}

module.exports = { curateEvalSet, writeEvalSet, splitFor };
