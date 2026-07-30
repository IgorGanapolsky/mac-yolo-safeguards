#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  auditPublishableStoreCopy,
  parseD1JsonOutput,
  summarizeContentLog,
} = require('../tools/hermes-growth-audit');

function makeTempDirectory() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-growth-audit-'));
}

test('publishable copy audit rejects retired packages and obsolete promises', () => {
  const root = makeTempDirectory();
  const ready = path.join(root, 'hermes-mobile/docs/social/ready-to-post');
  fs.mkdirSync(ready, { recursive: true });
  fs.writeFileSync(
    path.join(ready, 'bad.md'),
    [
      'https://play.google.com/store/apps/details?id=com.iganapolsky.hermesmobile',
      'Free for 10 approvals/week, then $19.99/mo.',
      'iOS is still in review.',
    ].join('\n'),
  );

  const result = auditPublishableStoreCopy(root);

  assert.equal(result.status, 'fail');
  assert.equal(result.filesScanned, 1);
  assert.deepEqual(
    result.findings.map((finding) => finding.rule).sort(),
    ['obsolete-ios-review-state', 'obsolete-subscription-copy', 'retired-play-package'],
  );
});

test('publishable copy audit accepts attributed store routes and ignores receipts', () => {
  const root = makeTempDirectory();
  const social = path.join(root, 'hermes-mobile/docs/social');
  const ready = path.join(social, 'ready-to-post');
  fs.mkdirSync(ready, { recursive: true });
  fs.writeFileSync(
    path.join(ready, 'good.md'),
    'Install for $4.99: https://thumbgate.app/go/android?utm_source=x&utm_medium=social&utm_campaign=launch&cta_id=x_a\n',
  );
  fs.writeFileSync(
    path.join(social, 'PUBLISHED.md'),
    'Historical receipt: https://play.google.com/store/apps/details?id=com.iganapolsky.hermesmobile\n',
  );

  const result = auditPublishableStoreCopy(root);

  assert.deepEqual(result, {
    status: 'pass',
    filesScanned: 1,
    findings: [],
  });
});

test('content log summary keeps provider-visible and draft states separate', () => {
  const root = makeTempDirectory();
  const logPath = path.join(root, 'content.tsv');
  fs.writeFileSync(
    logPath,
    [
      'Date\tPlatform\tCampaign\tStatus\tPostURL',
      '2026-07-30\tLinkedIn\tlaunch\tPublished\thttps://example.com/post',
      '2026-07-30\tX\tlaunch\tDrafted\t—',
      '2026-07-30\tReddit\tlaunch\tBlocked\t—',
      '2026-07-30\tdev.to\tlaunch\tPublished\t—',
    ].join('\n'),
  );

  assert.deepEqual(summarizeContentLog(logPath), {
    totalRows: 4,
    statusCounts: {
      blocked: 1,
      drafted: 1,
      published: 2,
    },
    publishedWithReceipt: 1,
    publishedWithoutReceipt: 1,
  });
});

test('D1 output parser extracts the final Wrangler JSON payload', () => {
  const stdout = [
    ' ⛅️ wrangler 4.112.0',
    'Executed 1 command in 0.42ms',
    JSON.stringify([
      {
        results: [
          { day: '2026-07-30', event: 'play_store_click', count: 3 },
        ],
        success: true,
      },
    ]),
  ].join('\n');

  assert.deepEqual(parseD1JsonOutput(stdout), [
    {
      results: [
        { day: '2026-07-30', event: 'play_store_click', count: 3 },
      ],
      success: true,
    },
  ]);
});
