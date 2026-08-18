#!/usr/bin/env node
'use strict';

const assert = require('assert');
const path = require('path');
const {
  inspectHooksPath,
  doctor,
  refuseForbiddenFlags,
  parseArgs,
  EXPECTED,
} = require('../tools/hooks-path-doctor');

let passed = 0;
function ok(name) {
  passed += 1;
  console.log(`ok  ${passed}  ${name}`);
}

{
  const missing = inspectHooksPath('');
  assert.equal(missing.ok, false);
  assert.equal(missing.reason, 'missing');
  ok('empty hooksPath is missing');
}

{
  const abs = inspectHooksPath(
    '/Users/igorganapolsky/workspace/git/igor/mac-yolo-safeguards/.githooks'
  );
  assert.equal(abs.ok, false);
  assert.equal(abs.reason, 'absolute');
  ok('absolute hooksPath fails (worktrees would run primary-tree hooks)');
}

{
  const rel = inspectHooksPath('.githooks');
  assert.equal(rel.ok, true);
  assert.equal(rel.reason, 'relative');
  assert.equal(EXPECTED, '.githooks');
  ok('relative .githooks is the only pass');
}

{
  const other = inspectHooksPath('.husky/_');
  assert.equal(other.ok, false);
  assert.equal(other.reason, 'unexpected');
  ok('husky path is unexpected — do not migrate');
}

{
  assert.throws(() => refuseForbiddenFlags(['--add-husky']), /do not install husky/);
  assert.throws(() => parseArgs(['--migrate-husky']), /do not install husky/);
  ok('refuses --add-husky / --migrate-husky');
}

{
  const report = doctor({
    cwd: path.resolve(__dirname, '..'),
    value: '.githooks',
    heal: false,
  });
  assert.equal(report.ok, true);
  assert.equal(report.vendor_switch, 'do_not_install_husky');
  assert.equal(report.hook_executable.ok, true);
  ok('repo .githooks/pre-commit is executable');
}

{
  const fs = require('fs');
  const installer = fs.readFileSync(
    path.resolve(__dirname, '../scripts/install-git-hooks.sh'),
    'utf8'
  );
  assert.match(installer, /config core\.hooksPath \.githooks/);
  assert.doesNotMatch(installer, /config core\.hooksPath ["']?\$ROOT/);
  assert.doesNotMatch(installer, /config core\.hooksPath ["']?\//);
  assert.match(installer, /must be relative \.githooks/);
  ok('installer writes relative .githooks, never $ROOT or /abs');
}

{
  const { spawnSync } = require('child_process');
  const bin = path.resolve(__dirname, '../bin/hooks-path-doctor');
  const r = spawnSync(process.execPath, [bin, '--add-husky'], {
    encoding: 'utf8',
  });
  assert.equal(r.status, 3);
  assert.match(String(r.stderr || ''), /do not install husky/);
  ok('CLI --add-husky exits 3');
}

console.log(`# ${passed} passed`);
