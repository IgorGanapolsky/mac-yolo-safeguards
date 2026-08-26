#!/usr/bin/env node
'use strict';

/**
 * Pins the reporting contract of tools/pr-review-threads.js.
 *
 * The regression this guards is the one that created a 47-thread backlog:
 * reporting a thread-blocked PR as clear. `gh pr view --json reviewThreads`
 * does that silently today, which is why the tool exists at all.
 */

const assert = require('assert');
const {
  toRow,
  severityOf,
  summarize,
  isBlockedByThreads,
  severityTally,
} = require('../tools/pr-review-threads');

let passed = 0;
function ok(name) {
  passed += 1;
  console.log(`ok  ${passed}  ${name}`);
}

const badge = (p) => `**<sub><sub>![${p} Badge](https://img.shields.io/badge/${p}-orange)</sub></sub>  Remove the inactive workaround**  Details follow.`;

function node(overrides = {}) {
  return {
    number: 2049,
    title: 'fix(lint): something',
    mergeStateStatus: 'BLOCKED',
    commits: { nodes: [{ commit: { statusCheckRollup: { state: 'SUCCESS' } } }] },
    reviewThreads: { nodes: [] },
    ...overrides,
  };
}

const thread = (isResolved, body, extra = {}) => ({
  id: 'PRRT_' + (extra.id || '1'),
  isResolved,
  isOutdated: Boolean(extra.isOutdated),
  path: extra.path || 'apps/x/y.ts',
  comments: { nodes: [{ author: { login: 'chatgpt-codex-connector' }, body }] },
});

// --- 1. The core regression: an unresolved thread is never reported as clear ---
{
  const row = toRow(node({ reviewThreads: { nodes: [thread(false, badge('P1'))] } }));
  assert.equal(row.unresolved.length, 1, 'unresolved thread must be reported');
  assert.equal(isBlockedByThreads(row), true, 'a PR with an open thread is blocked');
  ok('an unresolved thread is never reported as clear');
}

// --- 2. The exact combination gh hides: green CI plus open threads ---
{
  const row = toRow(node({ reviewThreads: { nodes: [thread(false, badge('P1'))] } }));
  assert.equal(row.rollup, 'SUCCESS', 'CI is green');
  assert.equal(isBlockedByThreads(row), true, 'yet the PR is still blocked');
  ok('a CI-green PR with open threads is reported blocked, not mergeable');
}

// --- 3. Resolved threads do not count against merge ---
{
  const row = toRow(node({
    reviewThreads: { nodes: [thread(true, badge('P1')), thread(true, badge('P2'), { id: '2' })] },
  }));
  assert.equal(row.totalThreads, 2, 'both threads are counted in the total');
  assert.equal(row.unresolved.length, 0, 'neither is unresolved');
  assert.equal(isBlockedByThreads(row), false, 'fully resolved PR is not blocked');
  ok('resolved threads do not block');
}

// --- 4. Mixed state reports only the open ones ---
{
  const row = toRow(node({
    reviewThreads: {
      nodes: [thread(true, badge('P1')), thread(false, badge('P2'), { id: '2' }), thread(false, badge('P3'), { id: '3' })],
    },
  }));
  assert.equal(row.totalThreads, 3);
  assert.deepEqual(row.unresolved.map((t) => t.severity), ['P2', 'P3']);
  ok('mixed threads report only the unresolved ones, in order');
}

// --- 5. Severity parsing, including the no-badge case ---
{
  assert.equal(severityOf(badge('P1')), 'P1');
  assert.equal(severityOf(badge('P3')), 'P3');
  assert.equal(severityOf('a plain human comment'), 'none');
  assert.equal(severityOf(undefined), 'none');
  ok('severity is parsed from the badge, and absent badges are not invented');
}

// --- 6. Summaries strip markup rather than leaking image markdown ---
{
  const text = summarize(badge('P1'));
  assert.ok(!text.includes('!['), 'image markdown removed');
  assert.ok(!text.includes('**'), 'bold markers removed');
  assert.ok(!text.includes('<sub>'), 'html removed');
  assert.ok(text.includes('Remove the inactive workaround'), 'the actual finding survives');
  ok('summary strips badge markup and keeps the finding');
}

// --- 7. Long bodies are truncated to a bounded width ---
{
  const long = summarize('x'.repeat(500), 90);
  assert.equal(long.length, 90, 'bounded to the requested width');
  assert.ok(long.endsWith('…'), 'truncation is visible, not silent');
  ok('long review bodies truncate visibly');
}

// --- 8. A PR with no rollup is reported NONE, not crashed on ---
{
  const row = toRow(node({ commits: { nodes: [] } }));
  assert.equal(row.rollup, 'NONE');
  assert.equal(isBlockedByThreads(row), false);
  ok('missing status rollup degrades to NONE rather than throwing');
}

// --- 9. Malformed nodes do not throw ---
{
  const row = toRow({ number: 1, title: 't', mergeStateStatus: 'UNKNOWN' });
  assert.equal(row.totalThreads, 0);
  assert.deepEqual(row.unresolved, []);
  ok('a node with no threads or commits is handled without throwing');
}

// --- 10. Tally counts unresolved severities across PRs ---
{
  const rows = [
    toRow(node({ reviewThreads: { nodes: [thread(false, badge('P1')), thread(false, badge('P1'), { id: '2' })] } })),
    toRow(node({ reviewThreads: { nodes: [thread(false, badge('P2')), thread(true, badge('P1'), { id: '3' })] } })),
  ];
  assert.deepEqual(severityTally(rows), { P1: 2, P2: 1 }, 'resolved P1 is excluded');
  ok('severity tally counts only unresolved threads across PRs');
}

// --- 11. Outdated threads are surfaced, not hidden ---
{
  const row = toRow(node({
    reviewThreads: { nodes: [thread(false, badge('P2'), { isOutdated: true })] },
  }));
  assert.equal(row.unresolved.length, 1, 'an outdated thread still blocks merge');
  assert.equal(row.unresolved[0].isOutdated, true, 'and is labelled so it can be triaged');
  ok('outdated-but-unresolved threads are surfaced and labelled');
}

// --- 12. Thread ids are preserved verbatim for the resolve mutation ---
{
  const row = toRow(node({ reviewThreads: { nodes: [thread(false, badge('P1'), { id: 'abc123' })] } }));
  assert.equal(row.unresolved[0].id, 'PRRT_abc123', 'id passes through unmodified');
  ok('thread ids survive intact for the one-id-per-call resolve mutation');
}

console.log(`\n1..${passed}`);
console.log(`All ${passed} pr-review-threads assertions passed.`);
