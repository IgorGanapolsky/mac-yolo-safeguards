#!/usr/bin/env node
'use strict';

/**
 * Tests for tools/rag-retrieval-eval.js — fixture integrity, MRR math,
 * CLI parsing, and the two degradation paths that must never fail CI
 * (lessons store absent, grepai binary absent).
 *
 *   node tests/test-rag-retrieval-eval.js
 *
 * Everything here is deterministic on a runner with no ThumbGate lessons
 * store and no grepai binary — which is exactly what CI is.
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const EVAL = path.join(REPO, 'tools/rag-retrieval-eval.js');
const HARNESS_FIXTURE = path.join(REPO, 'tests/fixtures/rag-eval/cases.json');
const LESSONS_FIXTURE = path.join(REPO, 'tests/fixtures/rag-eval/lessons-cases.json');

const {
  dedupeByFile,
  evaluateCase,
  evaluateGrepai,
  mean,
  parseArgs,
  requiredFor,
  resolveLessonsBackend,
  runLessonSearch,
  scoreRanking,
} = require(EVAL);
const { matchesAnySubstring, ndcgAtK, reciprocalRankAtK } = require(path.join(REPO, 'tools/ml-core.js'));

function runEval(args, extraEnv = {}) {
  return spawnSync(process.execPath, [EVAL, ...args], {
    cwd: REPO,
    encoding: 'utf8',
    env: { ...process.env, ...extraEnv },
    maxBuffer: 8 * 1024 * 1024,
  });
}

function readFixture(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function assertCommonCaseShape(testCase, seen, label) {
  assert.ok(testCase.id && typeof testCase.id === 'string', `${label}: case needs a string id`);
  assert.ok(!seen.has(testCase.id), `${label}: duplicate case id ${testCase.id}`);
  seen.add(testCase.id);
  assert.ok(
    typeof testCase.query === 'string' && testCase.query.trim().length > 0,
    `${label}/${testCase.id}: query must be a non-empty string`,
  );
  assert.ok(
    Number.isInteger(testCase.k) && testCase.k > 0,
    `${label}/${testCase.id}: k must be a positive integer`,
  );
  const required = requiredFor(testCase);
  assert.ok(required.length > 0, `${label}/${testCase.id}: needs at least one required item`);
  assert.strictEqual(
    new Set(required).size,
    required.length,
    `${label}/${testCase.id}: duplicate required items`,
  );
  for (const item of required) {
    assert.ok(
      typeof item === 'string' && item.trim().length > 0,
      `${label}/${testCase.id}: required items must be non-empty strings`,
    );
  }
  assert.ok(
    required.length <= testCase.k,
    `${label}/${testCase.id}: ${required.length} required items cannot all fit in k=${testCase.k}`,
  );
}

// --- fixture integrity: harness suite ---
// The scorer matches by substring, not by path equality, so `emptyStream`
// legitimately resolves to `.../emptyStreamRefreshCta.ts`. Validating with
// fs.existsSync would wrongly reject those; validate with the scorer's own
// predicate against the tracked file list instead.
{
  const tracked = spawnSync('git', ['ls-files'], { cwd: REPO, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 });
  assert.strictEqual(tracked.status, 0, `git ls-files failed: ${tracked.stderr}`);
  const files = tracked.stdout.split('\n').map((line) => line.trim()).filter(Boolean);
  assert.ok(files.length > 100, `expected a populated tracked-file list, got ${files.length}`);

  const fixture = readFixture(HARNESS_FIXTURE);
  assert.ok(Array.isArray(fixture.cases) && fixture.cases.length >= 8, 'harness fixture needs >= 8 cases');
  assert.ok(
    fixture.backend === undefined || fixture.backend === 'harness',
    'default fixture must use the harness backend',
  );
  const seen = new Set();
  for (const testCase of fixture.cases) {
    assertCommonCaseShape(testCase, seen, 'cases.json');
    assert.ok(
      Array.isArray(testCase.mustIncludePathSubstrings),
      `cases.json/${testCase.id}: harness cases use mustIncludePathSubstrings`,
    );
    for (const sub of testCase.mustIncludePathSubstrings) {
      const hits = files.filter((file) => matchesAnySubstring(file, [sub]));
      assert.ok(
        hits.length > 0,
        `cases.json/${testCase.id}: no tracked file matches required substring "${sub}"`,
      );
    }
  }
}

// --- fixture integrity: lessons suite ---
// Lesson ids cannot be checked against the store: it is gitignored and absent
// on CI. Check the contract that *is* checkable — shape, uniqueness, and that
// ids are opaque store keys rather than path substrings.
{
  const fixture = readFixture(LESSONS_FIXTURE);
  assert.strictEqual(fixture.backend, 'lessons', 'lessons fixture must declare backend=lessons');
  assert.ok(
    Array.isArray(fixture.cases) && fixture.cases.length >= 8 && fixture.cases.length <= 10,
    `lessons fixture needs 8-10 cases, got ${fixture.cases.length}`,
  );
  const seen = new Set();
  const allIds = [];
  for (const testCase of fixture.cases) {
    assertCommonCaseShape(testCase, seen, 'lessons-cases.json');
    assert.ok(
      Array.isArray(testCase.mustIncludeLessonIds),
      `lessons-cases.json/${testCase.id}: lessons cases use mustIncludeLessonIds`,
    );
    assert.strictEqual(
      testCase.mustIncludePathSubstrings,
      undefined,
      `lessons-cases.json/${testCase.id}: lessons cases must not carry path substrings`,
    );
    for (const id of testCase.mustIncludeLessonIds) {
      assert.match(
        id,
        /^mem_\d+_[a-z0-9]+$/,
        `lessons-cases.json/${testCase.id}: "${id}" is not a lessons-store id`,
      );
      allIds.push(id);
    }
  }
  assert.strictEqual(new Set(allIds).size, allIds.length, 'expected lesson ids must be distinct across cases');
  assert.ok(
    fixture.cases.some((c) => c.mustIncludeLessonIds.length > 1),
    'lessons fixture should exercise multi-target recall with at least one many-id case',
  );
}

// --- requiredFor dispatches per backend, never mixes ---
{
  assert.deepStrictEqual(requiredFor({ mustIncludePathSubstrings: ['a/b.js'] }), ['a/b.js']);
  assert.deepStrictEqual(requiredFor({ mustIncludeLessonIds: ['mem_1_a'] }), ['mem_1_a']);
  assert.deepStrictEqual(requiredFor({}), []);
  // Path substrings win when both are present, so a malformed fixture can never
  // silently score a harness case against lesson ids.
  assert.deepStrictEqual(
    requiredFor({ mustIncludePathSubstrings: ['x'], mustIncludeLessonIds: ['mem_1_a'] }),
    ['x'],
  );
}

// --- MRR math on synthetic ranked lists ---
{
  const ranked = ['a/one.js', 'b/two.js', 'c/three.js', 'd/four.js'];
  assert.strictEqual(reciprocalRankAtK(ranked, ['a/one.js'], 4), 1);
  assert.strictEqual(reciprocalRankAtK(ranked, ['b/two.js'], 4), 0.5);
  assert.strictEqual(reciprocalRankAtK(ranked, ['c/three.js'], 4), 0.3333);
  assert.strictEqual(reciprocalRankAtK(ranked, ['d/four.js'], 4), 0.25);
  assert.strictEqual(reciprocalRankAtK(ranked, ['nope.js'], 4), 0, 'absent target scores 0');
  assert.strictEqual(reciprocalRankAtK([], ['a/one.js'], 4), 0, 'empty ranking scores 0');
  assert.strictEqual(reciprocalRankAtK(ranked, [], 4), 0, 'no required items means no relevant hit');

  // Truncation at k: a hit past k does not count.
  assert.strictEqual(reciprocalRankAtK(ranked, ['c/three.js'], 2), 0);
  assert.strictEqual(reciprocalRankAtK(ranked, ['b/two.js'], 2), 0.5);

  // FIRST relevant result wins, not the best or the last.
  assert.strictEqual(reciprocalRankAtK(ranked, ['d/four.js', 'b/two.js'], 4), 0.5);

  // Same substring semantics as the scorer: prefix matches count.
  assert.strictEqual(reciprocalRankAtK(['x/emptyStreamRefreshCta.ts'], ['emptyStream'], 5), 1);
  // ...and Windows separators normalise the same way nDCG normalises them.
  assert.strictEqual(reciprocalRankAtK(['apps\\web\\billing.ts'], ['apps/web/billing.ts'], 5), 1);

  // MRR is the mean of per-case reciprocal ranks.
  const perCase = [
    reciprocalRankAtK(ranked, ['a/one.js'], 4),
    reciprocalRankAtK(ranked, ['b/two.js'], 4),
    reciprocalRankAtK(ranked, ['missing'], 4),
  ];
  assert.deepStrictEqual(perCase, [1, 0.5, 0]);
  assert.strictEqual(mean(perCase), 0.5);
  assert.strictEqual(mean([]), 0);
}

// --- reciprocal rank and nDCG never disagree about relevance ---
{
  const cases = [
    [['x/emptyStreamRefreshCta.ts'], ['emptyStream']],
    [['a.js', 'b.js'], ['b.js']],
    [['a.js'], ['zzz']],
    [['apps\\web\\billing.ts'], ['apps/web/billing.ts']],
  ];
  for (const [ranked, required] of cases) {
    const rr = reciprocalRankAtK(ranked, required, 8);
    const nd = ndcgAtK(ranked, required, 8);
    assert.strictEqual(rr > 0, nd > 0, `disagreement on ${JSON.stringify({ ranked, required })}`);
  }
}

// --- scoreRanking reports recall, nDCG and MRR off one ranking ---
{
  const ranked = ['tools/a.js', 'docs/b.md', 'tools/c.js'];
  const full = scoreRanking(ranked, ['tools/a.js', 'docs/b.md'], 3);
  assert.strictEqual(full.recallAtK, 1);
  assert.strictEqual(full.reciprocalRank, 1);
  assert.deepStrictEqual(full.missing, []);

  const partial = scoreRanking(ranked, ['docs/b.md', 'never/here.js'], 3);
  assert.strictEqual(partial.recallAtK, 0.5);
  assert.strictEqual(partial.reciprocalRank, 0.5, 'first relevant hit is at rank 2');
  assert.deepStrictEqual(partial.missing, ['never/here.js']);

  const none = scoreRanking(ranked, ['never/here.js'], 3);
  assert.strictEqual(none.recallAtK, 0);
  assert.strictEqual(none.ndcgAtK, 0);
  assert.strictEqual(none.reciprocalRank, 0);
}

// --- CLI flag parsing ---
{
  const defaults = parseArgs([]);
  assert.strictEqual(defaults.json, false);
  assert.strictEqual(defaults.grepai, false);
  assert.strictEqual(defaults.help, false);
  assert.strictEqual(defaults.fixture, HARNESS_FIXTURE);
  assert.strictEqual(defaults.lessonsDir, path.join(REPO, '.thumbgate'));

  const flags = parseArgs(['--json', '--grepai', '--help']);
  assert.strictEqual(flags.json, true);
  assert.strictEqual(flags.grepai, true);
  assert.strictEqual(flags.help, true);

  const valued = parseArgs([
    '--fixture',
    'tests/fixtures/rag-eval/lessons-cases.json',
    '--lessons-dir',
    'somewhere/.thumbgate',
  ]);
  assert.strictEqual(valued.fixture, path.resolve('tests/fixtures/rag-eval/lessons-cases.json'));
  assert.strictEqual(valued.lessonsDir, path.resolve('somewhere/.thumbgate'));
  assert.ok(path.isAbsolute(valued.lessonsDir), '--lessons-dir must resolve to an absolute path');

  assert.strictEqual(parseArgs(['-h']).help, true);
  assert.throws(() => parseArgs(['--nope']), /Unknown argument: --nope/);
}

// --- grepai payload dedupe: chunk hits collapse to first-seen file order ---
{
  const rows = [
    { file_path: 'tools/a.js', start_line: 1, score: 0.9 },
    { file_path: 'tools/a.js', start_line: 90, score: 0.8 },
    { file_path: 'docs/b.md', start_line: 1, score: 0.7 },
    { file_path: '', start_line: 1, score: 0.6 },
    { path: 'tools/c.js', score: 0.5 },
  ];
  assert.deepStrictEqual(dedupeByFile(rows), ['tools/a.js', 'docs/b.md', 'tools/c.js']);
  assert.deepStrictEqual(dedupeByFile([]), []);
}

// --- grepai leg is skipped, not faked, for non-harness backends ---
{
  const block = evaluateGrepai(readFixture(LESSONS_FIXTURE).cases, 'lessons');
  assert.strictEqual(block.state, 'not-applicable');
  assert.strictEqual(block.gating, false);
  assert.ok(block.reason.includes('lessons'));
  assert.strictEqual(block.meanRecallAtK, undefined, 'must not invent a score it never measured');
}

// --- lessons backend resolution names the concrete missing piece ---
{
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'rag-eval-nostore-'));
  const resolved = resolveLessonsBackend(path.join(empty, '.thumbgate'));
  assert.strictEqual(resolved.state, 'unavailable');
  assert.ok(resolved.reason.includes('memory-log.jsonl'), resolved.reason);
  assert.strictEqual(resolved.searchLessons, undefined, 'must not hand back a searcher it never loaded');
}

// --- a throwing lessons searcher degrades to an error result, not a crash ---
{
  const boom = () => {
    throw new Error('store corrupt');
  };
  const failed = runLessonSearch(boom, 'anything', 5, '/nowhere');
  assert.strictEqual(failed.ok, false);
  assert.strictEqual(failed.error, 'store corrupt');
  assert.deepStrictEqual(failed.ids, []);

  const stub = (query, options) => {
    assert.strictEqual(options.feedbackDir, '/pinned/.thumbgate', 'feedbackDir must be pinned, not inherited');
    assert.strictEqual(options.limit, 5);
    return { results: [{ id: 'mem_2_b' }, { id: 'mem_1_a' }, {}], totalLessons: 3 };
  };
  const okRun = runLessonSearch(stub, 'q', 5, '/pinned/.thumbgate');
  assert.strictEqual(okRun.ok, true);
  assert.deepStrictEqual(okRun.ids, ['mem_2_b', 'mem_1_a'], 'idless rows are dropped, order preserved');
}

// --- evaluateCase: skip shape, error shape, and lesson-id scoring ---
{
  const testCase = { id: 'c1', query: 'q', mustIncludeLessonIds: ['mem_1_a'], k: 5 };

  const skipped = evaluateCase(testCase, {
    backend: 'lessons',
    backendState: 'unavailable',
    backendReason: 'no store',
  });
  assert.strictEqual(skipped.skipped, true);
  assert.strictEqual(skipped.pass, null);
  assert.strictEqual(skipped.skipReason, 'no store');
  assert.deepStrictEqual(skipped.missing, ['mem_1_a']);

  const errored = evaluateCase(testCase, {
    backend: 'lessons',
    backendState: 'ready',
    lessonsDir: '/pinned/.thumbgate',
    searchLessons: () => {
      throw new Error('nope');
    },
  });
  assert.strictEqual(errored.pass, false, 'a backend error is a failure, never a skip');
  assert.strictEqual(errored.skipped, undefined);
  assert.strictEqual(errored.reciprocalRank, 0);
  assert.strictEqual(errored.error, 'nope');

  const scored = evaluateCase(testCase, {
    backend: 'lessons',
    backendState: 'ready',
    lessonsDir: '/pinned/.thumbgate',
    searchLessons: () => ({ results: [{ id: 'mem_9_z' }, { id: 'mem_1_a' }] }),
  });
  assert.strictEqual(scored.pass, true);
  assert.strictEqual(scored.recallAtK, 1);
  assert.strictEqual(scored.reciprocalRank, 0.5, 'lesson ids rank the same way paths do');
  assert.deepStrictEqual(scored.paths, ['mem_9_z', 'mem_1_a']);
}

// --- default harness suite: legacy output contract intact, MRR added ---
{
  const result = runEval(['--json']);
  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
  const body = JSON.parse(result.stdout);
  for (const key of ['ok', 'fixture', 'caseCount', 'passCount', 'meanRecallAtK', 'meanNdcgAtK', 'results']) {
    assert.ok(key in body, `legacy output key ${key} disappeared`);
  }
  assert.strictEqual(body.ok, true, JSON.stringify(body.results.filter((r) => !r.pass)));
  assert.strictEqual(body.backend, 'harness');
  assert.strictEqual(body.backendState, 'ready');
  assert.strictEqual(body.skippedCount, 0, 'harness cases are always measurable');
  assert.strictEqual(body.evaluatedCount, body.caseCount);
  assert.strictEqual(body.passCount, body.caseCount);
  assert.ok(typeof body.meanNdcgAtK === 'number' && body.meanNdcgAtK > 0, 'nDCG@k must stay computed');
  assert.ok(
    typeof body.meanReciprocalRank === 'number' && body.meanReciprocalRank > 0 && body.meanReciprocalRank <= 1,
    `meanReciprocalRank out of range: ${body.meanReciprocalRank}`,
  );
  for (const r of body.results) {
    assert.ok(typeof r.ndcgAtK === 'number', `${r.id}: ndcgAtK missing`);
    assert.ok(
      typeof r.reciprocalRank === 'number' && r.reciprocalRank >= 0 && r.reciprocalRank <= 1,
      `${r.id}: reciprocalRank out of range`,
    );
  }
  assert.ok(!('grepai' in body), 'grepai block must be opt-in');
}

// --- exit-code contract still bites: an unreachable target fails the run ---
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rag-eval-fail-'));
  const fixture = path.join(tmp, 'impossible.json');
  fs.writeFileSync(
    fixture,
    JSON.stringify({
      version: 1,
      cases: [
        {
          id: 'impossible',
          query: 'billing portal stripe subscription',
          mustIncludePathSubstrings: ['no/such/file/anywhere-zzz.ts'],
          k: 8,
        },
      ],
    }),
  );
  const result = runEval(['--fixture', fixture, '--json']);
  assert.strictEqual(result.status, 1, 'a missed target must still exit 1');
  const body = JSON.parse(result.stdout);
  assert.strictEqual(body.ok, false);
  assert.strictEqual(body.results[0].recallAtK, 0);
  assert.strictEqual(body.results[0].reciprocalRank, 0);
}

// --- lessons backend absent: honest, non-gating, exit 0 (this is CI) ---
{
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'rag-eval-home-'));
  const result = runEval(
    ['--fixture', LESSONS_FIXTURE, '--lessons-dir', path.join(home, '.thumbgate'), '--json'],
    { HOME: home },
  );
  assert.strictEqual(result.status, 0, `lessons-unavailable must not fail CI: ${result.stderr}`);
  const body = JSON.parse(result.stdout);
  assert.strictEqual(body.ok, true);
  assert.strictEqual(body.backend, 'lessons');
  assert.strictEqual(body.backendState, 'unavailable');
  assert.ok(body.backendReason.includes('memory-log.jsonl'), body.backendReason);
  assert.strictEqual(body.evaluatedCount, 0);
  assert.strictEqual(body.skippedCount, body.caseCount);
  assert.strictEqual(body.passCount, 0, 'skipped cases must not be counted as passes');
  assert.strictEqual(body.meanRecallAtK, null, 'unmeasured means must be null, not 0');
  assert.strictEqual(body.meanNdcgAtK, null);
  assert.strictEqual(body.meanReciprocalRank, null);
  for (const r of body.results) {
    assert.strictEqual(r.skipped, true);
    assert.strictEqual(r.pass, null);
    assert.strictEqual(r.recallAtK, null);
    assert.strictEqual(r.reciprocalRank, null);
  }
}

// --- lessons store present but ThumbGate runtime absent: still honest, still exit 0 ---
{
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'rag-eval-noruntime-'));
  const store = path.join(home, '.thumbgate');
  fs.mkdirSync(store);
  fs.writeFileSync(
    path.join(store, 'memory-log.jsonl'),
    `${JSON.stringify({ id: 'mem_1_a', title: 'placeholder', content: 'placeholder' })}\n`,
  );
  const result = runEval(['--fixture', LESSONS_FIXTURE, '--lessons-dir', store, '--json'], { HOME: home });
  assert.strictEqual(result.status, 0, `missing runtime must not fail CI: ${result.stderr}`);
  const body = JSON.parse(result.stdout);
  assert.strictEqual(body.ok, true);
  assert.strictEqual(body.backendState, 'unavailable');
  assert.ok(
    body.backendReason.includes('thumbgate runtime unavailable'),
    `expected a runtime-missing reason, got: ${body.backendReason}`,
  );
  assert.strictEqual(body.evaluatedCount, 0);
}

// --- grepai absent: reported unreachable, never gates, exit unchanged ---
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'rag-eval-grepai-'));
  const bin = path.join(tmp, 'bin');
  fs.mkdirSync(bin);
  fs.symlinkSync(process.execPath, path.join(bin, 'node'));
  const fixture = path.join(tmp, 'one-case.json');
  fs.writeFileSync(
    fixture,
    JSON.stringify({
      version: 1,
      cases: [
        {
          id: 'billing-portal',
          query: 'Stripe billing portal subscription manage plan',
          mustIncludePathSubstrings: ['apps/hermes-control-plane/app/api/billing/portal'],
          k: 8,
        },
      ],
    }),
  );
  const result = runEval(['--fixture', fixture, '--grepai', '--json'], { PATH: bin });
  assert.strictEqual(result.status, 0, `grepai must never gate the run: ${result.stderr}`);
  const body = JSON.parse(result.stdout);
  assert.strictEqual(body.ok, true, 'the harness suite result must be unaffected by grepai');
  assert.strictEqual(body.grepai.state, 'unreachable');
  assert.strictEqual(body.grepai.gating, false);
  assert.strictEqual(body.grepai.timeoutMs, 20000);
  assert.strictEqual(body.grepai.measuredCount, 0);
  assert.strictEqual(body.grepai.meanRecallAtK, null, 'unreachable grepai must not report a score');
  assert.strictEqual(body.grepai.meanReciprocalRank, null);
  assert.ok(body.grepai.results.every((r) => r.measured === false && r.error));
}

console.log('PASS tests/test-rag-retrieval-eval.js');
