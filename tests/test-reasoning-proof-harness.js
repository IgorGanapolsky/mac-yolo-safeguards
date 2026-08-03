#!/usr/bin/env node
'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');

function run(args) {
  return spawnSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8' });
}

// unit self-tests
for (const script of [
  'tools/deterministic-count.js',
  'tools/reasoning-proof-ladder.js',
  'tools/independent-verifier.js',
]) {
  const r = run([script, '--self-test']);
  assert.strictEqual(r.status, 0, `${script}: ${r.stderr || r.stdout}`);
  console.log('PASS', script, '--self-test');
}

// scaffold + grade packet
const sc = run([
  'tools/reasoning-proof-ladder.js',
  'scaffold',
  '--problem',
  'Block numeric LIVE claims without results',
  '--json',
]);
assert.strictEqual(sc.status, 0);
const packet = JSON.parse(sc.stdout);
packet.detours = [
  {
    approach: 'Trust model count of LIVE posts',
    whyFailed: 'BPE tokenization + TC0 depth limit mis-count (arXiv:2410.19730)',
    lesson: 'Deterministic code count only',
  },
];
packet.winningPath = 'ship-claim-gate + deterministic-count.compareClaimToResults';
packet.dualWitness = 'independent-verifier runs count self-test and ship-claim self-test';
packet.machineCheck = 'node tools/deterministic-count.js --self-test';
packet.residualRisks = ['Matrix format drift'];

const tmp = path.join(os.tmpdir(), `proof-packet-${process.pid}.json`);
fs.writeFileSync(tmp, JSON.stringify(packet, null, 2));
const g = run(['tools/reasoning-proof-ladder.js', 'grade', '--file', tmp, '--json']);
assert.strictEqual(g.status, 0, g.stderr + g.stdout);
const graded = JSON.parse(g.stdout);
assert.strictEqual(graded.level, 'machine_checked');
console.log('PASS grade machine_checked');

// claim-counts mismatch
const resFile = path.join(os.tmpdir(), `res-${process.pid}.json`);
fs.writeFileSync(resFile, JSON.stringify([{ ok: true }, { ok: false }, { ok: true }]));
const cc = run([
  'tools/deterministic-count.js',
  'claim-counts',
  '--claim',
  '5 replies LIVE',
  '--results-json',
  resFile,
]);
assert.notStrictEqual(cc.status, 0);
console.log('PASS claim-counts blocks overclaim');

// dual verifier
const iv = run([
  'tools/independent-verifier.js',
  '--a',
  'node tools/deterministic-count.js --self-test',
  '--b',
  'node tools/reasoning-proof-ladder.js --self-test',
]);
assert.strictEqual(iv.status, 0, iv.stderr);
console.log('PASS independent-verifier pair');

// ship-claim numeric without results
const scg = run([
  'tools/ship-claim-gate.js',
  '--claim',
  '5 replies LIVE on r/test',
]);
assert.strictEqual(scg.status, 1, 'should block');
assert.match(scg.stdout + scg.stderr, /deterministic|results-json|2410/i);
console.log('PASS ship-claim blocks bare numeric LIVE');

console.log('PASS test-reasoning-proof-harness');
