#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repo = path.resolve(__dirname, '..');
const installer = fs.readFileSync(
  path.join(repo, 'hermes-mobile', 'scripts', 'install-phone-release.sh'),
  'utf8',
);
const jestConfig = fs.readFileSync(
  path.join(repo, 'hermes-mobile', 'jest.config.js'),
  'utf8',
);

assert.match(jestConfig, /worktrees/, 'fixture requires the repo-local worktree ignore');
assert.match(
  installer,
  /npm test[\s\S]*--testPathIgnorePatterns=['"]\/node_modules\/['"]/,
  'release installer must include canonical tests from its current .worktrees checkout',
);
assert.doesNotMatch(
  installer,
  /npm test[^\n]*--passWithNoTests/,
  'release installer must never convert zero discovered tests into a green gate',
);
assert.match(
  installer,
  /npm run test:release-safety/,
  'worktree repair must preserve the release-safety contract gate',
);
assert.match(
  installer,
  /Error: unit tests failed — refusing phone install/,
  'worktree repair must preserve fail-closed installer behavior',
);

console.log('phone release installer worktree test gate: 5/5 passed');
