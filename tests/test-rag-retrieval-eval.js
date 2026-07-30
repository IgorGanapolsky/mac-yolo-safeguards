'use strict';

// Focused tests for tools/rag-retrieval-eval.js: fixture integrity for both
// production-backend fixture files, and the recall@k / MRR math on synthetic
// ranked lists. No live backend is invoked, so this runs identically on CI.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const {
  scoreRanking,
  pathMatches,
  idMatches,
  validateFixture,
  parseArgs,
} = require('../tools/rag-retrieval-eval');

const ROOT = path.join(__dirname, '..');
const LEXICAL_FIXTURE = path.join(ROOT, 'tests/fixtures/rag-eval/cases.json');
const LESSONS_FIXTURE = path.join(ROOT, 'tests/fixtures/rag-eval/lessons-cases.json');
const LESSONS_LOG = path.join(ROOT, '.thumbgate/memory-log.jsonl');

function loadFixture(fixturePath) {
  return JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
}

test('both backend fixtures validate: every case has query, required entries, and k', () => {
  validateFixture(loadFixture(LEXICAL_FIXTURE), 'mustIncludePathSubstrings', 'cases.json');
  validateFixture(loadFixture(LESSONS_FIXTURE), 'requiredLessonIds', 'lessons-cases.json');
});

test('fixture validation rejects malformed cases instead of scoring them', () => {
  assert.throws(() => validateFixture({ cases: [] }, 'requiredLessonIds'), /no cases/);
  assert.throws(
    () => validateFixture({ cases: [{ id: 'x', requiredLessonIds: ['a'], k: 5 }] }, 'requiredLessonIds'),
    /no query/,
  );
  assert.throws(
    () => validateFixture({ cases: [{ id: 'x', query: 'q', requiredLessonIds: [], k: 5 }] }, 'requiredLessonIds'),
    /no requiredLessonIds/,
  );
  assert.throws(
    () => validateFixture({ cases: [{ id: 'x', query: 'q', requiredLessonIds: ['a'], k: 0 }] }, 'requiredLessonIds'),
    /positive integer k/,
  );
  assert.throws(
    () =>
      validateFixture(
        { cases: [{ id: 'dup', query: 'q', requiredLessonIds: ['a'], k: 5 }, { id: 'dup', query: 'q2', requiredLessonIds: ['b'], k: 5 }] },
        'requiredLessonIds',
      ),
    /duplicate case id/,
  );
});

test('lexical fixture required substrings still match tracked repo files (stale fixtures caused nothing — the 2026-07-29 0.00s were corpus pollution — but keep them honest)', () => {
  // Requirements are path SUBSTRINGS, matching the eval scorer's own semantics
  // (`emptyStream` legitimately matches hermes-mobile/src/utils/emptyStreamRefreshCta.ts),
  // so validate them the way the scorer does rather than as literal paths.
  const tracked = execFileSync('git', ['ls-files'], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  })
    .split('\n')
    .filter(Boolean);
  for (const testCase of loadFixture(LEXICAL_FIXTURE).cases) {
    for (const required of testCase.mustIncludePathSubstrings) {
      assert.ok(
        tracked.some((file) => pathMatches(file, required)),
        `${testCase.id}: required substring ${required} matches no tracked file — fix the fixture or the tree, never the scorer`,
      );
    }
  }
});

test('lessons fixture ids all point at real lessons in the local store (skipped where the store is absent)', (t) => {
  if (!fs.existsSync(LESSONS_LOG)) {
    t.skip('.thumbgate/memory-log.jsonl is local-only (gitignored); nothing to cross-check on this machine');
    return;
  }
  const knownIds = new Set(
    fs
      .readFileSync(LESSONS_LOG, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line).id),
  );
  for (const testCase of loadFixture(LESSONS_FIXTURE).cases) {
    for (const id of testCase.requiredLessonIds) {
      assert.ok(knownIds.has(id), `${testCase.id}: required lesson ${id} is not in ${path.relative(ROOT, LESSONS_LOG)}`);
    }
  }
});

test('MRR math: reciprocal rank is 1/rank of the FIRST relevant result', () => {
  // Relevant at rank 1.
  assert.deepEqual(scoreRanking(['a', 'b', 'c'], ['a'], idMatches), {
    recallAtK: 1,
    reciprocalRank: 1,
    missing: [],
  });
  // First relevant at rank 3.
  const third = scoreRanking(['x', 'y', 'a'], ['a'], idMatches);
  assert.equal(third.recallAtK, 1);
  assert.ok(Math.abs(third.reciprocalRank - 1 / 3) < 1e-12);
  // No relevant result in the list: zero, never NaN.
  assert.deepEqual(scoreRanking(['x', 'y'], ['a'], idMatches), {
    recallAtK: 0,
    reciprocalRank: 0,
    missing: ['a'],
  });
  // Empty ranking.
  assert.deepEqual(scoreRanking([], ['a'], idMatches), {
    recallAtK: 0,
    reciprocalRank: 0,
    missing: ['a'],
  });
});

test('MRR math: rank of the first relevant, not the best-ranked required entry order', () => {
  // required[1] appears before required[0]; RR must use rank 2, and recall
  // counts both hits.
  const score = scoreRanking(['x', 'b', 'a'], ['a', 'b'], idMatches);
  assert.equal(score.recallAtK, 1);
  assert.equal(score.reciprocalRank, 1 / 2);
  // Partial recall: one of two required present.
  const partial = scoreRanking(['x', 'a'], ['a', 'missing-one'], idMatches);
  assert.equal(partial.recallAtK, 0.5);
  assert.equal(partial.reciprocalRank, 1 / 2);
  assert.deepEqual(partial.missing, ['missing-one']);
});

test('path matcher: substring semantics with Windows separator normalization', () => {
  assert.ok(pathMatches('tools/agent-swarm-harness.js', 'tools/agent-swarm-harness.js'));
  assert.ok(pathMatches('/abs/prefix/tools/agent-swarm-harness.js', 'tools/agent-swarm-harness.js'));
  assert.ok(pathMatches('tools\\agent-swarm-harness.js', 'tools/agent-swarm-harness.js'));
  assert.ok(!pathMatches('tools/other.js', 'tools/agent-swarm-harness.js'));
  // id matcher is strict equality, not substring.
  assert.ok(idMatches('mem_1', 'mem_1'));
  assert.ok(!idMatches('mem_12', 'mem_1'));
});

test('CLI arg parsing: --no-grepai and --json flags, unknown args rejected', () => {
  const defaults = parseArgs([]);
  assert.equal(defaults.grepai, true);
  assert.equal(defaults.json, false);
  assert.ok(defaults.fixture.endsWith('tests/fixtures/rag-eval/cases.json'));
  assert.ok(defaults.lessonsFixture.endsWith('tests/fixtures/rag-eval/lessons-cases.json'));
  const flagged = parseArgs(['--json', '--no-grepai']);
  assert.equal(flagged.grepai, false);
  assert.equal(flagged.json, true);
  assert.throws(() => parseArgs(['--bogus']), /Unknown argument/);
});
