'use strict';

const assert = require('assert');

const {
  buildBrief,
  localRetrieval,
  parseArgs,
  readContinuousDeviceVerified,
  recommendNextAction,
} = require('../tools/agent-decision-stack');

const parsed = parseArgs([
  '--task',
  'Hermes Specification-Driven Design retrieval harness',
  '--skip-thumbgate',
  '--skip-graphify',
  '--skip-local-retrieval',
  '--json',
]);
assert.strictEqual(parsed.skipLocalRetrieval, true);
assert.strictEqual(parsed.json, true);

const retrieval = localRetrieval('Hermes retrieval harness Specification-Driven Design');
assert(!retrieval.error, retrieval.error);
assert(Array.isArray(retrieval.citations));
assert(retrieval.citations.some((citation) => citation.path === 'tools/hermes-retrieval-harness.js'));

const brief = buildBrief({
  task: 'Hermes Specification-Driven Design retrieval harness',
  skipThumbgate: true,
  skipGraphify: true,
  skipLocalRetrieval: false,
});
assert(brief.rag.localRetrieval.citations.length > 0);
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
});
assert(briefWithContinuous.telemetry.continuousE2e);
assert.strictEqual(
  briefWithContinuous.telemetry.continuousE2e.deviceVerified,
  briefWithContinuous.telemetry.continuousE2e.e2e === 'pass',
);

console.log('Agent decision stack tests: PASS');
