#!/usr/bin/env node
'use strict';
/**
 * Test-discovery audit - fails when a test file exists but nothing ever runs it.
 *
 * The failure mode this closes (measured on this repo 2026-08-06): 21 of 40
 * shell/python test files under tests/ were executed by NOTHING. An agent wrote
 * the test, logged it in plan.md, and it never ran again. tests/ looked like
 * 226 files of coverage; 21 of them were decoration.
 *
 * JS tests are safe today because ci.yml globs `for f in tests/test-*.js`.
 * Shell and python tests are enumerated BY HAND, so every newly added one is
 * orphaned by default. This audit makes that state loud instead of silent.
 *
 * Contract: every test file is either
 *   (a) reachable  - matched by a glob a workflow iterates, or named literally, or
 *   (b) allowlisted - in tests/ci-test-discovery-allowlist.json WITH a reason.
 * Anything else fails. A stale allowlist entry (test deleted) also fails, so the
 * allowlist cannot rot into a permanent mute button.
 */

const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const WORKFLOW_DIR = path.join(REPO, '.github', 'workflows');
const ALLOWLIST = path.join(REPO, 'tests', 'ci-test-discovery-allowlist.json');
const TEST_DIR = path.join(REPO, 'tests');
const TEST_EXT = new Set(['.js', '.sh', '.py', '.mjs']);

/** Files under tests/ that are helpers, not tests. */
const NOT_A_TEST = /^(run-suite|helpers?|lib|fixtures?|_)/;

function readWorkflows(dir) {
  dir = dir || WORKFLOW_DIR;
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(function (f) { return f.endsWith('.yml') || f.endsWith('.yaml'); })
    .map(function (f) { return { name: f, body: fs.readFileSync(path.join(dir, f), 'utf8') }; });
}

function listTests(dir) {
  dir = dir || TEST_DIR;
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter(function (f) { return TEST_EXT.has(path.extname(f)); })
    .filter(function (f) { return !NOT_A_TEST.test(f); })
    .map(function (f) { return 'tests/' + f; })
    .sort();
}

/**
 * Shell globs a workflow actually iterates, e.g. `for f in tests/test-*.js`.
 * Only these auto-discover new files; a literal mention covers just that file.
 */
function globPatterns(workflows) {
  const out = new Set();
  const re = /for\s+\w+\s+in\s+((?:tests\/[^\s;]*[*][^\s;]*\s*)+)/g;
  workflows.forEach(function (wf) {
    let m;
    while ((m = re.exec(wf.body)) !== null) {
      m[1].trim().split(/\s+/).forEach(function (g) { if (g.indexOf('*') !== -1) out.add(g); });
    }
  });
  return Array.from(out);
}

function globToRe(glob) {
  const esc = glob.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*');
  return new RegExp('^' + esc + '$');
}

/**
 * Files a glob loop explicitly skips via case/continue. They sit inside the
 * loop's blast radius but never execute, so they must be allowlisted like any
 * other unreachable test - otherwise a skip silently becomes permanent.
 */
function globExclusions(workflows) {
  const out = new Set();
  const re = /^\s*(tests\/[\w.-]+\.\w+)\)\s*continue\s*;;/gm;
  workflows.forEach(function (wf) {
    let m;
    while ((m = re.exec(wf.body)) !== null) out.add(m[1]);
  });
  return out;
}

function loadAllowlist(file) {
  file = file || ALLOWLIST;
  if (!fs.existsSync(file)) return {};
  const entries = (JSON.parse(fs.readFileSync(file, 'utf8')) || {}).excluded || {};
  Object.keys(entries).forEach(function (f) {
    const meta = entries[f];
    if (!meta || typeof meta.reason !== 'string' || meta.reason.trim().length < 10) {
      throw new Error('allowlist entry "' + f + '" needs a reason of at least 10 characters');
    }
  });
  return entries;
}

function audit(opts) {
  opts = opts || {};
  const workflows = opts.workflows || readWorkflows();
  const tests = opts.tests || listTests();
  const allowlist = opts.allowlist || loadAllowlist();

  const globs = globPatterns(workflows);
  const globRes = globs.map(globToRe);
  const excluded = globExclusions(workflows);
  // A `case tests/x.js) continue ;;` line literally NAMES the file it skips. Left in
  // the haystack it would make every skipped test look "referenced", which is exactly
  // the silent pass this tool exists to catch. Strip those lines before name matching.
  const blob = workflows
    .map(function (w) { return w.body; })
    .join('\n')
    .split('\n')
    .filter(function (line) { return !/^\s*tests\/[\w.-]+\.\w+\)\s*continue\s*;;/.test(line); })
    .join('\n');

  const orphans = [];
  const reachable = [];
  tests.forEach(function (t) {
    const base = path.basename(t);
    const byGlob = !excluded.has(t) && globRes.some(function (r) { return r.test(t); });
    const safeBase = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const byName = blob.indexOf(t) !== -1 ||
      new RegExp('(^|[\\s\'"/])' + safeBase + '([\\s\'"]|$)', 'm').test(blob);
    if (byGlob || byName) reachable.push(t);
    else if (!allowlist[t]) orphans.push(t);
  });

  const stale = Object.keys(allowlist).filter(function (f) { return tests.indexOf(f) === -1; });
  return { globs: globs, tests: tests, reachable: reachable, orphans: orphans,
           stale: stale, excluded: Array.from(excluded), allowlist: allowlist };
}

function main() {
  let r;
  try { r = audit(); }
  catch (err) { console.error('test-discovery-audit: ' + err.message); process.exit(1); }

  console.log('=== test discovery audit ===');
  console.log('  globs runners iterate : ' + (r.globs.join(', ') || '(none)'));
  console.log('  test files            : ' + r.tests.length);
  console.log('  reachable by a runner : ' + r.reachable.length);
  console.log('  allowlisted           : ' + Object.keys(r.allowlist).length);
  console.log('  ORPHANED              : ' + r.orphans.length);
  r.orphans.forEach(function (o) { console.log('    ORPHAN  ' + o); });
  r.stale.forEach(function (s) { console.log('    STALE   ' + s + ' (allowlisted but gone)'); });

  if (r.orphans.length || r.stale.length) {
    if (r.orphans.length) {
      console.error('\n::error::' + r.orphans.length + ' test file(s) are never executed by any ' +
        'workflow. Wire them into a runner, or add them to ' +
        'tests/ci-test-discovery-allowlist.json with a reason.');
    }
    if (r.stale.length) {
      console.error('::error::' + r.stale.length + ' stale allowlist entr(ies) - delete them.');
    }
    process.exit(1);
  }
  console.log('\nAll test files are reachable or explicitly allowlisted.');
}

if (require.main === module) main();
module.exports = { audit: audit, globPatterns: globPatterns, globToRe: globToRe,
                   globExclusions: globExclusions, listTests: listTests,
                   readWorkflows: readWorkflows, loadAllowlist: loadAllowlist };
