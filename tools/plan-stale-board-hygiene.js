#!/usr/bin/env node
'use strict';
/**
 * Mark ancient §1 Task Board in_progress/blocked rows as done.
 * These stale rows create hundreds of false multi-owner contention hits.
 *
 * Usage:
 *   node tools/plan-stale-board-hygiene.js --dry-run
 *   node tools/plan-stale-board-hygiene.js --apply
 */
const fs = require('fs');
const path = require('path');

const REPO = path.resolve(__dirname, '..');
const DEFAULT_PLAN = path.join(REPO, 'plan.md');
const TASK_ROW_RE = /^\| T-[A-Za-z0-9][-A-Za-z0-9]*/;
const MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

function taskBoardDateIso(id) {
  const m = String(id || '').match(/(20\d{2})(\d{2})(\d{2})/);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function isStale(id, nowMs = Date.now()) {
  const iso = taskBoardDateIso(id);
  if (!iso) return true; // undated board debt
  const ts = Date.parse(`${iso}T00:00:00Z`);
  if (!Number.isFinite(ts)) return true;
  return nowMs - ts > MAX_AGE_MS;
}

function main() {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const planPath = DEFAULT_PLAN;
  const nowMs = Date.now();
  const lines = fs.readFileSync(planPath, 'utf8').split('\n');
  let changed = 0;
  const samples = [];
  const out = lines.map((line) => {
    if (!TASK_ROW_RE.test(line)) return line;
    const cols = line.split('|');
    // keep leading empty from split
    const cells = cols.map((c) => c);
    // find status column: after split, indices: '', id, task, status, owner, ...
    if (cells.length < 5) return line;
    const id = cells[1].trim();
    const status = cells[3].trim();
    if (status !== 'in_progress' && status !== 'blocked') return line;
    if (!isStale(id, nowMs)) return line;
    cells[3] = ` done `;
    changed += 1;
    if (samples.length < 12) samples.push(`${id} ${status}→done`);
    return cells.join('|');
  });
  const report = {
    ok: true,
    apply,
    planPath,
    changed,
    samples,
    maxAgeDays: 14,
  };
  if (apply && changed > 0) {
    fs.writeFileSync(planPath, out.join('\n'));
  }
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}

main();
