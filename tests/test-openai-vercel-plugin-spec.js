'use strict';

/**
 * Unit Tests for OpenAI / Vercel Agent Plugin Spec Engine (`tools/openai-vercel-plugin-spec-engine.js`)
 * Compatible with node tests/test-*.js harness (uses node:assert).
 */

const assert = require('assert');
const { auditOpenAiVercelPluginSpec } = require('../tools/openai-vercel-plugin-spec-engine');

console.log('Running test-openai-vercel-plugin-spec.js...');

const audit = auditOpenAiVercelPluginSpec();
assert.strictEqual(audit.status, 'OPENAI_VERCEL_PLUGIN_SPEC_ACTIVE', 'Expected ACTIVE status');
assert.strictEqual(audit.grade, '10/10 (UNIVERSAL_PLUGIN_EXCELLENCE)', 'Expected 10/10 grade');
assert.strictEqual(audit.features.length, 5, 'Expected 5 features');

console.log('ok tests/test-openai-vercel-plugin-spec.js');
