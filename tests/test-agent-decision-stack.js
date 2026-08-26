'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const {
  buildBrief,
  loadPatternReceipt,
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

const patternDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentic-pattern-receipt-'));
const patternManifestPath = path.join(patternDir, 'task.json');
fs.writeFileSync(patternManifestPath, JSON.stringify({
  schema: 'agentic-pattern-task/v1',
  taskId: 'decision-stack-integration',
  goal: 'Research current evidence and produce a verified decision brief',
  risk: 'low',
  effect: 'read',
  uncertainty: 'high',
  independentWorkstreams: 1,
  disjointResources: false,
  specializedRoles: [],
  crossSession: false,
  recurringFeedback: false,
  retrievalNeeded: true,
  dynamicRouting: false,
  resourceConstrained: false,
  humanConfirmation: 'not_required',
  successMetrics: ['receipt status is pass'],
}));

const parsedPatternArgs = parseArgs([
  '--task', 'Research current evidence to a verified decision',
  '--pattern-manifest', patternManifestPath,
]);
assert.strictEqual(parsedPatternArgs.patternManifest, patternManifestPath);
assert.throws(
  () => parseArgs(['--task', 'Research current evidence', '--pattern-manifest']),
  /requires a path/,
);

const patternReceipt = loadPatternReceipt(patternManifestPath);
assert.strictEqual(patternReceipt.status, 'pass');
assert(patternReceipt.selected.some((entry) => entry.id === 'knowledge_retrieval'));

const badPatternPath = path.join(patternDir, 'bad.json');
fs.writeFileSync(badPatternPath, JSON.stringify({ schema: 'agentic-pattern-task/v1' }));
const badPatternReceipt = loadPatternReceipt(badPatternPath);
assert.strictEqual(badPatternReceipt.status, 'block');
assert.match(badPatternReceipt.receiptHash, /^[a-f0-9]{64}$/);

const missingPatternReceipt = loadPatternReceipt(path.join(patternDir, 'missing.json'));
assert.strictEqual(missingPatternReceipt.status, 'block');
assert.match(missingPatternReceipt.receiptHash, /^[a-f0-9]{64}$/);

const malformedSecret = ['TOP', 'SECRET', '123'].join('_');
const malformedPatternPathA = path.join(patternDir, 'malformed-a.json');
const malformedPatternPathB = path.join(patternDir, 'malformed-b.json');
fs.writeFileSync(malformedPatternPathA, `{"password":${malformedSecret}}`);
fs.writeFileSync(malformedPatternPathB, `{"password":${malformedSecret}_DIFFERENT}`);
const malformedPatternA = loadPatternReceipt(malformedPatternPathA);
const malformedPatternB = loadPatternReceipt(malformedPatternPathB);
assert.deepStrictEqual(malformedPatternA.errors, ['manifest JSON is invalid']);
assert(!JSON.stringify(malformedPatternA).includes(malformedSecret));
assert.notStrictEqual(malformedPatternA.inputHash, malformedPatternB.inputHash);

const validJsonSentinel = ['STACK', 'SECRET', 'SENTINEL', '7462'].join('_');
const secretFieldPatternPath = path.join(patternDir, 'secret-field.json');
fs.writeFileSync(secretFieldPatternPath, JSON.stringify({
  schema: 'agentic-pattern-task/v1',
  [`token_${validJsonSentinel}`]: 'x',
}));
const secretFieldPattern = loadPatternReceipt(secretFieldPatternPath);
assert.strictEqual(secretFieldPattern.status, 'block');
assert(!JSON.stringify(secretFieldPattern).includes(validJsonSentinel));

const deepPatternPath = path.join(patternDir, 'deep.json');
const deepPatternJson = `${'{"nested":'.repeat(10_000)}0${'}'.repeat(10_000)}`;
fs.writeFileSync(deepPatternPath, deepPatternJson);
const deepPattern = loadPatternReceipt(deepPatternPath);
assert.strictEqual(deepPattern.status, 'block');
assert.match(deepPattern.receiptHash, /^[a-f0-9]{64}$/);

const blockedBrief = buildBrief({
  task: 'Do not execute work after an invalid pattern manifest',
  patternManifest: badPatternPath,
  skipThumbgate: false,
  skipGraphify: false,
  skipLocalRetrieval: false,
  skipGovernance: false,
});
assert.strictEqual(blockedBrief.patterns.status, 'block');
assert.deepStrictEqual(blockedBrief.rag, {});
assert.deepStrictEqual(blockedBrief.telemetry, {});
assert(blockedBrief.recommendation.includes('BLOCKED by agentic pattern contract'));

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

const briefWithPatterns = buildBrief({
  task: 'Research current evidence to a verified decision',
  patternManifest: patternManifestPath,
  skipThumbgate: true,
  skipGraphify: true,
  skipLocalRetrieval: true,
  skipGovernance: true,
  skipArc: true,
});
assert.strictEqual(briefWithPatterns.patterns.status, 'pass');
assert.match(briefWithPatterns.patterns.receiptHash, /^[a-f0-9]{64}$/);

const patternBlockedRecommendation = recommendNextAction({
  patterns: badPatternReceipt,
  governance: { skipped: true },
  telemetry: {},
  rag: {},
});
assert(patternBlockedRecommendation.includes('BLOCKED by agentic pattern contract'));

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
