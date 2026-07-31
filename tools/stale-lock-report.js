#!/usr/bin/env node
/**
 * Report plan.md §2 file locks that are safe to reclaim.
 *
 * Why: the ownership gate is good — it blocked real mistakes — but locks are append-only and
 * never expire, so the table accumulates claims whose task finished days ago. On 2026-07-27
 * an agent had to hand-audit three separate locks (task `done` since 07-17, and two with no
 * task row at all) before it could act. That audit is mechanical; this does it.
 *
 * A claim is STALE when any of:
 *   - the owner's task row is `done`
 *   - the owner has no task row at all in §1
 *   - the claim timestamp is older than --max-age-days (default 7)
 * Lines already marked "released" are ignored.
 *
 * Usage: node tools/stale-lock-report.js [--max-age-days 7] [--json]
 */
const fs = require('fs');
const path = require('path');

function parsePlan(text, { today, maxAgeDays = 7, orphanAgeDays = 3 } = {}) {
  const lines = text.split('\n');

  // §1 task rows: | T-ID | title | status | owner | files | outcome |
  const ownerStatuses = new Map();
  for (const line of lines) {
    const cells = line.split('|').map((c) => c.trim());
    if (cells.length < 6 || !/^T-|^\| ?T-/.test(line.trim())) continue;
    const status = cells[3];
    const owner = cells[4];
    if (!owner || !status) continue;
    if (!ownerStatuses.has(owner)) ownerStatuses.set(owner, new Set());
    ownerStatuses.get(owner).add(status);
  }

  const claims = [];
  for (const line of lines) {
    if (!line.startsWith('- ')) continue;
    if (!line.includes('→ **')) continue;
    if (/released/i.test(line)) continue;
    const owner = (line.match(/→ \*\*([^*]+)\*\*/) || [])[1];
    if (!owner) continue;
    const dateStr = (line.match(/\((20\d\d-\d\d-\d\d)/) || [])[1] || null;
    const files = (line.match(/`([^`]+)`/g) || []).map((f) => f.replace(/`/g, ''));

    // A missing §1 task row is NOT evidence of staleness — most valid claims never create
    // one. The first version of this tool used it and declared 310 of 405 claims
    // reclaimable, including claims filed an hour earlier. A detector that says "steal
    // anything" is worse than none: it would cause the very collisions the gate prevents.
    // Only two signals are trustworthy: an explicitly FINISHED task, or real age.
    const statuses = ownerStatuses.get(owner);
    const reasons = [];
    const ACTIVE = new Set(['in_progress', 'pending', 'blocked']);
    if (statuses && statuses.size && ![...statuses].some((s) => ACTIVE.has(s))) {
      reasons.push(`task status: ${[...statuses].join('/')}`);
    }
    let ageDays = null;
    if (dateStr && today) {
      ageDays = Math.floor((Date.parse(today) - Date.parse(dateStr)) / 86400000);
      if (ageDays > maxAgeDays) reasons.push(`${ageDays}d old (> ${maxAgeDays}d)`);
    }
    // "No §1 task row" is noise on its own (most valid claims never create one) but it IS
    // meaningful once the claim has aged: an owner with no tracked task and days of silence
    // is what the three hand-verified stale locks looked like on 2026-07-27.
    if (!statuses && ageDays !== null && ageDays >= orphanAgeDays) {
      reasons.push(`no task row in §1 and ${ageDays}d old`);
    }
    // Undated claims are unverifiable, never auto-reclaimable — flag separately for a human.
    const undated = !dateStr;
    claims.push({ owner, date: dateStr, ageDays, files, undated, stale: reasons.length > 0, reasons });
  }
  return claims;
}

function main() {
  const argv = process.argv.slice(2);
  const maxAgeDays = Number(argv[argv.indexOf('--max-age-days') + 1]) || 7;
  const asJson = argv.includes('--json');
  const planPath = path.join(__dirname, '..', 'plan.md');
  const today = new Date().toISOString().slice(0, 10);
  const claims = parsePlan(fs.readFileSync(planPath, 'utf8'), { today, maxAgeDays });
  const stale = claims.filter((c) => c.stale);

  if (asJson) {
    console.log(JSON.stringify({ total: claims.length, stale: stale.length, claims: stale }, null, 2));
    return 0;
  }
  console.log(`plan.md §2: ${claims.length} active claim(s), ${stale.length} reclaimable\n`);
  for (const c of stale.slice(0, 25)) {
    console.log(`  ${c.owner}  (${c.date || 'no date'})`);
    console.log(`    why: ${c.reasons.join('; ')}`);
    console.log(`    files: ${c.files.slice(0, 3).join(', ')}${c.files.length > 3 ? ` +${c.files.length - 3} more` : ''}`);
  }
  if (stale.length > 25) console.log(`  … ${stale.length - 25} more`);
  console.log('\nReclaim only what you need, and say so in your claim line.');
  return 0;
}

module.exports = { parsePlan };
if (require.main === module) process.exit(main());
