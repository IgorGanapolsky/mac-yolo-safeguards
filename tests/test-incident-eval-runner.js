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
  loadManifest,
  parseArgs,
  readArtifact,
  runIncidentEvals,
  validateManifest,
  writeReport,
} = require('../tools/incident-eval-runner');

const repoRoot = path.resolve(__dirname, '..');
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
  cases: 11,
  passed: 11,
  failed: 0,
  accepted: 3,
  rejected: 8,
});
assert(report.results.every((result) => result.executionTrajectory.inputDigest.length === 64));
assert(report.results.every((result) => result.verifierTrajectory.matched));
assert(report.results.every((result) => result.executionTrajectory.environment.network === 'denied'));
assert(report.results.every((result) => result.executionTrajectory.environment.productionWrites === 'denied'));
assert(report.results.every((result) => result.executionTrajectory.artifacts.length === 1));
assert(report.results.every((result) => (
  result.executionTrajectory.artifacts[0].sha256.length === 64
)));

const byCase = new Map(report.results.map((result) => [result.caseId, result]));
assert.strictEqual(byCase.get('production-unreachable-label').verifierTrajectory.decision, 'reject');
assert.strictEqual(byCase.get('production-auth-mismatch').verifierTrajectory.decision, 'reject');
assert.strictEqual(byCase.get('production-relay-green-mac-down').verifierTrajectory.decision, 'reject');
assert.strictEqual(byCase.get('production-direct-connected').verifierTrajectory.decision, 'accept');
assert.strictEqual(byCase.get('reported-skipped-run').verifierTrajectory.decision, 'reject');
assert.strictEqual(byCase.get('statusless-proof').verifierTrajectory.decision, 'reject');
assert.strictEqual(byCase.get('stale-artifact-revision').verifierTrajectory.decision, 'reject');
assert.strictEqual(byCase.get('revision-bound-pass').verifierTrajectory.decision, 'accept');
assert.strictEqual(byCase.get('hosted-macos-fixture').verifierTrajectory.decision, 'reject');
assert.strictEqual(byCase.get('untrusted-fork-fixture').verifierTrajectory.decision, 'reject');
assert.strictEqual(byCase.get('production-workflow-safe').verifierTrajectory.decision, 'accept');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'incident-eval-runner-test-'));

// Mutate the real predicate boundary, not the duplicate verifier. If production
// starts returning Connected for every state, the historical rejects turn red.
const connectionOnly = JSON.parse(JSON.stringify(manifest));
connectionOnly.tasks = [
  connectionOnly.tasks.find((task) => task.id === 'connection-proof'),
];
const connectionMutantRoot = path.join(temp, 'connection-mutant');
const connectionModule = path.join(
  connectionMutantRoot,
  connectionOnly.tasks[0].artifact.path,
);
fs.mkdirSync(path.dirname(connectionModule), { recursive: true });
fs.writeFileSync(
  connectionModule,
  'export function resolveCalmConnectionStatus() { '
    + 'return { status: "connected", label: "Connected" }; }\n',
);
const connectionArtifactMutant = runIncidentEvals(connectionOnly, {
  tier: 'pr',
  repoRoot: connectionMutantRoot,
});
assert.strictEqual(connectionArtifactMutant.overallStatus, 'fail');
assert(connectionArtifactMutant.metrics.failed >= 3);

// Mutating the actual workflow artifact back to hosted macOS must fail the
// production-workflow case even though the verifier implementation is intact.
const ipadWorkflowPath = '.github/workflows/ipad-simulator-e2e.yml';
const ipadWorkflow = fs.readFileSync(path.join(repoRoot, ipadWorkflowPath), 'utf8');
const hostedWorkflowMutant = ipadWorkflow.replace(
  'runs-on: ${{ fromJSON(\'["self-hosted", "ipad-simulator"]\') }}',
  'runs-on: macos-latest',
);
assert.notStrictEqual(hostedWorkflowMutant, ipadWorkflow);
const ipadArtifactMutant = runIncidentEvals(manifest, {
  tier: 'pr',
  artifactOverrides: { [ipadWorkflowPath]: hostedWorkflowMutant },
});
assert.strictEqual(ipadArtifactMutant.overallStatus, 'fail');
assert.strictEqual(
  ipadArtifactMutant.results.find((item) => item.caseId === 'production-workflow-safe').status,
  'fail',
);

