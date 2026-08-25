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
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  evaluateWesternElectric,
  runSentinel,
} = require('../tools/control-band-sentinel');

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


// --- Detection-only invariant -------------------------------------------
// ai-native-sdlc.js records the decision not to clone Western Electric
// auto-quarantine. Detection is in scope; acting on a breach is not. These
// assertions keep that boundary from eroding by config edit or by fallback.

const { loadConfig } = require('../tools/control-band-sentinel');

const ACTING = ['propose_and_revert', 'trigger_rollback', 'quarantine', 'revert', 'rollback'];
const bandsPath = path.join(__dirname, '..', 'bands.yaml');

{
  const config = loadConfig(bandsPath);
  const offenders = [];
  for (const metric of config.metrics || []) {
    for (const [tier, body] of Object.entries(metric.tiers || {})) {
      if (ACTING.includes(String(body.action))) offenders.push(`${metric.id}.${tier}=${body.action}`);
    }
  }
  assert.deepStrictEqual(offenders, [], 'no band tier may declare an auto-acting action');
  ok('no configured tier auto-acts on a breach');
}

{
  // The fallback parser must reflect the file, not substitute its own action.
  const raw = fs.readFileSync(bandsPath, 'utf8');
  assert.ok(!/propose_and_revert|trigger_rollback/.test(raw), 'bands.yaml declares no acting route');
  const src = fs.readFileSync(path.join(__dirname, '..', 'tools', 'control-band-sentinel.js'), 'utf8');
  const fallback = src.slice(src.indexOf('function parseYamlFallback'), src.indexOf('function loadConfig'));
  assert.ok(!/propose_and_revert|trigger_rollback/.test(fallback),
    'the fallback parser must not hardcode an acting tier');
  ok('fallback parser cannot introduce an acting tier the config never declared');
}

{
  // Every metric in the file must still be parsed, so a breach is not missed.
  const config = loadConfig(bandsPath);
  const ids = (config.metrics || []).map((m) => m.id);
  assert.ok(ids.includes('ci_test_failure_rate'), 'ci metric parsed');
  assert.ok(ids.includes('post_deploy_5xx_rate'), '5xx metric parsed');
  assert.ok(ids.includes('pr_cycle_time_hours'), 'cycle time metric parsed');
  for (const m of config.metrics) {
    assert.ok(Number.isFinite(m.baseline_mean), `${m.id} has a baseline mean`);
    assert.ok(Number.isFinite(m.baseline_std), `${m.id} has a baseline std`);
  }
  ok('every configured metric parses with usable baselines');
}

// --------------------------------------------------------------------------
// runSentinel: the two defects review found on PR #2051. Both were reachable
// only through the public runner, which is why unit tests on
// evaluateWesternElectric alone did not catch them.
// --------------------------------------------------------------------------

// A tiny config written to disk, so these assertions pin runSentinel's real
// YAML path rather than a hand-built object it would never see in production.
function withConfig(yaml, run) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cbs-test-'));
  const configPath = path.join(dir, 'bands.yaml');
  fs.writeFileSync(configPath, yaml);
  try {
    return run(configPath, dir);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const CONFIG = `metrics:
  - id: ci_pass_rate
    name: CI pass rate
    baseline_mean: 90
    baseline_std: 2
    tiers:
      1sigma:
        action: log
      3sigma:
        action: report
`;

{
  // Was: `if (samples.length === 0) continue`, which dropped the metric
  // entirely. A broken collector then looked exactly like a healthy system.
  const results = withConfig(CONFIG, (configPath) =>
    runSentinel({}, configPath, { dryRun: true }));

  assert.strictEqual(results.length, 1, 'a configured metric must not vanish when it has no samples');
  assert.strictEqual(results[0].metricId, 'ci_pass_rate');
  assert.strictEqual(results[0].evaluation.status, 'NO_DATA', 'missing telemetry must surface as NO_DATA');
  ok('a configured metric with no samples reports NO_DATA instead of disappearing');
}

{
  const results = withConfig(CONFIG, (configPath) =>
    runSentinel({ ci_pass_rate: [] }, configPath, { dryRun: true }));
  assert.strictEqual(results.length, 1, 'an explicitly empty series must also survive');
  assert.strictEqual(results[0].evaluation.status, 'NO_DATA');
  ok('an explicitly empty sample array is preserved, not skipped');
}

{
  // Was gated on `tierConfig.auto_intent`, a key no tier in bands.yaml
  // defines, so generateIncidentIntent was dead code while the committed
  // config advertised `action: report`.
  const { results, dir } = withConfig(CONFIG, (configPath, dir) => ({
    results: runSentinel(
      // Eight points, all well below the mean: a sustained one-sided breach.
      { ci_pass_rate: [80, 79, 78, 80, 77, 79, 78, 76] },
      configPath,
      { intentDir: dir },
    ),
    dir,
  }));

  assert.strictEqual(results[0].evaluation.breached, true, 'a sustained drift must breach');
  assert.strictEqual(results[0].action, 'report');
  assert.ok(
    results[0].autoIntentGenerated,
    'a report-tier breach must produce the artifact the config promises',
  );
  void dir;
  ok('a report-tier breach generates the promised artifact');
}

{
  // The safety half: dryRun must still write nothing.
  const results = withConfig(CONFIG, (configPath, dir) =>
    runSentinel(
      { ci_pass_rate: [80, 79, 78, 80, 77, 79, 78, 76] },
      configPath,
      { dryRun: true, intentDir: dir },
    ));
  assert.strictEqual(results[0].evaluation.breached, true);
  assert.strictEqual(results[0].autoIntentGenerated, null, 'dryRun must not write an artifact');
  ok('dryRun still suppresses artifact generation on a breach');
}

{
  // Detection must not have become action: a breach reports, it does not act.
  const results = withConfig(CONFIG, (configPath) =>
    runSentinel({ ci_pass_rate: [80, 79, 78, 80, 77, 79, 78, 76] }, configPath, { dryRun: true }));
  assert.ok(
    ['log', 'diagnose', 'report'].includes(results[0].action),
    `sentinel must stay non-acting, got action=${results[0].action}`,
  );
  ok('the sentinel reports and diagnoses but never auto-acts');
}

console.log(`\n1..${passed}`);
console.log(`All ${passed} control-band-sentinel assertions passed.`);
