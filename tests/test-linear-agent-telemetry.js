#!/usr/bin/env node
'use strict';

/**
 * test-linear-agent-telemetry.js — Unit regression test for Linear Agent Telemetry Engine.
 */

const assert = require('assert');
const { spawnSync } = require('child_process');
const path = require('path');
const { trackClaim, trackPrOpen, trackComplete, getTelemetrySummary, parseArgs, generatePostMortemComment } = require('../tools/linear-agent-telemetry-engine.js');

function testArgsParsing() {
  const parsed = parseArgs(['node', 'script.js', '--track', 'AGENT-268', '--agent', 'antigravity', '--pr-number', '1581']);
  assert.strictEqual(parsed.track, 'AGENT-268');
  assert.strictEqual(parsed.agent, 'antigravity');
  assert.strictEqual(parsed.prNumber, '1581');
  console.log('✅ Linear telemetry args parsing test passed.');
}

function testTelemetryLifecycle() {
  const claim = trackClaim('TEST-100', 'antigravity');
  assert.strictEqual(claim.success, true);
  assert.strictEqual(claim.label, 'agent:antigravity');

  const pr = trackPrOpen('TEST-100', '9999');
  assert.strictEqual(pr.success, true);
  assert.strictEqual(pr.prNumber, '9999');

  const complete = trackComplete('TEST-100', {
    prNumber: '9999',
    agent: 'antigravity',
    bottleneck: 'Emulator wait',
    recommendation: 'Pre-flight check',
  });
  assert.strictEqual(complete.success, true);
  assert(complete.comment.includes('Linear Agent Telemetry'));
  assert(complete.comment.includes('agent:antigravity'));
  assert(complete.comment.includes('Emulator wait'));
  console.log('✅ Telemetry lifecycle test passed.');
}

function testCliExecution() {
  const scriptPath = path.join(__dirname, '../tools/linear-agent-telemetry-engine.js');
  const res = spawnSync('node', [scriptPath, '--summary', '--json'], { encoding: 'utf8' });
  assert.strictEqual(res.status, 0, `Expected exit code 0, got ${res.status}`);
  const json = JSON.parse(res.stdout);
  assert.strictEqual(json.linearAgentCompliance, '10/10 (LINEAR_AGENT_STANDARD_ACTIVE)');
  assert(typeof json.totalTracked === 'number');
  console.log('✅ Telemetry CLI execution test passed.');
}

function main() {
  console.log('=== Testing Linear Agent Telemetry Engine ===');
  testArgsParsing();
  testTelemetryLifecycle();
  testCliExecution();
  console.log('✅ Linear Agent Telemetry Test PASSED!');
}

main();
