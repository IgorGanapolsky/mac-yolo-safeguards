#!/usr/bin/env node
'use strict';

/**
 * taste-gate.js — Mini "taste layer" for non-slop AI outputs (ThumbGate / Hermes).
 *
 * Inspired by Taste Labs framing (eval + production): decompose subjective quality
 * into scored dimensions + golden cases, then gate production paths.
 * This is NOT personalization ("what Igor likes this hour") — it is quality taste
 * for public promo, ship status, and operator-facing copy.
 *
 * Usage:
 *   node tools/taste-gate.js --domain promo_social --text "..." [--json]
 *   node tools/taste-gate.js --domain ship_status --text-file path [--json]
 *   node tools/taste-gate.js --domain promo_social --eval-golden [--json]
 *   node tools/taste-gate.js --list-domains
 *
 * Exit: 0 PASS · 1 FAIL (below threshold or golden regression) · 2 usage
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_GOLDEN = path.join(ROOT, 'evals/taste-golden-set.json');

/** @typedef {{ id: string, label: string, weight: number, min?: number }} Dimension */

const DOMAINS = {
  promo_social: {
    label: 'Public social / promo copy',
    threshold: 0.62,
    dimensions: [
      { id: 'specificity', label: 'Concrete scene / numbers / product truth', weight: 0.22 },
      { id: 'honesty', label: 'No fake traction / false affiliation / overclaim', weight: 0.25 },
      { id: 'brand_fit', label: 'ThumbGate.app-first, correct product/creator names', weight: 0.18 },
      { id: 'anti_slop', label: 'No generic AI filler / sycophancy / empty hype', weight: 0.2 },
      { id: 'cta', label: 'Clear actionable CTA or next step', weight: 0.15 },
    ],
  },
  ship_status: {
    label: 'Ship / LIVE / done status language',
    threshold: 0.7,
    dimensions: [
      { id: 'specificity', label: 'IDs, counts, paths, SHAs', weight: 0.3 },
      { id: 'honesty', label: 'Partial failures stated; no all-green theater', weight: 0.35 },
      { id: 'anti_slop', label: 'No vibes-only completion', weight: 0.2 },
      { id: 'cta', label: 'Next action or blocker if not done', weight: 0.15 },
    ],
  },
  outreach_email: {
    label: 'Outbound founder / buyer email',
    threshold: 0.6,
    dimensions: [
      { id: 'specificity', label: 'Named problem + their context', weight: 0.25 },
      { id: 'honesty', label: 'No fake scarcity / fake social proof', weight: 0.25 },
      { id: 'anti_slop', label: 'Short, non-template, non-sycophantic', weight: 0.25 },
      { id: 'cta', label: 'Single clear ask', weight: 0.25 },
    ],
  },
  product_ui: {
    label: 'In-product user-facing copy',
    threshold: 0.65,
    dimensions: [
      { id: 'specificity', label: 'Plain language, no internal jargon', weight: 0.3 },
      { id: 'honesty', label: 'Status matches reality (no false Connected)', weight: 0.3 },
      { id: 'anti_slop', label: 'Calm, short, no hype', weight: 0.25 },
      { id: 'cta', label: 'User knows next tap', weight: 0.15 },
    ],
  },
};

// --- signal libraries (deterministic, no LLM) ---

const SLOP_PHRASES = [
  /\bin today's fast[- ]paced\b/i,
  /\bleverage\s+(cutting[- ]edge|synerg)/i,
  /\bgame[- ]changer\b/i,
  /\brevolutionize\b/i,
  /\bunleash\s+(the\s+)?power\b/i,
  /\bseamless(ly)?\b/i,
  /\bdelve\s+into\b/i,
  /\bas an ai\b/i,
  /\bi hope this (email|message) finds you\b/i,
  /\bexcited to (share|announce)\b/i,
  /\bworld[- ]class\b/i,
  /\bnext[- ]level\b/i,
  /\btransform your (workflow|business)\b/i,
  /\byou'?re absolutely right\b/i,
  /\bgreat question[!.,]?\s*$/im,
];

