#!/usr/bin/env node
'use strict';

/**
 * ingestion-integrity.js — prove the retrieval stores AGREE with each other.
 *
 * WHY THIS EXISTS
 *   Audited 2026-07-30. The lesson corpus lives in three places and all three
 *   disagreed, with nothing reconciling them:
 *
 *       lessons.sqlite          1846 rows
 *       lessons-index.jsonl     1069 rows
 *       lesson-embeddings.json   383 vectors   (20.7% of sqlite)
 *
 *   1463 lessons had no vector at all, so semantic search silently covered a
 *   fifth of the corpus. Keyword (FTS) covered all of it, which is exactly why
 *   nobody noticed: some queries worked, so the store looked healthy.
 *
 *   Every ingestion failure in this repo has that shape — the pipeline keeps
 *   answering while quietly covering less and less. A frozen grepai index
 *   returned confident wrong files for days while its watcher reported
 *   "steady". None of it surfaced as an error, because a retriever that covers
 *   20% of a corpus still returns ten results for every query.
 *
 * WHAT IT CHECKS
 *   1. store reconciliation — do the counts agree?
 *   2. embedding coverage  — what fraction of records are vector-searchable?
 *   3. embedding sanity    — are the vectors real and distinct?
 *   4. index freshness     — is the search index built from current content?
 *
 *   Every check reports a NAMED cause. "Cannot determine" is always a failure,
 *   never a pass — the whole point.
 *
 * Usage: node tools/ingestion-integrity.js [--json]
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

// Coverage below this means semantic search is quietly answering from a
// minority of the corpus. Set at 0.9 rather than 1.0 because a live store is
// always slightly behind its writer.
const MIN_EMBEDDING_COVERAGE = 0.9;
// Two stores of the same corpus should not differ by more than this fraction.
const MAX_STORE_DRIFT = 0.1;

const ok = (name, detail, extra = {}) => ({ name, status: 'ok', detail, ...extra });
const bad = (name, detail, extra = {}) => ({ name, status: 'fail', detail, ...extra });

function countJsonl(p) {
  if (!fs.existsSync(p)) return null;
  let n = 0;
  for (const line of fs.readFileSync(p, 'utf8').split('\n')) if (line.trim()) n += 1;
  return n;
}

function countSqlite(p, table = 'lessons') {
  if (!fs.existsSync(p)) return null;
  try {
    // sqlite3 ships with macOS; if it is absent we must report unknown rather
    // than assume zero, because zero would look like an empty store.
    const out = execFileSync('sqlite3', [p, `select count(*) from ${table};`], {
      encoding: 'utf8', timeout: 15000, stdio: ['ignore', 'pipe', 'ignore'],
    });
    const n = Number(String(out).trim());
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function loadEmbeddings(p) {
  if (!fs.existsSync(p)) return null;
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

function vectorOf(entry) {
  if (Array.isArray(entry)) return entry;
  if (entry && typeof entry === 'object') {
    return entry.embedding || entry.vector || entry.values || null;
  }
  return null;
}

/** 1. Do the stores agree on how many records exist? */
function checkStoreReconciliation(paths) {
  const sqlite = countSqlite(paths.sqlite);
  const jsonl = countJsonl(paths.jsonl);
  const counts = { sqlite, jsonl };
  const known = Object.entries(counts).filter(([, v]) => typeof v === 'number');
  if (known.length < 2) {
    return bad('store-reconciliation',
      `cannot compare stores (sqlite=${sqlite}, jsonl=${jsonl}) — unknown is a failure, not a pass`,
      { counts });
  }
  const vals = known.map(([, v]) => v);
  const max = Math.max(...vals);
  const min = Math.min(...vals);
  const drift = max === 0 ? 0 : (max - min) / max;
  if (drift > MAX_STORE_DRIFT) {
    return bad('store-reconciliation',
      `stores disagree by ${(drift * 100).toFixed(1)}% (${known.map(([k, v]) => `${k}=${v}`).join(', ')}) `
      + `— one writer is not keeping up, and the smaller store is what search sees`,
      { counts, drift });
  }
  return ok('store-reconciliation',
    `${known.map(([k, v]) => `${k}=${v}`).join(', ')} within ${(MAX_STORE_DRIFT * 100).toFixed(0)}%`,
    { counts, drift });
}

/** 2. What fraction of records can vector search actually reach? */
function checkEmbeddingCoverage(paths) {
  const emb = loadEmbeddings(paths.embeddings);
  if (emb === null) {
    return bad('embedding-coverage', `no readable embedding store at ${paths.embeddings}`);
  }
  const nVec = Array.isArray(emb) ? emb.length : Object.keys(emb).length;
  const total = countSqlite(paths.sqlite) ?? countJsonl(paths.jsonl);
  if (typeof total !== 'number' || total === 0) {
    return bad('embedding-coverage', 'cannot determine corpus size, so coverage is unknown',
      { vectors: nVec });
  }
  const coverage = nVec / total;
  if (coverage < MIN_EMBEDDING_COVERAGE) {
    return bad('embedding-coverage',
      `${nVec}/${total} = ${(coverage * 100).toFixed(1)}% embedded — semantic search silently covers `
      + `a fraction of the corpus while keyword search covers all of it, so partial results look healthy`,
      { vectors: nVec, total, coverage });
  }
  return ok('embedding-coverage', `${nVec}/${total} = ${(coverage * 100).toFixed(1)}%`,
    { vectors: nVec, total, coverage });
}

