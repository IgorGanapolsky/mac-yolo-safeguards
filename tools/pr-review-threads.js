#!/usr/bin/env node
'use strict';

/**
 * List UNRESOLVED pull-request review threads.
 *
 * Why this exists: `gh pr view --json reviewThreads` reports 0 threads even
 * when a PR has many. It does not error - it silently returns an empty set, so
 * every agent that trusts it concludes a PR is clear when it is not.
 *
 * That matters here because `main` sets required_conversation_resolution, so a
 * single unresolved thread blocks merge on an otherwise-green PR. Measured
 * 2026-08-25: 15 open PRs, 47 unresolved threads, and NOT ONE of the 12
 * CI-green PRs had a clear thread list. The threads were invisible through the
 * usual tooling, so nobody was clearing them and nothing merged.
 *
 * GraphQL is the only surface that reports them truthfully.
 *
 * Usage:
 *   node tools/pr-review-threads.js                  # all open PRs
 *   node tools/pr-review-threads.js 2028 2057        # specific PRs
 *   node tools/pr-review-threads.js --json           # machine readable
 *   node tools/pr-review-threads.js --blocking-only  # hide PRs already clear
 */

const { execFileSync } = require('child_process');

const OWNER = process.env.PR_THREADS_OWNER || 'IgorGanapolsky';
const REPO = process.env.PR_THREADS_REPO || 'mac-yolo-safeguards';

/** Codex-style review bots prefix bodies with a severity badge. */
function severityOf(body) {
  const match = /!\[(P\d)\s+Badge\]/.exec(body || '');
  return match ? match[1] : 'none';
}

