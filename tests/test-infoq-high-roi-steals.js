'use strict';

const assert = require('assert');
const { spawnSync } = require('child_process');

console.log('=== Testing InfoQ High-ROI Architectural Steals Harness ===');

const run = spawnSync('node', ['tools/infoq-high-roi-steals.js', '--json'], { encoding: 'utf8' });
assert.strictEqual(run.status, 0, `InfoQ steals harness failed: ${run.stderr}`);

const data = JSON.parse(run.stdout);
assert.strictEqual(data.overallScore, '10/10 (A+)');
assert(data.mcpAudit.status === 'OPTIMIZED');
assert(data.hybridRag.ndcgScore >= 0.95);

console.log('✅ InfoQ High-ROI Architectural Steals test passed.\n');
