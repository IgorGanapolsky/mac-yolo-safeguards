'use strict';

/**
 * Unit Tests for Digg Tech Aggregator Engine (`tools/digg-agent-news-aggregator-engine.js`)
 * Compatible with node tests/test-*.js harness (uses node:assert).
 */

const assert = require('assert');
const { auditDiggAgentNewsAggregator, DIGG_HIGH_ROI_STEALS } = require('../tools/digg-agent-news-aggregator-engine');

console.log('Running test-digg-agent-news-aggregator.js...');

const audit = auditDiggAgentNewsAggregator();
assert.strictEqual(audit.status, 'DIGG_AGENT_NEWS_AGGREGATOR_ACTIVE', 'Expected ACTIVE status');
assert.strictEqual(audit.grade, '10/10 (HIGH_ROI_INNOVATION_EXCELLENCE)', 'Expected 10/10 grade');
assert.strictEqual(DIGG_HIGH_ROI_STEALS.length, 4, 'Expected 4 high-ROI steals');

console.log('ok tests/test-digg-agent-news-aggregator.js');
