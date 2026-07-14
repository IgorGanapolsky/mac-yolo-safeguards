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

  expect(extractPackageIds(html)).toEqual(['com.first.app', 'com.second_app']);
});

test('rankPackage returns a one-based position or null', () => {
  const packages = ['com.first', 'com.target', 'com.third'];
  expect(rankPackage(packages, 'com.target')).toBe(2);
  expect(rankPackage(packages, 'com.missing')).toBeNull();
});

test('parseArgs accepts repeated queries and market overrides', () => {
  expect(
    parseArgs([
      '--query', 'ai agent remote control',
      '--query', 'claude code remote',
      '--package', 'com.example',
      '--language', 'en',
      '--country', 'GB',
      '--json',
    ]),
  ).toEqual({
      packageId: 'com.example',
      queries: ['ai agent remote control', 'claude code remote'],
      language: 'en',
      country: 'GB',
      json: true,
    });
});

test('parseArgs uses the buyer-intent baseline by default', () => {
  const options = parseArgs([]);
  expect(options.queries).toEqual(DEFAULT_QUERIES);
  expect(options.queries).not.toBe(DEFAULT_QUERIES);
});

test('parseArgs rejects missing query values', () => {
  expect(() => parseArgs(['--query'])).toThrow(/requires a value/);
});
