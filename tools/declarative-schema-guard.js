#!/usr/bin/env node
'use strict';

/**
 * declarative-schema-guard.js
 *
 * Latent Space interview with Supabase (YouTube zHG6sAss_kE): an agent should
 * read one current database shape, and it should not disable row-level security
 * or store raw binary in the transactional schema. This file checks the
 * Hermes control-plane SQLite migrations. It does not start a database.
 *
 *   node tools/declarative-schema-guard.js
 */

const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const SCHEMA = path.join(REPO, 'apps/hermes-control-plane/db/schema.ts');
const DRIZZLE = path.join(REPO, 'apps/hermes-control-plane/drizzle');
const JOURNAL = path.join(DRIZZLE, 'meta/_journal.json');
const SHAPE = path.join(REPO, 'schemas/hermes-control-plane.shape.json');

function tablesInSchema(schemaTs) {
  const text = String(schemaTs || '');
  const tables = [];
  const start = /sqliteTable\(\s*"([a-z0-9_]+)"\s*,\s*\{/g;
  let match;
  while ((match = start.exec(text))) {
    const bodyStart = match.index + match[0].length - 1;
    let depth = 0;
    let end = bodyStart;
    for (let i = bodyStart; i < text.length; i += 1) {
      const ch = text[i];
      if (ch === '{') depth += 1;
      else if (ch === '}') {
        depth -= 1;
        if (depth === 0) {
          end = i;
          break;
        }
      }
    }
    const body = text.slice(bodyStart, end);
    const columns = [];
    const column = /(?:text|integer|real|blob|numeric|drizzleReal)\(\s*"([a-z0-9_]+)"/g;
    let found;
    while ((found = column.exec(body))) columns.push(found[1]);
    tables.push({ name: match[1], columns });
  }
  return tables;
}

function foldMigrations(migrations) {
  const tables = new Map();
  function ensure(name) {
    if (!tables.has(name)) tables.set(name, new Set());
    return tables.get(name);
  }
  for (const migration of migrations) {
    const text = String(migration.text || '');
    const creates = /CREATE TABLE\s+`([a-z0-9_]+)`\s*\(([\s\S]*?)\)\s*;/g;
    let create;
    while ((create = creates.exec(text))) {
      const columns = ensure(create[1]);
      for (const line of create[2].split('\n')) {
        const column = line.match(/^\s*`([a-z0-9_]+)`\s+(?:text|integer|real|blob|numeric)\b/i);
        if (column) columns.add(column[1]);
      }
    }
    const alters = /ALTER TABLE\s+`([a-z0-9_]+)`\s+ADD(?:\s+COLUMN)?\s+`([a-z0-9_]+)`/gi;
    let alter;
    while ((alter = alters.exec(text))) ensure(alter[1]).add(alter[2]);
  }
  return tables;
}

function paperclipFindings(text) {
  const body = String(text || '');
  const findings = [];
  if (/DISABLE\s+ROW\s+LEVEL\s+SECURITY/i.test(body)) findings.push('disable row level security');
  if (/NO\s+FORCE\s+ROW\s+LEVEL\s+SECURITY/i.test(body)) findings.push('no force row level security');
  if (/\bbytea\b/i.test(body)) findings.push('bytea column');
  if (/\bblob\s*\(|`[a-z0-9_]+`\s+blob\b/i.test(body)) findings.push('blob column');
  return findings;
}

function shapeFrom(schemaTables, folded) {
  const names = new Set([...schemaTables.map((table) => table.name), ...folded.keys()]);
  const tables = [...names].sort().map((name) => {
    const schema = schemaTables.find((table) => table.name === name);
    const columns = new Set(schema ? schema.columns : []);
    for (const column of folded.get(name) || []) columns.add(column);
    return { name, columns: [...columns].sort() };
  });
  return {
    source: 'apps/hermes-control-plane/db/schema.ts plus folded drizzle migrations',
    tables,
  };
}

function guard(input) {
  const schemaTables = tablesInSchema(input.schemaTs);
  const migrations = Array.isArray(input.migrations) ? input.migrations : [];
  const folded = foldMigrations(migrations);
  const tags = new Set((input.journal && input.journal.entries ? input.journal.entries : []).map((entry) => entry.tag));
  const migrationTags = migrations.map((migration) => migration.tag);
  const missingJournal = migrationTags.filter((tag) => !tags.has(tag));
  const extraJournal = [...tags].filter((tag) => !migrationTags.includes(tag));
  const missingCreates = schemaTables.filter((table) => !folded.has(table.name)).map((table) => table.name);
  const schemaBehindMigrations = [];
  for (const table of schemaTables) {
    for (const column of folded.get(table.name) || []) {
      if (!table.columns.includes(column)) schemaBehindMigrations.push(`${table.name}.${column}`);
    }
  }
  const paperclips = paperclipFindings(`${input.schemaTs || ''}\n${migrations.map((migration) => migration.text).join('\n')}`);
  const shape = shapeFrom(schemaTables, folded);
  const ok = missingJournal.length === 0
    && extraJournal.length === 0
    && missingCreates.length === 0
    && paperclips.length === 0;
  return {
    ok,
    missingJournal,
    extraJournal,
    missingCreates,
    schemaBehindMigrations: schemaBehindMigrations.sort(),
    paperclips,
    shape,
  };
}

function readRepo() {
  const names = fs.readdirSync(DRIZZLE).filter((name) => name.endsWith('.sql')).sort();
  return {
    schemaTs: fs.readFileSync(SCHEMA, 'utf8'),
    journal: JSON.parse(fs.readFileSync(JOURNAL, 'utf8')),
    migrations: names.map((name) => ({
      tag: name.replace(/\.sql$/, ''),
      text: fs.readFileSync(path.join(DRIZZLE, name), 'utf8'),
    })),
  };
}

function main() {
  const result = guard(readRepo());
  let shapeMatches = false;
  try {
    shapeMatches = fs.readFileSync(SHAPE, 'utf8') === `${JSON.stringify(result.shape, null, 2)}\n`;
  } catch (error) {
    shapeMatches = false;
  }
  const body = {
    ok: result.ok && shapeMatches,
    missingJournal: result.missingJournal,
    extraJournal: result.extraJournal,
    missingCreates: result.missingCreates,
    schemaBehindMigrations: result.schemaBehindMigrations,
    paperclips: result.paperclips,
    shapeMatches,
    tableCount: result.shape.tables.length,
  };
  process.stdout.write(`${JSON.stringify(body)}\n`);
  process.exitCode = body.ok ? 0 : 1;
}

module.exports = {
  tablesInSchema,
  foldMigrations,
  paperclipFindings,
  shapeFrom,
  guard,
  readRepo,
};

if (require.main === module) main();
