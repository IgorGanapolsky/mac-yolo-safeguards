#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  classifyPreflightEnvelope,
  evaluateSarif,
  parseSarif,
  writeReceipt,
} = require('../tools/codex-security-gate');

function finding(ruleId, severity, fingerprint, line = 1) {
  return {
    ruleId,
    level: severity === 'high' || severity === 'critical' ? 'error' : 'warning',
    message: { text: `Fixture ${ruleId}` },
    properties: { severity },
    partialFingerprints: { primaryLocationLineHash: fingerprint },
    locations: [{
      physicalLocation: {
        artifactLocation: { uri: 'src/fixture.js' },
        region: { startLine: line },
      },
    }],
  };
}

function sarif(results) {
  return {
    version: '2.1.0',
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    runs: [{
      tool: { driver: { name: 'Codex Security', rules: [] } },
      results,
    }],
  };
}

function writeJson(dir, name, value) {
  const filePath = path.join(dir, name);
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
  return filePath;
}

function test(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
}

test('known baseline high finding is not treated as a new regression', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-security-gate-'));
  const baseline = writeJson(dir, 'baseline.sarif', sarif([
    finding('TG001', 'high', 'stable-a', 4),
  ]));
  const candidate = writeJson(dir, 'candidate.sarif', sarif([
    finding('TG001', 'high', 'stable-a', 99),
    finding('TG002', 'medium', 'stable-b', 12),
  ]));
  const receipt = evaluateSarif({
    baselinePath: baseline,
    candidatePath: candidate,
    threshold: 'high',
    now: '2026-07-29T20:20:00.000Z',
  });
  assert.strictEqual(receipt.status, 'pass');
  assert.strictEqual(receipt.securityVerified, true);
  assert.strictEqual(receipt.counts.persisting, 1);
  assert.strictEqual(receipt.counts.new, 1);
  assert.strictEqual(receipt.counts.blockingNew, 0);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('new critical finding flips the gate from green to red', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-security-gate-'));
  const baseline = writeJson(dir, 'baseline.sarif', sarif([
    finding('TG001', 'high', 'stable-a'),
  ]));
  const cleanCandidate = writeJson(dir, 'clean.sarif', sarif([
    finding('TG001', 'high', 'stable-a'),
  ]));
  const poisonedCandidate = writeJson(dir, 'poisoned.sarif', sarif([
    finding('TG001', 'high', 'stable-a'),
    finding('TG999', 'critical', 'new-critical'),
  ]));
  assert.strictEqual(evaluateSarif({
    baselinePath: baseline,
    candidatePath: cleanCandidate,
    threshold: 'high',
  }).status, 'pass');
  const poisoned = evaluateSarif({
    baselinePath: baseline,
    candidatePath: poisonedCandidate,
    threshold: 'high',
  });
  assert.strictEqual(poisoned.status, 'fail');
  assert.strictEqual(poisoned.counts.blockingNew, 1);
  assert.deepStrictEqual(poisoned.blockingRuleIds, ['TG999']);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('fixed findings are counted as resolved', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-security-gate-'));
  const baseline = writeJson(dir, 'baseline.sarif', sarif([
    finding('TG001', 'high', 'stable-a'),
    finding('TG002', 'medium', 'stable-b'),
  ]));
  const candidate = writeJson(dir, 'candidate.sarif', sarif([]));
  const receipt = evaluateSarif({
    baselinePath: baseline,
    candidatePath: candidate,
    threshold: 'high',
  });
  assert.strictEqual(receipt.status, 'pass');
  assert.strictEqual(receipt.counts.resolved, 2);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('dry-run readiness can never masquerade as a completed security scan', () => {
  const receipt = classifyPreflightEnvelope({
    ok: true,
    data: {
      dryRun: true,
      repository: '/repo',
      target: { kind: 'refs' },
      authentication: { method: 'stored_credentials', verified: false },
      model: 'gpt-5.6-sol',
      reasoningEffort: 'xhigh',
      maxCostUsd: 0.5,
    },
  }, { now: '2026-07-29T20:21:00.000Z' });
  assert.strictEqual(receipt.readiness, 'pass');
  assert.strictEqual(receipt.status, 'blocked');
  assert.strictEqual(receipt.securityVerified, false);
  assert.match(receipt.reason, /dry_run_only/);
});

test('invalid non-SARIF input fails closed', () => {
  assert.throws(() => parseSarif({ version: '1.0', runs: [] }), /SARIF 2.1.0/);
});

test('receipts store counts and digests with mode 0600, not finding text', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-security-gate-'));
  const candidate = writeJson(dir, 'candidate.sarif', sarif([
    finding('TG001', 'low', 'stable-a'),
  ]));
  const receipt = evaluateSarif({
    candidatePath: candidate,
    threshold: 'high',
    now: '2026-07-29T20:22:00.000Z',
  });
  const receiptDir = path.join(dir, 'receipts');
  const artifacts = writeReceipt(receipt, { receiptDir });
  assert.strictEqual(fs.statSync(artifacts.immutablePath).mode & 0o777, 0o600);
  assert.strictEqual(fs.statSync(artifacts.historyPath).mode & 0o777, 0o600);
  const serialized = fs.readFileSync(artifacts.immutablePath, 'utf8');
  assert(!serialized.includes('Fixture TG001'));
  assert(!serialized.includes('src/fixture.js'));
  assert(serialized.includes('"candidateDigest"'));
  fs.rmSync(dir, { recursive: true, force: true });
});
