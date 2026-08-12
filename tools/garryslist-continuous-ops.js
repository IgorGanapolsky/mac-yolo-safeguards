#!/usr/bin/env node
'use strict';

/**
 * Garry's List continuous ops (scrape → score → stage engage/publish).
 *
 * Site truth (2026-08-12): garryslist.org is a California builder/civic 501(c)(4)
 * publication + membership forum — NOT a gig marketplace. Public posts scrape
 * fine over HTTPS. Commenting/publishing requires membership approval.
 *
 * Usage:
 *   node tools/garryslist-continuous-ops.js scrape [--json]
 *   node tools/garryslist-continuous-ops.js cycle  [--json]   # scrape+score+stage (LaunchAgent)
 *   node tools/garryslist-continuous-ops.js status [--json]
 *
 * State: ~/.hermes-garryslist/
 *   feed-latest.json, opportunities.jsonl, drafts/, cycle-latest.json, ledger.jsonl
 *
 * Engage/publish: staged only until membership is APPROVED. Cron never spams.
 */

const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const os = require('os');
const crypto = require('crypto');

const HOME = os.homedir();
const STATE_DIR = process.env.GARRYSLIST_STATE_DIR || path.join(HOME, '.hermes-garryslist');
const VAULT_NOTE =
  process.env.GARRYSLIST_VAULT_NOTE ||
  path.join(HOME, 'Documents/AI-Agent-Sync/Agent-State/garryslist-continuous.md');
const BASE = 'https://garryslist.org';

const HIGH_VALUE_KEYWORDS = [
  'ai',
  'agent',
  'techno',
  'technology',
  'builder',
  'startup',
  'abundance',
  'innovation',
  'automation',
  'software',
  'compute',
  'model',
  'openai',
  'anthropic',
  'gatekeeper',
  'octopus',
  'api',
  'platform',
];

const MONEY_PATHS = {
  afterhours_ops:
    'After-Hours Leak Score ($149 audit) for HVAC/plumbing missed-call leakage — operator ops, not CA politics theater',
  builder_ai_ops:
    'Multi-agent fleet control + memory-before-gen for builders who run agents in production',
  continuity:
    'Continuity/offline failover narrative only when membership allows product promo without affiliation claims',
};

function parseArgs(argv) {
  const out = { cmd: null, json: false, help: false };
  const args = argv.slice(2);
  if (args[0] && !args[0].startsWith('-')) out.cmd = args.shift();
  for (const a of args) {
    if (a === '--json') out.json = true;
    else if (a === '--help' || a === '-h') out.help = true;
    else throw new Error(`Unknown argument: ${a}`);
  }
  return out;
}

function usage() {
  return `garryslist-continuous-ops — scrape/score/stage Garry's List

Commands:
  scrape   Fetch public homepage + extract posts
  cycle    Full LaunchAgent cycle (scrape, score, stage drafts, ledger)
  status   Show state dir + last cycle

State: ${STATE_DIR}
`;
}

function ensureDir(d) {
  fs.mkdirSync(d, { recursive: true });
}

function fetchText(url, timeoutMs = 25000) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith('https') ? https : http;
    const req = lib.get(
      url,
      {
        headers: {
          'User-Agent':
            'mac-yolo-garryslist-ops/1.0 (+local continuous intel; respectful public scrape)',
          Accept: 'text/html,application/xhtml+xml',
        },
        timeout: timeoutMs,
      },
      (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          const next = res.headers.location.startsWith('http')
            ? res.headers.location
            : new URL(res.headers.location, url).toString();
          res.resume();
          fetchText(next, timeoutMs).then(resolve, reject);
          return;
        }
        if (res.statusCode !== 200) {
          reject(new Error(`HTTP ${res.statusCode} for ${url}`));
          res.resume();
          return;
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
      },
    );
    req.on('error', reject);
    req.on('timeout', () => {
      req.destroy(new Error(`timeout ${url}`));
    });
  });
}

