'use strict';

const assert = require('assert');

const {
  summarizeCodeQualitySetup,
  summarizeRulesets,
  parseArgs,
} = require('../tools/github-code-quality-status');

assert.deepStrictEqual(
  summarizeCodeQualitySetup({ state: 'configured', languages: ['typescript'] }),
  {
    enabled: true,
    state: 'configured',
    languages: ['typescript'],
    schedule: null,
    updatedAt: null,
  },
);

assert.deepStrictEqual(
  summarizeCodeQualitySetup({
    error: 'Code quality is not available for this repository. (HTTP 404)',
    httpStatus: 404,
  }),
  {
    enabled: false,
    state: 'unavailable',
    detail: 'Code quality is not available for this repository. (HTTP 404)',
    httpStatus: 404,
  },
);

assert.deepStrictEqual(
  summarizeRulesets([
    {
      id: 1,
      name: 'Hermes Mobile coverage gate (evaluate)',
      enforcement: 'evaluate',
      rules: [{ type: 'code_coverage' }],
    },
    { id: 2, name: 'Other', enforcement: 'active', rules: [{ type: 'pull_request' }] },
  ]),
  {
    count: 2,
    evaluateCoverageRulesets: [
      {
        id: 1,
        name: 'Hermes Mobile coverage gate (evaluate)',
        enforcement: 'evaluate',
      },
    ],
  },
);

assert.strictEqual(parseArgs(['node', 'script.js', '--json', '--repo', 'a/b']).json, true);
assert.strictEqual(parseArgs(['node', 'script.js', '--json', '--repo', 'a/b']).repo, 'a/b');

console.log('ok test-github-code-quality-status.js');
