#!/usr/bin/env node
'use strict';

/**
 * test-linear-agent-skill-exporter.js — Unit regression test for Linear Agent Skill Exporter.
 */

const assert = require('assert');
const { spawnSync } = require('child_process');
const path = require('path');
const { LINEAR_SKILLS, parseArgs } = require('../tools/linear-agent-skill-exporter.js');

function testSkillsList() {
  assert.strictEqual(Array.isArray(LINEAR_SKILLS), true);
  assert(LINEAR_SKILLS.length >= 4);
  assert(LINEAR_SKILLS.some((s) => s.name.includes('Claim Task')));
  assert(LINEAR_SKILLS.some((s) => s.name.includes('Cycle-Time')));
  assert(LINEAR_SKILLS.some((s) => s.name.includes('Hermes-YOLO')));
  assert(LINEAR_SKILLS.some((s) => s.name.includes('GSD Green PR')));
  console.log('✅ Linear Agent skills catalog unit test passed.');
}

function testCliExecution() {
  const scriptPath = path.join(__dirname, '../tools/linear-agent-skill-exporter.js');
  const res = spawnSync('node', [scriptPath, '--json'], { encoding: 'utf8' });
  assert.strictEqual(res.status, 0, `Expected exit code 0, got ${res.status}`);
  const json = JSON.parse(res.stdout);
  assert.strictEqual(json.ok, true);
  assert(json.skills.length >= 4);
  console.log('✅ Linear Agent skill exporter CLI execution test passed.');
}

function main() {
  console.log('=== Testing Linear Agent Skill Exporter ===');
  testSkillsList();
  testCliExecution();
  console.log('✅ Linear Agent Skill Exporter Test PASSED!');
}

main();
