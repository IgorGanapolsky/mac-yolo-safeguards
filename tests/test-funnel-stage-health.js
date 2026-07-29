#!/usr/bin/env node
'use strict';

const assert = require('assert');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const TOOL = path.join(ROOT, 'tools', 'funnel-stage-health.js');
const {
  STAGES,
  parseContentLogSummary,
  parseArgs,
} = require(TOOL);

function test(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (e) {
    console.error(`FAIL ${name}`);
    console.error(e);
    process.exitCode = 1;
  }
}

test('STAGES cover required GTM ids', () => {
  const ids = new Set(STAGES.map((s) => s.id));
  for (const id of [
    'product_landing',
    'billing_rails',
    'aeo_discovery',
    'campaign_beat',
    'outbound_domain',
    'design_partners',
    'cash_recognition',
  ]) {
    assert.ok(ids.has(id), `missing stage ${id}`);
  }
});

test('every stage has why, risks, measure', () => {
  for (const s of STAGES) {
    assert.ok(s.why && s.why.length > 20, `${s.id} why`);
    assert.ok(Array.isArray(s.risks) && s.risks.length >= 2, `${s.id} risks`);
    assert.ok(Array.isArray(s.measure) && s.measure.length >= 2, `${s.id} measure`);
    assert.ok(['critical', 'important', 'secondary'].includes(s.severity), `${s.id} severity`);
  }
});

test('parseArgs offline and json', () => {
  const a = parseArgs(['--offline', '--json']);
  assert.strictEqual(a.offline, true);
  assert.strictEqual(a.json, true);
});

test('parseContentLogSummary does not throw', () => {
  const s = parseContentLogSummary();
  assert.ok(typeof s.missing === 'boolean');
});

test('CLI --offline --json exits 0', () => {
  const r = spawnSync(process.execPath, [TOOL, '--offline', '--json'], {
    encoding: 'utf8',
    cwd: ROOT,
  });
  assert.strictEqual(r.status, 0, r.stderr);
  const j = JSON.parse(r.stdout);
  assert.ok(j.stages.length >= 7);
  assert.strictEqual(j.offline, true);
});

test('CLI --help exits 0', () => {
  const r = spawnSync(process.execPath, [TOOL, '--help'], { encoding: 'utf8' });
  assert.strictEqual(r.status, 0);
  assert.ok(r.stdout.includes('funnel-stage-health'));
});

if (!process.exitCode) {
  console.log('All funnel-stage-health tests passed.');
}
