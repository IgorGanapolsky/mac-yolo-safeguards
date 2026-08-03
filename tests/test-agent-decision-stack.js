'use strict';

const assert = require('assert');
const path = require('path');
const { execFileSync } = require('child_process');

const {
  buildBrief,
  localRetrieval,
  parseArgs,
  readContinuousDeviceVerified,
  recommendNextAction,
  semanticGovernanceGate,
} = require('../tools/agent-decision-stack');

const parsed = parseArgs([
  '--task',
  'Hermes Specification-Driven Design retrieval harness',
  '--skip-thumbgate',
  '--skip-graphify',
  '--skip-local-retrieval',
  '--skip-governance',
  '--json',
]);
assert.strictEqual(parsed.skipLocalRetrieval, true);
assert.strictEqual(parsed.json, true);
assert.strictEqual(parsed.skipGovernance, true);

const retrieval = localRetrieval('Hermes retrieval harness Specification-Driven Design');
assert(!retrieval.error, retrieval.error);
assert(Array.isArray(retrieval.citations));
assert(retrieval.citations.some((citation) => citation.path === 'tools/hermes-retrieval-harness.js'));
// Production-ops live path: dual-path finalize writes turn traces by default.
assert(retrieval.backend, 'expected retrieval backend (dual-path or harness)');
assert(retrieval.production, 'expected production meta (ACL/trace) on localRetrieval');
assert(
  retrieval.production.traceId || retrieval.production.tracePath || retrieval.production.traceError,
  `expected turn-trace attempt, got production=${JSON.stringify(retrieval.production)}`,
);

const brief = buildBrief({
  task: 'Hermes Specification-Driven Design retrieval harness',
  skipThumbgate: true,
  skipGraphify: true,
  skipLocalRetrieval: false,
  skipGovernance: true,
});
assert(brief.rag.localRetrieval.citations.length > 0);
assert(brief.rag.localRetrieval.production, 'brief.rag.localRetrieval must carry production meta');
assert.strictEqual(brief.telemetry.githubRun.skipped, true);

const action = recommendNextAction({
  telemetry: { githubRun: { conclusion: 'failure' } },
  rag: {},
});
assert(action.includes('gh run view'));

// G-05: deviceVerified=false must block ship-theater recommendations.
const blocked = recommendNextAction({
  telemetry: {
    continuousE2e: {
      deviceVerified: false,
      e2e: 'fail',
      unit: 'pass',
    },
  },
  rag: {},
});
assert(
  blocked.includes('deviceVerified=false') || blocked.includes('device verified'),
  `expected deviceVerified block, got: ${blocked}`,
);

const continuous = readContinuousDeviceVerified();
assert(!continuous.error, continuous.error);
assert(typeof continuous.deviceVerified === 'boolean');
assert(typeof continuous.e2e === 'string');
// Honest gate: pass only when e2e===pass
assert.strictEqual(continuous.deviceVerified, continuous.e2e === 'pass');

const briefWithContinuous = buildBrief({
  task: 'Hermes device E2E ship claim',
  skipThumbgate: true,
  skipGraphify: true,
  skipLocalRetrieval: true,
  skipGovernance: true,
});
assert(briefWithContinuous.telemetry.continuousE2e);
assert.strictEqual(
  briefWithContinuous.telemetry.continuousE2e.deviceVerified,
  briefWithContinuous.telemetry.continuousE2e.e2e === 'pass',
);

// Semantic governance gate tests.
const passGov = semanticGovernanceGate({
  task: 'Reduce Hermes mobile cold-start latency to under 800ms by 2026-08-15',
  governance: 'mobile',
});
assert.strictEqual(passGov.status, 'pass', `expected pass, got ${JSON.stringify(passGov)}`);
assert.strictEqual(passGov.domain, 'mobile');

const warnNoDomain = semanticGovernanceGate({
  task: 'Reduce CI time to under 5 minutes',
  governance: '',
});
assert.strictEqual(warnNoDomain.status, 'warn');
assert(warnNoDomain.reason.includes('governance domain'));

