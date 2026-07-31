'use strict';

// A checkout that silently serves old or unversioned code looks completely normal.
// This has bitten us four separate ways (see the module docstring). The audit only
// helps if it keeps detecting, so these tests build real git repos on disk and assert
// the classification, including the case that matters most: a checkout something
// automated executes from.

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const { classify } = require('../tools/stale-checkout-audit.js');

function entry(overrides = {}) {
  return {
    name: 'repo', dir: '/tmp/repo', branch: 'main',
    behind: 0, unversioned: [], executedBy: [], ...overrides,
  };
}

test('a checkout far behind main is flagged', () => {
  const findings = classify(entry({ behind: 120 }), 25);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].kind, 'BEHIND');
  assert.match(findings[0].detail, /sitting ON main/,
    'being far behind WHILE on main is the deceptive case and must be called out');
});

test('a checkout just under the threshold is not flagged — the guard is not trigger-happy', () => {
  assert.deepEqual(classify(entry({ behind: 24 }), 25), []);
});

test('unversioned tracked edits are flagged even when the tree is current', () => {
  const findings = classify(entry({ behind: 0, unversioned: ['tools/loop.js'] }), 25);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].kind, 'UNVERSIONED');
});

test('anything an automated job runs from escalates to CRITICAL', () => {
  // This is the combination that cost us: 3 launchd jobs executing from a checkout
  // 102 commits behind with 188 lines of revenue logic that existed on one disk only.
  const warn = classify(entry({ behind: 120, unversioned: ['a.js'] }), 25);
  assert.ok(warn.every((f) => f.severity === 'WARN'), 'no executor -> WARN');

  const crit = classify(entry({ behind: 120, unversioned: ['a.js'], executedBy: ['com.igor.revenue-autonomous-loop'] }), 25);
  assert.ok(crit.every((f) => f.severity === 'CRITICAL'), 'executor -> CRITICAL');
  assert.ok(crit.some((f) => f.detail.includes('com.igor.revenue-autonomous-loop')),
    'must name the job so it can be traced');
});

test('a repo with no commits is UNCOMPARABLE, not "uncommitted edits"', () => {
  // ~/workspace/git/igor/hermes-mobile had git init run with 717 files staged and no
  // commit. Reporting that as unversioned edits sent me chasing a non-problem.
  const findings = classify(entry({ unusable: 'repository has no commits' }), 25);
  assert.equal(findings.length, 1);
  assert.equal(findings[0].kind, 'UNCOMPARABLE');
  assert.equal(findings[0].severity, 'INFO', 'no executor -> informational, not a warning');
});

test('a clean current checkout produces no findings — the guard can report all-clear', () => {
  assert.deepEqual(classify(entry(), 25), []);
});

test('end to end against a real repo on disk', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sca-'));
  const origin = path.join(root, 'origin.git');
  const clone = path.join(root, 'clone');
  const run = (cwd, ...args) => execFileSync('git', args, { cwd, stdio: 'ignore' });

  execFileSync('git', ['init', '--bare', '-b', 'main', origin], { stdio: 'ignore' });
  execFileSync('git', ['clone', origin, clone], { stdio: 'ignore' });
  run(clone, 'config', 'user.email', 't@t.t');
  run(clone, 'config', 'user.name', 'T');
  fs.writeFileSync(path.join(clone, 'loop.js'), 'v1\n');
  run(clone, 'add', '.');
  run(clone, 'commit', '-m', 'v1');
  run(clone, 'push', '-u', 'origin', 'main');

  const { auditCheckout } = require('../tools/stale-checkout-audit.js');
  let result = auditCheckout(clone, 'clone', new Set());
  assert.equal(result.behind, 0);
  assert.deepEqual(result.unversioned, [], 'clean clone has no unversioned work');

  // Now modify a tracked file without committing — the dangerous state.
  fs.writeFileSync(path.join(clone, 'loop.js'), 'v2-local-only\n');
  result = auditCheckout(clone, 'clone', new Set(['com.igor.some-job']));
  assert.deepEqual(result.unversioned, ['loop.js']);
  const findings = classify(result, 25);
  assert.ok(findings.some((f) => f.kind === 'UNVERSIONED' && f.severity === 'CRITICAL'),
    'unversioned work in a checkout a job runs from must be CRITICAL');

  fs.rmSync(root, { recursive: true, force: true });
});
