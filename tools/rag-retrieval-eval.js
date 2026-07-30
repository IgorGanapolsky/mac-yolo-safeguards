#!/usr/bin/env node
'use strict';

/**
 * Offline retrieval evaluation for the local RAG stack.
 *
 * Measures recall@k, nDCG@k and MRR against fixed fixtures — not live
 * ThumbGate MCP (auth-bound). Exit 0 when every *measured* case hits its
 * required substrings within top-k.
 *
 * Two retrieval backends, selected by the fixture's `backend` field:
 *
 *   harness (default) — tools/hermes-retrieval-harness.js over repo files.
 *                       Always available; this is the suite the ML integrity
 *                       gate requires ok=true on.
 *   lessons           — the ThumbGate lessons store via the runtime package at
 *                       ~/.thumbgate/runtime/node_modules/thumbgate. The store
 *                       is gitignored and absent on CI, so this backend reports
 *                       `backendState: "unavailable"`, skips its cases and
 *                       still exits 0 rather than inventing a score.
 *
 * An optional grepai leg (--grepai) scores the same harness cases through the
 * semantic index for comparison. It is advisory only: it never changes `ok`
 * and never changes the exit code, and reports `unreachable` when the binary
 * is missing, errors, or exceeds its 20s timeout.
 *
 *   node tools/rag-retrieval-eval.js
 *   node tools/rag-retrieval-eval.js --json
 *   node tools/rag-retrieval-eval.js --fixture tests/fixtures/rag-eval/lessons-cases.json
 *   node tools/rag-retrieval-eval.js --grepai --json
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { matchesAnySubstring, ndcgAtK, reciprocalRankAtK } = require('./ml-core');

const REPO = path.resolve(__dirname, '..');
const DEFAULT_FIXTURE = path.join(REPO, 'tests/fixtures/rag-eval/cases.json');
const RETRIEVE = path.join(REPO, 'tools/hermes-retrieval-harness.js');

const HARNESS_BACKEND = 'harness';
const LESSONS_BACKEND = 'lessons';

/** Installed ThumbGate runtime — deliberately not a package.json dependency. */
const LESSON_SEARCH_MODULE = path.join(
  os.homedir(),
  '.thumbgate/runtime/node_modules/thumbgate/scripts/lesson-search.js',
);
const DEFAULT_LESSONS_DIR = path.join(REPO, '.thumbgate');

const GREPAI_TIMEOUT_MS = 20000;

