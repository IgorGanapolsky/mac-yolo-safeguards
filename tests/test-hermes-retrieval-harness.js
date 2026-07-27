'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  buildInventory,
  escapeRegExp,
  grep,
  parseArgs,
  readFileRange,
  retrieve,
  safeRepoPath,
  tokenize,
} = require('../tools/hermes-retrieval-harness');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-retrieval-harness-'));
fs.mkdirSync(path.join(tmp, 'docs'), { recursive: true });
fs.mkdirSync(path.join(tmp, 'tools'), { recursive: true });
fs.mkdirSync(path.join(tmp, 'node_modules', 'ignored'), { recursive: true });

fs.writeFileSync(
  path.join(tmp, 'docs', 'SDD.md'),
  [
    '# Specification-Driven Design',
    'Disciplined discovery creates modular markdown specifications.',
    'Continuous gap analysis maps requirements to tests and DevOps gates.',
  ].join('\n'),
);
fs.writeFileSync(
  path.join(tmp, 'tools', 'agent.js'),
  [
    "'use strict';",
    'function guardrails() { return "governance"; }',
    'module.exports = { guardrails };',
  ].join('\n'),
);
fs.writeFileSync(path.join(tmp, 'node_modules', 'ignored', 'skip.js'), 'Specification-Driven Design should not be indexed.');

assert.strictEqual(parseArgs(['retrieve', '--query', 'gap analysis', '--json']).json, true);
assert.deepStrictEqual(tokenize('The Specification-Driven Design gap analysis'), ['specification-driven', 'design', 'gap', 'analysis']);
assert.throws(() => safeRepoPath(tmp, '../outside'), /escapes repo/);

const inventory = buildInventory({ repo: tmp });
assert.strictEqual(inventory.fileCount, 2);
assert(inventory.files.some((file) => file.path === 'docs/SDD.md'));
assert(!inventory.files.some((file) => file.path.includes('node_modules')));

const retrieved = retrieve('modular markdown gap analysis tests', { repo: tmp, limit: 2 });
assert.strictEqual(retrieved.matches[0].path, 'docs/SDD.md');
assert(retrieved.matches[0].score > 0);
assert(retrieved.matches[0].snippet.includes('modular markdown'));

const read = readFileRange({ repo: tmp, path: 'docs/SDD.md', start: 2, end: 3 });
assert.strictEqual(read.start, 2);
assert(read.text.includes('2: Disciplined discovery'));
assert(read.text.includes('3: Continuous gap analysis'));
assert.throws(() => readFileRange({ repo: tmp, path: '../secret.txt' }), /escapes repo/);

const grepResult = grep({ repo: tmp, pattern: 'governance', limit: 5 });
assert.strictEqual(grepResult.matches.length, 1);
assert.strictEqual(grepResult.matches[0].path, 'tools/agent.js');

// js/regex-injection (CWE-400/730): --pattern is command-line-argument
// controlled, so grep() must treat metacharacters as literal text, never as
// a live regex — otherwise a malicious/mistyped pattern (e.g. nested
// quantifiers) could hang the process with catastrophic backtracking.
assert.strictEqual(escapeRegExp('a.b*c(d|e)'), 'a\\.b\\*c\\(d\\|e\\)');
fs.writeFileSync(path.join(tmp, 'tools', 'literal.js'), 'contains a.b*c literally, not a wildcard\n');
const literalGrep = grep({ repo: tmp, pattern: 'a.b*c', limit: 5 });
assert.strictEqual(literalGrep.matches.length, 1, 'pattern with regex metacharacters should match only the literal text');
assert.strictEqual(literalGrep.matches[0].path, 'tools/literal.js');
// A classic catastrophic-backtracking shape must be treated as literal text
// (and simply find nothing) instead of hanging or throwing.
const redosShapeGrep = grep({ repo: tmp, pattern: '(a+)+$', limit: 5 });
assert.strictEqual(redosShapeGrep.matches.length, 0);

fs.rmSync(tmp, { recursive: true, force: true });
console.log('Hermes retrieval harness tests: PASS');
