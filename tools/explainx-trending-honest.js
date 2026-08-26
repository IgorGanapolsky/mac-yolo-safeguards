#!/usr/bin/env node
'use strict';

/**
 * Honest ExplainX /trending ingest.
 * Source: https://explainx.ai/trending
 *
 * The page is a 30-minute page-view ranking of explainx.ai content
 * (blogs, workshops, skills, MCP, tools). It is not a ThumbGate catalog.
 *
 * Complementary to tools/explainx-trending-rag-engine.js (hardcoded
 * theater: invented views/growth). Do not dual-edit that file.
 * Do not clone the ExplainX registry, courses, or workshops.
 */

const fs = require('fs');
const https = require('https');
const path = require('path');

const SOURCE = 'https://explainx.ai/trending';
const SCHEMA = 'explainx-trending-honest/v1';
const THEATER_TITLES = [
  'MCP Gateway Protocol & Tool Policy Interdiction',
  'Bounded Agent Plan-Act-Observe Loops',
  'Local-First OpenTelemetry Span Telemetry for LLMs',
  'Per-Agent Sandboxed Digital Coworkers',
  'Cryptographic Code Solver Receipts & Verification',
];

const ITEM_RE =
  /\\"type\\":\\"([a-z]+)\\",\\"typeLabel\\":\\"([^\\]+)\\",\\"name\\":\\"(.*?)\\",\\"description\\":\\"(.*?)\\",\\"href\\":\\"([^\\]+)\\",\\"score\\":(\d+)/g;

const MAP_RULES = [
  { re: /skill\.md|agent skills/i, skill: 'skill-catalog-governance', verdict: 'already_have' },
  { re: /openrouter|ox alpha|stealth model/i, skill: 'openai-ultrafast-fleet', verdict: 'cost_signal' },
  { re: /cursor auto|per-model|usage limits|5-hour limit|codex plus/i, skill: 'hermes-yolo-cost-autonomy', verdict: 'cost_signal' },
  { re: /eli5|visual html explainer/i, skill: null, verdict: 'skip_clone' },
  { re: /deslop|concise output|ai slop|asd-ste100/i, skill: 'output-quality-loop', verdict: 'already_have' },
  { re: /agent harness/i, skill: 'agent-harness-router', verdict: 'already_have' },
  { re: /yt-dlp/i, skill: 'real-estate-knowledge-scrape', verdict: 'already_have' },
  { re: /searxng/i, skill: 'search-as-code', verdict: 'related' },
  { re: /mcp bootcamp/i, skill: null, verdict: 'skip_not_ours' },
  {
    re: /timeline visualizer|humanoid robot|hop\.earth|roblox|grill-me|caveman|tencent-docs/i,
    skill: null,
    verdict: 'skip_not_ours',
  },
];

function honesty() {
  return {
    schema: SCHEMA,
    source: SOURCE,
    clonedExplainx: false,
    inventedViews: false,
    autoInstallTrendingSkills: false,
    dualEditRagEngine: false,
    steal: [
      'rank by observed page views parsed from the live payload, never invented ROI',
      'map each item onto an existing SKILLS.md rail or skip — do not clone the registry',
      'fail-closed: zero parsed items is UNAVAILABLE, not a fake catalog',
    ],
    skip: [
      'ExplainX courses, workshops, bootcamps, paid pathways',
      'auto-installing trending skills/MCP',
      'TF-IDF ROI from invented views/growthPct',
      'editing tools/explainx-trending-rag-engine.js',
    ],
  };
}

