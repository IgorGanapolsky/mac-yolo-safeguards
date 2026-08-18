#!/usr/bin/env node
'use strict';

/**
 * test-buildkite-dynamic-pipeline.js
 * ----------------------------------
 * Verifies Buildkite Dynamic Pipeline DAG Generation:
 *   - Diff-aware dynamic step resolution
 *   - Targeted mobile/security/search step injection
 *   - Doctor check
 */

const assert = require('assert');
const {
  generateDynamicPipeline,
  runDoctor,
} = require('../tools/buildkite-dynamic-pipeline');

console.log('🧪 Running Buildkite Dynamic Pipeline Test Suite...');

// 1. Mobile diff triggers mobile E2E
{
  const pipe = generateDynamicPipeline(['hermes-mobile/App.tsx', 'README.md']);
  assert.ok(pipe.steps.some((s) => s.label.includes('Hermes Mobile')));
  console.log('  ✓ Mobile diff triggers mobile E2E step');
}

// 2. Security diff triggers Dogwood & anti-slop
{
  const pipe = generateDynamicPipeline(['tools/dogwood-temporal-policy.js']);
  assert.ok(pipe.steps.some((s) => s.label.includes('Dogwood')));
  console.log('  ✓ Security diff triggers Dogwood step');
}

// 3. Search diff triggers Zoekt step
{
  const pipe = generateDynamicPipeline(['tools/zoekt-trigram-search-engine.js']);
  assert.ok(pipe.steps.some((s) => s.label.includes('Zoekt')));
  console.log('  ✓ Search diff triggers Zoekt step');
}

// 4. Doctor Check
{
  const doc = runDoctor();
  assert.strictEqual(doc.status, 'READY');
  console.log('  ✓ Doctor check passes');
}

console.log('\n✅ All Buildkite Dynamic Pipeline tests passed successfully!');
process.exit(0);
