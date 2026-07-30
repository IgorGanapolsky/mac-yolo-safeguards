#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');

const {
  auditExperimentProof,
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
    [
      'obsolete-ios-review-state',
      'obsolete-subscription-copy',
      'retired-play-package',
      'unattributed-direct-store-link',
    ],
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

test('publishable copy audit recursively checks reusable weekly draft directories', () => {
  const root = makeTempDirectory();
  const week = path.join(
    root,
    'hermes-mobile/docs/social/week-2026-07-10/nested',
  );
  fs.mkdirSync(week, { recursive: true });
  fs.writeFileSync(
    path.join(week, 'stale.md'),
    'Play: https://play.google.com/store/apps/details?id=com.iganapolsky.hermesmobile\n',
  );

  const result = auditPublishableStoreCopy(root);

  assert.equal(result.status, 'fail');
  assert.equal(result.filesScanned, 1);
  assert.equal(result.findings[0]?.rule, 'retired-play-package');
  assert.equal(
    result.findings[0]?.file,
    'hermes-mobile/docs/social/week-2026-07-10/nested/stale.md',
  );
});

test('publishable copy audit rejects positive legacy free-tier and pending-iOS slogans', () => {
  const root = makeTempDirectory();
  const ready = path.join(root, 'hermes-mobile/docs/social/ready-to-post');
  fs.mkdirSync(ready, { recursive: true });
  fs.writeFileSync(
    path.join(ready, 'legacy-free.md'),
    'Hermes Mobile has an honest free tier. Free chat and free pairing are included.\n',
  );
  fs.writeFileSync(
    path.join(ready, 'pending-ios.md'),
    'Android demo live; iOS when App Store approves.\n',
  );
  fs.writeFileSync(
    path.join(ready, 'honesty-check.md'),
    'Do not claim a free tier, monthly mobile subscription, or pending iOS state.\n',
  );

  const result = auditPublishableStoreCopy(root);

  assert.equal(result.status, 'fail');
  assert.equal(result.filesScanned, 3);
  assert.deepEqual(
    result.findings.map((finding) => finding.rule).sort(),
    ['obsolete-ios-review-state', 'obsolete-subscription-copy'],
  );
});

test('publishable copy audit requires complete and platform-consistent campaign links', () => {
  const root = makeTempDirectory();
  const week = path.join(
    root,
    'hermes-mobile/docs/social/week-2026-07-10',
  );
  fs.mkdirSync(week, { recursive: true });
  fs.writeFileSync(
    path.join(week, 'mixed.md'),
    [
      '## X (short)',
      'https://thumbgate.app/go/android?utm_source=medium&utm_medium=organic&utm_campaign=launch&cta_id=x_play',
      'https://thumbgate.app/go/ios?utm_source=x&utm_medium=organic&utm_campaign=launch&cta_id=medium_play',
      '## LinkedIn',
      'https://thumbgate.app/go/ios?utm_source=linkedin&utm_medium=organic&utm_campaign=launch',
      '## Reddit',
      'https://play.google.com/store/apps/details?id=com.iganapolsky.hermesmobile.paid',
    ].join('\n'),
  );

  const result = auditPublishableStoreCopy(root);

  assert.equal(result.status, 'fail');
  assert.deepEqual(
    result.findings.map((finding) => finding.rule).sort(),
    [
      'incomplete-campaign-attribution',
      'platform-mismatched-attribution',
      'platform-mismatched-attribution',
      'unattributed-direct-store-link',
    ],
  );
});

test('store experiment proof requires independent active receipts for both stores', () => {
  const now = Date.parse('2026-07-30T20:00:00Z');
  const root = makeTempDirectory();
  const proofs = path.join(
    root,
    'hermes-mobile/docs/proofs/store-experiments',
  );
  fs.mkdirSync(proofs, { recursive: true });
  fs.writeFileSync(
    path.join(proofs, 'play.json'),
    JSON.stringify({
      provider: 'google-play',
      packageName: 'com.iganapolsky.hermesmobile.paid',
      experimentId: 'play-exp-1',
      status: 'active',
      capturedAt: '2026-07-30T19:00:00Z',
    }),
  );

  const playOnly = auditExperimentProof(root, now);
  assert.equal(playOnly.status, 'unverified');
  assert.equal(playOnly.providers.googlePlay.status, 'pass');
  assert.equal(playOnly.providers.appStore.status, 'unverified');

  fs.writeFileSync(
    path.join(proofs, 'apple.json'),
    JSON.stringify({
      provider: 'app-store',
      appleAppId: '6786778037',
      experimentId: 'apple-exp-1',
      status: 'running',
      capturedAt: '2026-07-30T19:05:00Z',
    }),
  );

  const both = auditExperimentProof(root, now);
  assert.equal(both.status, 'pass');
  assert.equal(both.activeExperimentCount, 2);
  assert.equal(both.providers.googlePlay.activeExperimentCount, 1);
  assert.equal(both.providers.appStore.activeExperimentCount, 1);
});

test('store experiment proof rejects stale and provider-mismatched receipts', () => {
  const now = Date.parse('2026-07-30T20:00:00Z');
  const root = makeTempDirectory();
  const proofs = path.join(
    root,
    'hermes-mobile/docs/proofs/store-experiments',
  );
  fs.mkdirSync(proofs, { recursive: true });
  fs.writeFileSync(
    path.join(proofs, 'stale-play.json'),
    JSON.stringify({
      provider: 'google-play',
      packageName: 'com.iganapolsky.hermesmobile.paid',
      experimentId: 'stale-play',
      status: 'active',
      capturedAt: '2026-07-20T20:00:00Z',
    }),
  );
  fs.writeFileSync(
    path.join(proofs, 'wrong-provider.json'),
    JSON.stringify({
      provider: 'unknown',
      appleAppId: '6786778037',
      experimentId: 'unknown-apple',
      status: 'active',
      capturedAt: '2026-07-30T19:00:00Z',
    }),
  );

  const result = auditExperimentProof(root, now);

  assert.equal(result.status, 'unverified');
  assert.equal(result.activeExperimentCount, 0);
  assert.equal(result.providers.googlePlay.status, 'unverified');
  assert.equal(result.providers.appStore.status, 'unverified');
  assert.deepEqual(
    result.rejected.map((receipt) => receipt.reason).sort(),
    ['provider-mismatch', 'stale-or-invalid-captured-at'],
  );
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
