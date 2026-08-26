#!/usr/bin/env node
'use strict';

/**
 * test-linear-agent-skill-exporter.js — Unit regression test for Linear Agent Skill Exporter.
 */

const assert = require('assert');
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const { LINEAR_SKILLS, parseArgs } = require('../tools/linear-agent-skill-exporter.js');

function testSkillsList() {
  assert.strictEqual(Array.isArray(LINEAR_SKILLS), true);
  assert.strictEqual(LINEAR_SKILLS.length, 5);
  assert(LINEAR_SKILLS.some((s) => s.name.includes('Claim Task')));
  assert(LINEAR_SKILLS.some((s) => s.name.includes('Workspace Hygiene')));
  assert(LINEAR_SKILLS.some((s) => s.name.includes('Project and Cycle')));
  assert(LINEAR_SKILLS.some((s) => s.name.includes('Closeout Evidence')));
  assert(LINEAR_SKILLS.some((s) => s.name.includes('Obsidian Handoff')));
  console.log('PASS Linear Agent skills catalog');
}

function testEveryReferencedCommandExists() {
  const repo = path.resolve(__dirname, '..');
  const combined = LINEAR_SKILLS.map((skill) => skill.prompt).join('\n');
  const references = [...combined.matchAll(/node\s+(tools\/[A-Za-z0-9._/-]+\.js)/g)]
    .map((match) => match[1]);
  assert.ok(references.length >= 3, 'expected repository command references');
  for (const reference of references) {
    assert.ok(fs.existsSync(path.join(repo, reference)), `missing referenced command: ${reference}`);
  }
  assert.doesNotMatch(combined, /linear-agent-telemetry-engine/);
  assert.doesNotMatch(combined, /gh\s+pr\s+merge/);
  assert.doesNotMatch(combined, /100% precision|100% CI pass/i);
  console.log('PASS every referenced skill command exists and no merge command is delegated');
}

function testCliExecution() {
  const scriptPath = path.join(__dirname, '../tools/linear-agent-skill-exporter.js');
  const first = spawnSync('node', [scriptPath, '--json'], { encoding: 'utf8' });
  const second = spawnSync('node', [scriptPath, '--json'], { encoding: 'utf8' });
  assert.strictEqual(first.status, 0, `Expected exit code 0, got ${first.status}`);
  assert.strictEqual(second.status, 0, `Expected exit code 0, got ${second.status}`);
  assert.strictEqual(first.stdout, second.stdout, 'export must be deterministic');
  const json = JSON.parse(first.stdout);
  assert.strictEqual(json.ok, true);
  assert.strictEqual(json.skills.length, 5);
  console.log('PASS Linear Agent skill exporter CLI is deterministic');
}

function testParserDoesNotInventMutationFlags() {
  assert.deepStrictEqual(parseArgs(['node', 'script', '--json']), { export: false, json: true });
  assert.deepStrictEqual(parseArgs(['node', 'script', '--export']), { export: true, json: false });
  console.log('PASS Linear Agent skill exporter parser');
}

function main() {
  console.log('=== Testing Linear Agent Skill Exporter ===');
  testSkillsList();
  testEveryReferencedCommandExists();
  testCliExecution();
  testParserDoesNotInventMutationFlags();
  console.log('Linear Agent Skill Exporter tests passed');
}

main();
