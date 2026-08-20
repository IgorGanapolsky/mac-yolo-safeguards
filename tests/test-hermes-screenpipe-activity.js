'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  classifyActivity,
  buildActivityTimeline,
  recallActivity,
  authorizeEgress,
  packActivityForHarness,
} = require('../tools/hermes-screenpipe-activity');

test('classifyActivity maps meeting/break/task bands', () => {
  assert.equal(classifyActivity({ type: 'note', detail: 'Zoom standup with team' }), 'meeting');
  assert.equal(classifyActivity({ type: 'note', detail: 'lunch break AFK' }), 'break');
  assert.equal(classifyActivity({ type: 'git_commit', detail: 'fix dashboard scroll' }), 'task');
  assert.equal(classifyActivity({ type: 'misc', detail: 'weather check' }), 'other');
});

test('buildActivityTimeline filters by since window and counts bands', () => {
  const now = new Date('2026-08-20T12:00:00Z');
  const events = [
    { id: '1', type: 'git_commit', detail: 'ship fix', timestamp: '2026-08-20T11:00:00Z' },
    { id: '2', type: 'note', detail: 'calendar sync meeting', timestamp: '2026-08-20T10:00:00Z' },
    { id: '3', type: 'note', detail: 'old', timestamp: '2026-08-01T10:00:00Z' },
  ];
  const timeline = buildActivityTimeline(events, { sinceMs: 24 * 60 * 60 * 1000, now });
  assert.equal(timeline.entryCount, 2);
  assert.equal(timeline.counts.task, 1);
  assert.equal(timeline.counts.meeting, 1);
});

test('recallActivity filters by query', () => {
  const timeline = buildActivityTimeline(
    [
      { id: '1', type: 'file_edit', detail: 'DashboardClient.tsx', timestamp: '2026-08-20T11:00:00Z' },
      { id: '2', type: 'git_commit', detail: 'island steal', timestamp: '2026-08-20T11:30:00Z' },
    ],
    { sinceMs: 48 * 60 * 60 * 1000, now: new Date('2026-08-20T12:00:00Z') },
  );
  const hit = recallActivity(timeline, 'island');
  assert.equal(hit.matchCount, 1);
  assert.match(hit.matches[0].detail, /island/i);
});

test('authorizeEgress fail-closed for cloud without --egress-ok', () => {
  const hold = authorizeEgress({ destination: 'cursor', egressOk: false });
  assert.equal(hold.allowed, false);
  assert.equal(hold.kind, 'hold_egress');

  const local = authorizeEgress({ destination: 'ollama', egressOk: false });
  assert.equal(local.allowed, true);
  assert.equal(local.kind, 'local_only');

  const yes = authorizeEgress({ destination: 'claude-code', egressOk: true });
  assert.equal(yes.allowed, true);
  assert.equal(yes.kind, 'say_yes_egress');
  assert.match(yes.framing, /Say yes/i);
});

test('packActivityForHarness requires egress-ok for cloud harness', () => {
  const timeline = buildActivityTimeline(
    [{ id: '1', type: 'test_run', detail: 'npm test', timestamp: '2026-08-20T11:00:00Z' }],
    { sinceMs: 24 * 60 * 60 * 1000, now: new Date('2026-08-20T12:00:00Z') },
  );
  const blocked = packActivityForHarness(timeline, { harness: 'cursor', egressOk: false });
  assert.equal(blocked.allowed, false);

  const packed = packActivityForHarness(timeline, {
    harness: 'grok',
    egressOk: true,
    distill: true,
  });
  assert.equal(packed.allowed, true);
  assert.ok(packed.envelope.id);
  assert.ok(packed.distilled.name);
});

test('pack to hermes-yolo is local without egress-ok', () => {
  const timeline = buildActivityTimeline(
    [{ id: '1', type: 'file_edit', detail: 'tools/x.js', timestamp: '2026-08-20T11:00:00Z' }],
    { sinceMs: 24 * 60 * 60 * 1000, now: new Date('2026-08-20T12:00:00Z') },
  );
  const packed = packActivityForHarness(timeline, { harness: 'hermes-yolo', egressOk: false });
  assert.equal(packed.allowed, true);
  assert.equal(packed.egress.kind, 'local_only');
});
