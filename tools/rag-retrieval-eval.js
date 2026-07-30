#!/usr/bin/env node
'use strict';

/**
 * Retrieval evaluation over the PRODUCTION retrieval backends, with
 * recall@k AND MRR (mean reciprocal rank of the first relevant result).
 *
 *   lexical — tools/hermes-retrieval-harness.js over the repo corpus
 *             (tests/fixtures/rag-eval/cases.json, path-substring relevance)
 *   lessons — ThumbGate lessons store at .thumbgate/memory-log.jsonl,
 *             searched via the installed runtime package
 *             ~/.thumbgate/runtime/node_modules/thumbgate (required in-process
 *             for determinism; lesson-id relevance,
 *             tests/fixtures/rag-eval/lessons-cases.json)
 *   grepai  — OPTIONAL semantic code search over the same lexical cases.
 *             Measured when reachable within 20s per query; reported
 *             "unreachable" honestly otherwise. Never fails the run.
 *
 * Exit 0 when every lexical case AND every lessons case (when the lessons
 * backend is available on this machine) hits all required results in top-k.
 * The lessons store and runtime are local-only (gitignored), so on CI the
 * lessons backend reports available:false instead of failing.
 *
 *   node tools/rag-retrieval-eval.js
 *   node tools/rag-retrieval-eval.js --json
 *   node tools/rag-retrieval-eval.js --json --no-grepai   # skip the optional leg
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const DEFAULT_FIXTURE = path.join(REPO, 'tests/fixtures/rag-eval/cases.json');
const DEFAULT_LESSONS_FIXTURE = path.join(REPO, 'tests/fixtures/rag-eval/lessons-cases.json');
const RETRIEVE = path.join(REPO, 'tools/hermes-retrieval-harness.js');
const LESSONS_DIR = path.join(REPO, '.thumbgate');
const LESSONS_LOG = path.join(LESSONS_DIR, 'memory-log.jsonl');
const LESSONS_RUNTIME = path.join(
  os.homedir(),
  '.thumbgate/runtime/node_modules/thumbgate/scripts/lesson-search.js',
);
const GREPAI_TIMEOUT_MS = 20000;

function parseArgs(argv) {
  const args = {
    fixture: DEFAULT_FIXTURE,
    lessonsFixture: DEFAULT_LESSONS_FIXTURE,
    grepai: true,
    json: false,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--json') args.json = true;
    else if (a === '--fixture') args.fixture = path.resolve(argv[++i] || '');
    else if (a === '--lessons-fixture') args.lessonsFixture = path.resolve(argv[++i] || '');
    else if (a === '--no-grepai') args.grepai = false;
    else if (a === '--help' || a === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${a}`);
  }
  return args;
}

// ---------------------------------------------------------------------------
// Scoring — shared by every backend.
// ---------------------------------------------------------------------------

function pathMatches(item, requiredSubstring) {
  const normalized = String(item).replace(/\\/g, '/');
  return normalized.includes(requiredSubstring);
}

function idMatches(item, requiredId) {
  return item === requiredId;
}

/**
 * Score one ranked result list against required relevant entries.
 *  - recallAtK: fraction of required entries present anywhere in the list
 *  - reciprocalRank: 1/rank of the FIRST relevant result (0 if none) — the
 *    per-case term of MRR
 */
function scoreRanking(rankedItems, required, matches) {
  const missing = required.filter((need) => !rankedItems.some((item) => matches(item, need)));
  const hit = required.length - missing.length;
  const recallAtK = required.length ? hit / required.length : 1;
  const firstRelevantIndex = rankedItems.findIndex((item) =>
    required.some((need) => matches(item, need)),
  );
  const reciprocalRank = firstRelevantIndex < 0 ? 0 : 1 / (firstRelevantIndex + 1);
  return { recallAtK, reciprocalRank, missing };
}

function mean(values) {
  return values.length === 0 ? 0 : values.reduce((sum, v) => sum + v, 0) / values.length;
}

function round4(value) {
  return Number(value.toFixed(4));
}

function summarizeResults(results) {
  return {
    caseCount: results.length,
    passCount: results.filter((r) => r.pass).length,
    meanRecallAtK: round4(mean(results.map((r) => r.recallAtK))),
    meanMRR: round4(mean(results.map((r) => r.reciprocalRank))),
    results,
  };
}

function readFixture(fixturePath, requiredField) {
  const fixture = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
  validateFixture(fixture, requiredField, fixturePath);
  return fixture;
}

function validateFixture(fixture, requiredField, label = 'fixture') {
  if (!Array.isArray(fixture.cases) || fixture.cases.length === 0) {
    throw new Error(`${label}: fixture has no cases`);
  }
  const seen = new Set();
  for (const testCase of fixture.cases) {
    const id = testCase.id;
    if (!id || typeof id !== 'string') throw new Error(`${label}: case without a string id`);
    if (seen.has(id)) throw new Error(`${label}: duplicate case id ${id}`);
    seen.add(id);
    if (!testCase.query || typeof testCase.query !== 'string') {
      throw new Error(`${label}: case ${id} has no query`);
    }
    const required = testCase[requiredField];
    if (!Array.isArray(required) || required.length === 0) {
      throw new Error(`${label}: case ${id} has no ${requiredField}`);
    }
    if (!Number.isInteger(testCase.k) || testCase.k <= 0) {
      throw new Error(`${label}: case ${id} has no positive integer k`);
    }
  }
}

