#!/usr/bin/env node
'use strict';

/**
 * completed-work-steal.js — Steal GitHub Universe 2026 "From idea to completed
 * software" vision. Builds a single pane of glass that answers:
 *
 *   "What work is ACTUALLY complete (shipped + verified) vs. in progress vs.
 *    blocked, and WHY is it blocked?"
 *
 * Aggregates from four sources this fleet already produces but never unifies:
 *
 *   1. plan.md §1 Task Board  — in_progress / blocked / released rows
 *   2. GitHub PR state        — open PRs, mergeable, check rollup
 *   3. GitHub check-runs      — per-PR CI status (verify, unit, E2E, funnel)
 *   4. Unresolved review threads — pr-review-threads.js logic (GraphQL)
 *
 * Output: a structured report that ranks items by blocker type and names the
 * exact root cause (e.g. "verify CI failing on critical next advisory").
 *
 * Usage:
 *   node tools/completed-work-steal.js                      # human report
 *   node tools/completed-work-steal.js --json              # machine readable
 *   node tools/completed-work-steal.js --plan ./plan.md    # custom plan.md path
 *   node tools/completed-work-steal.js --blocking-only     # only blocked items
 *   node tools/completed-work-steal.js --pr 2206           # inspect one PR
 *
 * No provider/API key needed. Uses `gh` CLI (authenticated via gh auth status).
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const OWNER = process.env.PR_THREADS_OWNER || 'IgorGanapolsky';
const REPO = process.env.PR_THREADS_REPO || 'mac-yolo-safeguards';
const DEFAULT_PLAN = path.join(process.cwd(), 'plan.md');

// ─── plan.md parsing ──────────────────────────────────────────────────────

/**
 * Parse the plan.md Task Board table (§1) into task objects.
 * Rows look like:
 * | T-FOO-ID | title | status | agent | files | evidence |
 *
 * Lines starting with `|` inside the Task Board section (between "## 1. Task Board"
 * and the next `## ` header) are table rows.
 */
