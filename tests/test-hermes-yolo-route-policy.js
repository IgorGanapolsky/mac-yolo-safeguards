'use strict';

const assert = require('assert');
const {
  selectRoute,
  taskSignals,
  ROUTES,
  commandEnv,
} = require('../tools/hermes-yolo-route-policy.js');

const CLEAN = Object.freeze({
  HERMES_PREFER_SUPERGROK: '1',
  HERMES_YOLO_BACKEND: 'auto',
  HERMES_DROP_DEAD_GLM: '1',
});

function testSmokeUsesFastNotGrok() {
  const r = selectRoute({
    task: 'Reply with exactly HERMES-YOLO-READY',
    env: { ...CLEAN },
  });
  assert.notStrictEqual(r.model, 'grok-4.5', r.reason);
  assert.ok(
    ['kimi-code-fast', 'deepseek-v4-flash-free', 'hermes-local', 'deepseek-v4-flash'].includes(r.model),
    `smoke model unexpected: ${r.model}`,
  );
}

function testHardUsesGrok() {
  const r = selectRoute({
    task: 'are you sure this architecture is right?',
    env: { ...CLEAN },
  });
  assert.strictEqual(r.model, 'grok-4.5', r.reason);
}

function testDefaultCodingUsesGrok() {
  const r = selectRoute({
    task: 'implement the login form validation',
    env: { ...CLEAN },
  });
  assert.strictEqual(r.model, 'grok-4.5', r.reason);
  assert.strictEqual(r.provider, 'grok-yolo');
}

function testDraftNotSuperGrok() {
  const r = selectRoute({
    task: 'draft outreach email newsletter',
    env: { ...CLEAN },
  });
  assert.notStrictEqual(r.model, 'grok-4.5', r.reason);
}

function testStaleGlmPinIgnored() {
  const r = selectRoute({
    task: 'fix the auth bug',
    env: {
      ...CLEAN,
      HERMES_YOLO_MODEL: 'glm-coding',
      HERMES_YOLO_PROVIDER: 'custom:litellm-gateway',
    },
  });
  assert.strictEqual(r.model, 'grok-4.5', `stale glm pin should yield SuperGrok, got ${r.model}`);
}

function testForceGlmPin() {
  const r = selectRoute({
    task: 'fix the auth bug',
    env: {
      ...CLEAN,
      HERMES_YOLO_FORCE_MODEL: '1',
      HERMES_YOLO_MODEL: 'glm-coding',
      HERMES_YOLO_PROVIDER: 'custom:litellm-gateway',
    },
  });
  assert.strictEqual(r.id, 'explicit_env');
  assert.strictEqual(r.model, 'glm-coding');
}

function testLongContextUsesK3Membership() {
  const r = selectRoute({
    task: 'analyze the whole large-repo codebase multi-file',
    env: { ...CLEAN },
  });
  assert.strictEqual(r.model, 'kimi-code-k3');
}

function testCyberUsesGlmWhenPreferred() {
  const r = selectRoute({
    task: 'security audit for CyberGym vulnerabilities',
    env: { ...CLEAN, HERMES_PREFER_GLM53_CYBER: '1' },
  });
  assert.strictEqual(r.model, 'glm-coding', r.reason);
  assert.ok(r.signals.cyber);
}

function testCyberDoesNotStealDefaultCoding() {
  const r = selectRoute({
    task: 'implement the login form validation',
    env: { ...CLEAN, HERMES_PREFER_GLM53_CYBER: '1' },
  });
  assert.strictEqual(r.model, 'grok-4.5', r.reason);
}

function testCommandEnv() {
  const env = commandEnv(ROUTES.coding);
  assert.strictEqual(env.HERMES_YOLO_MODEL, 'grok-4.5');
  assert.ok(taskSignals('smoke').smoke);
}

function testPolicyVersionConsistent() {
  const tasks = [
    'implement login',
    'smoke ping hermes-yolo-ready',
    'draft outreach email',
    'analyze the whole large-repo codebase multi-file',
  ];
  for (const task of tasks) {
    const r = selectRoute({ task, env: { ...CLEAN } });
    assert.strictEqual(r.policyVersion, 4, `${task} policyVersion=${r.policyVersion}`);
  }
}

function main() {
  testSmokeUsesFastNotGrok();
  testHardUsesGrok();
  testDefaultCodingUsesGrok();
  testDraftNotSuperGrok();
  testStaleGlmPinIgnored();
  testForceGlmPin();
  testLongContextUsesK3Membership();
  testCyberUsesGlmWhenPreferred();
  testCyberDoesNotStealDefaultCoding();
  testCommandEnv();
  testPolicyVersionConsistent();
  console.log('test-hermes-yolo-route-policy: ok');
}

main();
