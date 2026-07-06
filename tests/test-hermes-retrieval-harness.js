'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const {
  buildEvidenceBrief,
  buildInventory,
  findFiles,
  grepFile,
  parseArgs,
  readFile,
  redact,
  retrieve,
} = require('../tools/hermes-retrieval-harness');

assert.strictEqual(parseArgs(['retrieve', '--query', 'gateway proof', '--top-k', '3']).topK, 3);
assert.throws(() => parseArgs(['retrieve', '--bogus']), /Unknown argument/);
const FAKE_GITHUB_TOKEN = ['ghp', 'FAKE_FAKE_FAKE_FAKE_FAKE_FAKE_0000'].join('_');
assert.strictEqual(redact(`token ${FAKE_GITHUB_TOKEN}`), 'token [REDACTED:github-token]');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-retrieval-harness-'));
const repo = path.join(tmp, 'repo');
fs.mkdirSync(path.join(repo, 'docs'), { recursive: true });
fs.mkdirSync(path.join(repo, 'tools'), { recursive: true });
fs.mkdirSync(path.join(repo, 'tests'), { recursive: true });
fs.mkdirSync(path.join(repo, 'business_os'), { recursive: true });

fs.writeFileSync(path.join(repo, 'AGENTS.md'), [
  '# Agent directives',
  'Use evidence before claims.',
  'Always confirm with readFile or grepFile.',
].join('\n'));

fs.writeFileSync(path.join(repo, 'docs', 'HERMES-RUNTIME.md'), [
  '# Hermes runtime',
  'Gateway health is separate from Telegram readiness.',
  'The latest proof lives at hermes-mobile/docs/proofs/continuous/latest.json.',
  'When E2E is skipped by load guard, say it is skipped.',
].join('\n'));

fs.writeFileSync(path.join(repo, 'plan.md'), [
  '# Plan',
  '| T-1 | Retrieval harness | in_progress | codex | `tools/hermes-retrieval-harness.js` | tests pass |',
  'Decision: legal-kb style find retrieve read grep citations should ground Hermes claims.',
].join('\n'));

fs.writeFileSync(path.join(repo, 'tools', 'danger.js'), [
  `const token = '${FAKE_GITHUB_TOKEN}';`,
  'module.exports = { token };',
].join('\n'));

fs.writeFileSync(path.join(repo, 'business_os', 'private.md'), 'Do not index this private ignored folder.');

const baseOptions = { repo, roots: ['AGENTS.md', 'docs', 'tools', 'tests', 'plan.md'] };
const inventory = buildInventory(baseOptions);
assert.strictEqual(inventory.files.some((file) => file.path === 'docs/HERMES-RUNTIME.md'), true);
assert.strictEqual(inventory.files.some((file) => file.path === 'business_os/private.md'), false);
assert.ok(inventory.files.every((file) => file.sha256.length === 64));

const found = findFiles({ ...baseOptions, contains: 'runtime' });
assert.strictEqual(found.totalMatches, 1);
assert.strictEqual(found.files[0].path, 'docs/HERMES-RUNTIME.md');
assert.deepStrictEqual(found.toolOrder, ['findFiles', 'retrieve', 'readFile or grepFile before citing']);

const retrieved = retrieve({ ...baseOptions, query: 'gateway latest proof e2e skipped', topK: 2 });
assert.strictEqual(retrieved.resultCount > 0, true);
assert.strictEqual(retrieved.results[0].path, 'docs/HERMES-RUNTIME.md');
assert.match(retrieved.results[0].citation, /^cite:[0-9a-f]{10}$/);
assert.match(retrieved.results[0].preview, /latest proof/);

const read = readFile({ ...baseOptions, file: 'tools/danger.js', line: 1, maxLines: 2 });
assert.match(read.citation, /^cite:[0-9a-f]{10}$/);
assert.match(read.content, /\[REDACTED:github-token\]/);
assert.doesNotMatch(read.content, new RegExp(FAKE_GITHUB_TOKEN));

const grep = grepFile({ ...baseOptions, file: 'docs/HERMES-RUNTIME.md', pattern: 'latest\\.json', contextChars: 60 });
assert.strictEqual(grep.matchCount, 1);
assert.match(grep.matches[0].context, /latest\.json/);
assert.match(grep.matches[0].citation, /^cite:[0-9a-f]{10}$/);

const secretGrep = grepFile({ ...baseOptions, file: 'tools/danger.js', pattern: 'ghp_[A-Za-z0-9_]+', contextChars: 80 });
assert.strictEqual(secretGrep.matchCount, 1);
assert.strictEqual(secretGrep.matches[0].match, '[REDACTED:github-token]');
assert.doesNotMatch(JSON.stringify(secretGrep), new RegExp(FAKE_GITHUB_TOKEN));

const brief = buildEvidenceBrief({ ...baseOptions, query: 'legal-kb retrieve read grep citations', contains: 'plan', topK: 2 });
assert.strictEqual(brief.inventory.matchingFiles, 1);
assert.strictEqual(brief.retrieved.resultCount > 0, true);
assert.match(brief.instruction, /readFile or grepFile/);

const cli = spawnSync(process.execPath, [
  path.join(__dirname, '..', 'tools', 'hermes-retrieval-harness.js'),
  'retrieve',
  '--repo',
  repo,
  '--roots',
  'AGENTS.md,docs,tools,tests,plan.md',
  '--query',
  'gateway latest proof',
  '--json',
], { encoding: 'utf8' });
assert.strictEqual(cli.status, 0, cli.stderr);
const cliPayload = JSON.parse(cli.stdout);
assert.strictEqual(cliPayload.results[0].path, 'docs/HERMES-RUNTIME.md');

fs.rmSync(tmp, { recursive: true, force: true });
console.log('Hermes retrieval harness tests: PASS');
