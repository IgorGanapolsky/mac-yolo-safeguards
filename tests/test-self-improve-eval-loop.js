#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('path');
const {
  COUNSEL_CLEARANCE,
  MIN_N,
  mapOpportunity,
  promoteChange,
  catalog,
} = require('../tools/self-improve-eval-loop');

const TOOL = path.join(__dirname, '..', 'tools', 'self-improve-eval-loop.js');
const BIN = path.join(__dirname, '..', 'bin', 'self-improve-eval');

console.log('=== test-self-improve-eval-loop ===');

assert.equal(COUNSEL_CLEARANCE, false);
assert.equal(MIN_N, 5);

const cat = catalog();
assert.equal(cat.autoApply, false);
assert.equal(cat.affiliateSku, false);
assert.equal(cat.inventedConversion, null);
assert.ok(cat.denials.includes('affiliate_sku_from_headline'));
assert.ok(cat.complementaryTo.some((x) => /2046/.test(x)));

assert.equal(mapOpportunity({ intent: 'affiliate keyword discovery pipeline' }).deny, 'affiliate_sku_from_headline');
assert.equal(mapOpportunity({ intent: 'schema-ready publishing for affiliate deals' }).affiliateSku, false);
assert.equal(mapOpportunity({ intent: 'Why Did OpenAI Pause AI Training' }).deny, 'headline_bet');
assert.equal(mapOpportunity({ intent: 'generic AI chatbot for SMBs' }).deny, 'generic_chatbot');
assert.equal(mapOpportunity({ intent: 'sell ThumbGate $499 Partner Pilot' }).deny, 'eci_paid_pilot');
assert.equal(mapOpportunity({ intent: 'invoice and document processing for dentists' }).deny, 'not_beachhead');

const ahls = mapOpportunity({ intent: 'HVAC missed-call lead qualification after-hours leak' });
assert.equal(ahls.ok, true);
assert.equal(ahls.rail, 'agency_ahls');
assert.equal(ahls.priceUsd, 149);
assert.equal(ahls.sellable, true);
assert.equal(ahls.verticalTemplate, 'after_hours_leak_score');
assert.equal(ahls.promote, false);

const evalOpp = mapOpportunity({ intent: 'evaluation and observability layer for quality, cost, latency' });
assert.equal(evalOpp.ok, true);
assert.equal(evalOpp.defer, 'router-receipt');
assert.equal(evalOpp.sellable, false);

const route = promoteChange({ kind: 'route' });
assert.equal(route.ok, true);
assert.equal(route.defer, 'router-receipt');
assert.equal(route.promote, false);
assert.equal(route.apply, false);

assert.equal(promoteChange({ kind: 'prompt' }).deny, 'insufficient_evidence');
assert.equal(promoteChange({
  kind: 'prompt',
  baseline: { metric: 'conversion_rate', value: 0.2, n: 3 },
  candidate: { metric: 'conversion_rate', value: 0.4, n: 3 },
}).deny, 'insufficient_evidence');

const noHold = promoteChange({
  kind: 'workflow',
  baseline: { metric: 'conversion_rate', value: 0.2, n: 20 },
  candidate: { metric: 'conversion_rate', value: 0.3, n: 20 },
});
assert.equal(noHold.ok, true);
assert.equal(noHold.promote, false);
assert.equal(noHold.evidence, 'NEEDS_HOLDOUT');
assert.equal(noHold.apply, false);
assert.equal(noHold.inventedConversion, null);

const overfit = promoteChange({
  kind: 'prompt',
  baseline: { metric: 'conversion_rate', value: 0.2, n: 20 },
  candidate: { metric: 'conversion_rate', value: 0.4, n: 20 },
  holdout: { metric: 'conversion_rate', value: 0.19, n: 20 },
});
assert.equal(overfit.promote, false);
assert.equal(overfit.evidence, 'OVERFIT');

const win = promoteChange({
  kind: 'tool',
  baseline: { metric: 'conversion_rate', value: 0.2, n: 20 },
  candidate: { metric: 'conversion_rate', value: 0.3, n: 20 },
  holdout: { metric: 'conversion_rate', value: 0.28, n: 20 },
});
assert.equal(win.ok, true);
assert.equal(win.promote, true);
assert.equal(win.apply, false);
assert.equal(win.evidence, 'HOLDOUT_BEATS_BASELINE');
assert.equal(win.autoApply, false);

const latency = promoteChange({
  kind: 'tool',
  direction: 'lower',
  baseline: { metric: 'latency_s', value: 2.0, n: 10 },
  candidate: { metric: 'latency_s', value: 1.2, n: 10 },
  holdout: { metric: 'latency_s', value: 1.4, n: 10 },
});
assert.equal(latency.promote, true);
assert.equal(latency.apply, false);

function run(file, args) {
  return spawnSync(process.execPath, [file, ...args], { encoding: 'utf8' });
}

const denied = run(TOOL, ['--map', '--intent', 'affiliate keyword discovery', '--json']);
assert.equal(denied.status, 2);
assert.equal(JSON.parse(denied.stdout).deny, 'affiliate_sku_from_headline');

const honesty = run(BIN, ['--honesty', '--json']);
assert.equal(honesty.status, 0);
const h = JSON.parse(honesty.stdout);
assert.equal(h.episodeHasBenchmarks, false);
assert.ok(h.skip.some((s) => /affiliate/i.test(s)));

const promoted = run(TOOL, [
  '--promote', '--kind', 'prompt', '--json',
  '--baseline-metric', 'conversion_rate', '--baseline-value', '0.2', '--baseline-n', '20',
  '--candidate-value', '0.31', '--candidate-n', '20',
  '--holdout-value', '0.27', '--holdout-n', '20',
]);
assert.equal(promoted.status, 0);
const p = JSON.parse(promoted.stdout);
assert.equal(p.promote, true);
assert.equal(p.apply, false);

console.log('PASS');
