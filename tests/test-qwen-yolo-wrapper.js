#!/usr/bin/env node
'use strict';

/**
 * Smoke checks for bin/qwen-yolo (syntax + doctor surface). Does not call DashScope.
 */

const assert = require('assert');
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const BIN = path.join(ROOT, 'bin', 'qwen-yolo');

assert.ok(fs.existsSync(BIN), 'bin/qwen-yolo missing');
assert.ok(fs.statSync(BIN).mode & 0o100, 'bin/qwen-yolo not executable');

{
  const help = spawnSync(BIN, ['--help'], { encoding: 'utf8' });
  assert.strictEqual(help.status, 0, help.stderr);
  assert.match(help.stdout, /FULL YOLO/);
  assert.match(help.stdout, /--infer/);
  console.log('PASS 1: --help documents YOLO + infer');
}

{
  const doctor = spawnSync(BIN, ['--doctor'], { encoding: 'utf8', env: process.env });
  assert.ok(doctor.stdout.includes('qwen-yolo'), doctor.stderr || doctor.stdout);
  assert.match(doctor.stdout, /approvalMode/);
  assert.match(doctor.stdout, /DASHSCOPE/);
  console.log('PASS 2: --doctor prints health surface (exit=' + doctor.status + ')');
}

{
  const bash = spawnSync('bash', ['-n', BIN], { encoding: 'utf8' });
  assert.strictEqual(bash.status, 0, bash.stderr);
  console.log('PASS 3: bash -n clean');
}

console.log('\nALL QWEN-YOLO WRAPPER CHECKS PASSED');
