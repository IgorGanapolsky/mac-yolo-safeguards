#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SCRIPT = path.join(ROOT, 'tools', 'social-campaign-ds.js');
const {
  buildScoreboard,
  parseContentLog,
  isLiveStatus,
} = require(SCRIPT);

function test(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
}

test('CLI --help exits 0', () => {
  const res = spawnSync(process.execPath, [SCRIPT, '--help'], { encoding: 'utf8' });
  assert.strictEqual(res.status, 0, res.stderr);
  assert.ok(res.stdout.includes('social-campaign-ds'));
});

test('isLiveStatus', () => {
  assert.ok(isLiveStatus('Published'));
  assert.ok(!isLiveStatus('Drafted'));
});

test('buildScoreboard ranks winner with enough attribution', () => {
  const contentRows = [
    {
      date: '2026-07-25',
      platform: 'LinkedIn',
      hook: 'Install is step 0',
      campaign: 'evidence-installs-v1-20260725',
      status: 'Published',
      postUrl: 'https://linkedin.com/x',
      outcome: 'ok',
    },
    {
      date: '2026-07-25',
      platform: 'X',
      hook: 'Other hook',
      campaign: 'other-campaign',
      status: 'Published',
      postUrl: 'https://x.com/y',
      outcome: 'ok',
    },
  ];
  const attributionRows = [
    {
      event: 'landing_view',
      utmCampaign: 'evidence-installs-v1-20260725',
      utmSource: 'linkedin',
      count: 12,
    },
    {
      event: 'play_store_click',
      utmCampaign: 'evidence-installs-v1-20260725',
      count: 4,
    },
    {
      event: 'landing_view',
      utmCampaign: 'other-campaign',
      count: 6,
    },
    {
      event: 'sign_in_click',
      utmCampaign: 'other-campaign',
      count: 1,
    },
  ];
  const report = buildScoreboard({
    contentRows,
    attributionRows,
    lookbackDays: 30,
    minEvents: 5,
  });
  assert.strictEqual(report.decision, 'WINNER', JSON.stringify(report, null, 2));
  assert.strictEqual(report.winner.campaign, 'evidence-installs-v1-20260725');
  assert.ok(report.winner.attributedTotal >= 16);
  assert.ok(report.lessons.some((l) => /leads/i.test(l)));
});

test('buildScoreboard INSUFFICIENT_DATA when under min-events', () => {
  const report = buildScoreboard({
    contentRows: [
      {
        date: '2026-07-25',
        platform: 'X',
        hook: 'h',
        campaign: 'tiny',
        status: 'Published',
        postUrl: 'https://x.com/1',
        outcome: 'ok',
      },
    ],
    attributionRows: [{ event: 'landing_view', utmCampaign: 'tiny', count: 2 }],
    lookbackDays: 30,
    minEvents: 5,
  });
  assert.strictEqual(report.decision, 'INSUFFICIENT_DATA');
  assert.ok(report.nextExperiments.length >= 1);
});

test('LIVE posts with zero attribution produce lesson', () => {
  const report = buildScoreboard({
    contentRows: [
      {
        date: '2026-07-25',
        platform: 'Bluesky',
        hook: 'h',
        campaign: 'lonely-live',
        status: 'Published',
        postUrl: 'https://bsky.app/x',
        outcome: 'ok',
      },
    ],
    attributionRows: [],
    lookbackDays: 30,
    minEvents: 5,
  });
  assert.ok(report.lessons.some((l) => /zero attributed/i.test(l)));
});

test('CLI --json with fixture file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'scds-'));
  const attr = path.join(dir, 'attr.json');
  fs.writeFileSync(
    attr,
    JSON.stringify({
      attributionToday: [
        {
          event: 'landing_view',
          utmCampaign: 'evidence-installs-v1-20260725',
          count: 10,
        },
      ],
    }),
  );
  const res = spawnSync(
    process.execPath,
    [SCRIPT, '--json', '--attribution-file', attr, '--min-events', '5'],
    { encoding: 'utf8', cwd: ROOT },
  );
  assert.strictEqual(res.status, 0, res.stderr + res.stdout);
  const report = JSON.parse(res.stdout);
  assert.ok(report.campaigns);
  assert.ok(report.ragCaptureStub);
});

test('parseContentLog reads repo log when present', () => {
  const logPath = path.join(ROOT, 'docs/social/hermes-mobile-content-log.tsv');
  if (!fs.existsSync(logPath)) {
    console.log('SKIP parseContentLog real file');
    return;
  }
  const rows = parseContentLog(logPath);
  assert.ok(rows.length > 0);
  assert.ok(rows.some((r) => r.campaign));
});

if (process.exitCode) {
  process.exit(process.exitCode);
} else {
  console.log('\nAll social-campaign-ds tests passed.');
}
