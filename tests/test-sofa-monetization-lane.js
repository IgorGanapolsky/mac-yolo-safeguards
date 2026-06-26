'use strict';

const assert = require('assert');
const os = require('os');
const path = require('path');

const {
  CONTEXT_PATHS,
  collect,
  credentialCandidates,
  inferSignals,
  parseArgs,
  renderMarkdown,
  scoreLane,
} = require('../tools/sofa-monetization-lane');

assert.strictEqual(parseArgs(['--base-url', 'https://agents.stackoverflow.com/', '--json']).baseUrl, 'https://agents.stackoverflow.com');

const contexts = [
  { body: 'Stack Overflow for Agents is a knowledge exchange. Verify approaches and close the verification loop.' },
  { body: 'Authorization: Bearer YOUR_API_KEY. Create posts, reply, vote. POST /api/posts.' },
  { body: 'Strip identifiers, remove private context, avoid secrets, use human review when uncertain.' },
];
const signals = inferSignals(contexts);
assert.strictEqual(signals.publicKnowledgeExchange, true);
assert.strictEqual(signals.requiresVerificationLoop, true);
assert.strictEqual(signals.supportsContributionApi, true);
assert.strictEqual(signals.requiresApiKeyForAgents, true);
assert.strictEqual(signals.safeContributionGuardrails, true);

const isolatedHome = path.join(os.tmpdir(), `sofa-home-${process.pid}`);
assert.deepStrictEqual(credentialCandidates({ SOFA_API_KEY: 'secret' }, isolatedHome), [
  { source: 'SOFA_API_KEY', configured: true },
]);
assert.ok(scoreLane(signals, []) < scoreLane(signals, [{ source: 'SOFA_API_KEY', configured: true }]));

const fixture = {
  '/llms.txt': contexts[0].body,
  '/skill.md': contexts[1].body,
  '/contribute.md': contexts[2].body,
};

collect({
  baseUrl: 'https://agents.stackoverflow.com',
  env: {},
  home: path.join(os.tmpdir(), 'missing-sofa-home'),
  fetcher: async (url) => {
    const suffix = CONTEXT_PATHS.find((item) => url.endsWith(item));
    return { ok: true, status: 200, body: fixture[suffix] };
  },
}).then((report) => {
  assert.strictEqual(report.score, 60);
  assert.strictEqual(report.credentials.length, 0);
  assert.strictEqual(report.offer.sku, 'hermes-agent-reliability-audit');
  assert.ok(report.actions[0].action.includes('SOFA API credentials'));
  assert.ok(report.actions.some((item) => item.lane === 'revenue'));
  assert.ok(renderMarkdown(report).includes('SOFA Hermes Monetization Lane'));
  console.log('SOFA monetization lane tests: PASS');
}).catch((error) => {
  console.error(error);
  process.exit(1);
});
