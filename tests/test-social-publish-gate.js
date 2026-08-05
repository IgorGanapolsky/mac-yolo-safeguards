#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const GATE = path.join(ROOT, 'tools', 'social-publish-gate.js');
const VERIFY = path.join(ROOT, 'tools', 'verify-public-post.js');
const {
  evaluate,
  parseContentLog,
  hasDeadFreePlay,
  hasBuyLink,
  isMediumTitleOnly,
  stripHtml,
  isLiveStatus,
  campaignStem,
  sameCampaignFamily,
} = (() => {
  const gate = require(GATE);
  const verify = require(VERIFY);
  return {
    evaluate: gate.evaluate,
    parseContentLog: gate.parseContentLog,
    hasDeadFreePlay: gate.hasDeadFreePlay,
    hasBuyLink: gate.hasBuyLink,
    isLiveStatus: gate.isLiveStatus,
    campaignStem: gate.campaignStem,
    sameCampaignFamily: gate.sameCampaignFamily,
    isMediumTitleOnly: verify.isMediumTitleOnly,
    stripHtml: verify.stripHtml,
  };
})();

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

function writeTempLog(rows) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'social-gate-'));
  const logPath = path.join(dir, 'log.tsv');
  const header =
    'Date\tPlatform\tPersona\tPain\tAngle\tEvidence\tHook\tCTA\tCampaign\tStatus\tPostURL\tOutcome';
  const lines = [header, ...rows];
  fs.writeFileSync(logPath, `${lines.join('\n')}\n`);
  return logPath;
}

test('tools exist and are executable entrypoints', () => {
  assert.ok(fs.existsSync(GATE));
  assert.ok(fs.existsSync(VERIFY));
  const help = spawnSync(process.execPath, [GATE, '--help'], { encoding: 'utf8' });
  assert.strictEqual(help.status, 0, help.stderr);
  assert.ok(help.stdout.includes('social-publish-gate'));
  const vhelp = spawnSync(process.execPath, [VERIFY, '--help'], { encoding: 'utf8' });
  assert.strictEqual(vhelp.status, 0, vhelp.stderr);
  assert.ok(vhelp.stdout.includes('verify-public-post'));
});

test('isLiveStatus recognizes Published/Posted', () => {
  assert.ok(isLiveStatus('Published'));
  assert.ok(isLiveStatus('posted'));
  assert.ok(!isLiveStatus('Drafted'));
  assert.ok(!isLiveStatus('Blocked'));
  assert.ok(!isLiveStatus('Superseded'));
});

test('superseded campaign blocks re-post on same platform+campaign', () => {
  const log = writeTempLog([
    [
      '2026-07-29',
      'LinkedIn',
      'p',
      'pain',
      'a',
      'e',
      'Your agent does not stop needing a machine',
      'cta',
      'thumbgate_continuity_lid_20260729',
      'Superseded',
      '—',
      'Superseded same-day by engine-2026-07',
    ].join('\t'),
  ]);
  const r = evaluate({
    platform: 'linkedin',
    campaign: 'thumbgate_continuity_lid_20260729',
    hook: 'Your agent does not stop needing a machine when your laptop does.',
    lookbackDays: 14,
    log,
    requireBuyLinks: false,
    requireMentions: false,
    allowPartial: false,
  });
  assert.strictEqual(r.decision, 'BLOCK');
  assert.ok(r.blocks.some((b) => /Retired campaign/i.test(b)));
});

test('campaignStem collapses meme/image/v2 suffixes', () => {
  assert.strictEqual(
    campaignStem('engine-2026-08-04-gates-meme'),
    campaignStem('engine-2026-08-04-gates'),
  );
  assert.strictEqual(campaignStem('beat-v2'), 'beat');
  assert.ok(sameCampaignFamily('engine-2026-08-04-gates', 'engine-2026-08-04-gates-meme'));
  assert.ok(!sameCampaignFamily('engine-2026-08-04-gates', 'engine-2026-08-03-other'));
});

