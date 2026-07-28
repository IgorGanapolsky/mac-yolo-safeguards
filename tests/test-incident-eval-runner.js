'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const {
  DEFAULT_MANIFEST,
  MANIFEST_SCHEMA,
  VERIFIERS,
  connectionProof,
  continuousE2eProof,
  ipadRunnerCostProof,
  loadManifest,
  parseArgs,
  runIncidentEvals,
  validateManifest,
  writeReport,
} = require('../tools/incident-eval-runner');

const manifest = loadManifest(DEFAULT_MANIFEST);
assert.strictEqual(manifest.schema, MANIFEST_SCHEMA);
assert.strictEqual(manifest.tasks.length, 3);

const report = runIncidentEvals(manifest, {
  tier: 'pr',
  nowMs: Date.parse('2026-07-28T18:30:00.000Z'),
});
assert.strictEqual(report.overallStatus, 'pass');
assert.deepStrictEqual(report.metrics, {
  tasks: 3,
  cases: 9,
  passed: 9,
  failed: 0,
  accepted: 3,
  rejected: 6,
});
assert(report.results.every((result) => result.executionTrajectory.inputDigest.length === 64));
assert(report.results.every((result) => result.verifierTrajectory.matched));
assert(report.results.every((result) => result.executionTrajectory.environment.network === 'denied'));
assert(report.results.every((result) => result.executionTrajectory.environment.productionWrites === 'denied'));

// Historical connection false green: substring "Connected" inside "Not connected".
assert.strictEqual(connectionProof({
  connectionState: 'disconnected',
  authenticatedHealth: false,
  visibleText: 'Not connected',
}).decision, 'reject');
assert.strictEqual(connectionProof({
  connectionState: 'connected',
  authenticatedHealth: true,
  visibleText: 'Connected',
}).decision, 'accept');

// Historical E2E false green: missing/status-less proof defaulted to pass.
assert.strictEqual(continuousE2eProof({
  e2e: 'skipped',
  gitSha: null,
  artifactSha256: null,
}).decision, 'reject');
assert.strictEqual(continuousE2eProof({
  gitSha: '00fa769da32340675769419b47b647c16cde5b19',
  artifactSha256: 'b65d7f55ef8a9e2215f36f1c4b257703b1f9f0b2beccf8203eeeb4f7fa92f27d',
}).decision, 'reject');

// Historical cost regression: hosted macOS is never valid iPad routing.
assert.strictEqual(ipadRunnerCostProof({
  runsOn: ['macos-26'],
  trustedSource: true,
}).decision, 'reject');
assert.strictEqual(ipadRunnerCostProof({
  runsOn: ['self-hosted', 'ipad-simulator'],
  trustedSource: true,
}).decision, 'accept');

// Mutation controls: deliberately reintroducing any historical permissive
// verifier must make the suite fail. A test that stays green is not evidence.
for (const verifierId of Object.keys(VERIFIERS)) {
  const mutated = runIncidentEvals(manifest, {
    tier: 'pr',
    nowMs: Date.parse('2026-07-28T18:31:00.000Z'),
    verifiers: {
      [verifierId]: () => ({ decision: 'accept', evidenceCodes: ['mutant_accepts_everything'] }),
    },
  });
  assert.strictEqual(mutated.overallStatus, 'fail', `${verifierId} permissive mutant must be caught`);
  assert(mutated.metrics.failed >= 1);
}

// Reports retain field names and hashes, not potentially sensitive raw values.
const privateManifest = JSON.parse(JSON.stringify(manifest));
privateManifest.tasks[0].cases[0].input.visibleText = 'PRIVATE_SENTINEL Not connected';
const privateReport = runIncidentEvals(privateManifest, {
  tier: 'pr',
  nowMs: Date.parse('2026-07-28T18:32:00.000Z'),
});
assert(!JSON.stringify(privateReport).includes('PRIVATE_SENTINEL'));
assert(JSON.stringify(privateReport).includes('visibleText'));

// Fail closed on unsafe or under-specified task environments.
const unsafe = JSON.parse(JSON.stringify(manifest));
unsafe.tasks[0].environment.network = 'allowed';
assert.throws(() => validateManifest(unsafe), /deny network/);
const oneSided = JSON.parse(JSON.stringify(manifest));
const acceptedCase = oneSided.tasks[0].cases.find((item) => item.expectedDecision === 'accept');
oneSided.tasks[0].cases = [
  acceptedCase,
  { ...acceptedCase, id: 'authenticated-connected-copy' },
];
assert.throws(() => validateManifest(oneSided), /both accept and reject/);
const unknownVerifier = JSON.parse(JSON.stringify(manifest));
unknownVerifier.tasks[0].verifier = 'always-green-v0';
assert.throws(() => validateManifest(unknownVerifier), /unknown verifier/);
assert.throws(() => runIncidentEvals(manifest, {
  tier: 'pr',
  verifiers: {
    'connection-proof-v1': () => ({
      decision: 'reject',
      evidenceCodes: ['raw evidence must never enter a receipt'],
    }),
  },
}), /opaque labels/);

assert.throws(() => parseArgs(['--tier', 'production']), /--tier/);
assert.throws(() => parseArgs(['--manifest']), /requires a value/);

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'incident-eval-runner-test-'));
const out = path.join(temp, 'private', 'latest.json');
assert.strictEqual(writeReport(report, out), out);
assert.strictEqual(JSON.parse(fs.readFileSync(out, 'utf8')).overallStatus, 'pass');
assert.strictEqual(fs.statSync(out).mode & 0o777, 0o600);
assert.strictEqual(fs.statSync(path.dirname(out)).mode & 0o777, 0o700);

const cli = spawnSync(process.execPath, [
  path.join(__dirname, '..', 'tools', 'incident-eval-runner.js'),
  '--manifest', DEFAULT_MANIFEST,
  '--tier', 'pr',
  '--json',
], { encoding: 'utf8' });
assert.strictEqual(cli.status, 0, cli.stderr);
assert.strictEqual(JSON.parse(cli.stdout).overallStatus, 'pass');
fs.rmSync(temp, { recursive: true, force: true });

console.log('Hermes incident eval runner tests: PASS (3 mutation controls caught)');
