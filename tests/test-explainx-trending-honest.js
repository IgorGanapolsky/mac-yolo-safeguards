#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  honesty,
  parseTrendingHtml,
  analyze,
  THEATER_TITLES,
} = require('../tools/explainx-trending-honest');

const fixture = fs.readFileSync(
  path.join(__dirname, 'fixtures', 'explainx-trending-rsc-snippet.html'),
  'utf8',
);

const h = honesty();
assert.strictEqual(h.clonedExplainx, false);
assert.strictEqual(h.inventedViews, false);
assert.strictEqual(h.autoInstallTrendingSkills, false);
assert.strictEqual(h.dualEditRagEngine, false);

const empty = analyze('');
assert.strictEqual(empty.status, 'UNAVAILABLE');
assert.strictEqual(empty.liveClaim, false);
assert.strictEqual(empty.itemsAnalyzed, 0);

const items = parseTrendingHtml(fixture);
assert.ok(items.length >= 6, `expected >=6 items, got ${items.length}`);
assert.strictEqual(items[0].name.includes('Google Timeline Visualizer'), true);
assert.strictEqual(items[0].score, 3437);
assert.ok(Number.isInteger(items[0].score));
assert.ok(!('growthPct' in items[0]));
assert.ok(!('views' in items[0]));

const report = analyze(fixture);
assert.strictEqual(report.status, 'SUCCESS');
assert.strictEqual(report.liveClaim, false);
assert.strictEqual(report.legacyEngineIsTheater, true);
assert.deepStrictEqual(report.theaterTitlesOnPage, []);
for (const t of THEATER_TITLES) {
  assert.ok(!fixture.includes(t), `theater title leaked into fixture: ${t}`);
}

const skillMd = report.mapped.find((x) => /SKILL\.md/i.test(`${x.name} ${x.description}`));
assert.ok(skillMd, 'workshop about SKILL.md should parse');
assert.strictEqual(skillMd.verdict, 'already_have');
assert.strictEqual(skillMd.existingSkill, 'skill-catalog-governance');

const ox = report.mapped.find((x) => /Ox Alpha/i.test(x.name));
assert.ok(ox);
assert.strictEqual(ox.verdict, 'cost_signal');
assert.ok(ox.action.includes('$10/mo'));

const eli5 = report.mapped.find((x) => /eli5/i.test(x.name));
assert.ok(eli5);
assert.strictEqual(eli5.verdict, 'skip_clone');

const timeline = report.mapped.find((x) => /Timeline Visualizer/i.test(x.name));
assert.ok(timeline);
assert.strictEqual(timeline.verdict, 'skip_not_ours');

const deslop = report.mapped.find((x) => x.name === 'deslop');
assert.ok(deslop);
assert.strictEqual(deslop.verdict, 'already_have');
assert.strictEqual(deslop.existingSkill, 'output-quality-loop');

process.stdout.write('ok tests/test-explainx-trending-honest.js\n');