test('same-beat campaign family blocks meme variant after LIVE text post', () => {
  // Repro 2026-08-04: text LIVE under …-gates, then …-gates-meme ALLOWED → double-post
  const log = writeTempLog([
    [
      '2026-08-04',
      'LinkedIn',
      'p',
      'pain',
      'a',
      'e',
      'Everyone demos blocking rm -rf.',
      'cta',
      'engine-2026-08-04-gates',
      'Published',
      'https://www.linkedin.com/feed/update/urn:li:activity:7490467132669927425/',
      'text only',
    ].join('\t'),
  ]);
  const r = evaluate({
    platform: 'linkedin',
    campaign: 'engine-2026-08-04-gates-meme',
    hook: 'Shell is the screenshot risk. Checkout URLs are the quiet one.',
    body: 'ThumbGate hard-floors checkout URLs. https://thumbgate.app/?utm_source=linkedin',
    lookbackDays: 14,
    log,
    requireBuyLinks: false,
    requireMentions: false,
    allowPartial: false,
  });
  assert.strictEqual(r.decision, 'BLOCK', JSON.stringify(r.blocks));
  assert.ok(
    r.blocks.some((b) => /Same-beat campaign family/i.test(b)),
    JSON.stringify(r.blocks),
  );
});

test('hasDeadFreePlay blocks free package not paid', () => {
  assert.ok(
    hasDeadFreePlay(
      'https://play.google.com/store/apps/details?id=com.iganapolsky.hermesmobile&hl=en',
    ),
  );
  assert.ok(
    !hasDeadFreePlay(
      'https://play.google.com/store/apps/details?id=com.iganapolsky.hermesmobile.paid&hl=en',
    ),
  );
});

test('hasBuyLink accepts thumbgate and paid play', () => {
  assert.ok(hasBuyLink('try https://thumbgate.app/?utm_source=x'));
  assert.ok(
    hasBuyLink(
      'https://play.google.com/store/apps/details?id=com.iganapolsky.hermesmobile.paid',
    ),
  );
  assert.ok(!hasBuyLink('no links here just vibes'));
});

test('hashnode is always blocked', () => {
  const r = evaluate({
    platform: 'hashnode',
    campaign: 'any',
    lookbackDays: 14,
    log: writeTempLog([]),
    requireBuyLinks: false,
    requireMentions: false,
    allowPartial: false,
  });
  assert.strictEqual(r.decision, 'BLOCK');
  assert.ok(r.blocks.some((b) => /FROZEN/i.test(b)));
});

test('zernio path blocked', () => {
  const r = evaluate({
    platform: 'zernio',
    campaign: 'any',
    lookbackDays: 14,
    log: writeTempLog([]),
    requireBuyLinks: false,
    requireMentions: false,
    allowPartial: false,
  });
  assert.strictEqual(r.decision, 'BLOCK');
});

test('double-post blocked for same platform+campaign with LIVE URL', () => {
  const log = writeTempLog([
    [
      '2026-07-25',
      'LinkedIn',
      'p',
      'pain',
      'a',
      'e',
      'Install is step 0',
      'cta',
      'evidence-installs-v1-20260725',
      'Published',
      'https://www.linkedin.com/feed/update/urn:li:share:7486780057789779968/',
      'ok',
    ].join('\t'),
  ]);
  const r = evaluate({
    platform: 'linkedin',
    campaign: 'evidence-installs-v1-20260725',
    hook: 'Install is step 0. Pair is step 1.',
    lookbackDays: 14,
    log,
    requireBuyLinks: false,
    requireMentions: false,
    allowPartial: false,
  });
  assert.strictEqual(r.decision, 'BLOCK');
  assert.ok(r.blocks.some((b) => /Double-post/i.test(b)));
});

test('PARTIAL with public URL still blocks re-post (Medium title-only)', () => {
  const log = writeTempLog([
    [
      '2026-07-25',
      'Medium',
      'p',
      'pain',
      'a',
      'e',
      'Install is step 0',
      'cta',
      'evidence-installs-v1-20260725',
      'PARTIAL',
      'https://medium.com/@x/install-is-step-0-68c671c4e5f5',
      'title only',
    ].join('\t'),
  ]);
  const r = evaluate({
    platform: 'medium',
    campaign: 'evidence-installs-v1-20260725',
    lookbackDays: 14,
    log,
    requireBuyLinks: false,
    requireMentions: false,
    allowPartial: false,
  });
  assert.strictEqual(r.decision, 'BLOCK');
});

