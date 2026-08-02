#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const updater = path.join(repoRoot, 'scripts', 'hermes-fleet-autoupdate.sh');

function makeFixture({ active, healerExit = 0, staleLock = false, sourceDirty = false, sourceAhead = 0 }) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-fleet-autoupdate-'));
  const agentRepo = path.join(root, 'agent');
  const fakeBin = path.join(root, 'bin');
  const calls = path.join(root, 'calls.log');
  fs.mkdirSync(path.join(agentRepo, 'venv', 'bin'), { recursive: true });
  fs.mkdirSync(path.join(agentRepo, 'pkg', '__pycache__'), { recursive: true });
  fs.mkdirSync(path.join(agentRepo, '.git'), { recursive: true });
  fs.mkdirSync(fakeBin, { recursive: true });
  fs.writeFileSync(path.join(agentRepo, 'pkg', '__pycache__', 'sentinel.pyc'), 'fixture');
  const hermes = path.join(fakeBin, 'hermes');
  fs.writeFileSync(hermes, [
    '#!/bin/bash',
    `printf 'hermes %s\\n' "$*" >> ${JSON.stringify(calls)}`,
    'if [ "$1 $2" = "update --check" ]; then echo "Update available"; fi',
    'exit 0',
    '',
  ].join('\n'), { mode: 0o755 });
  fs.writeFileSync(path.join(agentRepo, 'venv', 'bin', 'python'), [
    '#!/bin/bash',
    `printf 'python %s\\n' "$*" >> ${JSON.stringify(calls)}`,
    'exit 0',
    '',
  ].join('\n'), { mode: 0o755 });
  const healer = path.join(fakeBin, 'healer');
  fs.writeFileSync(healer, [
    '#!/bin/bash',
    `printf 'healer\\n' >> ${JSON.stringify(calls)}`,
    `exit ${healerExit}`,
    '',
  ].join('\n'), { mode: 0o755 });
  const git = path.join(fakeBin, 'git');
  fs.writeFileSync(git, [
    '#!/bin/bash',
    `printf 'git %s\\n' "$*" >> ${JSON.stringify(calls)}`,
    `if [[ "$*" == *"status --porcelain=v1"* ]]; then ${sourceDirty ? 'echo " M local-wip.py"' : ':'}; exit 0; fi`,
    `if [[ "$*" == *"rev-list --left-right --count"* ]]; then echo "${sourceAhead} 0"; exit 0; fi`,
    'exit 0',
    '',
  ].join('\n'), { mode: 0o755 });
  const lockDir = path.join(root, 'updater.lock');
  if (staleLock) {
    fs.mkdirSync(lockDir);
    fs.writeFileSync(path.join(lockDir, 'owner.pid'), '99999999\n');
  }
  const result = spawnSync('/bin/bash', [updater], {
    encoding: 'utf8',
    timeout: 30_000,
    env: {
      ...process.env,
      HOME: root,
      HERMES_AGENT_REPO: agentRepo,
      HERMES_BIN: hermes,
      HERMES_CAPABILITY_HEALER: healer,
      HERMES_GIT_BIN: git,
      HERMES_UPDATE_LOCK_DIR: lockDir,
      HERMES_UPDATER_ASSUME_ACTIVE: String(active),
      HERMES_NTFY_URL: '',
    },
  });
  return { root, agentRepo, calls, result };
}

const active = makeFixture({ active: true });
try {
  assert.strictEqual(active.result.status, 0, active.result.stderr);
  const calls = fs.readFileSync(active.calls, 'utf8');
  assert.match(active.result.stdout, /update deferred/);
  assert.doesNotMatch(calls, /update --yes/);
  assert.match(calls, /python -c/);
  assert.match(calls, /healer/);
  assert(fs.existsSync(path.join(active.agentRepo, 'pkg', '__pycache__', 'sentinel.pyc')),
    'a deferred update must not spend time deleting bytecode');
} finally {
  fs.rmSync(active.root, { recursive: true, force: true });
}

const idle = makeFixture({ active: false });
try {
  assert.strictEqual(idle.result.status, 0, idle.result.stderr);
  const calls = fs.readFileSync(idle.calls, 'utf8');
  assert.match(calls, /update --yes/);
  assert(!fs.existsSync(path.join(idle.agentRepo, 'pkg', '__pycache__')),
    'a successful update must clear stale bytecode before import proof');
} finally {
  fs.rmSync(idle.root, { recursive: true, force: true });
}

const failedCapability = makeFixture({ active: true, healerExit: 1 });
try {
  assert.strictEqual(failedCapability.result.status, 1, 'capability failure must fail the scheduled run');
  assert.match(failedCapability.result.stderr, /capability proof failed/i);
} finally {
  fs.rmSync(failedCapability.root, { recursive: true, force: true });
}

const staleLock = makeFixture({ active: true, staleLock: true });
try {
  assert.strictEqual(staleLock.result.status, 0, staleLock.result.stderr);
  assert.match(fs.readFileSync(staleLock.calls, 'utf8'), /healer/,
    'a dead PID lock must be reclaimed so healing still runs');
} finally {
  fs.rmSync(staleLock.root, { recursive: true, force: true });
}

const dirtySource = makeFixture({ active: false, sourceDirty: true, sourceAhead: 11_736 });
try {
  assert.strictEqual(dirtySource.result.status, 0, dirtySource.result.stderr);
  const calls = fs.readFileSync(dirtySource.calls, 'utf8');
  assert.match(dirtySource.result.stdout, /source update deferred: checkout is dirty or ahead/i);
  assert.doesNotMatch(calls, /hermes update --yes/,
    'the updater must never stash or rewrite a dirty/ahead developer checkout');
  assert(fs.existsSync(path.join(dirtySource.agentRepo, 'pkg', '__pycache__', 'sentinel.pyc')),
    'a source-safety deferral must not clean bytecode');
  assert.match(calls, /healer/, 'capability healing must still run while source update is deferred');
} finally {
  fs.rmSync(dirtySource.root, { recursive: true, force: true });
}

console.log('Hermes fleet updater tests: PASS');