const FAKE_TRACTION = [
  /\b\d{2,}\s*k\+\s*(users|installs|downloads)\b/i,
  /\b#1\s+(on\s+)?(product\s*hunt|app\s*store|play\s*store)\b/i,
  /\bmillion\s+(users|installs)\b/i,
  /\beveryone\s+is\s+using\b/i,
  /\bindustry[- ]leading\b/i,
];

const FALSE_AFFILIATION = [
  /\bofficial\s+partner\b/i,
  /\bwe\s+power\s+(nous|fly\.?io|anthropic|cursor)\b/i,
  /\bnous\s+research\s+endorses\b/i,
  /\bpartnership\s+with\s+nous\b/i,
  /\bofficial\s+nous\b/i,
];

const OVERCLAIM = [
  /\ball\s+(\d+\s+)?(posts?|replies?|channels?)\s+(are\s+)?(live|published)\b/i,
  /\beverything\s+is\s+(live|shipped|done)\b/i,
  /\b100%\s+(working|fixed|green)\b/i,
  /\bfan-?out\s+(is\s+)?(complete|done)\b/i,
];

const SPECIFICITY_POSITIVE = [
  /\bthumbgate\.(app|ai)\b/i,
  /\bIGO-\d+\b/,
  /\bAGENT-\d+\b/,
  /\bt1_[a-z0-9]+\b/i,
  /\bhttps?:\/\/\S+/i,
  /\b[a-f0-9]{7,40}\b/, // sha-ish
  /\be2e\s*=\s*pass\b/i,
  /\bok(Count)?:\s*\d+/i,
  /\b\d+\s+(LIVE|FAIL|BLOCKED)\b/,
  /\bMac\b|\bHermes\b|\bLeash\b|\bContinuity\b/,
  /\b\$\d+/,
  /\butm_/i,
];

const BRAND_POSITIVE = [
  /\bthumbgate\.app\b/i,
  /\bhermes\s+mobile\b/i,
  /\bcontinuity\b/i,
  /\bleash\b/i,
];

