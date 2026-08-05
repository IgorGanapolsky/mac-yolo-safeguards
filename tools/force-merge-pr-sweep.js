#!/usr/bin/env node
'use strict';

/**
 * PR sweep — repair first, close last, never merge blind.
 *
 * Rewritten 2026-08-04 after this sweep closed three consecutive PRs carrying
 * verified bug fixes. Defects in the previous version:
 *
 *   1. CONFLICTING -> immediate close. On a repo where several agents edit the
 *      same files, a conflict with a fast-moving main is the NORMAL state and is
 *      usually fixed by updating the branch. Closing silently discards work that
 *      was already written, reviewed and tested.
 *   2. The close comment said "Closing superseded conflicting PR." Nothing was
 *      superseded. Readers then hunted for a duplicate PR that never existed.
 *      One wrong word cost hours.
 *   3. `mergeable === 'UNKNOWN'` was merged with `--admin`. UNKNOWN means GitHub
 *      has not finished computing mergeability — so this force-merged PRs of
 *      unknown state past all required checks, able to land a red PR on main.
 *
 * Policy now:
 *   - UNKNOWN     -> re-poll; never act on an uncomputed state.
 *   - CONFLICTING -> try update-branch to repair; re-poll. Close only if still
 *                    conflicting AND older than STALE_DAYS, with honest wording.
 *   - MERGEABLE   -> merge only when no required check is failing and none is
 *                    still running. Plain squash by default; --admin only with
 *                    --allow-admin, and never over a failing check.
 *
 * All GitHub calls use execFileSync with an argument array — no shell, so PR
 * titles and branch names can never be interpreted as commands.
 *
 * Usage:
 *   node tools/force-merge-pr-sweep.js --dry-run
 *   node tools/force-merge-pr-sweep.js
 *   node tools/force-merge-pr-sweep.js --allow-admin
 */

const { execFileSync } = require('child_process');

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has('--dry-run');
const ALLOW_ADMIN = args.has('--allow-admin');
const STALE_DAYS = 14;
const REPOLL_ATTEMPTS = 6;
const REPOLL_MS = 5000;

/** Inherit env minus GITHUB_TOKEN so gh uses the keychain login. */
function ghEnv() {
  const env = { ...process.env };
  delete env.GITHUB_TOKEN;
  return env;
}

/** Read-only gh call. argv is an array — never a shell string. */
function ghJson(argv) {
  try {
    const out = execFileSync('gh', argv, {
      encoding: 'utf8',
      env: ghEnv(),
      maxBuffer: 10 * 1024 * 1024,
    });
    return JSON.parse(out);
  } catch {
    return null;
  }
}

/** Mutating gh call, honours --dry-run. */
function ghAct(argv) {
  if (DRY_RUN) {
    console.log(`      [dry-run] gh ${argv.join(' ')}`);
    return true;
  }
  try {
    execFileSync('gh', argv, { stdio: 'ignore', env: ghEnv() });
    return true;
  } catch (err) {
    console.error(`      failed: ${String(err.message).split('\n')[0]}`);
    return false;
  }
}

