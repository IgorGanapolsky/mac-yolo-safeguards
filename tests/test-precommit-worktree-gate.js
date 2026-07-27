#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const repo = path.resolve(__dirname, '..');
const hook = fs.readFileSync(path.join(repo, '.githooks', 'pre-commit'), 'utf8');
const jestConfig = fs.readFileSync(path.join(repo, 'hermes-mobile', 'jest.config.js'), 'utf8');

assert.match(jestConfig, /worktrees/, 'fixture requires the repo-local worktree ignore');
assert.match(hook, /--findRelatedTests/, 'hook must run tests related to staged mobile files');
assert.match(
  hook,
  /--testPathIgnorePatterns=['"]\/node_modules\/['"]/,
  'hook must include tests from the current .worktrees checkout',
);
assert.doesNotMatch(
  hook,
  /--passWithNoTests/,
  'zero related tests must fail instead of being reported as a green gate',
);
assert.match(hook, /typecheck/, 'worktree test repair must preserve the typecheck gate');

console.log('precommit worktree test gate: 5/5 passed');
