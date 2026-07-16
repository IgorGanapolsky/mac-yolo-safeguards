#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.resolve(__dirname, '..');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mac-yolo-ci-home-test-'));
const operatorHome = path.join(root, 'operator-home');
const runnerTemp = path.join(root, 'runner-temp');
const fakeBin = path.join(root, 'fake-bin');
const launchctlLog = path.join(root, 'launchctl.log');
const liveTarget = path.join(operatorHome, 'live-hermes-yolo');
const liveLink = path.join(operatorHome, '.local', 'bin', 'hermes-yolo');
const isolatedHome = path.join(runnerTemp, 'mac-yolo-safeguards-ci-home');

try {
  fs.mkdirSync(path.dirname(liveLink), { recursive: true });
  fs.mkdirSync(runnerTemp, { recursive: true });
  fs.mkdirSync(fakeBin, { recursive: true });
  fs.writeFileSync(liveTarget, '# operator runtime sentinel\n', { mode: 0o755 });
  fs.symlinkSync(liveTarget, liveLink);

  const fakeLaunchctl = path.join(fakeBin, 'launchctl');
  fs.writeFileSync(fakeLaunchctl, [
    '#!/bin/sh',
    `printf '%s\\n' "$*" >> ${JSON.stringify(launchctlLog)}`,
    'exit 1',
    '',
  ].join('\n'), { mode: 0o755 });

  const result = spawnSync('/bin/sh', [path.join(repoRoot, 'install.sh')], {
    cwd: repoRoot,
    encoding: 'utf8',
    timeout: 60_000,
    env: {
      ...process.env,
      HOME: operatorHome,
      RUNNER_TEMP: runnerTemp,
      GITHUB_ACTIONS: 'true',
      CI: 'true',
      USER: 'runner',
      PATH: `${fakeBin}:${process.env.PATH || ''}`,
    },
  });

  assert.strictEqual(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.strictEqual(fs.readlinkSync(liveLink), liveTarget, 'operator hermes-yolo link must be untouched');
  assert.strictEqual(fs.readFileSync(liveTarget, 'utf8'), '# operator runtime sentinel\n');

  const isolatedLink = path.join(isolatedHome, '.local', 'bin', 'hermes-yolo');
  assert.strictEqual(fs.readlinkSync(isolatedLink), path.join(repoRoot, 'hermes-yolo-wrapper.js'));

  const isolatedPlist = fs.readFileSync(
    path.join(isolatedHome, 'Library', 'LaunchAgents', 'com.igor.shutdown-simulators.plist'),
    'utf8',
  );
  assert(isolatedPlist.includes(isolatedHome), 'CI plist must reference only the isolated home');
  assert(!isolatedPlist.includes(operatorHome), 'CI plist must not reference the operator home');

  const launchctlCalls = fs.existsSync(launchctlLog) ? fs.readFileSync(launchctlLog, 'utf8') : '';
  assert(!/\b(?:bootout|bootstrap)\b/.test(launchctlCalls), 'CI must not mutate live LaunchAgent state');
  assert(result.stdout.includes(`CI smoke isolation: ${isolatedHome}`));
  assert(result.stdout.includes('skipped in CI smoke mode; live LaunchAgent state is untouched'));

  console.log('PASS: CI smoke install is isolated from the operator home and live LaunchAgent');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
