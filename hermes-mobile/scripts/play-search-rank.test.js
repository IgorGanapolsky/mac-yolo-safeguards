const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DEFAULT_QUERIES,
  extractPackageIds,
  parseArgs,
  rankPackage,
} = require('./play-search-rank');

test('extractPackageIds preserves result order and removes duplicates', () => {
  const html = [
    '/store/apps/details?id=com.first.app',
    '/store/apps/details?id=com.second_app',
    '/store/apps/details?id=com.first.app',
  ].join(' ');

  assert.deepEqual(extractPackageIds(html), ['com.first.app', 'com.second_app']);
});

test('rankPackage returns a one-based position or null', () => {
  const packages = ['com.first', 'com.target', 'com.third'];
  assert.equal(rankPackage(packages, 'com.target'), 2);
  assert.equal(rankPackage(packages, 'com.missing'), null);
});

test('parseArgs accepts repeated queries and market overrides', () => {
  assert.deepEqual(
    parseArgs([
      '--query', 'ai agent remote control',
      '--query', 'claude code remote',
      '--package', 'com.example',
      '--language', 'en',
      '--country', 'GB',
      '--json',
    ]),
    {
      packageId: 'com.example',
      queries: ['ai agent remote control', 'claude code remote'],
      language: 'en',
      country: 'GB',
      json: true,
    },
  );
});

test('parseArgs uses the buyer-intent baseline by default', () => {
  const options = parseArgs([]);
  assert.deepEqual(options.queries, DEFAULT_QUERIES);
  assert.notEqual(options.queries, DEFAULT_QUERIES);
});

test('parseArgs rejects missing query values', () => {
  assert.throws(() => parseArgs(['--query']), /requires a value/);
});