/**
 * 3. Are the vectors REAL?
 *
 * The discriminating signal is component diversity, NOT magnitude. A previous
 * audit of this store reported "30 distinct magnitudes = fake embeddings"; that
 * was a misdiagnosis. Magnitudes clustering at exactly 1.0 is the signature of
 * L2 normalisation, which is correct for cosine similarity. Real degeneracy
 * shows up as identical or near-identical VECTORS.
 */
function checkEmbeddingSanity(paths, sampleSize = 400) {
  const emb = loadEmbeddings(paths.embeddings);
  if (emb === null) return bad('embedding-sanity', `no readable embedding store at ${paths.embeddings}`);
  const entries = Array.isArray(emb) ? emb : Object.values(emb);
  const sample = entries.slice(0, sampleSize).map(vectorOf).filter((v) => Array.isArray(v) && v.length);
  if (sample.length === 0) return bad('embedding-sanity', 'no usable vectors found in the store');

  const dims = new Set(sample.map((v) => v.length));
  if (dims.size > 1) {
    return bad('embedding-sanity',
      `mixed dimensions ${[...dims].join('/')} — the store was written by more than one embedder, `
      + 'so distances across it are meaningless', { dims: [...dims] });
  }
  // Fingerprint the leading components: distinct texts must yield distinct
  // vectors. Duplicates here mean a constant or placeholder was written.
  const fp = new Set(sample.map((v) => v.slice(0, 8).map((x) => x.toFixed(6)).join(',')));
  const distinctRatio = fp.size / sample.length;
  if (distinctRatio < 0.9) {
    return bad('embedding-sanity',
      `only ${fp.size}/${sample.length} vectors are distinct (${(distinctRatio * 100).toFixed(1)}%) `
      + '— duplicate vectors mean placeholder or constant embeddings, not real ones',
      { distinct: fp.size, sampled: sample.length, distinctRatio });
  }
  const dim = [...dims][0];
  return ok('embedding-sanity',
    `${sample.length} sampled, dim=${dim}, ${fp.size} distinct (${(distinctRatio * 100).toFixed(1)}%)`,
    { dim, distinct: fp.size, sampled: sample.length, distinctRatio });
}

/** 4. Is the search index built from CURRENT content? */
function checkIndexFreshness(paths) {
  const dir = paths.grepaiCorpus;
  if (!dir || !fs.existsSync(dir)) {
    return bad('index-freshness', `no grepai corpus at ${dir}`);
  }
  let behind;
  try {
    execFileSync('git', ['-C', dir, 'fetch', 'origin', 'main', '--quiet'], { timeout: 60000, stdio: 'ignore' });
    behind = String(execFileSync('git', ['-C', dir, 'rev-list', '--count', 'HEAD..origin/main'], {
      encoding: 'utf8', timeout: 30000,
    })).trim();
  } catch {
    return bad('index-freshness', 'could not compare the indexed corpus against origin/main');
  }
  const n = Number(behind);
  if (!Number.isFinite(n)) return bad('index-freshness', `unreadable commit distance: ${behind}`);
  if (n > 0) {
    return bad('index-freshness',
      `indexed corpus is ${n} commits behind origin/main — the index mirrors a stale snapshot and `
      + 'answers confidently from it', { behind: n });
  }
  return ok('index-freshness', 'indexed corpus is level with origin/main', { behind: 0 });
}

function runIngestionIntegrity(opts = {}) {
  const home = opts.home || os.homedir();
  const paths = {
    sqlite: opts.sqlite || path.join(home, '.thumbgate', 'lessons.sqlite'),
    jsonl: opts.jsonl || path.join(home, '.thumbgate', 'lessons-index.jsonl'),
    embeddings: opts.embeddings || path.join(home, '.thumbgate', 'lesson-embeddings.json'),
    grepaiCorpus: opts.grepaiCorpus
      || path.join(home, '.hermes', 'semantic-index', 'mac-yolo-safeguards'),
  };
  const checks = [
    checkStoreReconciliation(paths),
    checkEmbeddingCoverage(paths),
    checkEmbeddingSanity(paths),
  ];
  if (!opts.skipFreshness) checks.push(checkIndexFreshness(paths));

  const failed = checks.filter((c) => c.status === 'fail').length;
  return { timestamp: new Date().toISOString(), paths, checks, failed, ok: failed === 0 };
}

function render(res) {
  const out = ['', '=== INGESTION INTEGRITY ===', ''];
  for (const c of res.checks) {
    out.push(`  [${c.status === 'ok' ? 'OK  ' : 'FAIL'}] ${c.name}`);
    out.push(`         ${c.detail}`);
  }
  out.push('', `  ${res.checks.length - res.failed}/${res.checks.length} checks passed`, '');
  return out.join('\n');
}

module.exports = {
  runIngestionIntegrity,
  render,
  checkStoreReconciliation,
  checkEmbeddingCoverage,
  checkEmbeddingSanity,
  checkIndexFreshness,
  MIN_EMBEDDING_COVERAGE,
  MAX_STORE_DRIFT,
};

if (require.main === module) {
  const res = runIngestionIntegrity({ skipFreshness: process.argv.includes('--no-git') });
  if (process.argv.includes('--json')) console.log(JSON.stringify(res, null, 2));
  else console.log(render(res));
  process.exit(res.ok ? 0 : 1);
}
