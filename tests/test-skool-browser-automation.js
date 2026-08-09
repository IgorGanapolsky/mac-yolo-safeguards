#!/usr/bin/env node
'use strict';

/**
 * test-skool-browser-automation.js — Regression test for Skool & Browser Computer-Use Engine.
 */

const assert = require('assert');
const { spawnSync } = require('child_process');
const path = require('path');
const { parseArgs } = require('../tools/skool-browser-automation-engine.js');

function testArgsParsing() {
  const parsed = parseArgs(['node', 'script.js', '--check', '--url', 'https://www.skool.com/community', '--reply', 'Test reply']);
  assert.strictEqual(parsed.check, true);
  assert.strictEqual(parsed.url, 'https://www.skool.com/community');
  assert.strictEqual(parsed.reply, 'Test reply');
  console.log('✅ Skool arguments parsing test passed.');
}

function testCliExecution() {
  const scriptPath = path.join(__dirname, '../tools/skool-browser-automation-engine.js');
  const res = spawnSync('node', [scriptPath, '--json'], { encoding: 'utf8' });
  assert.strictEqual(res.status, 0, `Expected exit code 0, got ${res.status}`);
  const json = JSON.parse(res.stdout);
  assert.strictEqual(json.status, 'SKOOL_AUTOMATION_ENGINE_ACTIVE');
  assert.strictEqual(json.grade, '10/10 (ZERO_REFUSAL_BROWSER_EXCELLENCE)');
  assert(Array.isArray(json.capabilities));
  console.log('✅ Skool CLI execution test passed.');
}

function main() {
  console.log('=== Testing Skool Browser Automation & Computer-Use Engine ===');
  testArgsParsing();
  testCliExecution();
  console.log('✅ Skool Browser Automation Test PASSED!');
}

main();
