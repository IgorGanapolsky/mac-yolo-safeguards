const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const {
  DEFAULT_INSTRUCTIONS,
  validateParameters,
  checkPermission,
  validateTargetEndpoints,
  dispatchInstruction,
  generateAugmentedSessionSummary,
  exportResultsToTSV,
  formatMarkdownAuditReport,
} = require('../tools/teamviewer-dex-instruction-engine.js');

test('DEFAULT_INSTRUCTIONS contains core DEX operations with valid schemas', () => {
  assert.ok(DEFAULT_INSTRUCTIONS.length >= 5);
  for (const inst of DEFAULT_INSTRUCTIONS) {
    assert.ok(inst.id, 'Instruction must have id');
    assert.ok(inst.name, 'Instruction must have name');
    assert.ok(inst.category, 'Instruction must have category');
    assert.ok(inst.permissionRequired, 'Instruction must have permissionRequired');
    assert.ok(Array.isArray(inst.parameters), 'Instruction must have parameters array');
  }
});

test('validateParameters enforces types, defaults, and bounds correctly', () => {
  const schema = [
    { name: 'dryRun', type: 'boolean', default: true },
    { name: 'count', type: 'number', min: 1, max: 10, default: 5 },
    { name: 'mode', type: 'enum', enumValues: ['fast', 'deep'] },
    { name: 'tag', type: 'string', required: true, pattern: '^[A-Z0-9]+$' },
  ];

  // 1. Missing required field
  const invalid1 = validateParameters(schema, { mode: 'fast' });
  assert.equal(invalid1.valid, false);
  assert.ok(invalid1.errors[0].includes("Missing required parameter: 'tag'"));

  // 2. Out of bounds number
  const invalid2 = validateParameters(schema, { tag: 'ALPHA1', count: 99, mode: 'fast' });
  assert.equal(invalid2.valid, false);
  assert.ok(invalid2.errors[0].includes("Parameter 'count' must be <= 10"));

  // 3. Invalid enum value
  const invalid3 = validateParameters(schema, { tag: 'ALPHA1', mode: 'super_fast' });
  assert.equal(invalid3.valid, false);
  assert.ok(invalid3.errors[0].includes("Parameter 'mode' must be one of: [fast, deep]"));

  // 4. Pattern mismatch
  const invalid4 = validateParameters(schema, { tag: 'invalid-tag-lowercase', mode: 'fast' });
  assert.equal(invalid4.valid, false);
  assert.ok(invalid4.errors[0].includes("does not match required pattern"));

  // 5. Valid parameters with defaults applied
  const valid = validateParameters(schema, { tag: 'PROD01', mode: 'deep' });
  assert.equal(valid.valid, true);
  assert.equal(valid.validated.dryRun, true);
  assert.equal(valid.validated.count, 5);
  assert.equal(valid.validated.mode, 'deep');
  assert.equal(valid.validated.tag, 'PROD01');
});

test('checkPermission enforces least-privilege RBAC matrix', () => {
  // Read-only cannot perform admin or device support actions
  const denied1 = checkPermission(['read_only'], 'device_support');
  assert.equal(denied1.allowed, false);

  const denied2 = checkPermission(['device_support'], 'admin_policy');
  assert.equal(denied2.allowed, false);

  // Admin policy can perform device_support and read_only
  const allowed1 = checkPermission(['admin_policy'], 'device_support');
  assert.equal(allowed1.allowed, true);

  const allowed2 = checkPermission(['admin'], 'admin_policy');
  assert.equal(allowed2.allowed, true);

  const allowedWildcard = checkPermission(['*'], 'admin_policy');
  assert.equal(allowedWildcard.allowed, true);
});

