'use strict';

const assert = require('assert');
const { spawnSync } = require('child_process');

console.log('=== Testing Context Warehouse & Company Brain Engine ===');

const scriptPath = '/Users/igorganapolsky/.gemini/config/skills/context-warehouse-engine/context-warehouse-engine.js';
const run = spawnSync('node', [scriptPath, '--json'], { encoding: 'utf8' });
assert.strictEqual(run.status, 0, `context-warehouse-engine failed: ${run.stderr}`);

const data = JSON.parse(run.stdout);
assert.strictEqual(data.overallScore, '10/10 (A+ ZERO DRIFT)');
assert.strictEqual(data.contextWarehouseStats.registeredEntitiesCount, 3);
assert.strictEqual(data.revenueQueryPayload.compactionStatus, 'ENRICHED_WITHOUT_DRIFT');

console.log('✅ Context Warehouse Engine unit test passed.\n');
