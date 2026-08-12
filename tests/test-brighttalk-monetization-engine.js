'use strict';

const assert = require('assert');
const { spawnSync } = require('child_process');

console.log('=== Testing BrightTALK Monetization & Promotion Engine ===');

const run = spawnSync('node', ['tools/brighttalk-monetization-engine.js', '--json'], { encoding: 'utf8' });
assert.strictEqual(run.status, 0, `brighttalk-monetization-engine failed: ${run.stderr}`);

const data = JSON.parse(run.stdout);
assert.strictEqual(data.overallScore, '10/10 (A+ PIPELINE READY)');
assert.strictEqual(data.monetizationSummary.totalAudienceReach, 7400);
assert.strictEqual(data.monetizationSummary.monthlyPipelineValueUSD, 21000);
assert.strictEqual(data.opportunities.length, 4);

console.log('✅ BrightTALK Monetization Engine unit test passed.\n');
