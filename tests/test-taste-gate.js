#!/usr/bin/env node
'use strict';

const assert = require('assert');
const path = require('path');
const { spawnSync } = require('child_process');

const { scoreTaste, evalGoldenSet, DOMAINS, DEFAULT_GOLDEN } = require('../tools/taste-gate');

function test(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (e) {
    console.error(`FAIL ${name}`);
    console.error(e.stack || e.message);
    process.exitCode = 1;
  }
}

const ROOT = path.resolve(__dirname, '..');
const CLI = path.join(ROOT, 'tools/taste-gate.js');

test('domains defined', () => {
  assert.ok(DOMAINS.promo_social);
  assert.ok(DOMAINS.ship_status);
  assert.ok(DOMAINS.outreach_email);
  assert.ok(DOMAINS.product_ui);
});

test('slop promo fails', () => {
  const r = scoreTaste(
    'In today\'s fast-paced world, unleash the power of seamless AI! 50k+ users, official Nous partner, #1 on Product Hunt!',
    'promo_social',
  );
  assert.strictEqual(r.ok, false, JSON.stringify(r));
  assert.ok(r.score < r.threshold);
});

test('good promo passes', () => {
  const r = scoreTaste(
    'Agents stop when the Mac sleeps. Continuity keeps work going: https://thumbgate.app/?utm_source=x&utm_campaign=t&cta_id=x1 — not affiliated with Nous.',
    'promo_social',
  );
  assert.strictEqual(r.ok, true, JSON.stringify(r));
});

test('ship overclaim fails taste', () => {
  const r = scoreTaste(
    'Everything is LIVE! All 5 replies published. Fan-out is complete. 100% working.',
    'ship_status',
  );
  assert.strictEqual(r.ok, false, JSON.stringify(r));
});

test('ship honest matrix passes', () => {
  const r = scoreTaste(
    '1 LIVE t1_p1ccuu5; 3 FAIL rate-limit. okCount=1. Next: cooldown then retry. Not all LIVE.',
    'ship_status',
  );
  assert.strictEqual(r.ok, true, JSON.stringify(r));
});

test('golden set offline', () => {
  const report = evalGoldenSet(DEFAULT_GOLDEN);
  assert.strictEqual(report.ok, true, JSON.stringify(report.results.filter((x) => !x.ok), null, 2));
  assert.ok(report.total >= 8);
});

test('CLI --eval-golden exits 0', () => {
  const r = spawnSync(process.execPath, [CLI, '--eval-golden'], {
    encoding: 'utf8',
    cwd: ROOT,
  });
  assert.strictEqual(r.status, 0, r.stdout + r.stderr);
});

test('CLI fails slop text', () => {
  const r = spawnSync(
    process.execPath,
    [
      CLI,
      '--domain',
      'promo_social',
      '--text',
      'Excited to share our world-class game-changer with 50k+ users as official Nous partner!',
      '--json',
    ],
    { encoding: 'utf8', cwd: ROOT },
  );
  assert.strictEqual(r.status, 1, r.stdout + r.stderr);
});

test('personalization note: high score ≠ user preference', () => {
  // Documented contract: gate scores craft quality only
  const r = scoreTaste(
    'Short calm status: Mac unreachable. Tap Retry. https://thumbgate.app/docs',
    'product_ui',
  );
  assert.ok(typeof r.score === 'number');
  assert.ok(!('userPreference' in r));
});

if (!process.exitCode) {
  console.log('test-taste-gate: all assertions ran');
}