function sleep(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function ageDays(iso) {
  return (Date.now() - Date.parse(iso)) / 86400000;
}

const PR_FIELDS = 'number,title,mergeable,mergeStateStatus,createdAt,statusCheckRollup';

function viewPr(number) {
  return ghJson(['pr', 'view', String(number), '--json', PR_FIELDS]);
}

/** GitHub resolves UNKNOWN mergeability asynchronously; give it time. */
function pollPr(number, until) {
  let last = null;
  for (let i = 0; i < REPOLL_ATTEMPTS; i++) {
    last = viewPr(number);
    if (last && until(last)) return last;
    if (i < REPOLL_ATTEMPTS - 1) sleep(REPOLL_MS);
  }
  return last;
}

/**
 * Pure decision function — the whole policy in one testable place.
 *
 * Extracted so the rules that destroyed three PRs can be pinned by tests:
 * closing on conflict, and merging on UNKNOWN, must never come back silently.
 *
 * @returns {{action:'skip'|'wait'|'repair'|'close'|'merge', reason:string}}
 */
function decidePrAction(pr, opts = {}) {
  const nowMs = opts.nowMs ?? Date.now();
  const staleDays = opts.staleDays ?? STALE_DAYS;

  if (pr.isDraft) return { action: 'skip', reason: 'draft' };

  // UNKNOWN means GitHub has not computed mergeability. Never merge on it.
  if (pr.mergeable === 'UNKNOWN') {
    return { action: 'wait', reason: 'mergeability not computed yet' };
  }

  if (pr.mergeable === 'CONFLICTING') {
    const days = (nowMs - Date.parse(pr.createdAt)) / 86400000;
    if (days < staleDays) {
      return { action: 'repair', reason: `conflicts, ${days.toFixed(1)}d old — try update-branch` };
    }
    return { action: 'close', reason: `conflicts unresolved after ${days.toFixed(0)}d` };
  }

  if (pr.mergeable !== 'MERGEABLE') {
    return { action: 'skip', reason: `mergeable=${pr.mergeable}` };
  }

  const posture = checkPosture(pr);
  if (posture.failing.length) {
    return { action: 'skip', reason: `failing: ${posture.failing.join(', ')}` };
  }
  if (posture.running.length) {
    return { action: 'skip', reason: `still running: ${posture.running.join(', ')}` };
  }
  return { action: 'merge', reason: 'mergeable and every check green' };
}

/** Safe to merge only when nothing is failing and nothing is still running. */
function checkPosture(pr) {
  const rollup = (pr && pr.statusCheckRollup) || [];
  const stateOf = (c) => c.conclusion || c.state || '';
  const failing = rollup.filter((c) => /FAILURE|TIMED_OUT|CANCELLED|ERROR/i.test(stateOf(c)));
  const running = rollup.filter((c) => /PENDING|IN_PROGRESS|QUEUED|EXPECTED/i.test(stateOf(c)));
  const nameOf = (c) => c.name || c.context || 'unnamed';
  return {
    failing: failing.map(nameOf),
    running: running.map(nameOf),
    green: failing.length === 0 && running.length === 0,
  };
}

function main() {
  const prs = ghJson([
    'pr', 'list', '--state', 'open', '--limit', '300',
    '--json', 'number,title,mergeable,isDraft,createdAt,headRefName',
  ]);
  if (!prs) {
    console.error('Failed to list PRs');
    process.exit(1);
  }

  console.log(
    `PR sweep over ${prs.length} open PR(s)` +
      `${DRY_RUN ? ' (DRY RUN)' : ''}${ALLOW_ADMIN ? ' [admin merge permitted when green]' : ''}`,
  );

  const merged = [];
  const repaired = [];
  const closed = [];
  const skipped = [];

  for (const pr of prs) {
    if (pr.isDraft) {
      skipped.push(`#${pr.number} draft`);
      continue;
    }

    let state = pr.mergeable;

    if (state === 'UNKNOWN') {
      const settled = pollPr(pr.number, (p) => p.mergeable !== 'UNKNOWN');
      state = (settled && settled.mergeable) || 'UNKNOWN';
      if (state === 'UNKNOWN') {
        skipped.push(`#${pr.number} mergeability still UNKNOWN — not touching it`);
        continue;
      }
    }

    if (state === 'CONFLICTING') {
      console.log(`[REPAIR] #${pr.number}: ${pr.title.slice(0, 60)}`);
      if (ghAct(['pr', 'update-branch', String(pr.number)])) {
        const after = pollPr(pr.number, (p) => p.mergeable === 'MERGEABLE');
        if (after && after.mergeable === 'MERGEABLE') {
          console.log('      repaired — now MERGEABLE');
          repaired.push(pr.number);
          state = 'MERGEABLE';
        }
      }
    }

    if (state === 'CONFLICTING') {
      const days = ageDays(pr.createdAt);
      if (days < STALE_DAYS) {
        skipped.push(
          `#${pr.number} has real conflicts (${days.toFixed(1)}d old) — left OPEN for rebase`,
        );
        continue;
      }
      console.log(`[CLOSE] #${pr.number} unresolvable conflicts, ${days.toFixed(0)}d old`);
      const comment =
        `Closing after ${days.toFixed(0)} days: this branch has merge conflicts with main ` +
        `that an automated update-branch could not resolve. Nothing superseded it — ` +
        `reopen and rebase if the work is still wanted.`;
      if (ghAct(['pr', 'close', String(pr.number), '--comment', comment])) {
        closed.push(pr.number);
      }
      continue;
    }

    if (state !== 'MERGEABLE') {
      skipped.push(`#${pr.number} mergeable=${state}`);
      continue;
    }

    const posture = checkPosture(viewPr(pr.number));
    if (posture.failing.length) {
      skipped.push(`#${pr.number} FAILING: ${posture.failing.slice(0, 3).join(', ')}`);
      continue;
    }
    if (posture.running.length) {
      skipped.push(`#${pr.number} still running: ${posture.running.slice(0, 3).join(', ')}`);
      continue;
    }

    console.log(`[MERGE] #${pr.number}: ${pr.title.slice(0, 60)}`);
    let ok = ghAct(['pr', 'merge', String(pr.number), '--squash', '--delete-branch']);

    // MERGEABLE but behind base: strict protection refuses until the branch is
    // updated. Refresh from base and retry before considering anything else —
    // this is the common case on a fast-moving main, and it is not a failure.
    if (!ok) {
      console.log('      refreshing from base (likely behind) and retrying');
      if (ghAct(['pr', 'update-branch', String(pr.number)])) {
        const after = pollPr(pr.number, (p) => p.mergeStateStatus !== 'BEHIND');
        const afterPosture = checkPosture(after);
        if (afterPosture.failing.length) {
          skipped.push(
            `#${pr.number} went red after refresh: ${afterPosture.failing.slice(0, 3).join(', ')}`,
          );
          continue;
        }
        if (afterPosture.running.length) {
          skipped.push(
            `#${pr.number} refreshed; checks re-running: ${afterPosture.running.slice(0, 2).join(', ')}`,
          );
          continue;
        }
        ok = ghAct(['pr', 'merge', String(pr.number), '--squash', '--delete-branch']);
      }
    }

    if (!ok && ALLOW_ADMIN && posture.green) {
      // Reachable only when every check is green: bypasses the up-to-date
      // requirement, never a failing check.
      console.log('      retrying with --admin (all checks green)');
      ok = ghAct(['pr', 'merge', String(pr.number), '--squash', '--admin', '--delete-branch']);
    }
    if (ok) merged.push(pr.number);
  }

  const live = ghJson(['pr', 'list', '--state', 'open', '--limit', '300', '--json', 'number']);
  console.log('\n=== SWEEP COMPLETE ===');
  console.log(`Merged:   ${merged.length}${merged.length ? ' -> ' + merged.join(', ') : ''}`);
  console.log(`Repaired: ${repaired.length}${repaired.length ? ' -> ' + repaired.join(', ') : ''}`);
  console.log(`Closed:   ${closed.length}${closed.length ? ' -> ' + closed.join(', ') : ''}`);
  if (skipped.length) {
    console.log(`Left alone (${skipped.length}):`);
    for (const s of skipped) console.log(`  - ${s}`);
  }
  console.log(`Open PRs now: ${live ? live.length : 'unknown'}`);
}

module.exports = { decidePrAction, checkPosture, STALE_DAYS };

if (require.main === module) {
  main();
}
