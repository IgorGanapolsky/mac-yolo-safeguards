#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const script = path.resolve(__dirname, '..', 'scripts', 'prune-stale-worktrees.sh');
const sandbox = fs.mkdtempSync(path.join(os.tmpdir(), 'worktree-hygiene-safety-'));
const repo = path.join(sandbox, 'repo');
const cleanTree = path.join(sandbox, 'clean-agent');
const dirtyTree = path.join(sandbox, 'dirty-agent');

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: 'utf8', ...options });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout;
}

try {
  fs.mkdirSync(repo);
  run('git', ['init', '-q', '-b', 'main', repo]);
  run('git', ['-C', repo, 'config', 'user.email', 'hygiene-test@example.invalid']);
  run('git', ['-C', repo, 'config', 'user.name', 'Worktree Hygiene Test']);
  fs.writeFileSync(path.join(repo, 'README.md'), 'fixture\n');
  run('git', ['-C', repo, 'add', 'README.md']);
  run('git', ['-C', repo, 'commit', '-qm', 'fixture']);

  run('git', ['-C', repo, 'worktree', 'add', '-qb', 'agent-clean', cleanTree]);
  run('git', ['-C', repo, 'worktree', 'add', '-qb', 'agent-dirty', dirtyTree]);
  fs.writeFileSync(path.join(dirtyTree, 'uncommitted.txt'), 'must survive\n');

  const source = fs.readFileSync(script, 'utf8');
  assert.doesNotMatch(source, /git\s+(?:-C\s+["']?\$[^ ]+["']?\s+)?worktree\s+remove/);
  assert.doesNotMatch(source, /rm\s+-rf/);

  const output = run('/bin/bash', [script, '--repo', repo]);

  assert.ok(fs.existsSync(cleanTree), 'clean active worktree must survive');
  assert.ok(fs.existsSync(dirtyTree), 'dirty active worktree must survive');
  assert.equal(fs.readFileSync(path.join(dirtyTree, 'uncommitted.txt'), 'utf8'), 'must survive\n');

  const registrations = run('git', ['-C', repo, 'worktree', 'list', '--porcelain']);
  assert.equal((registrations.match(/^worktree /gm) || []).length, 3);
  assert.match(output, /existing_secondary_preserved=2/);
  assert.match(output, /dirty_secondary_preserved=1/);
  assert.match(output, /existing_worktrees_deleted=0/);

  console.log('worktree hygiene safety: 7/7 passed');
} finally {
  fs.rmSync(sandbox, { recursive: true, force: true });
}
