#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const TOOL = path.join(ROOT, 'tools', 'hosted-prompt-distill.js');
const BIN = path.join(ROOT, 'bin', 'hosted-prompt-distill');

function run(args) {
  return spawnSync(process.execPath, [TOOL, ...args], {
    encoding: 'utf8',
    cwd: ROOT,
  });
}

console.log('=== test-hosted-prompt-distill ===');

const doctor = run(['--doctor', '--json']);
assert.equal(doctor.status, 0, doctor.stderr);
const d = JSON.parse(doctor.stdout);
assert.equal(d.ok, true);
assert.equal(d.costUsd, 0);
assert.equal(d.tinkerClone, false);
assert.equal(d.trainOnCustomerRuns, false);
assert.equal(d.paidTrain, false);
assert.equal(d.hostedCompletedIsNotQuality, true);
assert.equal(d.inklingDefault, false);

const dump = path.join(os.tmpdir(), `hosted-distill-system-${process.pid}.txt`);
fs.writeFileSync(
  dump,
  `${'# SKILL.md\nYou are an interactive CLI tool.\n## NEVER\n## ALWAYS\nSlash: /x\nAuto-invoke\n'.repeat(400)}`,
);
const distilled = run(['--distill', '--system-file', dump, '--json']);
assert.equal(distilled.status, 0, distilled.stderr);
const out = JSON.parse(distilled.stdout);
assert.equal(out.ok, true);
assert.equal(out.stripped, true);
assert.ok(out.ratio < 0.1, `ratio ${out.ratio}`);
assert.equal(out.trained, false);
fs.unlinkSync(dump);

const customer = run(['--distill', '--source', 'customer_run', '--json']);
assert.equal(customer.status, 2);
const denied = JSON.parse(customer.stdout);
assert.equal(denied.reason, 'train_on_customer_runs_forbidden');
assert.equal(denied.trained, false);

const binHelp = spawnSync(BIN, ['--help'], { encoding: 'utf8' });
assert.equal(binHelp.status, 0, binHelp.stderr);
assert.match(binHelp.stdout, /hosted-prompt-distill/);
assert.doesNotMatch(out.system, /GPU cluster checkout/i);
assert.doesNotMatch(d.product, /GPU cluster/i);

console.log('PASS');