// ---------------------------------------------------------------------------
// Backend: lexical (hermes-retrieval-harness)
// ---------------------------------------------------------------------------

function runRetrieve(query, limit) {
  const result = spawnSync(
    process.execPath,
    [RETRIEVE, 'retrieve', '--query', query, '--limit', String(limit), '--json'],
    { cwd: REPO, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024 },
  );
  if (result.status !== 0) {
    return {
      ok: false,
      error: (result.stderr || result.stdout || `exit ${result.status}`).trim(),
      paths: [],
    };
  }
  try {
    const body = JSON.parse(result.stdout);
    const hits = body.matches || [];
    const paths = hits.map((hit) => hit.path || '').filter(Boolean);
    return { ok: true, paths };
  } catch (error) {
    return { ok: false, error: `invalid JSON: ${error.message}`, paths: [] };
  }
}

function evaluateLexicalCase(testCase) {
  const k = testCase.k;
  const required = testCase.mustIncludePathSubstrings;
  const run = runRetrieve(testCase.query, k);
  if (!run.ok) {
    return { id: testCase.id, pass: false, k, recallAtK: 0, reciprocalRank: 0, missing: required, paths: [], error: run.error };
  }
  const paths = run.paths.slice(0, k);
  const score = scoreRanking(paths, required, pathMatches);
  return { id: testCase.id, pass: score.missing.length === 0, k, ...score, paths };
}

function evaluateLexicalBackend(fixturePath, cases) {
  return {
    fixture: path.relative(REPO, fixturePath),
    ...summarizeResults(cases.map(evaluateLexicalCase)),
  };
}

// ---------------------------------------------------------------------------
// Backend: ThumbGate lessons store (production memory retrieval)
// ---------------------------------------------------------------------------

function loadLessonsRuntime() {
  if (!fs.existsSync(LESSONS_LOG)) {
    return { available: false, reason: `no lessons store at ${path.relative(REPO, LESSONS_LOG)} (local-only, gitignored)` };
  }
  if (!fs.existsSync(LESSONS_RUNTIME)) {
    return { available: false, reason: `thumbgate runtime not installed at ${LESSONS_RUNTIME}` };
  }
  try {
    // eslint-disable-next-line import/no-dynamic-require, global-require
    const { searchLessons } = require(LESSONS_RUNTIME);
    if (typeof searchLessons !== 'function') {
      return { available: false, reason: 'thumbgate runtime exports no searchLessons()' };
    }
    return { available: true, searchLessons };
  } catch (error) {
    return { available: false, reason: `thumbgate runtime failed to load: ${error.message}` };
  }
}

function evaluateLessonsCase(searchLessons, testCase) {
  const k = testCase.k;
  const required = testCase.requiredLessonIds;
  let ids;
  try {
    const result = searchLessons(testCase.query, { feedbackDir: LESSONS_DIR, limit: k });
    ids = (result.results || []).map((entry) => entry.id).filter(Boolean);
  } catch (error) {
    return { id: testCase.id, pass: false, k, recallAtK: 0, reciprocalRank: 0, missing: required, lessonIds: [], error: error.message };
  }
  const score = scoreRanking(ids, required, idMatches);
  return { id: testCase.id, pass: score.missing.length === 0, k, ...score, lessonIds: ids };
}

function evaluateLessonsBackend(fixturePath) {
  const runtime = loadLessonsRuntime();
  if (!runtime.available) {
    return { available: false, reason: runtime.reason, fixture: path.relative(REPO, fixturePath) };
  }
  const fixture = readFixture(fixturePath, 'requiredLessonIds');
  return {
    available: true,
    fixture: path.relative(REPO, fixturePath),
    store: path.relative(REPO, LESSONS_LOG),
    ...summarizeResults(fixture.cases.map((c) => evaluateLessonsCase(runtime.searchLessons, c))),
  };
}

// ---------------------------------------------------------------------------
// Backend: grepai semantic code search (optional — never fails the run)
// ---------------------------------------------------------------------------

function runGrepaiSearch(query, k) {
  const result = spawnSync(
    'grepai',
    // grepai limits CHUNKS, not files; ask for extra chunks then dedupe to
    // the top-k unique file paths in rank order.
    ['search', query, '--json', '--compact', '--limit', String(k * 4)],
    { cwd: REPO, encoding: 'utf8', timeout: GREPAI_TIMEOUT_MS, maxBuffer: 8 * 1024 * 1024 },
  );
  if (result.error) {
    const reason = result.error.code === 'ETIMEDOUT'
      ? `timed out after ${GREPAI_TIMEOUT_MS}ms`
      : result.error.message;
    return { ok: false, reason };
  }
  if (result.status !== 0) {
    return { ok: false, reason: (result.stderr || result.stdout || `exit ${result.status}`).trim().slice(0, 200) };
  }
  try {
    const rows = JSON.parse(result.stdout);
    const seen = new Set();
    const paths = [];
    for (const row of rows) {
      const p = row.file_path || '';
      if (!p || seen.has(p)) continue;
      seen.add(p);
      paths.push(p);
      if (paths.length >= k) break;
    }
    return { ok: true, paths };
  } catch (error) {
    return { ok: false, reason: `invalid JSON: ${error.message}` };
  }
}

