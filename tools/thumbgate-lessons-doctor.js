#!/usr/bin/env node
'use strict';

/**
 * ThumbGate lessons doctor — READ-ONLY health report for the .thumbgate data
 * directory that backs mcp recall / lessons retrieval.
 *
 * Diagnoses the four defects found in the 2026-07-29 RAG audit:
 *   1. STORE DRIFT — lessons-index.jsonl (ledger) vs lessons.sqlite (FTS
 *      search corpus) counts diverging (observed: 454 vs 3 — FTS covered <1%).
 *   2. FAKE EMBEDDINGS — lesson-embeddings.json vectors that are hashing-trick
 *      term frequencies (tiny distinct-value alphabet), not neural embeddings.
 *   3. EMPTY VECTOR DB — lancedb/ initialized (manifest only) with no .lance
 *      data files.
 *   4. SUSPECT SYNTHESIZED RULES — auto-promoted rules that look like
 *      questions or double-prefixed captures ("NEVER: SUCCESS: ...?"), i.e.
 *      vague feedback promoted into global gates.
 *
 * Never mutates anything. Exit 0 with --warn-only or when healthy; exit 1
 * when any check fails. Package-side fixes belong in the ThumbGate repo
 * (github.com/IgorGanapolsky/ThumbGate) — this doctor is the detector.
 *
 * Usage: node tools/thumbgate-lessons-doctor.js [--dir .thumbgate] [--json] [--warn-only]
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const DRIFT_RATIO_FLOOR = 0.5; // sqlite should hold at least half the ledger
const MIN_DISTINCT_MAGNITUDES = 50; // neural embeddings have ~continuous values

function parseArgs(argv) {
  const args = { dir: path.join(REPO, '.thumbgate'), json: false, warnOnly: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--dir') args.dir = path.resolve(argv[++i] || '');
    else if (a === '--json') args.json = true;
    else if (a === '--warn-only') args.warnOnly = true;
    else throw new Error(`Unknown argument: ${a}`);
  }
  return args;
}

function countJsonlLines(file) {
  if (!fs.existsSync(file)) return null;
  return fs.readFileSync(file, 'utf8').split('\n').filter((line) => line.trim()).length;
}

function sqliteLessonCount(dbPath) {
  if (!fs.existsSync(dbPath)) return { count: null, note: 'lessons.sqlite absent' };
  const probe = spawnSync('sqlite3', [dbPath, 'SELECT COUNT(*) FROM lessons;'], { encoding: 'utf8', timeout: 10000 });
  if (probe.error && probe.error.code === 'ENOENT') return { count: null, note: 'sqlite3 CLI unavailable — count skipped' };
  if (probe.status !== 0) return { count: null, note: `sqlite3 error: ${(probe.stderr || '').slice(0, 120)}` };
  const count = Number(probe.stdout.trim());
  return Number.isFinite(count) ? { count } : { count: null, note: 'unparseable count' };
}

function embeddingDiagnosis(file) {
  if (!fs.existsSync(file)) return { status: 'absent' };
  let data;
  try {
    data = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (error) {
    return { status: 'unparseable', note: error.message };
  }
  const entries = Array.isArray(data) ? data : Object.values(data);
  const first = entries.find((e) => Array.isArray(e?.embedding || e?.vector || e));
  const vector = first ? first.embedding || first.vector || first : null;
  if (!Array.isArray(vector) || vector.length === 0) return { status: 'no-vectors', entries: entries.length };
  const magnitudes = new Set(vector.filter((v) => v !== 0).map((v) => Math.abs(v).toFixed(6)));
  return {
    status: magnitudes.size < MIN_DISTINCT_MAGNITUDES ? 'hashed-term-frequency (NOT neural)' : 'plausibly neural',
    entries: entries.length,
    dimensions: vector.length,
    distinctMagnitudes: magnitudes.size,
  };
}

function lancedbDiagnosis(dir) {
  if (!fs.existsSync(dir)) return { status: 'absent' };
  let dataFiles = 0;
  const stack = [dir];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.name.endsWith('.lance')) dataFiles += 1;
    }
  }
  return { status: dataFiles > 0 ? 'has-data' : 'initialized-but-EMPTY', dataFiles };
}

function suspectRules(file) {
  if (!fs.existsSync(file)) return { status: 'absent', suspects: [] };
  const suspects = [];
  const lines = fs.readFileSync(file, 'utf8').split('\n').filter((l) => l.trim());
  for (const line of lines) {
    let rule;
    try {
      rule = JSON.parse(line);
    } catch {
      continue;
    }
    const text = JSON.stringify(rule);
    const ruleText = rule?.rule?.action?.text || rule?.rule?.trigger?.text || rule?.text || text;
    const looksLikeQuestion = /\?["\s,}]/.test(ruleText) || /\?$/.test(String(ruleText).trim());
    const doublePrefixed = /NEVER:\s*(SUCCESS|MISTAKE|BLOCKED):/i.test(text);
    if (looksLikeQuestion || doublePrefixed) {
      suspects.push({
        id: rule.id || rule?.rule?.id || 'unknown',
        why: [looksLikeQuestion && 'question-shaped', doublePrefixed && 'double-prefixed capture'].filter(Boolean),
        excerpt: String(ruleText).slice(0, 140),
      });
    }
  }
  return { status: 'checked', total: lines.length, suspects };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const problems = [];
  const report = { dir: args.dir, checkedAt: new Date().toISOString() };

  if (!fs.existsSync(args.dir)) {
    report.note = '.thumbgate directory absent — nothing to diagnose';
    console.log(JSON.stringify(report, null, 2));
    process.exit(0);
  }

  // 1. Store drift
  const ledgerCount = countJsonlLines(path.join(args.dir, 'lessons-index.jsonl'));
  const sqlite = sqliteLessonCount(path.join(args.dir, 'lessons.sqlite'));
  report.storeDrift = { ledgerCount, sqliteCount: sqlite.count, note: sqlite.note };
  if (ledgerCount !== null && sqlite.count !== null && ledgerCount > 0) {
    const ratio = sqlite.count / ledgerCount;
    report.storeDrift.coverage = Number(ratio.toFixed(3));
    if (ratio < DRIFT_RATIO_FLOOR) {
      problems.push(
        `store drift: lessons.sqlite holds ${sqlite.count}/${ledgerCount} ledger lessons (${(ratio * 100).toFixed(1)}% — FTS search is blind to the rest)`,
      );
    }
  }

  // 2. Embeddings
  report.embeddings = embeddingDiagnosis(path.join(args.dir, 'lesson-embeddings.json'));
  if (String(report.embeddings.status).includes('NOT neural')) {
    problems.push(
      `embeddings are ${report.embeddings.status} (${report.embeddings.distinctMagnitudes} distinct magnitudes across ${report.embeddings.dimensions} dims) — semantic recall is keyword-grade`,
    );
  }

  // 3. LanceDB
  report.lancedb = lancedbDiagnosis(path.join(args.dir, 'lancedb'));
  if (report.lancedb.status === 'initialized-but-EMPTY') {
    problems.push('lancedb initialized but contains zero .lance data files — vector path is a stub');
  }

  // 4. Synthesized rules
  report.synthesizedRules = suspectRules(path.join(args.dir, 'synthesized-rules.jsonl'));
  if (report.synthesizedRules.suspects?.length) {
    problems.push(
      `${report.synthesizedRules.suspects.length}/${report.synthesizedRules.total} synthesized rules look like vague captures promoted to gates (question-shaped or double-prefixed) — review before they block real work`,
    );
  }

  report.ok = problems.length === 0;
  report.problems = problems;
  console.log(JSON.stringify(report, null, 2));
  process.exit(report.ok || args.warnOnly ? 0 : 1);
}

try {
  main();
} catch (error) {
  console.error(error.message || error);
  process.exit(2);
}