test('allow when campaign free on platform', () => {
  const log = writeTempLog([
    [
      '2026-07-20',
      'X',
      'p',
      'pain',
      'a',
      'e',
      'Old hook completely different',
      'cta',
      'launch-week-1',
      'Published',
      'https://x.com/IgorGanapolsky/status/1',
      'ok',
    ].join('\t'),
  ]);
  const r = evaluate({
    platform: 'x',
    campaign: 'fresh-campaign-20260725',
    hook: 'Brand new angle about pair metric',
    body: 'Install is step 0. https://thumbgate.app/?utm_source=x&utm_medium=social',
    lookbackDays: 14,
    log,
    requireBuyLinks: true,
    requireMentions: false,
    allowPartial: false,
  });
  assert.strictEqual(r.decision, 'ALLOW', JSON.stringify(r.blocks));
});

test('require-buy-links blocks empty promo body', () => {
  const log = writeTempLog([]);
  const r = evaluate({
    platform: 'x',
    campaign: 'c1',
    body: 'Cool product, trust me.',
    lookbackDays: 14,
    log,
    requireBuyLinks: true,
    requireMentions: false,
    allowPartial: false,
  });
  assert.strictEqual(r.decision, 'BLOCK');
  assert.ok(r.blocks.some((b) => /buy\/CTA/i.test(b)));
});

test('false affiliation language blocked', () => {
  const log = writeTempLog([]);
  const r = evaluate({
    platform: 'x',
    campaign: 'c1',
    body: 'We are an official partner of Nous Research. https://thumbgate.app/',
    lookbackDays: 14,
    log,
    requireBuyLinks: false,
    requireMentions: false,
    allowPartial: false,
  });
  assert.strictEqual(r.decision, 'BLOCK');
});

test('CLI exit 1 on double-post against real content log if present', () => {
  const realLog = path.join(ROOT, 'docs/social/hermes-mobile-content-log.tsv');
  if (!fs.existsSync(realLog)) {
    console.log('SKIP CLI real-log double-post (log missing)');
    return;
  }
  const parsed = parseContentLog(realLog);
  const live = parsed.rows.find(
    (r) => isLiveStatus(r.status) && r.postUrl && r.postUrl.startsWith('http'),
  );
  if (!live) {
    console.log('SKIP CLI real-log double-post (no live rows)');
    return;
  }
  const res = spawnSync(
    process.execPath,
    [
      GATE,
      '--platform',
      live.platform,
      '--campaign',
      live.campaign,
      '--json',
    ],
    { encoding: 'utf8' },
  );
  assert.strictEqual(res.status, 1, res.stdout + res.stderr);
  const json = JSON.parse(res.stdout);
  assert.strictEqual(json.decision, 'BLOCK');
});

test('stripHtml and medium title-only detector', () => {
  const html = '<html><title>Install is step 0</title><body><p>Install is step 0</p></body></html>';
  const text = stripHtml(html);
  assert.ok(text.includes('Install is step 0'));
  assert.ok(isMediumTitleOnly('Install is step 0', 'Install is step 0', 400));
  assert.ok(
    !isMediumTitleOnly(
      'Install is step 0. Pair is step 1. First chat is the product. '.repeat(20),
      'Install is step 0',
      400,
    ),
  );
});

test('verify CLI rejects missing url', () => {
  const res = spawnSync(process.execPath, [VERIFY, '--json'], { encoding: 'utf8' });
  assert.notStrictEqual(res.status, 0);
});

test('verify CLI rejects editor URL without network', async () => {
  // sync CLI
  const res = spawnSync(
    process.execPath,
    [VERIFY, '--url', 'https://hashnode.com/drafts/abc', '--json'],
    { encoding: 'utf8' },
  );
  assert.strictEqual(res.status, 1, res.stdout + res.stderr);
  const json = JSON.parse(res.stdout);
  assert.strictEqual(json.live, false);
  assert.ok(/editor|draft/i.test(json.reason));
});

if (process.exitCode) {
  process.exit(process.exitCode);
} else {
  console.log('\nAll social-publish-gate tests passed.');
}
