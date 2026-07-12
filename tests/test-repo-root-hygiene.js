#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const tool = path.resolve(__dirname, '..', 'tools', 'repo-root-hygiene.js');
const repo = fs.mkdtempSync(path.join(os.tmpdir(), 'repo-root-hygiene-'));
const date = '2099-12-31';

function write(relative, contents) {
  const target = path.join(repo, relative);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, contents);
  return target;
}

function run(extraArgs, expectedStatus) {
  const result = spawnSync(process.execPath, [tool, '--repo', repo, '--json'].concat(extraArgs), {
    encoding: 'utf8',
  });
  assert.equal(result.status, expectedStatus, result.stderr || result.stdout);
  return JSON.parse(result.stdout);
}

try {
  assert.equal(spawnSync('git', ['init', '-q', repo]).status, 0);
  write('.gitignore', [
    'payment-readiness*.md',
    'pipeline-integrity*.md',
    'proposal-batch-plan*.md',
    'proposal-plan*.md',
    'hermes-decision*.md',
    'hermes-decisions*.jsonl',
    'artifacts/',
    'business_os/',
    '',
  ].join('\n'));

  const tracked = write(`payment-readiness-tracked-${date}.md`, 'tracked\n');
  assert.equal(spawnSync('git', ['-C', repo, 'add', '.gitignore']).status, 0);
  assert.equal(spawnSync('git', ['-C', repo, 'add', '-f', path.basename(tracked)]).status, 0);

  const symlinkTarget = write('symlink-target.txt', 'target\n');
  fs.symlinkSync(symlinkTarget, path.join(repo, `payment-readiness-link-${date}.md`));
  write(`personal-notes-${date}.md`, 'unknown\n');
  write('proposal-plan-draft.md', 'manual undated draft\n');

  write(`payment-readiness-all-${date}.md`, 'canonical candidate\n');
  write(`hermes-decision-${date}.md`, 'decision receipt\n');
  write(`pipeline-integrity-${date}.md`, 'same\n');
  write(`business_os/revenue/pipeline-integrity-${date}.md`, 'same\n');
  write(`proposal-batch-plan-${date}.md`, 'new conflict\n');
  write(`business_os/revenue/proposal-batch-plan-${date}.md`, 'old conflict\n');

  const check = run([], 1);
  assert.equal(check.mode, 'check');
  assert.equal(check.eligibleBefore, 4);
  assert.equal(check.moved, 0);
  assert.equal(check.healthy, false);
  assert.ok(fs.existsSync(path.join(repo, `payment-readiness-all-${date}.md`)));

  const repair = run(['--repair'], 0);
  assert.equal(repair.mode, 'repair');
  assert.equal(repair.eligibleBefore, 4);
  assert.equal(repair.moved, 4);
  assert.equal(repair.eligibleAfter, 0);
  assert.equal(repair.healthy, true);

  assert.equal(
    fs.readFileSync(path.join(repo, `business_os/revenue/payment-readiness-all-${date}.md`), 'utf8'),
    'canonical candidate\n',
  );
  assert.equal(
    fs.readFileSync(path.join(repo, `artifacts/hermes-decision-loop/hermes-decision-${date}.md`), 'utf8'),
    'decision receipt\n',
  );
  const duplicateMove = repair.moves.find((move) => move.reason === 'duplicate_preserved');
  const conflictMove = repair.moves.find((move) => move.reason === 'conflict_preserved');
  assert.ok(duplicateMove, 'same-content collision should be preserved in duplicate quarantine');
  assert.ok(conflictMove, 'different-content collision should be preserved in conflict quarantine');
  assert.equal(fs.readFileSync(path.join(repo, duplicateMove.to), 'utf8'), 'same\n');
  assert.equal(fs.readFileSync(path.join(repo, conflictMove.to), 'utf8'), 'new conflict\n');

  assert.ok(fs.existsSync(tracked), 'tracked matching file must remain in root');
  assert.ok(fs.lstatSync(path.join(repo, `payment-readiness-link-${date}.md`)).isSymbolicLink());
  assert.ok(fs.existsSync(path.join(repo, `personal-notes-${date}.md`)));
  assert.ok(fs.existsSync(path.join(repo, 'proposal-plan-draft.md')));
  assert.ok(fs.existsSync(path.join(repo, 'artifacts/root-hygiene/latest.json')));

  const secondRepair = run(['--repair'], 0);
  assert.equal(secondRepair.eligibleBefore, 0);
  assert.equal(secondRepair.moved, 0);
  assert.equal(secondRepair.healthy, true);

  console.log('repo root hygiene: 8/8 passed');
} finally {
  fs.rmSync(repo, { recursive: true, force: true });
}