function decodeEntities(s) {
  // Decode named/numeric entities. &amp; last so we never double-unescape.
  return String(s || '')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

function extractPosts(html) {
  const posts = [];
  const seen = new Set();
  const re = /<h[2-4][^>]*>\s*<a[^>]+href="(\/posts\/[^"#]+)"[^>]*>([^<]+)<\/a>/gi;
  let m;
  while ((m = re.exec(html))) {
    const slugPath = m[1];
    const title = decodeEntities(m[2]).trim();
    const url = BASE + slugPath;
    if (seen.has(url) || slugPath.includes('/feed')) continue;
    seen.add(url);
    posts.push({ title, path: slugPath, url, slug: slugPath.replace(/^\/posts\//, '') });
  }
  // channel links from nav (context only)
  const channels = [...new Set((html.match(/\/posts\?channel=([a-z_]+)/g) || []).map((x) => x.split('=')[1]))];
  return { posts, channels };
}

function scorePost(post) {
  const hay = `${post.title} ${post.slug}`.toLowerCase();
  const hits = HIGH_VALUE_KEYWORDS.filter((k) => hay.includes(k));
  let score = hits.length * 10;
  if (/ai|agent|techno|technology|builder|startup|gatekeeper|octopus|api/.test(hay)) score += 20;
  if (/crime|homeless|tax|housing|police|fentanyl|overdose/.test(hay)) score += 2; // civic intel, lower money path
  let moneyAngle = null;
  if (/ai|agent|techno|technology|builder|gatekeeper|octopus|automation/.test(hay)) {
    moneyAngle = 'builder_ai_ops';
  } else if (/small business|storefront|red tape/.test(hay)) {
    moneyAngle = 'afterhours_ops';
  }
  return {
    ...post,
    score,
    keyword_hits: hits,
    money_angle: moneyAngle,
    money_path_note: moneyAngle ? MONEY_PATHS[moneyAngle] : null,
    engage_priority: score >= 25 ? 'high' : score >= 10 ? 'medium' : 'low',
  };
}

function draftComment(post) {
  if (post.money_angle === 'builder_ai_ops') {
    return {
      post_url: post.url,
      title: post.title,
      body: [
        `Strong piece. The operator version of this fight shows up in production agent fleets every day: open interfaces and short-lived auth beat siloed dashboards, and "memory before gen" beats re-burning tokens on the same analysis.`,
        ``,
        `I run multi-agent systems on Mac/mobile (control plane + continuity when the laptop sleeps). Happy to add concrete failure modes if useful — runaway loops, dashboard thrash, and false "we're productive because tokens burned."`,
        ``,
        `— Igor (builder; membership pending for full forum reply)`,
      ].join('\n'),
      mode: 'DRAFT_ONLY_until_membership_approved',
      promo: 'soft — no hard CTA unless membership allows; no fake traction',
    };
  }
  if (post.money_angle === 'afterhours_ops') {
    return {
      post_url: post.url,
      title: post.title,
      body: [
        `The small-business cost of broken after-hours capture is concrete: missed calls after 5pm leak jobs that never show up in a dashboard.`,
        ``,
        `We score HVAC/plumbing sites for after-hours leak (answer rate, CTA, mobile call path) before any pitch — $149 audit path for operators who want the number, not a slide deck.`,
        ``,
        `— Igor`,
      ].join('\n'),
      mode: 'DRAFT_ONLY_until_membership_approved',
      promo: 'AHLS $149 — value-first',
    };
  }
  return {
    post_url: post.url,
    title: post.title,
    body: [
      `Useful civic reporting. Filing for later cross-check against builder/AI policy threads on the same site.`,
      ``,
      `— Igor`,
    ].join('\n'),
    mode: 'DRAFT_ONLY_low_priority',
    promo: 'none',
  };
}

function draftArticleIdeas(scored) {
  const top = scored.filter((p) => p.engage_priority === 'high').slice(0, 5);
  return [
    {
      id: 'builder-vs-spreadsheet-ops',
      status: 'DRAFT_OUTLINE',
      title: 'Red Robin Died by Spreadsheet — Agents Die by Vanity Metrics',
      hooks_from: top.map((p) => p.url),
      outline: [
        'Open with operator failure mode (token vanity vs outcome metrics)',
        'Map to memory-before-gen + short-lived tokens (Vercel Connect pattern)',
        'Honest product: AfterHours Ops / fleet control — no fake customers',
        'CTA only if membership publish is open: apply@ style, or external post + link back',
      ],
      publish_target: 'garryslist.org (when member) + Medium/dev.to mirror',
    },
    {
      id: 'open-apis-agent-gatekeepers',
      status: 'DRAFT_OUTLINE',
      title: 'The New Octopus for Agents: Open APIs or Locked Dashboards',
      hooks_from: scored.filter((p) => /octopus|gatekeeper/i.test(p.title)).map((p) => p.url),
      outline: [
        'Platform lock-in as agent tax',
        'MCP data tools pattern: ask tools you already pay for',
        'Our stack: grepai + github MCP + staged Semrush — no theater CONNECTED claims',
      ],
      publish_target: 'garryslist.org when approved',
    },
  ];
}

function appendJsonl(file, obj) {
  ensureDir(path.dirname(file));
  fs.appendFileSync(file, `${JSON.stringify(obj)}\n`, 'utf8');
}

function writeJson(file, obj) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, `${JSON.stringify(obj, null, 2)}\n`, 'utf8');
}

function readJson(file, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

async function scrape() {
  const html = await fetchText(BASE + '/');
  const { posts, channels } = extractPosts(html);
  const scored = posts.map(scorePost).sort((a, b) => b.score - a.score);
  const result = {
    ok: true,
    action: 'scrape',
    timestamp: new Date().toISOString(),
    source: BASE,
    post_count: scored.length,
    channels,
    posts: scored,
    high_value: scored.filter((p) => p.engage_priority === 'high'),
  };
  writeJson(path.join(STATE_DIR, 'feed-latest.json'), result);
  return result;
}

async function cycle() {
  ensureDir(STATE_DIR);
  ensureDir(path.join(STATE_DIR, 'drafts'));
  const scraped = await scrape();
  const comments = scraped.high_value.slice(0, 8).map(draftComment);
  const articles = draftArticleIdeas(scraped.posts);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const draftPack = {
    generated_at: new Date().toISOString(),
    membership: 'PENDING_APPROVAL — Application submitted 2026-08-12; Garry will be in touch',
    account: 'iganapolsky / Igor Ganapolsky (Google SSO + LinkedIn verify)',
    engage_policy: {
      auto_comment: false,
      reason: 'Membership not approved yet; never spam; stage drafts only',
      when_approved: 'Human or agent with --engage-approved flag posts value-first comments max 2/day',
    },
    comments,
    articles,
  };
  writeJson(path.join(STATE_DIR, 'drafts', `pack-${stamp}.json`), draftPack);
  writeJson(path.join(STATE_DIR, 'drafts', 'latest.json'), draftPack);

  for (const p of scraped.high_value) {
    appendJsonl(path.join(STATE_DIR, 'opportunities.jsonl'), {
      ts: new Date().toISOString(),
      url: p.url,
      title: p.title,
      score: p.score,
      money_angle: p.money_angle,
    });
  }

  const cycleOut = {
    ok: true,
    action: 'cycle',
    timestamp: new Date().toISOString(),
    scraped_posts: scraped.post_count,
    high_value: scraped.high_value.length,
    drafts_path: path.join(STATE_DIR, 'drafts', 'latest.json'),
    top: scraped.high_value.slice(0, 5).map((p) => ({ title: p.title, url: p.url, score: p.score })),
    next_money_moves: [
      'Wait for Garry membership approval email (apply@reply.garryslist.org)',
      'When approved: post 1 value-first comment on top AI/tech thread from drafts/latest.json',
      'Publish article outline "Red Robin / vanity metrics" on GL or Medium+dev.to with honest CTAs',
      'Do not double-post; log each live URL in ledger.jsonl',
    ],
  };
  writeJson(path.join(STATE_DIR, 'cycle-latest.json'), cycleOut);
  appendJsonl(path.join(STATE_DIR, 'ledger.jsonl'), {
    ts: cycleOut.timestamp,
    event: 'cycle',
    high_value: cycleOut.high_value,
    scraped_posts: cycleOut.scraped_posts,
  });

  // vault note (best-effort)
  try {
    ensureDir(path.dirname(VAULT_NOTE));
    const lines = [
      `# Garry's List continuous`,
      ``,
      `- **Updated:** ${cycleOut.timestamp}`,
      `- **Account:** Igor Ganapolsky / iganapolsky (Google SSO); LinkedIn verified; **membership PENDING**`,
      `- **Last cycle:** ${cycleOut.scraped_posts} posts, ${cycleOut.high_value} high-value`,
      `- **State:** \`${STATE_DIR}\``,
      `- **Top:**`,
      ...cycleOut.top.map((t) => `  - [${t.title}](${t.url}) score=${t.score}`),
      `- **Engage:** drafts only until membership approved`,
      ``,
    ];
    fs.writeFileSync(VAULT_NOTE, lines.join('\n'), 'utf8');
  } catch {
    // vault path may be missing on CI
  }

  return cycleOut;
}

function status() {
  const cycleLatest = readJson(path.join(STATE_DIR, 'cycle-latest.json'), null);
  const feed = readJson(path.join(STATE_DIR, 'feed-latest.json'), null);
  const drafts = readJson(path.join(STATE_DIR, 'drafts', 'latest.json'), null);
  return {
    ok: true,
    action: 'status',
    state_dir: STATE_DIR,
    cycle_latest: cycleLatest,
    feed_post_count: feed?.post_count ?? null,
    drafts_comments: drafts?.comments?.length ?? 0,
    membership: drafts?.membership || 'unknown',
  };
}

function printHuman(result) {
  if (result.action === 'scrape') {
    console.log(`Scraped ${result.post_count} posts from ${result.source}`);
    console.log(`High-value: ${result.high_value.length}`);
    for (const p of result.high_value.slice(0, 10)) {
      console.log(`  [${p.score}] ${p.title}`);
      console.log(`      ${p.url}`);
    }
    return;
  }
  if (result.action === 'cycle') {
    console.log(`Cycle OK @ ${result.timestamp}`);
    console.log(`  posts=${result.scraped_posts} high_value=${result.high_value}`);
    console.log(`  drafts=${result.drafts_path}`);
    for (const t of result.top) console.log(`  - ${t.title} (${t.score})`);
    console.log('Next:');
    for (const n of result.next_money_moves) console.log(`  • ${n}`);
    return;
  }
  if (result.action === 'status') {
    console.log(JSON.stringify(result, null, 2));
    return;
  }
  console.log(JSON.stringify(result, null, 2));
}

async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv);
  } catch (e) {
    console.error(e.message || e);
    process.exit(2);
  }
  if (opts.help || !opts.cmd) {
    process.stdout.write(usage());
    process.exit(opts.help ? 0 : 2);
  }

  let result;
  try {
    if (opts.cmd === 'scrape') result = await scrape();
    else if (opts.cmd === 'cycle') result = await cycle();
    else if (opts.cmd === 'status') result = status();
    else throw new Error(`Unknown command: ${opts.cmd}`);
  } catch (e) {
    console.error(e.message || e);
    process.exit(1);
  }

  if (opts.json) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  else printHuman(result);
  if (result && result.ok === false) process.exit(1);
}

if (require.main === module) {
  main();
}

module.exports = {
  extractPosts,
  scorePost,
  draftComment,
  decodeEntities,
  HIGH_VALUE_KEYWORDS,
  MONEY_PATHS,
};