const CTA_POSITIVE = [
  /\bhttps?:\/\/\S*thumbgate\.(app|ai)/i,
  /\btry\b|\bstart\b|\bopen\b|\breply\b|\bbook\b|\binstall\b/i,
  /\bnext\s*step\b|\bdo this\b|\brun\b:\s*`/i,
  /\bcal\.com\//i,
];

const JARGON_UI = [
  /\bcomputer\s+link\b/i,
  /\bmacHttpOk\b/,
  /\bgateway\s+profile\b/i,
  /\bpair\s+payload\b/i,
];

function parseArgs(argv) {
  const out = {
    domain: 'promo_social',
    text: '',
    textFile: null,
    evalGolden: false,
    goldenPath: DEFAULT_GOLDEN,
    listDomains: false,
    json: false,
    minScore: null,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--json') out.json = true;
    else if (a === '--help' || a === '-h') out.help = true;
    else if (a === '--list-domains') out.listDomains = true;
    else if (a === '--eval-golden') out.evalGolden = true;
    else if (a === '--domain') out.domain = String(argv[++i] || '').trim();
    else if (a === '--text') out.text = String(argv[++i] || '');
    else if (a === '--text-file') out.textFile = argv[++i];
    else if (a === '--golden') out.goldenPath = path.resolve(argv[++i] || '');
    else if (a === '--min-score') out.minScore = parseFloat(argv[++i]);
  }
  return out;
}

function countMatches(text, patterns) {
  let n = 0;
  for (const re of patterns) {
    if (re.test(text)) n += 1;
  }
  return n;
}

function scoreDimension(id, text, domainId) {
  const t = String(text || '');
  const len = t.trim().length;
  if (!len) return { score: 0, notes: ['empty'] };

  switch (id) {
    case 'specificity': {
      const hits = countMatches(t, SPECIFICITY_POSITIVE);
      // length alone is not specificity — short concrete beats long vague
      const vagueLong = len > 400 && hits === 0;
      let score = Math.min(1, hits * 0.28);
      if (hits >= 1 && len < 80) score = Math.max(score, 0.55);
      if (hits >= 2) score = Math.max(score, 0.75);
      if (hits >= 3) score = 0.95;
      if (vagueLong) score = Math.min(score, 0.25);
      if (domainId === 'product_ui' && JARGON_UI.some((re) => re.test(t))) {
        score = Math.min(score, 0.35);
      }
      return { score, notes: [`specificity_hits=${hits}`] };
    }
    case 'honesty': {
      const fake = countMatches(t, FAKE_TRACTION);
      const aff = countMatches(t, FALSE_AFFILIATION);
      const over = countMatches(t, OVERCLAIM);
      let score = 1;
      if (fake) score -= 0.45 * fake;
      if (aff) score -= 0.5 * aff;
      if (over) score -= 0.4 * over;
      // honest partial matrix language is good
      if (/\bFAIL\b|\bBLOCKED\b|\bpartial\b|\bokCount=/i.test(t) && /\bLIVE\b/i.test(t)) {
        score = Math.max(score, 0.85);
      }
      score = Math.max(0, Math.min(1, score));
      return {
        score,
        notes: [`fake=${fake}`, `affiliation=${aff}`, `overclaim=${over}`],
      };
    }
    case 'brand_fit': {
      const hits = countMatches(t, BRAND_POSITIVE);
      let score = hits === 0 ? 0.35 : Math.min(1, 0.45 + hits * 0.25);
      if (FALSE_AFFILIATION.some((re) => re.test(t))) score = Math.min(score, 0.2);
      // store-only promo without thumbgate.app is weaker brand fit for default narrative
      if (/play\.google|apps\.apple\.com/i.test(t) && !/thumbgate\.app/i.test(t)) {
        score = Math.min(score, 0.45);
      }
      return { score, notes: [`brand_hits=${hits}`] };
    }
    case 'anti_slop': {
      const slop = countMatches(t, SLOP_PHRASES);
      let score = 1 - Math.min(1, slop * 0.35);
      // pure emoji / hype walls
      if ((t.match(/!/g) || []).length >= 5) score -= 0.2;
      if (/\bamazing\b.*\bincredible\b|\bincredible\b.*\bamazing\b/i.test(t)) score -= 0.25;
      // very short empty hype
      if (len < 40 && !SPECIFICITY_POSITIVE.some((re) => re.test(t))) score = Math.min(score, 0.4);
      score = Math.max(0, Math.min(1, score));
      return { score, notes: [`slop_hits=${slop}`] };
    }
    case 'cta': {
      const hits = countMatches(t, CTA_POSITIVE);
      let score = hits === 0 ? 0.25 : Math.min(1, 0.4 + hits * 0.3);
      if (domainId === 'ship_status') {
        // blocker or next command counts as CTA
        if (/\bnext\b|\bblocked\b|\brun\b|\bfix\b/i.test(t)) score = Math.max(score, 0.7);
      }
      return { score, notes: [`cta_hits=${hits}`] };
    }
    default:
      return { score: 0.5, notes: ['unknown_dimension'] };
  }
}

/**
 * Score text for a domain. Pure function for tests.
 */
function scoreTaste(text, domainId = 'promo_social', opts = {}) {
  const domain = DOMAINS[domainId];
  if (!domain) {
    return {
      ok: false,
      code: 'UNKNOWN_DOMAIN',
      domain: domainId,
      score: 0,
      threshold: 1,
      dimensions: {},
      message: `Unknown domain: ${domainId}`,
    };
  }
  const threshold =
    typeof opts.minScore === 'number' && !Number.isNaN(opts.minScore)
      ? opts.minScore
      : domain.threshold;

  const dimensions = {};
  let weighted = 0;
  let weightSum = 0;
  for (const dim of domain.dimensions) {
    const { score, notes } = scoreDimension(dim.id, text, domainId);
    dimensions[dim.id] = {
      score: round4(score),
      weight: dim.weight,
      label: dim.label,
      notes,
    };
    weighted += score * dim.weight;
    weightSum += dim.weight;
  }
  const total = weightSum > 0 ? weighted / weightSum : 0;
  const ok = total >= threshold;
  return {
    ok,
    code: ok ? 'PASS' : 'FAIL',
    domain: domainId,
    domainLabel: domain.label,
    score: round4(total),
    threshold,
    dimensions,
    message: ok
      ? `taste PASS ${domainId} score=${total.toFixed(3)} ≥ ${threshold}`
      : `taste FAIL ${domainId} score=${total.toFixed(3)} < ${threshold}`,
  };
}

function round4(n) {
  return Math.round(n * 10000) / 10000;
}

function loadGolden(filePath) {
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  return raw.cases || raw;
}

/**
 * Eval golden set: good cases must PASS; slop cases must FAIL.
 */
function evalGoldenSet(filePath = DEFAULT_GOLDEN) {
  const cases = loadGolden(filePath);
  const results = [];
  let pass = 0;
  let fail = 0;
  for (const c of cases) {
    const scored = scoreTaste(c.text, c.domain || 'promo_social', {
      minScore: c.threshold,
    });
    const expectPass = c.expect === 'pass' || c.expect === 'PASS' || c.label === 'good';
    const expectFail = c.expect === 'fail' || c.expect === 'FAIL' || c.label === 'slop';
    let okCase = true;
    let reason = 'ok';
    if (expectPass && !scored.ok) {
      okCase = false;
      reason = `expected PASS got FAIL score=${scored.score}`;
    } else if (expectFail && scored.ok) {
      okCase = false;
      reason = `expected FAIL got PASS score=${scored.score}`;
    } else if (!expectPass && !expectFail) {
      okCase = false;
      reason = 'case missing expect/label';
    }
    if (okCase) pass += 1;
    else fail += 1;
    results.push({
      id: c.id,
      ok: okCase,
      reason,
      score: scored.score,
      expect: expectPass ? 'pass' : 'fail',
      domain: c.domain,
    });
  }
  return {
    ok: fail === 0,
    pass,
    fail,
    total: cases.length,
    results,
    message:
      fail === 0
        ? `taste golden PASS ${pass}/${cases.length}`
        : `taste golden FAIL ${fail}/${cases.length} regressions`,
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(`taste-gate — non-slop taste layer (deterministic rubrics)

Domains: ${Object.keys(DOMAINS).join(', ')}

  node tools/taste-gate.js --domain promo_social --text "..."
  node tools/taste-gate.js --domain ship_status --text-file status.md --json
  node tools/taste-gate.js --eval-golden [--golden path]
  node tools/taste-gate.js --list-domains

Exit 0 PASS · 1 FAIL · 2 usage
Personalization ≠ taste: this gate scores quality, not user preference.`);
    process.exit(0);
  }

  if (args.listDomains) {
    if (args.json) {
      console.log(JSON.stringify(DOMAINS, null, 2));
    } else {
      for (const [id, d] of Object.entries(DOMAINS)) {
        console.log(`${id}\tthreshold=${d.threshold}\t${d.label}`);
        for (const dim of d.dimensions) {
          console.log(`  - ${dim.id} (w=${dim.weight}): ${dim.label}`);
        }
      }
    }
    process.exit(0);
  }

  if (args.evalGolden) {
    const report = evalGoldenSet(args.goldenPath);
    if (args.json) console.log(JSON.stringify(report, null, 2));
    else {
      console.log(report.message);
      for (const r of report.results.filter((x) => !x.ok)) {
        console.log(`  FAIL ${r.id}: ${r.reason}`);
      }
    }
    process.exit(report.ok ? 0 : 1);
  }

  let text = args.text;
  if (args.textFile) {
    text = fs.readFileSync(args.textFile, 'utf8');
  }
  if (!text || !String(text).trim()) {
    console.error('Error: --text or --text-file required (or --eval-golden / --list-domains)');
    process.exit(2);
  }
  if (!DOMAINS[args.domain]) {
    console.error(`Error: unknown domain ${args.domain}`);
    process.exit(2);
  }

  const result = scoreTaste(text, args.domain, { minScore: args.minScore });
  if (args.json) console.log(JSON.stringify(result, null, 2));
  else {
    console.log(result.message);
    for (const [id, d] of Object.entries(result.dimensions)) {
      console.log(`  ${id}: ${d.score.toFixed(2)} — ${d.notes.join(', ')}`);
    }
  }
  process.exit(result.ok ? 0 : 1);
}

module.exports = {
  DOMAINS,
  scoreTaste,
  scoreDimension,
  evalGoldenSet,
  parseArgs,
  DEFAULT_GOLDEN,
};

if (require.main === module) {
  main();
}
