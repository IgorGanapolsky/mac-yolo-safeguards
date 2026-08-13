'use strict';

/**
 * tests/test-hermes-voice-engine.js
 * Automated test suite for Hermes Zero-Cost Real-Time Voice Engine.
 */

const assert = require('assert');
const { spawnSync } = require('child_process');
const path = require('path');
const {
  getAvailableMacVoices,
  speakText,
  interruptSpeech,
  runDoctor,
} = require('../tools/hermes-voice-engine');

const VOICE_BIN = path.resolve(__dirname, '../tools/hermes-voice-engine.js');

console.log('🧪 Running Test Suite for Hermes Voice Engine...\n');

// Test 1: Available Voices Retrieval
{
  const voices = getAvailableMacVoices();
  assert.ok(Array.isArray(voices), 'Available voices must be an array');
  assert.ok(voices.length > 0, 'Must find at least 1 macOS voice');
  assert.ok(voices.some((v) => v.name === 'Samantha' || v.name === 'Alex'), 'Must list standard macOS voices');
  console.log('✅ Test 1 Passed: Available Voices Retrieval');
}

// Test 2: Doctor Diagnostic Probe
{
  const doc = runDoctor();
  assert.strictEqual(doc.status, 'READY');
  assert.ok(doc.cost.includes('$0.00'), 'Cost must be $0.00');
  assert.strictEqual(doc.macSayAvailable, true);
  console.log('✅ Test 2 Passed: Doctor Diagnostic Probe');
}

// Test 3: CLI Probe Execution
{
  const cliRun = spawnSync('node', [VOICE_BIN, '--doctor', '--json'], { encoding: 'utf8' });
  assert.strictEqual(cliRun.status, 0, 'CLI --doctor must exit 0');
  const parsed = JSON.parse(cliRun.stdout);
  assert.strictEqual(parsed.status, 'READY');
  assert.strictEqual(parsed.service, 'hermes-voice-engine');
  console.log('✅ Test 3 Passed: CLI Probe Execution');
}

// Test 4: List Voices via CLI
{
  const cliRun = spawnSync('node', [VOICE_BIN, '--voices', '--json'], { encoding: 'utf8' });
  assert.strictEqual(cliRun.status, 0);
  const parsed = JSON.parse(cliRun.stdout);
  assert.ok(Array.isArray(parsed));
  console.log('✅ Test 4 Passed: List Voices via CLI');
}

console.log('\n🎉 ALL 4 HERMES VOICE ENGINE TESTS PASSED SUCCESSFULLY!');
