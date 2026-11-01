#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { guard, readRepo } = require('../tools/declarative-schema-guard');

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
  console.log(`ok ${passed} ${name}`);
}

function migration(tag, text) {
  return { tag, text };
}

check('a disabled row policy and a blob column hold', () => {
  const result = guard({
    schemaTs: 'export const files = sqliteTable("files", { body: blob("body") });',
    journal: { entries: [{ tag: '0001_files' }] },
    migrations: [migration('0001_files', 'CREATE TABLE `files` (\n\t`body` blob\n);\nALTER TABLE `files` DISABLE ROW LEVEL SECURITY;')],
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.paperclips, ['disable row level security', 'blob column']);
});

check('a migration missing from the journal holds', () => {
  const result = guard({
    schemaTs: 'export const notes = sqliteTable("notes", { id: text("id") });',
    journal: { entries: [] },
    migrations: [migration('0001_notes', 'CREATE TABLE `notes` (\n\t`id` text\n);')],
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.missingJournal, ['0001_notes']);
});

check('a schema table with no create holds', () => {
  const result = guard({
    schemaTs: 'export const notes = sqliteTable("notes", { id: text("id") });',
    journal: { entries: [] },
    migrations: [],
  });
  assert.equal(result.ok, false);
  assert.deepEqual(result.missingCreates, ['notes']);
});

check('the control plane journal matches its sql files', () => {
  const result = guard(readRepo());
  assert.equal(result.ok, true);
  assert.deepEqual(result.missingJournal, []);
  assert.deepEqual(result.missingCreates, []);
  assert.deepEqual(result.paperclips, []);
  assert.deepEqual(result.schemaBehindMigrations, ['organizations.store_entitlement_expires_at']);
  assert.equal(result.shape.tables.some((table) => table.name === 'llm_calls'), true);
  const organizations = result.shape.tables.find((table) => table.name === 'organizations');
  assert.equal(organizations.columns.includes('store_entitlement_expires_at'), true);
  const committed = fs.readFileSync(path.join(__dirname, '../schemas/hermes-control-plane.shape.json'), 'utf8');
  assert.equal(committed, `${JSON.stringify(result.shape, null, 2)}\n`);
});

console.log(`declarative-schema-guard: ${passed} checks passed`);
