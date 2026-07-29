#!/usr/bin/env node
'use strict';

/**
 * Unit tests for weekly KPI decision loop (offline-safe).
 */

const assert = require('assert');
const path = require('path');
const fs = require('fs');

const REPO = path.resolve(__dirname, '..');
const mod = require(path.join(REPO, 'tools/weekly-kpi-decision-loop.js'));

function testColorFor() {
  const cash = {
    unit: 'usd',
    thresholds: { green_min: 10, yellow_min: 0.01 },
  };
  assert.strictEqual(mod.colorFor(cash, 0), 'red');
  assert.strictEqual(mod.colorFor(cash, 1), 'yellow');
  assert.strictEqual(mod.colorFor(cash, 10), 'green');

  const fails = {
    unit: 'fail_count',
    thresholds: { green_max: 0, yellow_max: 1 },
  };
  assert.strictEqual(mod.colorFor(fails, 0), 'green');
  assert.strictEqual(mod.colorFor(fails, 1), 'yellow');
  assert.strictEqual(mod.colorFor(fails, 3), 'red');
  console.log('PASS colorFor');
}

function testConfigPresent() {
  const cfg = path.join(REPO, 'config/kpi-weekly-loop.json');
  assert.ok(fs.existsSync(cfg), 'config/kpi-weekly-loop.json must exist');
  const j = JSON.parse(fs.readFileSync(cfg, 'utf8'));
  assert.strictEqual(j.schema_version, 'kpi-weekly-loop/1');
  assert.ok(j.kpis.length >= 3 && j.kpis.length <= 7, '3–7 KPIs');
  for (const k of j.kpis) {
    assert.ok(k.question && k.question.includes('?'), `question for ${k.id}`);
    assert.ok(Array.isArray(k.playbook) && k.playbook.length >= 2, `playbook for ${k.id}`);
    assert.ok(k.thresholds, `thresholds for ${k.id}`);
  }
  console.log('PASS config shape');
}

async function testOfflineReport() {
  const report = await mod.buildReport({ offline: true, maxActions: 5 });
  assert.strictEqual(report.schema_version, 'kpi-weekly-decision/1');
  assert.ok(report.kpis.length >= 3);
  assert.ok(Array.isArray(report.tickets));
  assert.ok(report.tickets.length <= 5, 'cap actions');
  // Cash fail-closed is usually red/yellow with $0
  const cash = report.kpis.find((k) => k.id === 'external_cash');
  assert.ok(cash, 'external_cash kpi');
  assert.ok(cash.color === 'red' || cash.color === 'yellow' || cash.color === 'green');
  const md = mod.renderMarkdown(report);
  assert.ok(md.includes('Weekly KPI decision review'));
  assert.ok(md.includes('Tickets'));
  console.log('PASS offline report + markdown');
}

async function main() {
  testColorFor();
  testConfigPresent();
  await testOfflineReport();
  console.log('All weekly-kpi-decision-loop tests passed.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
