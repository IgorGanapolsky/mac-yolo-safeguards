'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const TOOL = path.resolve(__dirname, '..', 'tools', 'revenue-decision-engine.js');
const E = require(TOOL);

let passed = 0;
function t(name, fn) { fn(); passed++; console.log(`ok - ${name}`); }
const near = (a, b, eps = 1e-6) => assert.ok(Math.abs(a - b) < eps, `${a} vs ${b}`);

// Counts only, no personal data.
const SMALL = {
  window: '24h',
  sources: { visits: 'fixture referrers', downloads: 'fixture releases', checkouts: 'fixture stripe', paid: 'fixture stripe' },
  channels: {
    producthunt: { visits: 40, checkouts: 1, paid: 0 },
    hn: { visits: 60, checkouts: 1, paid: 0 },
    reddit: { visits: 20, checkouts: 0, paid: 0 },
    github_readme: { visits: 80, checkouts: 2, paid: 0 },
    direct: { visits: 10, checkouts: 0, paid: 0 },
  },
  totals: { visits: 210, downloads: 214, checkouts: 4, paid: 0 },
  offers: { pro_guard: { price: 29, checkouts: 4, paid: 0 } },
  pages: { '/': { visits: 150 }, '/teams/': { visits: 20 } },
};

t('posterior matches hand-computed Beta(1,5) for 0 of 4', () => {
  // Beta(1,5): mean 1/6, CDF 1-(1-x)^5, so 5% = 1-0.95^(1/5), 95% = 1-0.05^(1/5).
  const p = E.posterior(0, 4);
  assert.strictEqual(p.alpha, 1);
  assert.strictEqual(p.beta, 5);
  near(p.mean, 1 / 6);
  near(p.lo, 1 - Math.pow(0.95, 1 / 5), 1e-9);
  near(p.hi, 1 - Math.pow(0.05, 1 / 5), 1e-9);
  near(p.lo, 0.010206, 1e-5);
  near(p.hi, 0.450720, 1e-5);
});

t('posterior for 1 of 4 is Beta(2,4); CDF equals 1-(1-x)^5-5x(1-x)^4', () => {
  const p = E.posterior(1, 4);
  near(p.mean, 1 / 3);
  const x = 0.3;
  near(E.betaCdf(x, 2, 4), 1 - Math.pow(1 - x, 5) - 5 * x * Math.pow(1 - x, 4), 1e-9);
});

t('leakiest stage is the one that loses the most paid users', () => {
  const data = {
    channels: { hn: { visits: 1000, downloads: 900, checkouts: 5, paid: 1 } },
    totals: { visits: 1000, downloads: 900, checkouts: 5, paid: 1 },
  };
  const rows = E.leakiestStage(E.normalizeInput(data));
  assert.strictEqual(rows[0].stage, 'download->checkout');
  assert.ok(rows[0].expectedLostPaid > rows[1].expectedLostPaid);
  // Opposite shape: visits barely download, later stages healthy.
  const data2 = {
    channels: { hn: { visits: 1000, downloads: 20, checkouts: 18, paid: 17 } },
    totals: { visits: 1000, downloads: 20, checkouts: 18, paid: 17 },
  };
  assert.strictEqual(E.leakiestStage(E.normalizeInput(data2))[0].stage, 'visit->download');
});

t('overlapping intervals give the not-enough-data verdict', () => {
  const r = E.decide(SMALL, { seed: 3 });
  assert.strictEqual(r.rankable, false);
  assert.strictEqual(r.recommendation.verdict, 'not enough data to rank channels yet');
  assert.strictEqual(r.recommendation.channel, 'github_readme'); // most visits, fastest samples
  assert.ok(/tiny/i.test(r.smallSampleWarning));
  assert.ok(/not enough data to rank channels yet/.test(E.toText(r)));
});

t('clearly separated channels are ranked', () => {
  const r = E.decide({
    channels: {
      hn: { visits: 2000, checkouts: 400, paid: 80 },
      reddit: { visits: 2000, checkouts: 2, paid: 0 },
    },
  }, { seed: 3 });
  assert.strictEqual(r.rankable, true);
  assert.strictEqual(r.recommendation.verdict, 'ranked');
  assert.strictEqual(r.recommendation.channel, 'hn');
  assert.ok(r.thompson.effortSplit.hn > 0.95);
});

t('Thompson split sums to 1 and is reproducible by seed', () => {
  const a = E.decide(SMALL, { seed: 42 });
  const b = E.decide(SMALL, { seed: 42 });
  const c = E.decide(SMALL, { seed: 43 });
  const sum = Object.values(a.thompson.effortSplit).reduce((x, y) => x + y, 0);
  near(sum, 1, 1e-9);
  assert.deepStrictEqual(a.thompson.effortSplit, b.thompson.effortSplit);
  assert.notDeepStrictEqual(a.thompson.effortSplit, c.thompson.effortSplit);
});

t('graph evidence is cited with counts and sources', () => {
  const r = E.decide(SMALL, { seed: 3 });
  assert.ok(r.evidence.length > 0);
  const co = r.evidence.find((e) => e.rel === 'CHECKOUTS');
  assert.strictEqual(co.count, 2);
  assert.strictEqual(co.of, 80);
  assert.strictEqual(co.source, 'fixture stripe');
  assert.ok(r.leakiestStage.evidence.length > 0);
  assert.ok(r.leakiestStage.evidence.every((e) => e.rel === 'CONVERTS' && e.source === 'pooled totals'));
  const g = E.buildGraph(E.normalizeInput(SMALL));
  assert.ok(g.nodes.some((n) => n.id === 'page:/teams/' && n.type === 'page'));
  assert.ok(g.nodes.some((n) => n.id === 'offer:pro_guard' && n.type === 'offer'));
});

t('mismatched counts are clamped and warned, missing data is not invented', () => {
  const d = E.normalizeInput({ channels: { producthunt: { visits: 1, checkouts: 3, paid: 0 }, hn: { visits: null, checkouts: 1, paid: 0 } } });
  assert.ok(d.warnings.some((w) => w.includes('producthunt')));
  assert.strictEqual(d.channels.hn.visits, null);
  const r = E.decide({ channels: { hn: { visits: null, checkouts: 1, paid: 0 } } });
  assert.strictEqual(r.recommendation.verdict, 'not enough data to rank channels yet');
  assert.deepStrictEqual(r.thompson.eligibleChannels, []);
});

t('channel mapping', () => {
  assert.strictEqual(E.mapChannel('news.ycombinator.com'), 'hn');
  assert.strictEqual(E.mapChannel('www.producthunt.com'), 'producthunt');
  assert.strictEqual(E.mapChannel('github.com'), 'github_readme');
  assert.strictEqual(E.mapChannel(''), 'direct');
  assert.strictEqual(E.mapChannel('t.co'), 'other');
});

t('CLI: --input json and --text give 5-8 lines', () => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rde-')), 'in.json');
  fs.writeFileSync(f, JSON.stringify(SMALL));
  const j = JSON.parse(execFileSync('node', [TOOL, '--input', f, '--seed', '5'], { encoding: 'utf8' }));
  assert.ok(j.thompson && j.leakiestStage);
  const txt = execFileSync('node', [TOOL, '--input', f, '--text'], { encoding: 'utf8' }).trim().split('\n');
  assert.ok(txt.length >= 5 && txt.length <= 8, `lines=${txt.length}`);
});

console.log(`\n${passed} tests passed`);