function parsePlan(planPath) {
  if (!fs.existsSync(planPath)) {
    return { tasks: [], error: `plan.md not found at ${planPath}` };
  }
  const content = fs.readFileSync(planPath, 'utf8');

  // Find the Task Board section
  const boardStart = content.indexOf('## 1. Task Board');
  const nextHeader = content.indexOf('\n## ', boardStart + 1);
  const boardSection = content.slice(boardStart, nextHeader === -1 ? content.length : nextHeader);

  const lines = boardSection.split('\n');
  const tasks = [];

  for (const line of lines) {
    if (!line.startsWith('|')) continue;
    // Skip header separator (|---|---|...)
    if (line.includes('---')) continue;
    // Skip blank separator lines (consecutive table rows separated by blank lines)
    if (line.trim() === '| |' || line.trim() === '|') continue;

    // Parse: | cell1 | cell2 | cell3 | cell4 | cell5 | cell6 |
    const raw = line.trim();
    if (!raw.startsWith('|')) continue;
    const parts = raw.slice(1, -1).split('|').map((c) => c.trim());

    if (parts.length < 6) continue;

    const [id, title, status, agent, files, evidence] = parts;

    // Skip if id doesn't look like a task ID (T-...) — that's a header row
    if (!id.startsWith('T-') && !id.startsWith('—')) continue;

    // Extract PR number from evidence if present
    const prMatch = (evidence || '').match(/PR\s*#(\d+)/i);
    const mergedMatch = (evidence || '').match(/merged as `([a-f0-9]+)`/i);

    // Check if it's a released/done task
    const isReleased = status.toLowerCase().includes('released') ||
                       status.toLowerCase().includes('done') ||
                       (evidence || '').toLowerCase().includes('released') ||
                       (evidence || '').toLowerCase().includes('merged');

    tasks.push({
      id: id.trim(),
      title: title.trim(),
      status: status.trim(),
      agent: agent.trim(),
      files: files.trim(),
      evidence: (evidence || '').trim(),
      prNumber: prMatch ? parseInt(prMatch[1], 10) : null,
      isReleased,
      isBlocked: status.toLowerCase().includes('blocked'),
    });
  }

  return { tasks, error: null };
}

// ─── GitHub queries via gh CLI ────────────────────────────────────────────

/**
 * Query GitHub for open PRs targeting base=main.
 * Returns compact objects: number, title, state, mergeable, mergeStateStatus,
 * headRefName, statusCheckRollup (SUCCESS/FAILURE/PENDING/None).
 */
/**
 * Fetch failed + pending check names for a single PR via check-runs API.
 * Silently returns empty arrays on 404 (PR may not have check runs yet).
 * Returns { failed: string[], pending: string[] }.
 */
function getCheckDetailsSafe(prNumber) {
  try {
    const result = execFileSync('gh', [
      'api',
      `repos/${OWNER}/${REPO}/pulls/${prNumber}/check-runs`,
      '--jq', '.check_runs[] | "\(.name)\t\(.status)\t\(.conclusion)"',
    ], { encoding: 'utf8', maxBuffer: 5 * 1024 * 1024, stdio: ['pipe', 'pipe', 'ignore'] });

    const failed = [];
    const pending = [];
    for (const line of result.trim().split('\n')) {
      if (!line.trim()) continue;
      const [name, status, conclusion] = line.split('\t');
      if (status === 'completed' && conclusion === 'failure') {
        failed.push(name);
      } else if (status === 'in_progress' || status === 'queued') {
        pending.push(name);
      }
    }
    return { failed, pending };
  } catch {
    return { failed: [], pending: [] };
  }
}

/**
 * Query GitHub for open PRs targeting base=main.
 * Returns compact objects with check rollup from `gh pr list`.
 */
function getOpenPRs() {
  // Use gh pr list with statusCheckRollup field — works without GraphQL schema issues
  const result = execFileSync('gh', [
    'pr', 'list',
    '--state', 'open',
    '--limit', '30',
    '--json', 'number,title,mergeable,mergeStateStatus,headRefName,statusCheckRollup',
  ], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });

  const prs = JSON.parse(result);

  return prs.map((pr) => {
    const rollup = pr.statusCheckRollup || {};
    const state = rollup.state || 'NONE';
    const details = getCheckDetailsSafe(pr.number);

    return {
      number: pr.number,
      title: pr.title,
      mergeable: pr.mergeable,
      mergeStateStatus: pr.mergeStateStatus,
      headRefName: pr.headRefName,
      checkState: state,
      failedChecks: details.failed,
      pendingChecks: details.pending,
    };
  });
}

/**
 * Fetch unresolved review threads for a single PR via GraphQL.
 * Follows the same pagination pattern as pr-review-threads.js fetchRow:
 * page through ALL threads so a truncated page never reports a PR as clear.
 *
 * Returns { count, threads: [{ path, author, severity, summary }] } or null
 * if there are no unresolved threads.
 */
function fetchReviewThreads(prNumber) {
  let after = null;
  const nodes = [];

  for (;;) {
    const cursor = after ? ', after:"' + after + '"' : '';
    const query =
      '{ repository(owner:"' + OWNER + '", name:"' + REPO + '") {' +
      ' pullRequest(number:' + prNumber + ') {' +
      ' number title mergeStateStatus' +
      ' reviewThreads(first:100' + cursor + '){' +
      ' pageInfo { hasNextPage endCursor }' +
      ' nodes {' +
      ' id isResolved isOutdated path' +
      ' comments(first:1){ nodes { author { login } body } }' +
      ' } } } } }';

    const result = execFileSync('gh', [
      'api', 'graphql', '-f', 'query=' + query,
    ], { encoding: 'utf8', maxBuffer: 10 * 1024 * 1024 });

    const parsed = JSON.parse(result);
    const pr = parsed.data?.repository?.pullRequest;
    if (!pr) return null;

    const pageNodes = (pr.reviewThreads && pr.reviewThreads.nodes) || [];
    nodes.push(...pageNodes);

    const info = pr.reviewThreads.pageInfo || {};
    if (!info.hasNextPage) break;
    if (!info.endCursor) {
      // No cursor but has next page — stop to avoid infinite loop
      break;
    }
    after = info.endCursor;
  }

  const unresolved = nodes.filter((t) => !t.isResolved);
  if (unresolved.length === 0) return null;

  return {
    count: unresolved.length,
    threads: unresolved.map((t) => {
      const first = (t.comments && t.comments.nodes && t.comments.nodes[0]) || {};
      return {
        path: t.path || null,
        author: (first.author && first.author.login) || 'unknown',
        severity: extractSeverity(first.body),
        summary: summarize(first.body),
      };
    }),
  };
}