function unescapeRsc(s) {
  return String(s || '')
    .replace(/\\n/g, ' ')
    .replace(/\\"/g, '"')
    .replace(/\\u0027/g, "'")
    .replace(/\\'/g, "'");
}

function parseTrendingHtml(html) {
  const items = [];
  const seen = new Set();
  ITEM_RE.lastIndex = 0;
  let m;
  while ((m = ITEM_RE.exec(html))) {
    const href = unescapeRsc(m[5]);
    if (seen.has(href)) continue;
    seen.add(href);
    items.push({
      type: m[1],
      typeLabel: unescapeRsc(m[2]),
      name: unescapeRsc(m[3]),
      description: unescapeRsc(m[4]),
      href,
      url: href.startsWith('http') ? href : `https://explainx.ai${href}`,
      score: Number(m[6]),
    });
  }
  items.sort((a, b) => b.score - a.score);
  return items;
}

function theaterOverlap(items) {
  const names = new Set(items.map((it) => it.name));
  return THEATER_TITLES.filter((t) => names.has(t));
}

function loadRegisteredSkills() {
  const names = new Set();
  const skillsMd = path.join(__dirname, '..', 'SKILLS.md');
  if (fs.existsSync(skillsMd)) {
    const md = fs.readFileSync(skillsMd, 'utf8');
    for (const m of md.matchAll(/^\| `([^`]+)` \|/gm)) names.add(m[1]);
  }
  const agentsDir = path.join(__dirname, '..', '.agents', 'skills');
  if (fs.existsSync(agentsDir)) {
    for (const ent of fs.readdirSync(agentsDir, { withFileTypes: true })) {
      if (
        ent.isDirectory() &&
        fs.existsSync(path.join(agentsDir, ent.name, 'SKILL.md'))
      ) {
        names.add(ent.name);
      }
    }
  }
  return names;
}

function mapItem(item, registered) {
  const hay = `${item.name} ${item.description} ${item.href}`;
  for (const rule of MAP_RULES) {
    if (rule.re.test(hay)) {
      let skill = rule.skill;
      let verdict = rule.verdict;
      if (skill && registered && !registered.has(skill)) {
        if (verdict === 'cost_signal') skill = null;
        else {
          verdict = 'unmapped';
          skill = null;
        }
      }
      return {
        ...item,
        verdict,
        existingSkill: skill,
        action: actionFor(verdict, skill),
      };
    }
  }
  if (item.type === 'workshop' || item.type === 'bootcamp' || item.type === 'course') {
    return {
      ...item,
      verdict: 'skip_not_ours',
      existingSkill: null,
      action: 'Skip ExplainX training product — do not clone courses.',
    };
  }
  return {
    ...item,
    verdict: 'backlog',
    existingSkill: null,
    action: 'One-line backlog only if it maps to an existing rail; do not generate a new engine.',
  };
}

function actionFor(verdict, skill) {
  if (verdict === 'already_have') return `Use existing /${skill} — do not clone the trending listing.`;
  if (verdict === 'cost_signal') {
    return skill
      ? `Cost signal only: keep the $10/mo fail-closed cap; optional via /${skill}, never a new default paid route.`
      : 'Cost signal only: keep the $10/mo fail-closed cap; no registered skill slash — do not invent one.';
  }
  if (verdict === 'related') return `Related to /${skill}; do not add an unpaid public MCP default.`;
  if (verdict === 'unmapped') return 'No registered SKILLS.md / .agents/skills entry — do not emit an unusable slash.';
  if (verdict === 'skip_clone') return 'Skip clone (visual explainer skill is not ThumbGate).';
  if (verdict === 'skip_not_ours') return 'Not our product.';
  return 'Backlog one-liner only.';
}

function analyze(html, opts = {}) {
  const h = honesty();
  const items = parseTrendingHtml(html || '');
  const registered = opts.registeredSkills || loadRegisteredSkills();
  if (!items.length) {
    return {
      ...h,
      status: 'UNAVAILABLE',
      liveClaim: false,
      reason: 'no ranked items parsed from HTML — not a fake catalog',
      itemsAnalyzed: 0,
      mapped: [],
      theaterTitlesOnPage: [],
      // Parsing failed: do not assert theater. Unknown until titles are observed.
      legacyEngineIsTheater: null,
    };
  }
  const mapped = items.map((item) => mapItem(item, registered));
  const overlap = theaterOverlap(items);
  return {
    ...h,
    status: 'SUCCESS',
    liveClaim: Boolean(opts.liveFetch),
    itemsAnalyzed: items.length,
    fetchedAt: opts.fetchedAt || null,
    mapped,
    alreadyHave: mapped.filter((x) => x.verdict === 'already_have').length,
    costSignals: mapped.filter((x) => x.verdict === 'cost_signal').length,
    skipped: mapped.filter((x) => x.verdict.startsWith('skip')).length,
    theaterTitlesOnPage: overlap,
    legacyEngineIsTheater: overlap.length === 0,
    reason:
      overlap.length === 0
        ? 'live ranking parsed; hardcoded rag-engine titles are not on the page'
        : 'parsed items include rag-engine titles (unexpected)',
  };
}

function fetchTrending(url = SOURCE, timeoutMs = 25000) {
  return new Promise((resolve, reject) => {
    const req = https.get(
      url,
      {
        headers: { 'User-Agent': 'mac-yolo-explainx-trending-honest/1', Accept: 'text/html' },
        timeout: timeoutMs,
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          resolve({
            statusCode: res.statusCode,
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });
      },
    );
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('timeout'));
    });
    req.on('error', reject);
  });
}

async function main(argv) {
  const args = argv || process.argv.slice(2);
  const json = args.includes('--json');
  const fixtureIdx = args.indexOf('--fixture');
  const htmlIdx = args.indexOf('--html');
  const wantFetch = args.includes('--fetch') || args.includes('--live');
  let html = '';
  let liveFetch = false;
  let fetchedAt = null;
  if (fixtureIdx >= 0) {
    html = fs.readFileSync(args[fixtureIdx + 1], 'utf8');
  } else if (htmlIdx >= 0) {
    html = fs.readFileSync(args[htmlIdx + 1], 'utf8');
  } else if (wantFetch) {
    const r = await fetchTrending();
    html = r.body;
    liveFetch = r.statusCode === 200 && html.length > 0;
    fetchedAt = new Date().toISOString();
  } else {
    const def = path.join(__dirname, '..', 'tests', 'fixtures', 'explainx-trending-rsc-snippet.html');
    html = fs.readFileSync(def, 'utf8');
  }
  const report = analyze(html, { liveFetch, fetchedAt });
  process.stdout.write(`${JSON.stringify(report, null, json ? 2 : 0)}\n`);
  return report.status === 'SUCCESS' ? 0 : 1;
}

if (require.main === module) {
  main().then(
    (code) => process.exit(code),
    (err) => {
      process.stderr.write(`${err && err.message ? err.message : err}\n`);
      process.exit(1);
    },
  );
}

module.exports = {
  SOURCE,
  THEATER_TITLES,
  honesty,
  parseTrendingHtml,
  mapItem,
  loadRegisteredSkills,
  analyze,
  fetchTrending,
  main,
};
