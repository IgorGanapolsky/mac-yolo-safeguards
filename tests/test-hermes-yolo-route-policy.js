'use strict';

const assert = require('assert');
const {
  selectRoute,
  taskSignals,
  ROUTES,
  commandEnv,
} = require('../tools/hermes-yolo-route-policy.js');

// Quality lock default: no SuperGrok prefer → glm-coding for interactive coding.
const CLEAN = Object.freeze({
  HERMES_YOLO_BACKEND: 'auto',
  HERMES_DROP_DEAD_GLM: '1',
});

// Opt-in SuperGrok for hard/coding when explicitly preferred.
const CLEAN_SUPERGROK = Object.freeze({
  ...CLEAN,
  HERMES_PREFER_SUPERGROK: '1',
});

function testSmokeUsesFastNotGrok() {
  const r = selectRoute({
    task: 'Reply with exactly HERMES-YOLO-READY',
    env: { ...CLEAN_SUPERGROK },
  });
  assert.notStrictEqual(r.model, 'grok-4.5', r.reason);
  assert.ok(
    ['kimi-code-fast', 'deepseek-v4-flash-free', 'hermes-local', 'deepseek-v4-flash'].includes(r.model),
    `smoke model unexpected: ${r.model}`,
  );
}

function testHardUsesGrokWhenPreferred() {
  const r = selectRoute({
    task: 'are you sure this architecture is right?',
    env: { ...CLEAN_SUPERGROK },
  });
  assert.strictEqual(r.model, 'grok-4.5', r.reason);
}

function testDefaultCodingUsesGlmCoding() {
  const r = selectRoute({
    task: 'implement the login form validation',
    env: { ...CLEAN },
  });
  // 2026-08-13 quality lock: glm-coding is default interactive coding (anti-slop).
  assert.strictEqual(r.model, 'glm-coding', r.reason);
  assert.ok(
    String(r.provider || '').includes('litellm') || r.provider === 'custom:litellm-gateway',
    `expected litellm gateway, got ${r.provider}`,
  );
}

function testPreferSuperGrokCodingUsesGrok() {
  const r = selectRoute({
    task: 'implement the login form validation',
    env: { ...CLEAN_SUPERGROK },
  });
  assert.strictEqual(r.model, 'grok-4.5', r.reason);
}

function testDraftNotSuperGrok() {
  const r = selectRoute({
    task: 'draft outreach email newsletter',
    env: { ...CLEAN_SUPERGROK },
  });
  assert.notStrictEqual(r.model, 'grok-4.5', r.reason);
}

function testGlmCodingPinIsQualityPrimary() {
  const r = selectRoute({
    task: 'fix the auth bug',
    env: {
      ...CLEAN,
      HERMES_YOLO_MODEL: 'glm-coding',
      HERMES_YOLO_PROVIDER: 'custom:litellm-gateway',
    },
  });
  // Quality lock: glm-coding is the intentional coding primary (not a stale pin).
  assert.strictEqual(r.model, 'glm-coding', `expected glm-coding primary, got ${r.model}`);
}

function testForceGlmPin() {
  const r = selectRoute({
    task: 'fix the auth bug',
    env: {
      ...CLEAN_SUPERGROK,
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
  // Default coding is already glm-coding; cyber prefer must not change that.
  assert.strictEqual(r.model, 'glm-coding', r.reason);
}

function testCommandEnv() {
  const env = commandEnv(ROUTES.coding);
  assert.strictEqual(env.HERMES_YOLO_MODEL, 'glm-coding');
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
  testHardUsesGrokWhenPreferred();
  testDefaultCodingUsesGlmCoding();
  testPreferSuperGrokCodingUsesGrok();
  testDraftNotSuperGrok();
  testGlmCodingPinIsQualityPrimary();
  testForceGlmPin();
  testLongContextUsesK3Membership();
  testCyberUsesGlmWhenPreferred();
  testCyberDoesNotStealDefaultCoding();
  testCommandEnv();
  testPolicyVersionConsistent();
  console.log('test-hermes-yolo-route-policy: ok');
}

main();
