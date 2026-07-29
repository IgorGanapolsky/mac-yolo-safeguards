'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const {
  DEFAULT_REGISTRY,
  EXPECTED_INCIDENT_IDS,
  evaluateRegistry,
  loadRegistry,
  parseArgs,
  validateRegistry,
} = require('../tools/hermes-reliability-traceability');

const repoRoot = path.resolve(__dirname, '..');
const registry = loadRegistry(DEFAULT_REGISTRY);
const validated = validateRegistry(registry, { repoRoot });
assert.strictEqual(validated.incidents.length, EXPECTED_INCIDENT_IDS.size);

const audit = evaluateRegistry(registry, { mode: 'audit', repoRoot });
assert.strictEqual(audit.status, 'pass');
assert.deepStrictEqual(audit.metrics, {
  incidents: 9,
  verified: 0,
  unresolved: 9,
  releaseBlockers: 7,
  claimBlockers: 9,
});

const release = evaluateRegistry(registry, { mode: 'release', repoRoot });
assert.strictEqual(release.status, 'blocked');
assert.strictEqual(release.blockerIds.length, 7);
assert(!release.blockerIds.includes('play-search-hermes-ai'));
assert(!release.blockerIds.includes('play-search-hermes-mobile-top-five'));

const claim = evaluateRegistry(registry, { mode: 'claim', repoRoot });
assert.strictEqual(claim.status, 'blocked');
assert.strictEqual(claim.blockerIds.length, 9);

// Mutation control: deleting one screenshot incident must fail the audit.
const missingIncident = structuredClone(registry);
missingIncident.incidents = missingIncident.incidents.slice(1);
assert.throws(
  () => validateRegistry(missingIncident, { repoRoot }),
  /missing required incidents/,
);

// A CI queue or test skip is not an evidence state and cannot become a false pass.
for (const falseGreenState of ['queued', 'skipped']) {
  const falseGreen = structuredClone(registry);
  falseGreen.incidents[2].evidence[0].state = falseGreenState;
  assert.throws(
    () => validateRegistry(falseGreen, { repoRoot }),
    /queued\/skipped are never proof states/,
  );
}

// Store publication cannot satisfy the independent search-ranking boundary.
const storeFalseGreen = structuredClone(registry);
storeFalseGreen.incidents[0].state = 'verified';
storeFalseGreen.incidents[0].evidence = storeFalseGreen.incidents[0].evidence.filter(
  (item) => item.kind !== 'store-search',
);
assert.throws(
  () => validateRegistry(storeFalseGreen, { repoRoot }),
  /missing pass evidence for store-search/,
);

// An exact local proof path must exist on the branch being audited.
const missingLocalProof = structuredClone(registry);
missingLocalProof.incidents[3].evidence[0].source =
  'repo:hermes-mobile/src/__tests__/does-not-exist.test.ts';
assert.throws(
  () => validateRegistry(missingLocalProof, { repoRoot }),
  /source does not exist/,
);

// A pending PR cannot be relabeled verified without every required proof surface.
const fakeVerified = structuredClone(registry);
fakeVerified.incidents[5].state = 'verified';
assert.throws(
  () => validateRegistry(fakeVerified, { repoRoot }),
  /verified state is missing pass evidence/,
);

// The registry stores evidence codes and paths, never raw user content or network secrets.
const rawContent = structuredClone(registry);
rawContent.incidents[0].rawPrompt = 'private text';
assert.throws(
  () => validateRegistry(rawContent, { repoRoot }),
  /raw user or credential content is forbidden/,
);
const rawNetworkIdentity = structuredClone(registry);
rawNetworkIdentity.incidents[0].title = 'Computer at 100.64.0.1';
assert.throws(
  () => validateRegistry(rawNetworkIdentity, { repoRoot }),
  /raw IP addresses are forbidden/,
);

assert.throws(() => parseArgs(['--mode', 'green']), /--mode/);
assert.throws(() => parseArgs(['--registry']), /requires a value/);

const cli = path.join(repoRoot, 'tools', 'hermes-reliability-traceability.js');
const auditCli = spawnSync(process.execPath, [cli, '--mode', 'audit', '--json'], {
  encoding: 'utf8',
});
assert.strictEqual(auditCli.status, 0, auditCli.stderr);
assert.strictEqual(JSON.parse(auditCli.stdout).status, 'pass');

const releaseCli = spawnSync(process.execPath, [cli, '--mode', 'release', '--json'], {
  encoding: 'utf8',
});
assert.strictEqual(releaseCli.status, 1, releaseCli.stderr);
assert.strictEqual(JSON.parse(releaseCli.stdout).status, 'blocked');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-reliability-traceability-'));
const tempRegistry = path.join(temp, 'registry.json');
fs.writeFileSync(tempRegistry, `${JSON.stringify(registry, null, 2)}\n`);
const customCli = spawnSync(
  process.execPath,
  [cli, '--registry', tempRegistry, '--mode', 'claim', '--json'],
  { encoding: 'utf8' },
);
assert.strictEqual(customCli.status, 1, customCli.stderr);
assert.strictEqual(JSON.parse(customCli.stdout).metrics.claimBlockers, 9);
fs.rmSync(temp, { recursive: true, force: true });

console.log(
  'Hermes reliability traceability tests: PASS '
  + '(9 incidents; 8 false-green/privacy/path mutations caught)',
);