/** First line of a review body, with badge markup and noise stripped. */
function summarize(body, max = 90) {
  const text = String(body || '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/<\/?sub>/g, '')
    .replace(/\*\*/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > max ? text.slice(0, max - 1) + '…' : text;
}

/**
 * Shape one GraphQL pullRequest node into a report row.
 * Pure: no network, so the reporting contract is directly testable.
 */
function toRow(node) {
  const threads = (node.reviewThreads && node.reviewThreads.nodes) || [];
  const unresolved = threads.filter((t) => !t.isResolved);
  const rollupNode = (node.commits && node.commits.nodes && node.commits.nodes[0]) || null;
  const rollup =
    rollupNode && rollupNode.commit && rollupNode.commit.statusCheckRollup
      ? rollupNode.commit.statusCheckRollup.state
      : 'NONE';
  return {
    number: node.number,
    title: node.title,
    mergeStateStatus: node.mergeStateStatus,
    rollup,
    totalThreads: threads.length,
    unresolved: unresolved.map((t) => {
      const first = (t.comments && t.comments.nodes && t.comments.nodes[0]) || {};
      return {
        id: t.id,
        path: t.path || null,
        isOutdated: Boolean(t.isOutdated),
        author: (first.author && first.author.login) || 'unknown',
        severity: severityOf(first.body),
        summary: summarize(first.body),
      };
    }),
  };
}

/**
 * A PR is merge-blocked by conversation resolution when it has unresolved
 * threads. Reported separately from CI so a green-but-blocked PR is obvious -
 * that combination is the one the broken CLI hides.
 */
function isBlockedByThreads(row) {
  return row.unresolved.length > 0;
}

function severityTally(rows) {
  const tally = {};
  for (const row of rows) {
    for (const thread of row.unresolved) {
      tally[thread.severity] = (tally[thread.severity] || 0) + 1;
    }
  }
  return tally;
}

function graphql(query) {
  const out = execFileSync('gh', ['api', 'graphql', '-f', 'query=' + query], {
    encoding: 'utf8',
    maxBuffer: 20 * 1024 * 1024,
  });
  return JSON.parse(out);
}

function openPrNumbers() {
  const out = execFileSync(
    'gh',
    ['pr', 'list', '--state', 'open', '--limit', '200', '--json', 'number'],
    { encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 },
  );
  return JSON.parse(out).map((p) => p.number);
}

/**
 * Read one PR, following thread pagination to the end.
 *
 * The page size is not a display cap: a PR with 101 threads must not report as
 * clear because the 101st was never fetched. This whole tool exists because
 * tooling reported "no threads" when threads existed, so truncating silently
 * here would reproduce the defect it was written to expose.
 */
function fetchRow(number) {
  let after = null;
  let page = null;
  const nodes = [];

  for (;;) {
    const cursor = after ? ', after:"' + after + '"' : '';
    const query =
      '{ repository(owner:"' + OWNER + '", name:"' + REPO + '") {' +
      ' pullRequest(number:' + number + ') {' +
      ' number title mergeStateStatus' +
      ' commits(last:1){ nodes { commit { statusCheckRollup { state } } } }' +
      ' reviewThreads(first:100' + cursor + '){' +
      ' pageInfo { hasNextPage endCursor }' +
      ' nodes {' +
      ' id isResolved isOutdated path' +
      ' comments(first:1){ nodes { author { login } body } }' +
      ' } } } } }';

    const pr = graphql(query).data.repository.pullRequest;
    if (!pr) throw new Error('PR #' + number + ' returned no data');
    page = pr;
    nodes.push(...(pr.reviewThreads.nodes || []));

    const info = pr.reviewThreads.pageInfo || {};
    if (!info.hasNextPage) break;
    if (!info.endCursor) throw new Error('PR #' + number + ' paginated without a cursor');
    after = info.endCursor;
  }

  return toRow({ ...page, reviewThreads: { nodes } });
}

function main(argv) {
  const json = argv.includes('--json');
  const blockingOnly = argv.includes('--blocking-only');
  const explicit = argv.filter((a) => /^\d+$/.test(a)).map(Number);
  const numbers = explicit.length ? explicit : openPrNumbers();

  const rows = [];
  const unreadable = [];
  for (const number of numbers) {
    try {
      rows.push(fetchRow(number));
    } catch (error) {
      // A PR we could not query is UNKNOWN, never clear. Previously this
      // printed a stderr note and dropped the PR from the report, so an
      // expired token turned every PR into "no threads" - the precise
      // false-clear this tool was built to eliminate.
      unreadable.push({ number, reason: (error && error.message) || String(error) });
    }
  }
  rows.sort((a, b) => a.unresolved.length - b.unresolved.length || a.number - b.number);
  const shown = blockingOnly ? rows.filter(isBlockedByThreads) : rows;

  if (json) {
    console.log(
      JSON.stringify(
        { rows: shown, severityTally: severityTally(rows), unreadable },
        null,
        2,
      ),
    );
    return unreadable.length ? 2 : 0;
  }

  console.log('Unresolved review threads - ' + OWNER + '/' + REPO + '\n');
  for (const row of shown) {
    const flag =
      row.rollup === 'SUCCESS' && isBlockedByThreads(row) ? '  <-- GREEN BUT BLOCKED' : '';
    console.log(
      '#' + row.number + '  [' + row.rollup + '/' + row.mergeStateStatus + ']  ' +
        row.unresolved.length + ' unresolved' + flag,
    );
    console.log('   ' + row.title);
    for (const thread of row.unresolved) {
      const stale = thread.isOutdated ? ' (outdated)' : '';
      console.log('   - ' + thread.severity + ' ' + (thread.path || '(no path)') + stale);
      console.log('     ' + thread.summary);
      console.log('     id: ' + thread.id);
    }
    console.log('');
  }

  const blocked = rows.filter(isBlockedByThreads);
  const green = rows.filter((r) => r.rollup === 'SUCCESS');
  const greenBlocked = green.filter(isBlockedByThreads);
  console.log('PRs: ' + rows.length + ' | blocked by threads: ' + blocked.length);
  console.log('CI-green: ' + green.length + ' | CI-green AND thread-blocked: ' + greenBlocked.length);
  console.log('unresolved by severity: ' + JSON.stringify(severityTally(rows)));

  // Loud, and non-zero on exit. An unread PR is UNKNOWN, not clear, and a
  // caller scripting this must be able to tell the difference.
  if (unreadable.length) {
    console.log('\nCOULD NOT READ ' + unreadable.length + ' PR(s) - status UNKNOWN, not clear:');
    for (const item of unreadable) {
      console.log('  #' + item.number + '  ' + item.reason);
    }
    console.log('Re-run after fixing the above before treating any PR as unblocked.');
  }

  console.log('\nResolve one at a time; a joined multi-line id yields NOT_FOUND.');
  return unreadable.length ? 2 : 0;
}

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}

module.exports = { toRow, severityOf, summarize, isBlockedByThreads, severityTally };
