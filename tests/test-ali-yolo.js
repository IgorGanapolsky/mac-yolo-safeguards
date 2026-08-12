#!/usr/bin/env node
'use strict';

const assert = require('assert');
const { resolveAliModelRoute, buildAliSystemPrompt } = require('../tools/ali-yolo-wrapper');

console.log('=== Testing ali-yolo System-Wide Agent Launcher ===');

// 1. Test Model Route Resolution
const route = resolveAliModelRoute();
assert.strictEqual(typeof route.provider, 'string');
assert.strictEqual(typeof route.modelRoute, 'string');
assert.ok(route.modelRoute.includes('qwen'));
console.log('✓ Model route resolution test passed');

// 2. Test System Prompt Context Building
const prompt = buildAliSystemPrompt();
assert.strictEqual(typeof prompt, 'string');
assert.ok(prompt.includes('ali-yolo'));
assert.ok(prompt.includes('AGENTS.md'));
console.log('✓ System prompt context ingestion test passed');

console.log('✅ ali-yolo System-Wide Agent Launcher Unit Tests PASSED!');