function evaluateGrepaiBackend(cases) {
  const results = [];
  for (const testCase of cases) {
    const run = runGrepaiSearch(testCase.query, testCase.k);
    if (!run.ok) {
      return {
        status: 'unreachable',
        reason: `query "${testCase.query.slice(0, 60)}": ${run.reason}`,
      };
    }
    const score = scoreRanking(run.paths, testCase.mustIncludePathSubstrings, pathMatches);
    results.push({ id: testCase.id, pass: score.missing.length === 0, k: testCase.k, ...score, paths: run.paths });
  }
  return { status: 'measured', ...summarizeResults(results) };
}

// ---------------------------------------------------------------------------
// Report
// ---------------------------------------------------------------------------

function buildReport(args) {
  const lexicalCases = readFixture(args.fixture, 'mustIncludePathSubstrings').cases;
  const lexical = evaluateLexicalBackend(args.fixture, lexicalCases);
  const lessons = evaluateLessonsBackend(args.lessonsFixture);
  const grepai = args.grepai
    ? evaluateGrepaiBackend(lexicalCases)
    : { status: 'skipped', reason: '--no-grepai' };

  const combinedResults = [
    ...lexical.results,
    ...(lessons.available ? lessons.results : []),
  ];
  const combined = {
    caseCount: combinedResults.length,
    meanRecallAtK: round4(mean(combinedResults.map((r) => r.recallAtK))),
    meanMRR: round4(mean(combinedResults.map((r) => r.reciprocalRank))),
  };

  const ok =
    lexical.caseCount > 0 &&
    lexical.passCount === lexical.caseCount &&
    (!lessons.available || lessons.passCount === lessons.caseCount);

  return {
    ok,
    // Legacy top-level fields = the lexical backend, kept for
    // tools/system-maturity-scorecard.js and tests/test-system-maturity.js.
    meanRecallAtK: lexical.meanRecallAtK,
    results: lexical.results,
    backends: { lexical, lessons, grepai },
    combined,
  };
}

function printCase(r) {
  const mark = r.pass ? 'PASS' : 'FAIL';
  console.log(
    `  [${mark}] ${r.id} recall@${r.k}=${r.recallAtK.toFixed(2)} RR=${r.reciprocalRank.toFixed(2)}${r.error ? ` · ${r.error}` : ''}`,
  );
  if (r.missing?.length) console.log(`         missing: ${r.missing.join(', ')}`);
}

function printReport(report) {
  const { lexical, lessons, grepai } = report.backends;
  console.log('RAG retrieval eval — production backends');
  console.log(
    `lexical (hermes-retrieval-harness): ${lexical.passCount}/${lexical.caseCount} pass · recall@k=${lexical.meanRecallAtK} · MRR=${lexical.meanMRR}`,
  );
  for (const r of lexical.results) printCase(r);
  if (lessons.available) {
    console.log(
      `lessons (thumbgate runtime, ${lessons.store}): ${lessons.passCount}/${lessons.caseCount} pass · recall@k=${lessons.meanRecallAtK} · MRR=${lessons.meanMRR}`,
    );
    for (const r of lessons.results) printCase(r);
  } else {
    console.log(`lessons (thumbgate runtime): unavailable — ${lessons.reason}`);
  }
  if (grepai.status === 'measured') {
    console.log(
      `grepai (semantic, optional): ${grepai.passCount}/${grepai.caseCount} pass · recall@k=${grepai.meanRecallAtK} · MRR=${grepai.meanMRR}`,
    );
    for (const r of grepai.results) printCase(r);
  } else {
    console.log(`grepai (semantic, optional): ${grepai.status} — ${grepai.reason}`);
  }
  console.log(
    `combined (lexical+lessons): recall@k=${report.combined.meanRecallAtK} · MRR=${report.combined.meanMRR} over ${report.combined.caseCount} cases`,
  );
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log('Usage: node tools/rag-retrieval-eval.js [--fixture PATH] [--lessons-fixture PATH] [--no-grepai] [--json]');
    process.exit(0);
  }
  if (!fs.existsSync(RETRIEVE)) {
    console.error('missing tools/hermes-retrieval-harness.js');
    process.exit(2);
  }
  const report = buildReport(args);
  if (args.json) console.log(JSON.stringify(report, null, 2));
  else printReport(report);
  process.exit(report.ok ? 0 : 1);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(2);
  }
}

module.exports = { scoreRanking, pathMatches, idMatches, validateFixture, parseArgs };