test('validateTargetEndpoints enforces hard 10-device limit and rejects wildcards / bad FQDNs', () => {
  // Empty targets
  const empty = validateTargetEndpoints([]);
  assert.equal(empty.valid, false);

  // Exceeds max 10 even when caller requests 100
  const eleven = Array.from({ length: 11 }, (_, i) => `host-${i}.local`);
  const exceed = validateTargetEndpoints(eleven, { maxTargets: 100 });
  assert.equal(exceed.valid, false);
  assert.ok(exceed.error.includes('exceeds safe maximum limit of 10 devices'));

  // Wildcard and glob patterns rejected
  const wildcard1 = validateTargetEndpoints(['*']);
  assert.equal(wildcard1.valid, false);
  assert.ok(wildcard1.error.includes('without wildcards'));

  const wildcard2 = validateTargetEndpoints(['host*.corp.local']);
  assert.equal(wildcard2.valid, false);
  assert.ok(wildcard2.error.includes('without wildcards'));

  const malformed = validateTargetEndpoints(['not an fqdn with spaces']);
  assert.equal(malformed.valid, false);

  // Valid targets
  const valid = validateTargetEndpoints(['mac-mini-01.local', 'macbook-pro.local']);
  assert.equal(valid.valid, true);
  assert.equal(valid.targets.length, 2);
});

test('dispatchInstruction truthfully distinguishes simulation/dryRun from execution', () => {
  const receipt = dispatchInstruction(
    'dex-disk-cleanup',
    { dryRun: true, maxAgeDays: 14, targetFolder: 'caches' },
    ['node-primary.corp.local', 'node-secondary.corp.local'],
    { permissions: ['device_support'], callerId: 'agent-chief' }
  );

  assert.ok(receipt.dispatchId.startsWith('dex_dsp_'));
  assert.equal(receipt.instructionId, 'dex-disk-cleanup');
  assert.equal(receipt.overallStatus, 'dry_run_verified');
  assert.equal(receipt.persisted, true);
  assert.equal(receipt.targetCount, 2);
  assert.equal(receipt.deviceResults[0].status, 'simulated_dry_run');
});

test('generateAugmentedSessionSummary derives risk posture from real evidence', () => {
  // 1. Session with errors -> degraded / high risk
  const failedSession = {
    sessionId: 'sess_fail',
    errors: ['root shell connection failed'],
    verifiedItems: [],
    hasValidLease: false,
  };
  const sumFail = generateAugmentedSessionSummary(failedSession);
  assert.equal(sumFail.riskAssessment.posture, 'degraded_with_errors');
  assert.equal(sumFail.riskAssessment.residualRisk, 'high');
  assert.equal(sumFail.riskAssessment.fencedLeaseValid, false);

  // 2. Session with verified items -> hardened / low risk
  const okSession = {
    sessionId: 'sess_ok',
    errors: [],
    verifiedItems: ['Reclaimed 500MB disk', 'Port 8765 healthy'],
    hasValidLease: true,
  };
  const sumOk = generateAugmentedSessionSummary(okSession);
  assert.equal(sumOk.riskAssessment.posture, 'hardened_and_verified');
  assert.equal(sumOk.riskAssessment.residualRisk, 'low');
  assert.equal(sumOk.riskAssessment.fencedLeaseValid, true);
});

test('exportResultsToTSV and formatMarkdownAuditReport generate valid outputs', () => {
  const receipt = {
    dispatchId: 'dex_dsp_test',
    instructionId: 'dex-disk-cleanup',
    instructionName: 'Proactive Disk Space Recovery',
    category: 'maintenance',
    timestamp: '2026-08-20T18:00:00.000Z',
    callerId: 'operator-1',
    targetCount: 1,
    parameters: { dryRun: true },
    overallStatus: 'dry_run_verified',
    persisted: true,
    receiptPath: '/tmp/test.json',
    deviceResults: [
      { target: 'host1.local', status: 'simulated_dry_run', exitCode: 0, executionTimeMs: 45, output: 'Cleaned 500MB' },
    ],
  };

  const tsv = exportResultsToTSV(receipt);
  assert.ok(tsv.includes('target\tstatus\texitCode\texecutionTimeMs\toutput'));
  assert.ok(tsv.includes('host1.local\tsimulated_dry_run\t0\t45\tCleaned 500MB'));

  const md = formatMarkdownAuditReport(receipt);
  assert.ok(md.includes('# 🖥️ TeamViewer DEX Instruction Execution Receipt'));
  assert.ok(md.includes('dex-disk-cleanup'));
  assert.ok(md.includes('| `host1.local` | **simulated_dry_run** | `0` | 45ms | Cleaned 500MB |'));
});
