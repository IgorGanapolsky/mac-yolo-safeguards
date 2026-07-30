'use strict';

/**
 * Tests for tools/curate-eval-set.js
 *
 * These tests verify the core anti-LLM-as-judge properties:
 * 1. Labels come from humans, never models
 * 2. Splitting is deterministic (sha256-based, not RNG)
 * 3. Rejection filters correctly exclude auto-captured, echo-of-prompt,
 *    too-short, and duplicate records
 * 4. Manifest sha256 is stable for a given input set
 * 5. The tool gracefully handles missing feedback logs
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const { curateEvalSet, writeEvalSet, splitFor } = require('../tools/curate-eval-set');

// ——— splitFor determinism ———————————————————————————————————————

test('splitFor is deterministic: same id always splits the same way', () => {
  const result1 = splitFor('test-id-1', 30);
  const result2 = splitFor('test-id-1', 30);
  assert.equal(result1, result2, 'same id must always produce the same split');
  assert.ok(['train', 'holdout'].includes(result1), 'split must be train or holdout');
});

test('splitFor with 0 pct always yields train, 100 pct always yields holdout', () => {
  assert.equal(splitFor('anything', 0), 'train');
  assert.equal(splitFor('anything', 100), 'holdout');
});

test('splitFor distributes ~pct into holdout across many ids', () => {
  const ids = Array.from({ length: 1000 }, (_, i) => `id-${i}`);
  const holdoutCount = ids.filter((id) => splitFor(id, 30) === 'holdout').length;
  // With 1000 ids and 30% holdout, expect roughly 300 (allow 10% margin)
  assert.ok(holdoutCount >= 270 && holdoutCount <= 330,
    `expected ~300 holdout, got ${holdoutCount}`);
});

// ——— curation with synthetic feedback ———————————————————————

function makeFeedbackLog(records) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'thumbgate-test-'));
  const logPath = path.join(dir, 'feedback-log.jsonl');
  fs.writeFileSync(logPath, records.map((r) => JSON.stringify(r)).join('\n') + '\n');
  return logPath;
}

// Unique long contexts so tests do not false-fail on the dedupe filter.
let contextSeq = 0;
function uniqueContext(prefix = 'This is a real user feedback context') {
  contextSeq += 1;
  return `${prefix} #${contextSeq} with enough detail to evaluate against a holdout set`;
}

function makeRecord(overrides = {}) {
  return {
    id: crypto.randomUUID(),
    signal: 'positive',
    context: uniqueContext(),
    whatWorked: null,
    whatWentWrong: null,
    whatToChange: null,
    failureType: null,
    tags: '',
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

test('curateEvalSet rejects auto-capture-fallback records', () => {
  const logPath = makeFeedbackLog([
    makeRecord({ tags: 'auto-capture-fallback', signal: 'positive' }),
    makeRecord({ tags: '', signal: 'negative' }),
  ]);
  const result = curateEvalSet({ logPath });
  assert.equal(result.ok, true);
  assert.equal(result.counts.totalRecords, 2);
  assert.equal(result.counts.kept, 1);
  assert.equal(result.rejected.autoCapture, 1);
});

test('curateEvalSet rejects echo-of-prompt records', () => {
  const context = uniqueContext('Echo prompt context');
  const other = uniqueContext('Non-echo context');
  const logPath = makeFeedbackLog([
    makeRecord({ context, whatWorked: context }), // echo
    makeRecord({ context: other, whatWorked: 'Something different that worked' }), // not echo
  ]);
  const result = curateEvalSet({ logPath });
  assert.equal(result.counts.totalRecords, 2);
  assert.equal(result.counts.kept, 1);
  assert.equal(result.rejected.echoOfPrompt, 1);
});

test('curateEvalSet rejects context under minimum length', () => {
  const logPath = makeFeedbackLog([
    makeRecord({ context: 'short' }), // too short
    makeRecord({ context: uniqueContext() }), // OK
  ]);
  const result = curateEvalSet({ logPath });
  assert.equal(result.counts.totalRecords, 2);
  assert.equal(result.counts.kept, 1);
  assert.equal(result.rejected.contextTooShort, 1);
});

test('curateEvalSet rejects records with no valid label', () => {
  const logPath = makeFeedbackLog([
    makeRecord({ signal: 'positive' }),
    makeRecord({ signal: 'None' }),
    makeRecord({ signal: undefined }),
    makeRecord({ signal: '' }),
    makeRecord({ signal: 'negative' }),
  ]);
  const result = curateEvalSet({ logPath });
  assert.equal(result.counts.totalRecords, 5);
  assert.equal(result.counts.kept, 2);
  assert.equal(result.rejected.noLabel, 3);
});

test('curateEvalSet dedupes case-insensitive whitespace-normalized contexts', () => {
  const baseContext = 'This is a real user feedback context with enough detail to evaluate';
  const logPath = makeFeedbackLog([
    makeRecord({ context: baseContext, signal: 'positive' }),
    makeRecord({ context: baseContext, signal: 'negative' }), // exact dup
    makeRecord({ context: baseContext.toUpperCase(), signal: 'positive' }), // case-insensitive dup
    makeRecord({ context: '  ' + baseContext + '  ', signal: 'positive' }), // whitespace dup
  ]);
  const result = curateEvalSet({ logPath });
  assert.equal(result.counts.totalRecords, 4);
  assert.equal(result.counts.kept, 1);
  assert.equal(result.rejected.duplicate, 3);
});

test('curateEvalSet computes accurate label distribution', () => {
  const logPath = makeFeedbackLog([
    makeRecord({ signal: 'positive' }),
    makeRecord({ signal: 'positive' }),
    makeRecord({ signal: 'negative' }),
    makeRecord({ signal: 'negative' }),
    makeRecord({ signal: 'negative' }),
  ]);
  const result = curateEvalSet({ logPath });
  assert.equal(result.counts.kept, 5);
  assert.equal(result.counts.keptPositive, 2);
  assert.equal(result.counts.keptNegative, 3);
});

test('curateEvalSet manifest sha256 is stable for the same input', () => {
  const logPath = makeFeedbackLog([
    makeRecord({ signal: 'positive' }),
    makeRecord({ signal: 'negative' }),
  ]);
  const result1 = curateEvalSet({ logPath });
  const result2 = curateEvalSet({ logPath });
  assert.equal(result1.manifest.sha256, result2.manifest.sha256,
    'same input must produce the same manifest sha256');
  // sha256 should be 64 hex chars
  assert.match(result1.manifest.sha256, /^[0-9a-f]{64}$/);
});

test('curateEvalSet returns ok=false when log file is missing', () => {
  const result = curateEvalSet({ logPath: '/nonexistent/path/feedback-log.jsonl' });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'no feedback log at /nonexistent/path/feedback-log.jsonl');
});

test('curateEvalSet labels come from human, never model-generated', () => {
  const logPath = makeFeedbackLog([
    makeRecord({ signal: 'positive' }),
  ]);
  const result = curateEvalSet({ logPath });
  assert.match(result.manifest.labelSource, /human/,
    'label source must explicitly state human, not model');
  assert.match(result.manifest.labelSource, /never model-generated/,
    'label source must explicitly forbid model-generated labels');
});

test('curateEvalSet uses deterministic hash-based split (not RNG)', () => {
  const logPath = makeFeedbackLog(Array.from({ length: 20 }, (_, i) =>
    makeRecord({ signal: i % 2 === 0 ? 'positive' : 'negative' })
  ));
  const result1 = curateEvalSet({ logPath });
  const result2 = curateEvalSet({ logPath });
  assert.deepEqual(
    result1.items.map((i) => i.split),
    result2.items.map((i) => i.split),
    'same input must always produce the same train/holdout split (deterministic, not RNG)'
  );
});

test('writeEvalSet creates set + manifest files', () => {
  const logPath = makeFeedbackLog([
    makeRecord({ signal: 'positive' }),
    makeRecord({ signal: 'negative' }),
  ]);
  const result = curateEvalSet({ logPath });
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'evalset-out-'));
  const { setPath, manifestPath } = writeEvalSet(result, outDir);
  assert.equal(fs.existsSync(setPath), true);
  assert.equal(fs.existsSync(manifestPath), true);
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  assert.equal(manifest.schema, 'hermes/eval-set-v1');
  assert.equal(manifest.labelSource, result.manifest.labelSource);
  assert.equal(manifest.sha256, result.manifest.sha256);

  // Each line in the set file is valid JSON with the 6 curated fields
  const setLines = fs.readFileSync(logPath, 'utf8').split('\n').filter((l) => l.trim());
  // The eval set should have fewer lines than the raw log (some rejected/same)
  const evalSetLines = fs.readFileSync(setPath, 'utf8').split('\n').filter((l) => l.trim());
  assert.equal(evalSetLines.length, result.counts.kept);
  for (const line of evalSetLines) {
    const item = JSON.parse(line);
    assert.ok(['train', 'holdout'].includes(item.split), `bad split: ${item.split}`);
    assert.ok(['positive', 'negative'].includes(item.label), `bad label: ${item.label}`);
  }
});

test('malformed JSON lines are counted, not silently dropped', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'thumbgate-badjson-'));
  const logPath = path.join(dir, 'feedback-log.jsonl');
  // Two DISTINCT good records (same JSON string would dedupe after parse)
  const goodA = JSON.stringify(makeRecord({ signal: 'positive' }));
  const goodB = JSON.stringify(makeRecord({ signal: 'negative' }));
  fs.writeFileSync(logPath, [
    goodA,
    '{ this is not valid json',
    goodB,
    '  ',
  ].join('\n') + '\n');
  const result = curateEvalSet({ logPath });
  assert.equal(result.ok, true);
  // totalRecords counts successfully parsed rows only; malformed is separate
  assert.equal(result.counts.totalRecords, 2);
  assert.equal(result.rejected.malformedJson, 1);
  assert.equal(result.counts.kept, 2);
});