/**
 * Get unresolved review threads for all open PRs.
 * Returns Map<PR number, { count, threads: [...] }>.
 */
function getReviewThreads(prNumbers) {
  const threadMap = new Map();
  for (const num of prNumbers) {
    try {
      const info = fetchReviewThreads(num);
      if (info) threadMap.set(num, info);
    } catch (err) {
      // One PR failing shouldn't break the whole report
      process.stderr.write(`  warning: could not fetch threads for PR #${num}: ${err.message}\n`);
    }
  }
  return threadMap;
}

function extractSeverity(body) {
  const match = /!\[(P\d)\s+Badge\]/.exec(body || '');
  return match ? match[1] : 'none';
}

function summarize(body, max = 90) {
  const text = String(body || '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/<\/?sub>/g, '')
    .replace(/\*\*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > max ? text.slice(0, max - 1) + '…' : text;
}

// ─── Cross-referencing / synthesis ───────────────────────────────────────

/**
 * Match plan.md tasks to GitHub PRs using PR numbers mentioned in evidence.
 */
function crossReference(tasks, prs, threads) {
  const prByNumber = new Map(prs.map((p) => [p.number, p]));
  const threadCounts = new Map();
  for (const [num, info] of threads) threadCounts.set(num, info.count);

  const result = [];
  for (const task of tasks) {
    if (task.isReleased) continue; // skip completed/released

    let pr = null;
    if (task.prNumber && prByNumber.has(task.prNumber)) {
      pr = prByNumber.get(task.prNumber);
    }

    // If no PR number in plan.md, try to find by branch name in evidence
    if (!pr && task.evidence) {
      const branchMatch = task.evidence.match(/PR\s*#(\d+)/i);
      if (branchMatch) {
        const num = parseInt(branchMatch[1], 10);
        if (prByNumber.has(num)) pr = prByNumber.get(num);
      }
    }

    const threadInfo = task.prNumber ? threads.get(task.prNumber) : null;
    const threadCount = threadInfo ? threadInfo.count : 0;

    const blockers = [];
    if (pr) {
      if (pr.checkState === 'FAILURE') {
        blockers.push(`CI failing: ${pr.failedChecks.join(', ') || 'unknown check(s)'}`);
      }
      if (pr.checkState === 'PENDING' && pr.pendingChecks.length > 0) {
        blockers.push(`CI pending: ${pr.pendingChecks.join(', ') || 'unknown check(s)'}`);
      }
      if (threadCount > 0) {
        blockers.push(`Unresolved review threads: ${threadCount} (${threadInfo.threads.map((t) => t.severity).join(', ')})`);
      }
      if (pr.mergeStateStatus === 'BEHIND') {
        blockers.push('Branch is behind base — needs rebase');
      }
      if (!pr.mergeable) {
        blockers.push('Merge conflicts detected');
      }
      if (pr.mergeStateStatus === 'DIRTY') {
        blockers.push('Unclean merge state — check conflicts');
      }
    } else {
      blockers.push('No associated GitHub PR found — task is in_progress without a PR');
    }

    // Determine blocker severity
    let blockerType = 'unblocked';
    if (blockers.length > 0) {
      if (blockers.some((b) => b.includes('Unresolved review'))) {
        blockerType = 'review';
      } else if (blockers.some((b) => b.includes('CI'))) {
        blockerType = 'ci';
      } else if (blockers.some((b) => b.includes('behind') || b.includes('Merge'))) {
        blockerType = 'merge';
      } else if (blockers.some((b) => b.includes('No associated'))) {
        blockerType = 'noPr';
      } else {
        blockerType = 'unblocked';
      }
    }

    result.push({
      task: task.id,
      title: task.title,
      agent: task.agent,
      status: task.status,
      prNumber: task.prNumber,
      prTitle: pr ? pr.title : null,
      checkState: pr ? pr.checkState : null,
      mergeStateStatus: pr ? pr.mergeStateStatus : null,
      mergeable: pr ? pr.mergeable : null,
      unresolvedThreads: threadCount,
      blockers,
      blockerType,
    });
  }

  return result;
}

// ─── Report generation ──────────────────────────────────────────────────

function generateReport(synthesis, options) {
  const blocked = synthesis.filter((s) => s.blockers.length > 0);
  const unblocked = synthesis.filter((s) => s.blockers.length === 0);

  // Group by blocker type
  const byType = {
    ci: blocked.filter((s) => s.blockerType === 'ci'),
    review: blocked.filter((s) => s.blockerType === 'review'),
    merge: blocked.filter((s) => s.blockerType === 'merge'),
    noPr: blocked.filter((s) => s.blockerType === 'noPr'),
    unblocked_in_progress: unblocked,
  };

  const report = {
    generatedAt: new Date().toISOString(),
    summary: {
      totalTasks: synthesis.length,
      inProgress: synthesis.filter((s) => !s.status.toLowerCase().match(/released|done/)).length,
      blocked: blocked.length,
      unblockedInProgress: unblocked.length,
      blockerBreakdown: {
        ci: byType.ci.length,
        review: byType.review.length,
        merge: byType.merge.length,
        noPr: byType.noPr.length,
      },
    },
    blockedItems: blocked,
    unblockedItems: unblocked,
  };

  return report;
}

function printHuman(report) {
  const s = report.summary;
  console.log('═'.repeat(72));
  console.log('  COMPLETED-WORK STEAL — What\'s shipped, in-progress, and blocked');
  console.log('  Stolen from GitHub Universe 2026: "completed work, not more code"');
  console.log('═'.repeat(72));
  console.log(`  Generated: ${report.generatedAt}`);
  console.log(`  Total in-progress tasks: ${s.inProgress}`);
  console.log(`  Blocked: ${s.blocked}  |  Unblocked: ${s.unblockedInProgress}`);
  console.log('═'.repeat(72));

  if (s.blockerBreakdown.ci > 0) {
    console.log(`\n🔴 CI BLOCKED (${s.blockerBreakdown.ci})`);
    for (const item of report.blockedItems.filter((i) => i.blockerType === 'ci')) {
      console.log(`  ${item.task} — ${item.title}`);
      console.log(`    PR #${item.prNumber || '?'} | checks: ${item.checkState}`);
      for (const b of item.blockers) {
        console.log(`    ─ ${b}`);
      }
    }
  }

  if (s.blockerBreakdown.review > 0) {
    console.log(`\n🟠 REVIEW THREAD BLOCKED (${s.blockerBreakdown.review})`);
    for (const item of report.blockedItems.filter((i) => i.blockerType === 'review')) {
      console.log(`  ${item.task} — ${item.title}`);
      console.log(`    PR #${item.prNumber} | ${item.unresolvedThreads} unresolved threads`);
      for (const b of item.blockers) {
        console.log(`    ─ ${b}`);
      }
    }
  }

  if (s.blockerBreakdown.merge > 0) {
    console.log(`\n🟡 MERGE BLOCKED (${s.blockerBreakdown.merge})`);
    for (const item of report.blockedItems.filter((i) => i.blockerType === 'merge')) {
      console.log(`  ${item.task} — ${item.title}`);
      for (const b of item.blockers) console.log(`    ─ ${b}`);
    }
  }

  if (s.blockerBreakdown.merge > 0) {
    console.log(`\n🟡 MERGE BLOCKED (${s.blockerBreakdown.merge})`);
    for (const item of report.blockedItems.filter((i) => i.blockerType === 'merge')) {
      console.log(`  ${item.task} — ${item.title}`);
      for (const b of item.blockers) console.log(`    ─ ${b}`);
    }
  }

  if (s.blockerBreakdown.noPr > 0) {
    console.log(`\n🔵 NO PR (${s.blockerBreakdown.noPr})`);
    for (const item of report.blockedItems.filter((i) => i.blockerType === 'noPr')) {
      console.log(`  ${item.task} — ${item.title}`);
      console.log(`    Agent: ${item.agent}`);
      for (const b of item.blockers) console.log(`    ─ ${b}`);
    }
  }

  if (report.unblockedItems.length > 0) {
    console.log(`\n🟢 UNBLOCKED IN-PROGRESS (${report.unblockedItems.length})`);
    for (const item of report.unblockedItems) {
      console.log(`  ${item.task} — ${item.title}`);
      console.log(`    PR #${item.prNumber || '?'} | checks: ${item.checkState} | merge: ${item.mergeStateStatus}`);
    }
  }

  console.log('\n' + '═'.repeat(72));
}

// ─── Main ─────────────────────────────────────────────────────────────────

function main(argv) {
  const options = {
    plan: DEFAULT_PLAN,
    json: false,
    blockingOnly: false,
    prNumber: null,
  };

  for (let i = 2; i < argv.length; i++) {
    switch (argv[i]) {
      case '--json': options.json = true; break;
      case '--blocking-only': options.blockingOnly = true; break;
      case '--plan': options.plan = argv[++i]; break;
      case '--pr': options.prNumber = parseInt(argv[++i], 10); break;
      case '--help':
      case '-h':
        console.log(`Usage: node tools/completed-work-steal.js [--json] [--blocking-only] [--plan path] [--pr N]`);
        process.exit(0);
    }
  }

  // 1. Parse plan.md
  const { tasks, error: planError } = parsePlan(options.plan);
  if (planError) {
    console.error('ERROR:', planError);
    process.exit(1);
  }

  // 2. Get open PRs with CI status
  let prs = [];
  try {
    prs = getOpenPRs();
  } catch (err) {
    console.error('WARNING: Could not fetch GitHub PRs:', err.message);
    prs = [];
  }

  // 3. Get unresolved review threads
  let threads = new Map();
  try {
    threads = getReviewThreads(prs.map((p) => p.number));
  } catch (err) {
    console.error('WARNING: Could not fetch review threads:', err.message);
  }

  // 4. Cross-reference
  let synthesis = crossReference(tasks, prs, threads);

  if (options.prNumber) {
    const prTask = synthesis.find((s) => s.prNumber === options.prNumber);
    if (!prTask) {
      console.error(`No task associated with PR #${options.prNumber}`);
      // Still show the PR directly
      const pr = prs.find((p) => p.number === options.prNumber);
      if (pr) {
        console.log(JSON.stringify(pr, null, 2));
      } else {
        console.log(`PR #${options.prNumber} not found in open PRs`);
      }
      process.exit(1);
    }
    synthesis = [prTask];
  }

  if (options.blockingOnly) {
    synthesis = synthesis.filter((s) => s.blockers.length > 0);
  }

  // 5. Generate report
  const report = generateReport(synthesis, options);

  if (options.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    printHuman(report);
  }
}

if (require.main === module) {
  main(process.argv);
}

module.exports = {
  parsePlan,
  getOpenPRs,
  getReviewThreads,
  crossReference,
  generateReport,
  extractSeverity,
  summarize,
};
