'use strict';

const assert = require('assert');
const { spawnSync } = require('child_process');
const path = require('path');

const {
  slugFromActionName,
  parseArgs,
  assertSafeArgs,
  extractTitle,
  extractUses,
  isGithubNotFound,
  evaluate,
} = require('../.agents/skills/github-marketplace-action-publish/scripts/verify-listing.js');

const script = path.join(
  __dirname,
  '..',
  '.agents/skills/github-marketplace-action-publish/scripts/verify-listing.js',
);

console.log('=== test-github-marketplace-verify ===');

assert.strictEqual(slugFromActionName('ThumbGate Agent Governance'), 'thumbgate-agent-governance');
assert.strictEqual(slugFromActionName('  Foo_Bar  Baz!! '), 'foo-bar-baz');

const args = parseArgs(['--slug', 'thumbgate-agent-governance', '--uses', 'IgorGanapolsky/ThumbGate']);
assert.strictEqual(args.slug, 'thumbgate-agent-governance');
assertSafeArgs(args);
assert.throws(() => assertSafeArgs({ slug: '../etc', uses: 'IgorGanapolsky/ThumbGate' }));
assert.throws(() => assertSafeArgs({ slug: 'ok-slug', uses: 'https://evil.example/x' }));

assert.strictEqual(extractTitle('<title>ThumbGate Agent Governance · GitHub Marketplace</title>'), 'ThumbGate Agent Governance · GitHub Marketplace');
assert.deepStrictEqual(
  extractUses('uses: IgorGanapolsky/ThumbGate@v1.35.2 and IgorGanapolsky/ThumbGate@v1', 'IgorGanapolsky/ThumbGate'),
  ['IgorGanapolsky/ThumbGate@v1.35.2', 'IgorGanapolsky/ThumbGate@v1'],
);

assert.strictEqual(isGithubNotFound(404, '', 'Page not found'), true);
assert.strictEqual(
  isGithubNotFound(200, 'This is not the web page you are looking for', 'GitHub'),
  true,
);
assert.strictEqual(isGithubNotFound(200, '<title>ThumbGate</title>', 'ThumbGate'), false);

const fakeLive = evaluate(
  { slug: 'thumbgate-agent-governance', uses: 'IgorGanapolsky/ThumbGate', query: 'ThumbGate' },
  { status: 200, body: '<title>ThumbGate Agent Governance</title> uses: IgorGanapolsky/ThumbGate@v1' },
  { status: 200, body: '/marketplace/actions/thumbgate-agent-governance' },
);
assert.strictEqual(fakeLive.live, true);
assert.strictEqual(fakeLive.search.hasSlug, true);

const fakeMissing = evaluate(
  { slug: 'this-slug-does-not-exist-xyz', uses: 'IgorGanapolsky/ThumbGate', query: 'zzz' },
  { status: 404, body: '<title>Page not found · GitHub</title>' },
  { status: 200, body: '0 results' },
);
assert.strictEqual(fakeMissing.live, false);
assert.strictEqual(fakeMissing.listing.notFound, true);

function run(extra) {
  return spawnSync(process.execPath, [script, ...extra], { encoding: 'utf8' });
}

const live = run(['--json', '--slug', 'thumbgate-agent-governance', '--uses', 'IgorGanapolsky/ThumbGate']);
if (live.status === 1) {
  console.error('probe failed (unknown), not treating as not-live', live.stderr);
  process.exit(1);
}
assert.strictEqual(live.status, 0, live.stdout + live.stderr);
const report = JSON.parse(live.stdout);
assert.strictEqual(report.live, true);
assert.strictEqual(report.listing.http, 200);
assert.match(report.listing.title, /ThumbGate/i);

const missing = run(['--json', '--slug', 'this-slug-does-not-exist-xyz', '--query', 'zzz-no-such-action']);
assert.notStrictEqual(missing.status, 0);
if (missing.status === 1) {
  console.error('missing-slug probe failed (unknown)', missing.stderr);
  process.exit(1);
}
const miss = JSON.parse(missing.stdout);
assert.strictEqual(miss.live, false);

const specPath = path.join(
  __dirname,
  '..',
  '.agents/skills/github-marketplace-action-publish/routine-spec.json',
);
const specRes = spawnSync(
  process.execPath,
  [path.join(__dirname, '..', 'tools/outcome-routine-spec.js'), 'validate', specPath],
  { encoding: 'utf8' },
);
assert.strictEqual(specRes.status, 0, specRes.stdout + specRes.stderr);

console.log('ok', report.listing.url, report.listing.title);
process.exit(0);
