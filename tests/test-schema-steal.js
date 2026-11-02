#!/usr/bin/env node
'use strict';

/**
 * Tests for tools/schema-steal.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

// Require the module (will execute main if run directly — but we import functions)
const mod = require('../tools/schema-steal');
const { buildSchema, validate, diff, extractTasks, extractToolBoundaries } = mod;

let passed = 0;
function ok(name) {
  passed += 1;
  console.log(`ok  ${passed}  ${name}`);
}

// ─── 1. extractTasks ──────────────────────────────────────────────────

{
  const result = extractTasks();
  assert.equal(typeof result.total, 'number');
  assert.equal(typeof result.inProgress, 'number');
  assert.equal(typeof result.released, 'number');
  assert.equal(typeof result.blocked, 'number');
  assert.equal(result.inProgress + result.released + result.blocked, result.total, 'inProgress + released + blocked should equal total');
  ok('extractTasks returns consistent counts that sum to total');
}

{
  const result = extractTasks();
  assert.equal(result.tasks.every((t) => t.id.startsWith('T-')), true, 'all tasks should have T- prefixed IDs');
  ok('all extracted tasks have T- prefixed IDs');
}

{
  const result = extractTasks();
  // released and done tasks should NOT be in inProgress
  const releasedTasks = result.tasks.filter((t) => t.released);
  const inProgressTasks = result.tasks.filter((t) => t.inProgress);
  const overlap = releasedTasks.filter((t) => t.inProgress);
  assert.equal(overlap.length, 0, 'no task should be both released and in_progress');
  ok('no task is simultaneously released and in_progress');
}

// ─── 2. extractToolBoundaries ──────────────────────────────────────────

{
  const boundaries = extractToolBoundaries();
  assert.equal(Array.isArray(boundaries.deny), true);
  assert.equal(boundaries.deny.length > 0, true, 'should have deny rules from settings.yaml');
  assert.equal(boundaries.deny.some((d) => d.includes('id_rsa') || d.includes('id_')), true, 'should deny SSH keys');
  assert.equal(boundaries.deny.some((d) => d.includes('Eci')), true, 'should deny ECI projects');
  assert.equal(boundaries.deny.some((d) => d.includes('secure-yolo')), false, 'should NOT deny secure-yolo (poolside fix)');
  ok('tool boundaries deny ECI projects and SSH keys but NOT secure-yolo');
}

// ─── 3. buildSchema ───────────────────────────────────────────────────

{
  const schema = buildSchema();
  assert.equal(schema.$schema, 'https://mac-yolo-safeguards.dev/schemas/coordination-v1');
  assert.equal(typeof schema.generatedAt, 'string');
  assert.equal(schema.version, '1.0.0');
  assert.equal(typeof schema.tasks, 'object');
  assert.equal(typeof schema.git, 'object');
  assert.equal(typeof schema.prs, 'object');
  assert.equal(typeof schema.skills, 'object');
  assert.equal(typeof schema.toolBoundaries, 'object');
  ok('buildSchema returns valid schema with all expected top-level keys');
}

{
  const schema = buildSchema();
  assert.equal(schema.tasks.inProgress + schema.tasks.released + schema.tasks.blocked, schema.tasks.total);
  ok('schema task counts are consistent');
}

{
  const schema = buildSchema();
  assert.equal(schema.skills.count, 95, 'should find 95 skills in SKILLS.md');
  ok('schema correctly counts 95 skills from SKILLS.md');
}

// ─── 4. validate ──────────────────────────────────────────────────────

{
  const schema = buildSchema();
  const result = validate(schema);
  assert.equal(typeof result.valid, 'boolean');
  assert.equal(Array.isArray(result.errors), true);
  assert.equal(Array.isArray(result.warnings), true);
  ok('validate returns object with valid, errors, warnings');
}

// ─── 5. Schema file exists on disk ────────────────────────────────────

{
  const schemaPath = path.join(__dirname, '..', 'schemas', 'coordination.json');
  assert.equal(fs.existsSync(schemaPath), true, 'schemas/coordination.json should exist after generation');
  const schema = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));
  assert.equal(schema.$schema, 'https://mac-yolo-safeguards.dev/schemas/coordination-v1');
  ok('schemas/coordination.json exists on disk and is valid JSON');
}

// ─── 6. diff ──────────────────────────────────────────────────────────

{
  const old = buildSchema();
  // Mutate a copy for diff testing
  const current = JSON.parse(JSON.stringify(old));
  current.tasks.inProgress = old.tasks.inProgress + 1;

  const d = diff(old, current);
  assert.equal(d.changed, true, 'diff should detect changed in_progress count');
  assert.equal(d.changes.length > 0, true, 'diff should have at least one change message');
  ok('diff detects count changes between schema versions');
}

{
  const old = buildSchema();
  const current = JSON.parse(JSON.stringify(old)); // identical copy
  const d = diff(old, current);
  assert.equal(d.changed, false, 'diff should not detect changes for identical schemas');
  ok('diff returns no changes for identical schemas');
}

console.log(`\n${passed}/${passed} tests passed`);
process.exit(0);
