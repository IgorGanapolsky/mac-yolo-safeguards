'use strict';

const assert = require('assert');
const {
  commentCount,
  findDuplicates,
  keywordHits,
  retrieveRag,
  scoreItem,
} = require('../tools/hermes-contribution-opportunities');

const issue = {
  number: 40691,
  kind: 'issue',
  title: '[BUG] Telegram Gateway freezes after polling conflict recovery',
  labels: [{ name: 'type/bug' }, { name: 'comp/gateway' }, { name: 'platform/telegram' }, { name: 'P1' }],
  createdAt: '2026-06-06T00:00:00Z',
  updatedAt: '2026-06-15T00:00:00Z',
  comments: 0,
  url: 'https://github.com/NousResearch/hermes-agent/issues/40691',
};

const emptyBugTitle = {
  number: 47166,
  kind: 'issue',
  title: '[Bug]:',
  labels: [{ name: 'type/bug' }, { name: 'comp/gateway' }],
  createdAt: '2026-06-15T00:00:00Z',
  updatedAt: '2026-06-15T00:00:00Z',
  comments: [],
  url: 'https://github.com/NousResearch/hermes-agent/issues/47166',
};

const duplicatePr = {
  number: 29326,
  kind: 'pr',
  title: 'fix(telegram): isolate getUpdates polling transport',
  labels: [{ name: 'type/bug' }, { name: 'comp/gateway' }, { name: 'platform/telegram' }, { name: 'P2' }],
  createdAt: '2026-05-20T00:00:00Z',
  updatedAt: '2026-06-15T00:00:00Z',
  comments: 1,
  isDraft: false,
  mergeable: 'MERGEABLE',
  url: 'https://github.com/NousResearch/hermes-agent/pull/29326',
};

const duplicateDraft = {
  ...duplicatePr,
  number: 46996,
  title: 'fix(telegram): isolate getUpdates polling transport',
  isDraft: true,
  url: 'https://github.com/NousResearch/hermes-agent/pull/46996',
};

const docsIssue = {
  number: 50000,
  kind: 'issue',
  title: 'Improve README wording',
  labels: [{ name: 'documentation' }],
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-02T00:00:00Z',
  comments: 9,
  url: 'https://github.com/NousResearch/hermes-agent/issues/50000',
};

const rag = [
  {
    timestamp: '2026-06-15T00:00:00Z',
    title: 'macOS Telegram conflict reproduction',
    tags: ['telegram', 'gateway', 'polling', 'conflict'],
    text: 'single launchd gateway process, webhook empty, raw getUpdates returned 409 after shutdown',
    url: 'local-rag://telegram-conflict',
  },
];

assert.deepStrictEqual(keywordHits(issue).slice(0, 3), ['telegram', 'gateway', 'polling']);

const duplicates = findDuplicates(duplicateDraft, [issue, duplicatePr, duplicateDraft, docsIssue]);
assert.strictEqual(duplicates[0].number, 29326);
assert.ok(duplicates[0].similarity >= 0.99);
assert.deepStrictEqual(findDuplicates(issue, [issue, emptyBugTitle]), []);
assert.strictEqual(commentCount({ comments: [{ id: 1 }, { id: 2 }] }), 2);
assert.strictEqual(commentCount({ comments: 7 }), 7);

const ragHits = retrieveRag(issue, rag);
assert.strictEqual(ragHits.length, 1);
assert.strictEqual(ragHits[0].record.url, 'local-rag://telegram-conflict');

const scoredIssue = scoreItem(issue, [issue, duplicatePr, duplicateDraft, docsIssue], rag, new Date('2026-06-16T00:00:00Z'));
const scoredDocs = scoreItem(docsIssue, [issue, duplicatePr, duplicateDraft, docsIssue], rag, new Date('2026-06-16T00:00:00Z'));
assert.ok(scoredIssue.score > scoredDocs.score, `expected Telegram P1 score ${scoredIssue.score} > docs score ${scoredDocs.score}`);
assert.ok(scoredIssue.recommendation.includes('diagnostic matrix'));

const scoredDuplicate = scoreItem(duplicateDraft, [issue, duplicatePr, duplicateDraft, docsIssue], rag, new Date('2026-06-16T00:00:00Z'));
assert.ok(scoredDuplicate.recommendation.includes('Consolidate evidence'));

console.log('Hermes contribution opportunity scoring tests: PASS');
