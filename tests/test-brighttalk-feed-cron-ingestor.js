'use strict';

const assert = require('assert');
const fs = require('fs');
const { spawnSync } = require('child_process');
const { runBrighttalkIngestion } = require('../tools/brighttalk-feed-cron-ingestor');

console.log('=== Testing BrightTALK Feed Cron Ingestor & Strategy Synthesizer ===');

// Test 1: Programmatic Evaluation
const result = runBrighttalkIngestion();
assert.strictEqual(result.status, '10/10 (BRIGHTTALK FEED INGESTED & SYNTHESIZED)');
assert.strictEqual(result.itemsProcessed, 3);
assert.ok(fs.existsSync(result.outputDocument));

// Test 2: CLI JSON Mode
const run = spawnSync('node', ['tools/brighttalk-feed-cron-ingestor.js', '--json'], { encoding: 'utf8' });
assert.strictEqual(run.status, 0, `brighttalk-feed-cron-ingestor failed: ${run.stderr}`);

const data = JSON.parse(run.stdout);
assert.strictEqual(data.sourceFeed, 'https://www.brighttalk.com/mybrighttalk/my-feed');

console.log('✅ BrightTALK Feed Cron Ingestor unit test passed.\n');
