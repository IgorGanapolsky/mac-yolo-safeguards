#!/usr/bin/env node
'use strict';
/**
 * Tests for tools/test-discovery-audit.js.
 *
 * These pin BEHAVIOUR against synthetic workflows, not the repo's live file
 * counts, so the suite does not go red every time someone adds a test. The one
 * live-repo assertion is unconditional on purpose: an `if (found) assert` would
 * silently pass on an empty result, which is the exact bug this tool exists to
 * catch.
 */

const assert = require('assert');
const A = require('../tools/test-discovery-audit.js');

let n = 0;
function it(name, fn) { fn(); n++; console.log('  ok  ' + name); }

console.log('=== test-discovery-audit ===');

it('finds a glob a workflow iterates', function () {
  const wf = [{ name: 'ci.yml', body: 'run: |\n  for f in tests/test-*.js; do\n    node "$f"\n  done\n' }];
  assert.deepStrictEqual(A.globPatterns(wf), ['tests/test-*.js']);
});

it('ignores a glob that is only mentioned, never iterated', function () {
  const wf = [{ name: 'ci.yml', body: 'run: echo "we should run tests/test-*.js someday"\n' }];
  assert.deepStrictEqual(A.globPatterns(wf), []);
});

it('globToRe matches only the intended shape', function () {
  const re = A.globToRe('tests/test-*.js');
  assert.ok(re.test('tests/test-foo.js'));
  assert.ok(!re.test('tests/foo.test.js'), 'must not match the *.test.js naming convention');
  assert.ok(!re.test('tests/test-foo.sh'));
  assert.ok(!re.test('tests/sub/test-foo.js'), 'must not cross a directory boundary');
});

it('flags a test no workflow can reach', function () {
  const r = A.audit({
    workflows: [{ name: 'ci.yml', body: 'for f in tests/test-*.js; do node "$f"; done' }],
    tests: ['tests/test-a.js', 'tests/orphan.sh'],
    allowlist: {},
  });
  assert.deepStrictEqual(r.reachable, ['tests/test-a.js']);
  assert.deepStrictEqual(r.orphans, ['tests/orphan.sh']);
});

it('counts a literally-named test as reachable', function () {
  const r = A.audit({
    workflows: [{ name: 'ci.yml', body: 'run: bash tests/named.sh' }],
    tests: ['tests/named.sh'],
    allowlist: {},
  });
  assert.deepStrictEqual(r.orphans, []);
});

it('an allowlisted test is not an orphan', function () {
  const r = A.audit({
    workflows: [{ name: 'ci.yml', body: '' }],
    tests: ['tests/skipped.sh'],
    allowlist: { 'tests/skipped.sh': { reason: 'needs real hardware' } },
  });
  assert.deepStrictEqual(r.orphans, []);
});

it('a test skipped inside the glob loop still counts as unreachable', function () {
  const body = 'for f in tests/test-*.js; do\n  case "$f" in\n    tests/test-skipme.js) continue ;;\n  esac\n  node "$f"\ndone';
  const r = A.audit({
    workflows: [{ name: 'ci.yml', body: body }],
    tests: ['tests/test-skipme.js', 'tests/test-ok.js'],
    allowlist: {},
  });
  assert.deepStrictEqual(r.excluded, ['tests/test-skipme.js']);
  assert.deepStrictEqual(r.orphans, ['tests/test-skipme.js'],
    'a case/continue skip must not silently count as covered');
});

it('reports a stale allowlist entry so the list cannot rot', function () {
  const r = A.audit({
    workflows: [{ name: 'ci.yml', body: '' }],
    tests: [],
    allowlist: { 'tests/deleted.sh': { reason: 'was excluded long ago' } },
  });
  assert.deepStrictEqual(r.stale, ['tests/deleted.sh']);
});

it('rejects an allowlist entry with no real reason', function () {
  const fs = require('fs');
  const os = require('os');
  const path = require('path');
  const p = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tda-')), 'a.json');
  fs.writeFileSync(p, JSON.stringify({ excluded: { 'tests/x.sh': { reason: 'meh' } } }));
  assert.throws(function () { A.loadAllowlist(p); }, /at least 10 characters/);
});

it('the live repo is clean: every test is reachable or allowlisted', function () {
  const r = A.audit();
  assert.ok(r.tests.length > 0, 'expected to discover test files in this repo');
  assert.deepStrictEqual(r.orphans, [], 'orphaned tests: ' + r.orphans.join(', '));
  assert.deepStrictEqual(r.stale, [], 'stale allowlist entries: ' + r.stale.join(', '));
});

console.log('\nAll ' + n + ' test-discovery-audit tests passed.');
