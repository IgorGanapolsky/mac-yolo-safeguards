'use strict';
// Enforces the AI Debt Register (docs/AI-DEBT-REGISTER.md). YouTube "AI tech debt"
// playbook steal: agent-generated services must not become unowned debt.
const assert = require('node:assert/strict');
const test = require('node:test');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const register = fs.readFileSync(path.join(ROOT, 'docs/AI-DEBT-REGISTER.md'), 'utf8');

function parseRows(md) {
  const lines = md.split('\n');
  const start = lines.findIndex((l) => /^\|\s*id\s*\|/.test(l));
  if (start < 0) return [];
  const rows = [];
  for (let i = start + 2; i < lines.length; i++) {
    const line = lines[i];
    if (!/^\|/.test(line)) break;
    const cells = line.split('|').slice(1, -1).map((c) => c.trim());
    if (cells.length < 8) continue;
    rows.push({ id: cells[0], artifact: cells[1], owner: cells[2], purpose: cells[3], provenance: cells[4], tests: cells[5], risk: cells[6], review_by: cells[7] });
  }
  return rows;
}

const rows = parseRows(register);

test('register has at least one tracked entry', () => {
  assert.ok(rows.length >= 1, 'AI debt register is empty');
});

test('every row has all eight fields populated', () => {
  for (const r of rows) {
    for (const [k, v] of Object.entries(r)) {
      assert.ok(v && v.length > 0, `${r.id}: field ${k} is empty`);
    }
  }
});

test('every registered artifact actually exists in the repo', () => {
  for (const r of rows) {
    const p = path.join(ROOT, r.artifact);
    assert.ok(fs.existsSync(p), `${r.id}: artifact ${r.artifact} does not exist (register drifted)`);
  }
});

test('every review_by is a valid ISO date', () => {
  for (const r of rows) {
    assert.match(r.review_by, /^\d{4}-\d{2}-\d{2}$/, `${r.id}: review_by not YYYY-MM-DD`);
    assert.ok(!Number.isNaN(Date.parse(r.review_by)), `${r.id}: review_by unparseable`);
  }
});

test('report AI debt due for review (advisory, non-fatal)', () => {
  const overdue = rows.filter((r) => Date.parse(r.review_by) < Date.now());
  if (overdue.length) console.warn('AI debt due for review:', overdue.map((r) => r.id).join(', '));
  assert.ok(true);
});
