'use strict';

/**
 * Unit Tests for OpenAI ChatGPT Work & Codex Shared Harness (`tools/openai-codex-chatgpt-work-harness.js`)
 * Compatible with node tests/test-*.js harness (uses node:assert).
 */

const assert = require('assert');
const { auditOpenAiCodexChatGptWorkHarness, OPENAI_SHARED_HARNESS_CAPABILITIES } = require('../tools/openai-codex-chatgpt-work-harness');

console.log('Running test-openai-codex-chatgpt-work-harness.js...');

const audit = auditOpenAiCodexChatGptWorkHarness();
assert.strictEqual(audit.status, 'OPENAI_SHARED_HARNESS_ACTIVE', 'Expected ACTIVE status');
assert.strictEqual(audit.grade, '10/10 (OPENAI_SHARED_HARNESS_EXCELLENCE)', 'Expected 10/10 grade');
assert.strictEqual(OPENAI_SHARED_HARNESS_CAPABILITIES.length, 4, 'Expected 4 capabilities');

console.log('ok tests/test-openai-codex-chatgpt-work-harness.js');
