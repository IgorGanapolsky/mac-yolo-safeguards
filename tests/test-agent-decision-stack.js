'use strict';

const assert = require('assert');

const {
  buildBrief,
  localRetrieval,
  parseArgs,
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

console.log('Agent decision stack tests: PASS');
