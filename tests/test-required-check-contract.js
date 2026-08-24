#!/usr/bin/env node

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const workflows = [
  {
    path: '.github/workflows/hermes-control-plane.yml',
    check: 'Hermes control plane / verify',
  },
  {
    path: '.github/workflows/control-plane-tests.yml',
    check: 'control-plane-tests / unit-and-coverage',
  },
];

let assertions = 0;
const check = (condition, message) => {
  assert.ok(condition, message);
  assertions += 1;
};

for (const workflow of workflows) {
  const source = read(workflow.path);
  const trigger = source.slice(source.indexOf('\non:'), source.indexOf('\npermissions:'));
  const pullRequest = trigger.slice(
    trigger.indexOf('  pull_request:'),
    trigger.indexOf('  push:'),
  );

  check(
    !/^\s+paths:/m.test(pullRequest),
    `${workflow.check} must be emitted on every pull request instead of disappearing behind a trigger path filter`,
  );
  check(source.includes('fetch-depth: 0'), `${workflow.check} must fetch both PR revisions`);
  check(source.includes('id: scope'), `${workflow.check} must expose a path-scope decision`);
  check(source.includes('git diff --quiet "$BASE_SHA...$HEAD_SHA"'), `${workflow.check} must compare the provider-supplied PR revisions`);
  check(source.includes('case "$diff_status" in'), `${workflow.check} must distinguish changed, unchanged, and detector-error outcomes`);
  check(source.includes('exit "$diff_status"'), `${workflow.check} must fail closed when path detection errors`);
  check(
    source.includes('if: steps.scope.outputs.relevant != \'true\''),
    `${workflow.check} must expose an explicit cheap success path for irrelevant changes`,
  );

  const stepBlocks = source.split(/^      - /m).slice(1);
  const scopeIndex = stepBlocks.findIndex((block) => block.includes('id: scope'));
  check(scopeIndex >= 0, `${workflow.check} must contain the scope step in its job`);

  for (const block of stepBlocks.slice(scopeIndex + 1)) {
    if (block.includes("if: steps.scope.outputs.relevant != 'true'")) continue;
    check(
      block.includes("if: steps.scope.outputs.relevant == 'true'"),
      `${workflow.check} heavy step must be conditional:\n${block.split('\n')[0]}`,
    );
  }
}

console.log(`required check contract: ${assertions} assertions passed`);
