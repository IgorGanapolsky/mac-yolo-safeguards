#!/usr/bin/env node
'use strict';

/**
 * Pins Western Electric rule reachability in tools/control-band-sentinel.js.
 *
 * Regression guard: the rules were originally chained as `else if` on sample
 * count, so for any series of 3 or more points Rule 3 and Rule 4 were
 * unreachable. Persistent drift -- the failure mode control bands exist to
 * catch -- was therefore never detected. These tests fail if that returns.
 */

const assert = require('assert');
const { evaluateWesternElectric } = require('../tools/control-band-sentinel');

let passed = 0;
function ok(name) {
  passed += 1;
  console.log(`ok  ${passed}  ${name}`);
}

const MEAN = 0.02;
const STD = 0.008;
const at = (sigmas) => MEAN + sigmas * STD;

// --- Rule 1: a single point beyond 3 sigma ---
{
  const r = evaluateWesternElectric([at(0.1), at(0.2), at(3.5)], MEAN, STD);
  assert.strictEqual(r.breached, true);
  assert.strictEqual(r.tier, '3sigma');
  assert.match(r.ruleFired, /Rule 1/);
  ok('Rule 1 fires on a single point beyond 3 sigma');
}

// --- Rule 2: 2 of 3 consecutive points beyond 2 sigma, same side ---
{
  const r = evaluateWesternElectric([at(2.4), at(0.1), at(2.6)], MEAN, STD);
  assert.strictEqual(r.breached, true);
  assert.strictEqual(r.tier, '2sigma');
  assert.match(r.ruleFired, /Rule 2/);
  ok('Rule 2 fires on 2 of 3 points beyond 2 sigma');
}

// --- Rule 3: 4 of 5 consecutive beyond 1 sigma, same side, none beyond 2 ---
{
  const samples = [at(1.2), at(1.3), at(0.2), at(1.4), at(1.5)];
  const r = evaluateWesternElectric(samples, MEAN, STD);
  assert.strictEqual(r.breached, true, 'Rule 3 must be reachable, not shadowed by Rule 2');
  assert.match(r.ruleFired, /Rule 3/);
  ok('Rule 3 fires on 4 of 5 points beyond 1 sigma (was unreachable)');
}

// --- Rule 4: 8 consecutive points on one side of centerline (drift) ---
{
  const drift = [0.5, 0.6, 0.7, 0.8, 0.9, 0.5, 0.6, 0.7].map(at);
  const r = evaluateWesternElectric(drift, MEAN, STD);
  assert.strictEqual(r.breached, true, 'Rule 4 must be reachable, not shadowed by Rule 2');
  assert.match(r.ruleFired, /Rule 4/);
  ok('Rule 4 fires on 8 consecutive points one side of centerline (was unreachable)');
}

// --- Rule 4 also detects drift BELOW the centerline ---
{
  const drift = [-0.5, -0.6, -0.7, -0.8, -0.9, -0.5, -0.6, -0.7].map(at);
  const r = evaluateWesternElectric(drift, MEAN, STD);
  assert.strictEqual(r.breached, true);
  assert.match(r.ruleFired, /Rule 4/);
  ok('Rule 4 detects downward drift as well as upward');
}

// --- A genuinely in-control series must NOT breach (no false positives) ---
{
  const stable = [0.1, -0.2, 0.3, -0.1, 0.2, -0.3, 0.1, -0.2].map(at);
  const r = evaluateWesternElectric(stable, MEAN, STD);
  assert.strictEqual(r.breached, false, 'an in-control series must not breach');
  assert.strictEqual(r.tier, '1sigma');
  ok('in-control series does not breach any rule');
}

// --- Rule precedence: a 3 sigma spike reports as 3sigma, not a lesser tier ---
{
  const spikeAmidDrift = [at(1.2), at(1.3), at(1.4), at(1.5), at(4.0)];
  const r = evaluateWesternElectric(spikeAmidDrift, MEAN, STD);
  assert.strictEqual(r.tier, '3sigma', 'the most severe rule must win');
  assert.match(r.ruleFired, /Rule 1/);
  ok('most severe rule takes precedence');
}

// --- No data is reported as NO_DATA, not as in-control ---
{
  const r = evaluateWesternElectric([], MEAN, STD);
  assert.strictEqual(r.status, 'NO_DATA');
  ok('empty sample set reports NO_DATA rather than passing');
}

console.log(`\n1..${passed}`);
console.log(`All ${passed} control-band-sentinel assertions passed.`);