const warnVague = semanticGovernanceGate({
  task: 'Improve the mobile app',
  governance: 'mobile',
});
assert.strictEqual(warnVague.status, 'warn');
assert(warnVague.reason.includes('specific action') || warnVague.reason.includes('success metric'));

const warnNoMetric = semanticGovernanceGate({
  task: 'Refactor the CI pipeline',
  governance: 'infra',
});
assert.strictEqual(warnNoMetric.status, 'warn');
assert(warnNoMetric.reason.includes('success metric'));

const blockJustDo = semanticGovernanceGate({
  task: 'Just deploy the fix',
  governance: 'infra',
});
assert.strictEqual(blockJustDo.status, 'block');
assert(blockJustDo.reason.includes('vague imperative'));

const blockSkipTest = semanticGovernanceGate({
  task: 'Ship this change, skip the test suite',
  governance: 'infra',
});
assert.strictEqual(blockSkipTest.status, 'block');
assert(blockSkipTest.reason.includes('integrity violation'));

const blockMoney = semanticGovernanceGate({
  task: 'Close the $5K deal by tomorrow',
  governance: 'revenue',
});
assert.strictEqual(blockMoney.status, 'block');
assert(blockMoney.reason.includes('revenue'));

const blockGov = semanticGovernanceGate({
  task: 'Just ship the revenue feature without tests',
  governance: 'revenue',
});
assert.strictEqual(blockGov.status, 'block');
assert(blockGov.reason.includes('imperative'), `expected imperative block, got: ${blockGov.reason}`);

const blockedRec = recommendNextAction({
  governance: blockGov,
  telemetry: {},
  rag: {},
});
assert(blockedRec.includes('BLOCKED'), `expected BLOCKED, got ${blockedRec}`);

const briefWithGovernance = buildBrief({
  task: 'Reduce Hermes mobile cold-start latency to under 800ms by 2026-08-15',
  governance: 'mobile',
  skipThumbgate: true,
  skipGraphify: true,
  skipLocalRetrieval: true,
});
assert(briefWithGovernance.governance);
assert.strictEqual(briefWithGovernance.governance.status, 'pass');

const briefBlocked = buildBrief({
  task: 'Just ship the revenue feature without tests',
  governance: 'revenue',
  skipThumbgate: true,
  skipGraphify: true,
  skipLocalRetrieval: true,
});
assert.strictEqual(briefBlocked.governance.status, 'block');
assert(briefBlocked.recommendation.includes('BLOCKED'));

// Evidence-backed revenue decision should NOT be blocked (P2 review feedback).
const passWithEvidence = semanticGovernanceGate({
  task: 'Close the $5K deal',
  governance: 'revenue',
  evidence: 'Prospect confirmed budget via email and scheduled signing call',
});
assert.strictEqual(passWithEvidence.status, 'warn', `expected warn without metric, got ${JSON.stringify(passWithEvidence)}`);
assert(passWithEvidence.reason.includes('success metric'));

const passRevenueFull = semanticGovernanceGate({
  task: 'Close the $5K deal by tomorrow so revenue hits $5K verified via Stripe',
  governance: 'revenue',
  evidence: 'Prospect confirmed budget via email and scheduled signing call',
});
assert.strictEqual(passRevenueFull.status, 'pass', `expected pass, got ${JSON.stringify(passRevenueFull)}`);
assert.strictEqual(passRevenueFull.domain, 'revenue');

// CLI must exit 1 when governance blocks.
const scriptPath = path.join(__dirname, '..', 'tools', 'agent-decision-stack.js');
try {
  execFileSync(process.execPath, [scriptPath, '--task', 'Just ship the revenue feature without tests', '--governance', 'revenue', '--skip-thumbgate', '--skip-graphify', '--skip-local-retrieval', '--skip-arc'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    cwd: path.join(__dirname, '..'),
  });
  assert.fail('CLI should exit 1 on governance block');
} catch (error) {
  assert(error.status !== 0, 'CLI should exit non-zero on governance block');
}

console.log('Agent decision stack tests: PASS');