// The trusted digest and embedded revision are one binding. Changing the
// artifact bytes without updating both must fail the valid pass case.
const e2eArtifactPath = 'evals/incidents/artifacts/continuous-e2e-bound.json';
const e2eArtifact = fs.readFileSync(path.join(repoRoot, e2eArtifactPath), 'utf8');
const staleArtifactMutant = e2eArtifact.replace(/1111111111111111111111111111111111111111/g, (
  '2222222222222222222222222222222222222222'
));
const e2eArtifactMutant = runIncidentEvals(manifest, {
  tier: 'pr',
  artifactOverrides: { [e2eArtifactPath]: staleArtifactMutant },
});
assert.strictEqual(e2eArtifactMutant.overallStatus, 'fail');
assert.strictEqual(
  e2eArtifactMutant.results.find((item) => item.caseId === 'revision-bound-pass').status,
  'fail',
);

// Mutation controls: deliberately reintroducing any historical permissive
// verifier must make the suite fail. A test that stays green is not evidence.
for (const verifierId of Object.keys(VERIFIERS)) {
  for (const decision of ['accept', 'reject']) {
    const mutated = runIncidentEvals(manifest, {
      tier: 'pr',
      nowMs: Date.parse('2026-07-28T18:31:00.000Z'),
      verifiers: {
        [verifierId]: () => ({
          decision,
          evidenceCodes: [`mutant_${decision}s_everything`],
        }),
      },
    });
    assert.strictEqual(
      mutated.overallStatus,
      'fail',
      `${verifierId} ${decision}-everything mutant must be caught`,
    );
    assert(mutated.metrics.failed >= 1);
  }
}

// Reports retain field names and hashes, not potentially sensitive raw values.
const privateManifest = JSON.parse(JSON.stringify(manifest));
privateManifest.tasks[0].cases[0].input.privateProbeLabel = 'PRIVATE_SENTINEL';
const privateReport = runIncidentEvals(privateManifest, {
  tier: 'pr',
  nowMs: Date.parse('2026-07-28T18:32:00.000Z'),
});
assert(!JSON.stringify(privateReport).includes('PRIVATE_SENTINEL'));
assert(JSON.stringify(privateReport).includes('privateProbeLabel'));

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
const escapedArtifact = JSON.parse(JSON.stringify(manifest));
escapedArtifact.tasks[2].cases[0].input.artifactPath = '../outside.yml';
assert.throws(() => validateManifest(escapedArtifact), /stay inside the repository/);
const newlineArtifact = JSON.parse(JSON.stringify(manifest));
newlineArtifact.tasks[2].cases[0].input.artifactPath = 'safe.yml\nforged';
assert.throws(() => validateManifest(newlineArtifact), /stay inside the repository/);
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

const out = path.join(temp, 'private', 'latest.json');
assert.strictEqual(writeReport(report, out), out);
assert.strictEqual(JSON.parse(fs.readFileSync(out, 'utf8')).overallStatus, 'pass');
assert.strictEqual(fs.statSync(out).mode & 0o777, 0o600);
assert.strictEqual(fs.statSync(path.dirname(out)).mode & 0o777, 0o700);
fs.chmodSync(path.dirname(out), 0o755);
assert.strictEqual(writeReport(report, out), out);
assert.strictEqual(fs.statSync(path.dirname(out)).mode & 0o777, 0o700);
const outside = path.join(temp, 'outside-artifact.txt');
fs.writeFileSync(outside, 'outside');
const symlinkRoot = path.join(temp, 'symlink-root');
fs.mkdirSync(symlinkRoot);
fs.symlinkSync(outside, path.join(symlinkRoot, 'escape'));
assert.throws(
  () => readArtifact('escape', { repoRoot: symlinkRoot }),
  /symlink escaped/,
);

const cli = spawnSync(process.execPath, [
  path.join(__dirname, '..', 'tools', 'incident-eval-runner.js'),
  '--manifest', DEFAULT_MANIFEST,
  '--tier', 'pr',
  '--json',
], { encoding: 'utf8' });
assert.strictEqual(cli.status, 0, cli.stderr);
assert.strictEqual(JSON.parse(cli.stdout).overallStatus, 'pass');
fs.rmSync(temp, { recursive: true, force: true });

console.log(
  'Hermes incident eval runner tests: PASS '
  + '(6 verifier + 3 production-artifact mutation controls caught)',
);