function parseArgs(argv) {
  const args = {
    fixture: DEFAULT_FIXTURE,
    json: false,
    help: false,
    grepai: false,
    lessonsDir: DEFAULT_LESSONS_DIR,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--json') args.json = true;
    else if (a === '--grepai') args.grepai = true;
    else if (a === '--fixture') args.fixture = path.resolve(argv[++i] || '');
    else if (a === '--lessons-dir') args.lessonsDir = path.resolve(argv[++i] || '');
    else if (a === '--help' || a === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${a}`);
  }
  return args;
}

/**
 * Required items for a case. Harness fixtures match on path substrings;
 * lessons fixtures match on lesson ids. Both run through the same substring
 * relevance predicate, so a lesson id simply degenerates to exact equality.
 */
function requiredFor(testCase) {
  if (Array.isArray(testCase.mustIncludePathSubstrings)) return testCase.mustIncludePathSubstrings;
  if (Array.isArray(testCase.mustIncludeLessonIds)) return testCase.mustIncludeLessonIds;
  return [];
}

/** recall@k + nDCG@k + reciprocal rank over one ranked list. */
function scoreRanking(ranked, required, k) {
  const missing = required.filter((sub) => !ranked.some((item) => matchesAnySubstring(item, [sub])));
  const hit = required.length - missing.length;
  return {
    recallAtK: required.length ? hit / required.length : 1,
    ndcgAtK: ndcgAtK(ranked, required, k),
    reciprocalRank: reciprocalRankAtK(ranked, required, k),
    missing,
  };
}

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
    const hits = body.matches || body.results || body.hits || body.files || [];
    const paths = hits
      .map((hit) => hit.path || hit.relativePath || hit.file || '')
      .filter(Boolean);
    return { ok: true, paths, raw: body };
  } catch (error) {
    return { ok: false, error: `invalid JSON: ${error.message}`, paths: [] };
  }
}

// --- lessons backend -------------------------------------------------------

/**
 * Resolve the lessons backend without pretending. Returns `ready` only when
 * both the store and the runtime package are actually present; otherwise
 * `unavailable` with the concrete reason, which is what CI sees.
 */
function resolveLessonsBackend(lessonsDir) {
  const store = path.join(lessonsDir, 'memory-log.jsonl');
  if (!fs.existsSync(store)) {
    return { state: 'unavailable', reason: `no lessons store at ${store}` };
  }
  let mod;
  try {
    // eslint-disable-next-line global-require, import/no-dynamic-require
    mod = require(LESSON_SEARCH_MODULE);
  } catch (error) {
    return {
      state: 'unavailable',
      reason: `thumbgate runtime unavailable (${LESSON_SEARCH_MODULE}): ${error.code || error.message}`,
    };
  }
  if (typeof mod.searchLessons !== 'function') {
    return { state: 'unavailable', reason: `${LESSON_SEARCH_MODULE} exports no searchLessons()` };
  }
  return { state: 'ready', searchLessons: mod.searchLessons, store };
}

function runLessonSearch(searchLessons, query, limit, lessonsDir) {
  try {
    const body = searchLessons(query, { limit, feedbackDir: lessonsDir });
    const ids = (body.results || []).map((entry) => entry.id).filter(Boolean);
    return { ok: true, ids, totalLessons: body.totalLessons ?? null };
  } catch (error) {
    return { ok: false, error: error.message || String(error), ids: [] };
  }
}

// --- optional grepai leg ---------------------------------------------------

/**
 * grepai returns chunk-level hits, several per file. Dedupe to first-seen file
 * order so its ranking is comparable with the harness's file-level ranking.
 */
function dedupeByFile(rows) {
  const seen = new Set();
  const paths = [];
  for (const row of rows) {
    const file = row.file_path || row.path || row.file || '';
    if (!file || seen.has(file)) continue;
    seen.add(file);
    paths.push(file);
  }
  return paths;
}

function runGrepai(query, k) {
  const result = spawnSync(
    'grepai',
    ['search', query, '--json', '--compact', '--limit', String(Math.max(30, k * 6))],
    { cwd: REPO, encoding: 'utf8', timeout: GREPAI_TIMEOUT_MS, maxBuffer: 8 * 1024 * 1024 },
  );
  if (result.error) {
    const code = result.error.code || result.error.message;
    return {
      ok: false,
      reason: code === 'ETIMEDOUT' ? `timed out after ${GREPAI_TIMEOUT_MS}ms` : String(code),
    };
  }
  if (result.signal) return { ok: false, reason: `killed by ${result.signal}` };
  if (result.status !== 0) {
    return { ok: false, reason: `exit ${result.status}: ${(result.stderr || '').trim().slice(0, 160)}` };
  }
  let rows;
  try {
    rows = JSON.parse(result.stdout || 'null');
  } catch (error) {
    return { ok: false, reason: `invalid JSON: ${error.message}` };
  }
  if (!Array.isArray(rows)) return { ok: false, reason: 'unexpected grepai payload (not an array)' };
  return { ok: true, paths: dedupeByFile(rows) };
}

/**
 * Advisory grepai comparison over the same cases. Never gates: the caller
 * ignores this block when computing `ok` and the exit code.
 */
function evaluateGrepai(cases, backend) {
  if (backend !== HARNESS_BACKEND) {
    return {
      state: 'not-applicable',
      gating: false,
      reason: `grepai indexes repo files; fixture backend is "${backend}"`,
    };
  }
  const results = [];
  let unreachableReason = null;
  for (const testCase of cases) {
    const k = testCase.k || 8;
    const run = runGrepai(testCase.query, k);
    if (!run.ok) {
      unreachableReason = unreachableReason || run.reason;
      results.push({ id: testCase.id, k, measured: false, error: run.reason });
      continue;
    }
    const scored = scoreRanking(run.paths, requiredFor(testCase), k);
    results.push({
      id: testCase.id,
      k,
      measured: true,
      recallAtK: Number(scored.recallAtK.toFixed(4)),
      ndcgAtK: scored.ndcgAtK,
      reciprocalRank: scored.reciprocalRank,
      missing: scored.missing,
    });
  }
  const measured = results.filter((r) => r.measured);
  return {
    state: measured.length > 0 ? 'measured' : 'unreachable',
    gating: false,
    timeoutMs: GREPAI_TIMEOUT_MS,
    reason: unreachableReason,
    caseCount: results.length,
    measuredCount: measured.length,
    // null, not 0 — nothing was measured, so there is no score to report.
    meanRecallAtK: measured.length ? mean(measured.map((r) => r.recallAtK)) : null,
    meanNdcgAtK: measured.length ? mean(measured.map((r) => r.ndcgAtK)) : null,
    meanReciprocalRank: measured.length ? mean(measured.map((r) => r.reciprocalRank)) : null,
    results,
  };
}

// --- case evaluation -------------------------------------------------------

function evaluateCase(testCase, context = {}) {
  const backend = context.backend || HARNESS_BACKEND;
  const k = testCase.k || 8;
  const required = requiredFor(testCase);

  if (backend === LESSONS_BACKEND && context.backendState !== 'ready') {
    return {
      id: testCase.id,
      pass: null,
      skipped: true,
      skipReason: context.backendReason || 'lessons backend unavailable',
      k,
      recallAtK: null,
      ndcgAtK: null,
      reciprocalRank: null,
      missing: required,
      paths: [],
    };
  }

  const run =
    backend === LESSONS_BACKEND
      ? runLessonSearch(context.searchLessons, testCase.query, k, context.lessonsDir)
      : runRetrieve(testCase.query, k);
  const ranked = backend === LESSONS_BACKEND ? run.ids : run.paths;

  if (!run.ok) {
    return {
      id: testCase.id,
      pass: false,
      k,
      recallAtK: 0,
      ndcgAtK: 0,
      reciprocalRank: 0,
      missing: required,
      paths: [],
      error: run.error,
    };
  }

  const scored = scoreRanking(ranked, required, k);
  return {
    id: testCase.id,
    pass: scored.missing.length === 0,
    k,
    recallAtK: scored.recallAtK,
    ndcgAtK: scored.ndcgAtK,
    reciprocalRank: scored.reciprocalRank,
    missing: scored.missing,
    paths: ranked.slice(0, k),
  };
}

function mean(values) {
  if (!values.length) return 0;
  return Number((values.reduce((sum, v) => sum + v, 0) / values.length).toFixed(4));
}

function evaluateFixture(fixture, args) {
  const backend = fixture.backend === LESSONS_BACKEND ? LESSONS_BACKEND : HARNESS_BACKEND;
  const cases = fixture.cases || [];
  const context = { backend, lessonsDir: args.lessonsDir, backendState: 'ready' };

  if (backend === LESSONS_BACKEND) {
    const resolved = resolveLessonsBackend(args.lessonsDir);
    context.backendState = resolved.state;
    context.backendReason = resolved.reason;
    context.searchLessons = resolved.searchLessons;
  }

  const results = cases.map((testCase) => evaluateCase(testCase, context));
  const evaluated = results.filter((r) => !r.skipped);
  const passCount = results.filter((r) => r.pass === true).length;

  const report = {
    // A skipped case is honestly unmeasured, not a pass: it cannot fail the
    // run, and `evaluatedCount` is what tells a reader how much was measured.
    ok: results.length > 0 && results.every((r) => r.pass === true || r.skipped === true),
    fixture: path.relative(REPO, args.fixture),
    backend,
    backendState: context.backendState,
    caseCount: results.length,
    passCount,
    evaluatedCount: evaluated.length,
    skippedCount: results.length - evaluated.length,
    // null, not 0, when nothing ran: 0 would read as "measured, scored zero".
    meanRecallAtK: evaluated.length ? mean(evaluated.map((r) => r.recallAtK)) : null,
    meanNdcgAtK: evaluated.length ? mean(evaluated.map((r) => r.ndcgAtK || 0)) : null,
    meanReciprocalRank: evaluated.length ? mean(evaluated.map((r) => r.reciprocalRank || 0)) : null,
    results,
  };
  if (context.backendReason) report.backendReason = context.backendReason;
  if (args.grepai) report.grepai = evaluateGrepai(cases, backend);
  return report;
}

function renderText(report) {
  const headline =
    report.evaluatedCount === 0
      ? `RAG retrieval eval: 0/${report.caseCount} cases measured · nothing scored`
      : `RAG retrieval eval: ${report.passCount}/${report.caseCount} cases pass · mean recall@k=${report.meanRecallAtK} · mean nDCG@k=${report.meanNdcgAtK} · mean MRR=${report.meanReciprocalRank}`;
  const lines = [
    headline,
    `  backend=${report.backend} state=${report.backendState} evaluated=${report.evaluatedCount} skipped=${report.skippedCount}`,
  ];
  if (report.backendReason) lines.push(`  reason: ${report.backendReason}`);
  for (const r of report.results) {
    if (r.skipped) {
      lines.push(`  [SKIP] ${r.id} · ${r.skipReason}`);
      continue;
    }
    const mark = r.pass ? 'PASS' : 'FAIL';
    lines.push(
      `  [${mark}] ${r.id} recall@${r.k}=${r.recallAtK.toFixed(2)} nDCG=${(r.ndcgAtK || 0).toFixed(2)} rr=${(r.reciprocalRank || 0).toFixed(2)}${r.error ? ` · ${r.error}` : ''}`,
    );
    if (r.missing?.length) lines.push(`         missing: ${r.missing.join(', ')}`);
  }
  if (report.grepai) {
    const g = report.grepai;
    lines.push(
      `  grepai (advisory, non-gating): ${g.state}${
        g.state === 'measured'
          ? ` · ${g.measuredCount}/${g.caseCount} measured · recall@k=${g.meanRecallAtK} nDCG@k=${g.meanNdcgAtK} MRR=${g.meanReciprocalRank}`
          : ''
      }${g.reason ? ` · ${g.reason}` : ''}`,
    );
  }
  return lines.join('\n');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(
      'Usage: node tools/rag-retrieval-eval.js [--fixture PATH] [--lessons-dir PATH] [--grepai] [--json]',
    );
    process.exit(0);
  }
  if (!fs.existsSync(RETRIEVE)) {
    console.error('missing tools/hermes-retrieval-harness.js');
    process.exit(2);
  }
  const fixture = JSON.parse(fs.readFileSync(args.fixture, 'utf8'));
  const report = evaluateFixture(fixture, args);
  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(renderText(report));
  }
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

module.exports = {
  dedupeByFile,
  evaluateCase,
  evaluateGrepai,
  mean,
  ndcgAtK,
  parseArgs,
  reciprocalRankAtK,
  requiredFor,
  resolveLessonsBackend,
  runLessonSearch,
  runRetrieve,
  scoreRanking,
};
