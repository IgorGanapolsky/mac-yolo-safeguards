#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  BASELINE_PROFILE,
  CANDIDATE_PROFILE,
  INKLING,
  buildReport,
  datasetMetadata,
  readEval,
  writePrivateJson,
} = require('../tools/hermes-tinker-harness');

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  process.stdout.write(`ok - ${name}\n`);
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-tinker-harness-'));
process.on('exit', () => fs.rmSync(root, { recursive: true, force: true }));

test('uses full-weight storage rather than active-parameter count', () => {
  assert.strictEqual(INKLING.totalParameters, 975_000_000_000);
  assert.strictEqual(INKLING.activeParameters, 41_000_000_000);
  assert.strictEqual(INKLING.theoreticalWeightBytesAt4Bit, 487_500_000_000);
});

test('rejects local Inkling on the real 24 GB-class host shape', () => {
  const report = buildReport({
    host: { machine: 'MacBook Pro', chip: 'Apple M5', architecture: 'arm64', memoryBytes: 24e9, memoryGB: 24 },
    supportedModels: ['thinkingmachines/Inkling'],
    dataset: { exists: false, rows: 0, bytes: 0, privateMode: false },
    evaluation: { exists: false, status: 'missing', adopted: false },
    tinkerAuthOK: true,
  });
  assert.strictEqual(report.candidate.tinkerCatalogAvailable, true);
  assert.strictEqual(report.candidate.weightsFitAt4Bit, false);
  assert.strictEqual(report.candidate.localInferenceFeasible, false);
  assert.strictEqual(report.gates.baselineReplacementAllowed, false);
  assert.match(report.recommendation, /Do not download or route Inkling locally/);
});

test('does not infer runtime readiness from enough memory alone', () => {
  const report = buildReport({
    host: { machine: 'GPU host', chip: 'test', architecture: 'x64', memoryBytes: 800e9, memoryGB: 800 },
    supportedModels: [],
    dataset: { exists: false, rows: 0, bytes: 0, privateMode: false },
    evaluation: { exists: false, status: 'missing', adopted: false },
  });
  assert.strictEqual(report.candidate.weightsFitAt4Bit, true);
  assert.strictEqual(report.candidate.compatibleLocalRuntimeProven, false);
  assert.strictEqual(report.candidate.localInferenceFeasible, false);
});

test('requires matching repeated and holdout adoption evidence', () => {
  const evalPath = path.join(root, 'eval.json');
  fs.writeFileSync(evalPath, JSON.stringify({
    profileComparison: {
      status: 'adopt',
      baselineProfile: BASELINE_PROFILE,
      candidateProfile: CANDIDATE_PROFILE,
      gates: { enoughRepeats: true, holdoutNoRegression: true, noRegressions: true },
    },
  }));
  assert.strictEqual(readEval(evalPath).adopted, true);
  const wrong = JSON.parse(fs.readFileSync(evalPath, 'utf8'));
  wrong.profileComparison.candidateProfile = 'some-other-candidate';
  fs.writeFileSync(evalPath, JSON.stringify(wrong));
  assert.strictEqual(readEval(evalPath).adopted, false);
});

test('reports dataset metadata without retaining content', () => {
  const dataset = path.join(root, 'dataset.jsonl');
  fs.writeFileSync(dataset, '{"messages":[{"role":"user","content":"private"},{"role":"assistant","content":"answer"}]}\n', { mode: 0o600 });
  fs.chmodSync(dataset, 0o600);
  const metadata = datasetMetadata(dataset);
  assert.deepStrictEqual(Object.keys(metadata).sort(), ['bytes', 'exists', 'privateMode', 'rows']);
  assert.strictEqual(metadata.rows, 1);
  assert.strictEqual(metadata.privateMode, true);
  assert.strictEqual(JSON.stringify(metadata).includes('messages'), false);
  assert.strictEqual(JSON.stringify(metadata).includes('content'), false);
});

test('writes mode-0600 recommendation receipts', () => {
  const out = path.join(root, 'nested', 'latest.json');
  writePrivateJson(out, { schema: 'test' });
  assert.strictEqual(fs.statSync(out).mode & 0o777, 0o600);
  assert.strictEqual(fs.statSync(path.dirname(out)).mode & 0o777, 0o700);
});

process.stdout.write(`PASS ${passed}/6 hermes-tinker-harness\n`);
