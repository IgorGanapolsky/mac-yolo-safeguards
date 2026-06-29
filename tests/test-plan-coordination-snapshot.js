#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  parseActiveTasks,
  parseFileLocks,
  parseMeta,
  snapshotPlan,
} = require('../tools/plan-coordination-snapshot');

function test(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
}

const SAMPLE = `# plan.md

## 0. Meta

- Updated: 2026-06-29 by cursor
- Active agents (claim your id here): cursor, gemini
- Active branch of record: feature/foo

## 1. Task Board

| ID  | Task | Status | Owner | Files (claim) | AcceptanceCheck |
|-----|------|--------|-------|---------------|-----------------|
| T-1 | Active work | in_progress | gemini | foo.ts | tests pass |
| T-2 | Blocked item | blocked | cursor | bar.ts | unblocked |
| T-3 | Finished | done | antigravity | baz.ts | shipped |

## 2. File Ownership Map

- \`foo.ts\` → **gemini** (T-1) — DO NOT EDIT
- \`bar.ts\` → **cursor** (T-2)
- \`released.ts\` → **antigravity** (T-9) — released (2026-06-28)
- everything else → (free)
`;

test('parseMeta extracts coordination header fields', () => {
  const meta = parseMeta(SAMPLE);
  assert.strictEqual(meta.updated, '2026-06-29 by cursor');
  assert.match(meta.activeAgents, /cursor/);
  assert.strictEqual(meta.activeBranch, 'feature/foo');
});

test('parseActiveTasks keeps in_progress and blocked only', () => {
  const tasks = parseActiveTasks(SAMPLE);
  assert.strictEqual(tasks.length, 2);
  assert.strictEqual(tasks[0].id, 'T-1');
  assert.strictEqual(tasks[1].status, 'blocked');
});

test('parseFileLocks skips released and free rows', () => {
  const locks = parseFileLocks(SAMPLE);
  assert.strictEqual(locks.length, 2);
  assert.match(locks[0], /foo\.ts/);
  assert.match(locks[1], /bar\.ts/);
});

test('snapshotPlan reads real plan.md when present', () => {
  const planPath = path.join(__dirname, '..', 'plan.md');
  if (!fs.existsSync(planPath)) return;
  const snapshot = snapshotPlan(planPath);
  assert.strictEqual(snapshot.ok, true);
  assert.ok(Array.isArray(snapshot.activeTasks));
  assert.ok(Array.isArray(snapshot.fileLocks));
});

test('snapshotPlan reports missing plan file', () => {
  const missing = path.join(os.tmpdir(), `missing-plan-${Date.now()}.md`);
  const snapshot = snapshotPlan(missing);
  assert.strictEqual(snapshot.ok, false);
});
