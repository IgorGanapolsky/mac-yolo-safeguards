'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  buildChunkIndex,
  buildInventory,
  chunkFile,
  contentHash,
  escapeRegExp,
  grep,
  indexCommand,
  parseArgs,
  readFileRange,
  readIndex,
  reindexCommand,
  retrieve,
  safeRepoPath,
  tokenize,
  updateIndex,
  writeIndex,
} = require('../tools/hermes-retrieval-harness');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-retrieval-harness-'));
fs.mkdirSync(path.join(tmp, 'docs'), { recursive: true });
fs.mkdirSync(path.join(tmp, 'tools'), { recursive: true });
fs.mkdirSync(path.join(tmp, 'node_modules', 'ignored'), { recursive: true });
fs.mkdirSync(path.join(tmp, 'parallel-research'), { recursive: true });

fs.writeFileSync(
  path.join(tmp, 'docs', 'SDD.md'),
  [
    '# Specification-Driven Design',
    'Disciplined discovery creates modular markdown specifications.',
    '',
    '## Gap Analysis',
    'Continuous gap analysis maps requirements to tests and DevOps gates.',
    '',
    '## Tests',
    'Every specification must have a focused test proving its contract.',
  ].join('\n'),
);
fs.writeFileSync(
  path.join(tmp, 'tools', 'agent.js'),
  [
    "'use strict';",
    'function guardrails() { return "governance"; }',
    'function planner() { return "owner"; }',
    'module.exports = { guardrails, planner };',
  ].join('\n'),
);
fs.writeFileSync(path.join(tmp, 'node_modules', 'ignored', 'skip.js'), 'Specification-Driven Design should not be indexed.');
fs.writeFileSync(
  path.join(tmp, 'parallel-research', 'raw-provider-output.md'),
  'ThumbGate lessons response feedback thumbs repeated provider transcript.',
);
// A cloned foreign repository (has its own .git) and a local-only vault dump —
// both classes of directory exhausted the walkFiles budget in the real repo and
// silently displaced docs/ and tools/ from retrieval.
fs.mkdirSync(path.join(tmp, 'cloned-upstream', '.git'), { recursive: true });
fs.writeFileSync(
  path.join(tmp, 'cloned-upstream', 'README.md'),
  'Specification-Driven Design duplicated inside a nested git clone.',
);
fs.mkdirSync(path.join(tmp, 'Compiled-Vaults'), { recursive: true });
fs.writeFileSync(
  path.join(tmp, 'Compiled-Vaults', 'memory-pack.md'),
  'Specification-Driven Design duplicated inside an exported memory vault.',
);

assert.strictEqual(parseArgs(['retrieve', '--query', 'gap analysis', '--json']).json, true);
assert.deepStrictEqual(tokenize('The Specification-Driven Design gap analysis'), ['specification-driven', 'design', 'gap', 'analysis']);
assert.throws(() => safeRepoPath(tmp, '../outside'), /escapes repo/);

const inventory = buildInventory({ repo: tmp });
assert.strictEqual(inventory.fileCount, 2);
assert(inventory.files.some((file) => file.path === 'docs/SDD.md'));
assert(!inventory.files.some((file) => file.path.includes('node_modules')));
assert(
  !inventory.files.some((file) => file.path.includes('parallel-research')),
  'raw deep-research receipts must not displace canonical code or curated docs',
);
assert(
  !inventory.files.some((file) => file.path.includes('cloned-upstream')),
  'nested git clones are foreign corpora and must not be indexed',
);
assert(
  !inventory.files.some((file) => file.path.includes('Compiled-Vaults')),
  'exported memory-vault dumps must not displace the repo corpus',
);

// Chunking tests.
const markdownChunks = chunkFile(fs.readFileSync(path.join(tmp, 'docs/SDD.md'), 'utf8'), 'docs/SDD.md');
assert(markdownChunks.length >= 3, 'markdown should split into multiple heading chunks');
assert(markdownChunks.some((chunk) => chunk.header.toLowerCase().includes('gap analysis')));
assert.strictEqual(markdownChunks[0].chunkType, 'markdown-section');

const codeChunks = chunkFile(fs.readFileSync(path.join(tmp, 'tools', 'agent.js'), 'utf8'), 'tools/agent.js');
assert(codeChunks.length >= 2, 'code should split into multiple function blocks');
assert(codeChunks.some((chunk) => chunk.text.includes('guardrails')));
assert(codeChunks.some((chunk) => chunk.text.includes('planner')));

// Deduplication: identical chunks across vault dumps should be skipped in the index.
fs.writeFileSync(
  path.join(tmp, 'Compiled-Vaults', 'duplicate.md'),
  '# Specification-Driven Design\nDisciplined discovery creates modular markdown specifications.\n',
);
const indexWithDedupe = buildChunkIndex(tmp);
const parentPaths = indexWithDedupe.files.flatMap((entry) => entry.chunks.map((chunk) => chunk.parentPath));
assert(parentPaths.includes('docs/SDD.md'));
assert(
  !parentPaths.some((parentPath) => parentPath.includes('Compiled-Vaults')),
  'duplicate content from vault dumps must be deduplicated',
);

// Index persistence and incremental update.
const indexResult = indexCommand(tmp);
assert(indexResult.fileCount >= 2);
assert(indexResult.chunkCount > 0);
assert(fs.existsSync(path.join(tmp, '.rag-index', 'index.jsonl')));
const readBack = readIndex(tmp);
assert(readBack, 'index should be readable from disk');
assert(readBack.files.some((entry) => entry.path === 'docs/SDD.md'));

const updated = updateIndex(tmp);
assert(updated.files.some((entry) => entry.path === 'docs/SDD.md'));

// Retrieval still works and now returns chunk-level citations.
const retrieved = retrieve('modular markdown gap analysis tests', { repo: tmp, limit: 5 });
assert.strictEqual(retrieved.matches[0].path, 'docs/SDD.md');
assert(retrieved.matches[0].score > 0);
assert(
  retrieved.matches[0].snippet.toLowerCase().includes('gap analysis') ||
    retrieved.matches[0].snippet.toLowerCase().includes('modular markdown'),
);
assert(retrieved.matches[0].chunk, 'retrieval should include chunk metadata');
assert(Number.isInteger(retrieved.matches[0].chunk.startLine));
assert.strictEqual(retrieved.matches[0].chunk.chunkType, 'markdown-section');
assert(
  !retrieve('ThumbGate lessons response feedback thumbs', { repo: tmp, limit: 10 }).matches.some(
    (match) => match.path.includes('parallel-research'),
  ),
  'raw deep-research receipts must stay outside default retrieval',
);

// Code retrieval: header boosting should surface the right function.
const plannerRetrieved = retrieve('planner owner', { repo: tmp, limit: 5 });
assert(plannerRetrieved.matches.some((match) => match.path === 'tools/agent.js' && match.chunk.header.toLowerCase().includes('planner')));

const read = readFileRange({ repo: tmp, path: 'docs/SDD.md', start: 2, end: 5 });
assert.strictEqual(read.start, 2);
assert(read.text.includes('2: Disciplined discovery'));
assert(read.text.includes('4: ## Gap Analysis'));
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
