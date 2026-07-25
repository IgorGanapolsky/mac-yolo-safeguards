#!/usr/bin/env node
'use strict';

/**
 * social-publish-gate.js — HARD pre-publish gate for social channels.
 *
 * Skills (never-double-post, no-hashnode, product mentions) are soft text.
 * This script is the enforceable gate agents must run before clicking Post.
 *
 * Usage:
 *   node tools/social-publish-gate.js --platform <name> --campaign <id> \
 *     [--hook "..."] [--body-file path | --body "..."] [--title "..."] \
 *     [--require-buy-links] [--require-mentions] [--allow-partial] [--json]
 *
 * Exit:
 *   0 = ALLOW (safe to publish once)
 *   1 = BLOCK (do not Post)
 *   2 = usage / IO error
 *
 * Checks:
 *   - Hashnode frozen
 *   - Zernio ban (platform name)
 *   - Content log double-post (same platform + campaign with LIVE URL)
 *   - Near-duplicate hook on same platform within lookback days
 *   - Dead free Play package URL in body
 *   - Optional buy-link / mention / honesty checks on body
 *   - LinkedIn: store app URLs belong in first comment (warn+block with body)
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_LOG = path.join(ROOT, 'docs/social/hermes-mobile-content-log.tsv');
const LOOKBACK_DAYS = 14;

const LIVE_STATUSES = new Set(['published', 'posted', 'live']);
const FROZEN_PLATFORMS = new Set(['hashnode']);
const BANNED_PLATFORMS = new Set(['zernio', 'creator-platform-promo', 'creator_platform_promo']);

const DEAD_FREE_PLAY_FRAGMENTS = [
  'id=com.iganapolsky.hermesmobile&',
  'id=com.iganapolsky.hermesmobile)',
  'id=com.iganapolsky.hermesmobile\t',
  'id=com.iganapolsky.hermesmobile ',
  'id=com.iganapolsky.hermesmobile\n',
];

const BUY_LINK_PATTERNS = [
  /thumbgate\.(ai|app)/i,
  /play\.google\.com\/store\/apps\/details\?id=com\.iganapolsky\.hermesmobile\.paid/i,
  /apps\.apple\.com\/.*hermes|id6786778037/i,
  /utm_source=/i,
  /cal\.com\/igor/i,
];

const FALSE_AFFILIATION = [
  /\bofficial\s+partner\b/i,
  /\bwe\s+power\s+(nous|fly\.?io|anthropic|cursor)\b/i,
  /\bnous\s+research\s+endorses\b/i,
  /\bpartnership\s+with\s+nous\b/i,
  /\bofficial\s+nous\b/i,
];

const FAKE_TRACTION = [
  /\b\d{2,}\s*k\+\s*(users|installs|downloads)\b/i,
  /\b#1\s+(on\s+)?(product\s*hunt|app\s*store|play\s*store)\b/i,
  /\bmillion\s+(users|installs)\b/i,
  /\bzero\s+telemetry\b/i,
];

const usage = `Usage:
  node tools/social-publish-gate.js --platform <name> --campaign <id> [options]

Required:
  --platform   linkedin|x|bluesky|threads|medium|dev.to|reddit|hackernews|...
  --campaign   campaign / cta batch id (e.g. evidence-installs-v1-20260725)

Optional:
  --hook "..."           opening line / hook for near-dup detection
  --body "..."           draft body text
  --body-file PATH       draft body from file
  --title "..."          title (Medium/dev.to)
  --log PATH             content log TSV (default docs/social/hermes-mobile-content-log.tsv)
  --lookback-days N      default ${LOOKBACK_DAYS}
  --require-buy-links    fail if body lacks ThumbGate/store/UTM CTA
  --require-mentions     fail if agent/cloud/pre-exec talk lacks product links
  --allow-partial        treat PARTIAL log rows as non-blocking for re-attempt
  --json                 machine-readable result
  --help

Exit 0 ALLOW · 1 BLOCK · 2 error

Agents MUST run this before Post/Publish. Skills alone are not enforcement.`;

function parseArgs(argv) {
  const args = {
    lookbackDays: LOOKBACK_DAYS,
    requireBuyLinks: false,
    requireMentions: false,
    allowPartial: false,
    json: false,
    log: DEFAULT_LOG,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--help' || a === '-h') args.help = true;
    else if (a === '--json') args.json = true;
    else if (a === '--require-buy-links') args.requireBuyLinks = true;
    else if (a === '--require-mentions') args.requireMentions = true;
    else if (a === '--allow-partial') args.allowPartial = true;
    else if (a === '--platform') args.platform = argv[++i];
    else if (a === '--campaign') args.campaign = argv[++i];
    else if (a === '--hook') args.hook = argv[++i];
    else if (a === '--body') args.body = argv[++i];
    else if (a === '--body-file') args.bodyFile = argv[++i];
    else if (a === '--title') args.title = argv[++i];
    else if (a === '--log') args.log = path.resolve(argv[++i]);
    else if (a === '--lookback-days') args.lookbackDays = Number(argv[++i]);
    else throw new Error(`Unknown argument: ${a}`);
  }
  return args;
}

function normalizePlatform(p) {
  let s = String(p || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '');
  if (s === 'twitter' || s === 'x.com' || s === 'x/twitter') s = 'x';
  if (s === 'devto' || s === 'dev-to') s = 'dev.to';
  // Do NOT substring-match "hn" — it corrupts "hashnode" → "hashackernewsode"
  if (s === 'hackernews' || s === 'hn' || s === 'showhn' || s === 'show-hn') {
    s = 'hackernews';
  }
  return s;
}

function normalizeStatus(s) {
  return String(s || '')
    .trim()
    .toLowerCase();
}

function isLiveStatus(status) {
  return LIVE_STATUSES.has(normalizeStatus(status));
}

function parseDate(s) {
  const d = new Date(String(s || '').trim());
  return Number.isNaN(d.getTime()) ? null : d;
}

function hookFingerprint(hook) {
  return String(hook || '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

function parseContentLog(logPath) {
  if (!fs.existsSync(logPath)) {
    return { header: [], rows: [], missing: true };
  }
  const raw = fs.readFileSync(logPath, 'utf8');
  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) return { header: [], rows: [], missing: false };
  const header = lines[0].split('\t');
  const idx = (name) => header.indexOf(name);
  const rows = [];
  for (let i = 1; i < lines.length; i += 1) {
    const cols = lines[i].split('\t');
    const get = (name) => {
      const j = idx(name);
      return j >= 0 ? (cols[j] || '').trim() : '';
    };
    rows.push({
      date: get('Date'),
      platform: normalizePlatform(get('Platform')),
      hook: get('Hook'),
      campaign: get('Campaign'),
      status: get('Status'),
      postUrl: get('PostURL'),
      outcome: get('Outcome'),
      raw: lines[i],
      line: i + 1,
    });
  }
  return { header, rows, missing: false };
}

function hasDeadFreePlay(text) {
  const t = String(text || '');
  if (!t.includes('com.iganapolsky.hermesmobile')) return false;
  // paid package is OK
  if (t.includes('com.iganapolsky.hermesmobile.paid')) {
    // still fail if free package also present as a standalone promo URL
    const withoutPaid = t.replace(/com\.iganapolsky\.hermesmobile\.paid/g, '');
    return DEAD_FREE_PLAY_FRAGMENTS.some((f) => withoutPaid.includes(f))
      || /id=com\.iganapolsky\.hermesmobile(?:[^\w.]|$)/.test(withoutPaid);
  }
  return (
    DEAD_FREE_PLAY_FRAGMENTS.some((f) => t.includes(f))
    || /id=com\.iganapolsky\.hermesmobile(?:[^\w.]|$)/.test(t)
  );
}

function hasBuyLink(text) {
  const t = String(text || '');
  return BUY_LINK_PATTERNS.some((re) => re.test(t));
}

function checkMentions(text) {
  const t = String(text || '');
  const failures = [];
  const lower = t.toLowerCase();

  const talksPreExec =
    /pre-?exec|green\/yellow\/red|before the agent acts|gatekeeper/.test(lower);
  if (talksPreExec) {
    const hasGk =
      /oakandsparrowsystemsenterprise\.(com|io)/i.test(t)
      || /gatekeeper/i.test(t);
    if (!hasGk) {
      failures.push(
        'Body discusses pre-exec/governance but lacks Gatekeeper name or oakandsparrowsystemsenterprise URL',
      );
    }
  }

  const talksHermesEcosystem =
    /\bnous\b|\bhermes agent\b|\bhermes-agent\b/i.test(t)
    && /\bhermes mobile\b|\bthumbgate\b/i.test(t);
  if (talksHermesEcosystem) {
    const disambig =
      /different product|not (the )?nous|nous research|hermes-agent\.nousresearch\.com|independent of nous/i.test(
        t,
      );
    if (!disambig && /nous/i.test(t)) {
      failures.push(
        'Body mentions Hermes Mobile/ThumbGate with Nous/Hermes Agent but lacks disambiguation',
      );
    }
  }

  const talksCloudContinuity =
    /cloud continuity|vps failover|fly\.io|continuity \(/.test(lower);
  if (talksCloudContinuity && /fly/i.test(t)) {
    if (!/fly\.io|@flydotio/i.test(t)) {
      failures.push('Body mentions Fly/Continuity cloud but lacks fly.io or @flydotio');
    }
  }

  return failures;
}

function loadBody(args) {
  if (args.bodyFile) {
    const p = path.resolve(args.bodyFile);
    if (!fs.existsSync(p)) throw new Error(`body-file not found: ${p}`);
    return fs.readFileSync(p, 'utf8');
  }
  return args.body || '';
}

function evaluate(args) {
  const blocks = [];
  const warnings = [];
  const platform = normalizePlatform(args.platform);
  const campaign = String(args.campaign || '').trim();
  const body = loadBody(args);
  const hook = args.hook || '';
  const title = args.title || '';
  const combined = [title, hook, body].filter(Boolean).join('\n');

  if (!platform) blocks.push('Missing --platform');
  if (!campaign) blocks.push('Missing --campaign');

  if (FROZEN_PLATFORMS.has(platform)) {
    blocks.push(
      `Platform "${platform}" is FROZEN (CEO 2026-07-23 AutoMod ban risk). Do not publish.`,
    );
  }
  if (BANNED_PLATFORMS.has(platform)) {
    blocks.push(
      `Platform/path "${platform}" is banned. Use Chrome computer-use fan-out, not Zernio.`,
    );
  }

  const log = parseContentLog(args.log);
  if (log.missing) {
    warnings.push(`Content log missing at ${args.log} — double-post check skipped`);
  } else {
    const cutoff = Date.now() - args.lookbackDays * 24 * 60 * 60 * 1000;
    const sameCampaignLive = log.rows.filter((r) => {
      if (r.platform !== platform) return false;
      if (r.campaign !== campaign) return false;
      if (!isLiveStatus(r.status)) {
        if (!args.allowPartial && normalizeStatus(r.status) === 'partial') {
          // PARTIAL with a real public URL still blocks re-post (title-only Medium case)
          if (r.postUrl && /^https?:\/\//i.test(r.postUrl) && r.postUrl !== '—') {
            return true;
          }
        }
        return false;
      }
      if (!r.postUrl || r.postUrl === '—' || r.postUrl.toLowerCase() === 'pending') {
        return false;
      }
      return true;
    });

    if (sameCampaignLive.length > 0) {
      const sample = sameCampaignLive
        .slice(0, 3)
        .map((r) => `L${r.line} ${r.status} ${r.postUrl}`)
        .join('; ');
      blocks.push(
        `Double-post blocked: ${platform} + campaign "${campaign}" already LIVE (${sameCampaignLive.length}). ${sample}. Do not Post again.`,
      );
    }

    if (hook) {
      const fp = hookFingerprint(hook);
      if (fp.length >= 20) {
        const near = log.rows.filter((r) => {
          if (r.platform !== platform) return false;
          if (!isLiveStatus(r.status)) return false;
          if (!r.postUrl || r.postUrl === '—') return false;
          const d = parseDate(r.date);
          if (d && d.getTime() < cutoff) return false;
          const other = hookFingerprint(r.hook);
          return other && (other === fp || other.includes(fp.slice(0, 40)) || fp.includes(other.slice(0, 40)));
        });
        // exclude exact campaign matches already reported
        const nearOther = near.filter((r) => r.campaign !== campaign);
        if (nearOther.length > 0) {
          blocks.push(
            `Near-duplicate hook on ${platform} within ${args.lookbackDays}d: ${nearOther
              .slice(0, 2)
              .map((r) => `${r.postUrl} (${r.campaign})`)
              .join('; ')}. Use a new angle or skip.`,
          );
        }
      }
    }
  }

  if (combined && hasDeadFreePlay(combined)) {
    blocks.push(
      'Body/hook contains retired free Play package id=com.iganapolsky.hermesmobile (use .paid).',
    );
  }

  for (const re of FALSE_AFFILIATION) {
    if (re.test(combined)) {
      blocks.push(`False-affiliation language matched: ${re}`);
    }
  }
  for (const re of FAKE_TRACTION) {
    if (re.test(combined)) {
      blocks.push(`Fake/unverified traction language matched: ${re}`);
    }
  }

  if (args.requireBuyLinks && body) {
    if (!hasBuyLink(body) && !hasBuyLink(combined)) {
      // LinkedIn often puts links in first comment — require flag note
      if (platform === 'linkedin') {
        warnings.push(
          'LinkedIn body has no buy links — first comment MUST carry Play/iOS/web UTMs before LIVE claim',
        );
      } else {
        blocks.push(
          'Missing buy/CTA links (thumbgate, paid Play, App Store, or utm_source). See thumbgate-promo-buy-links skill.',
        );
      }
    }
  }

  if (args.requireMentions && body) {
    for (const f of checkMentions(body)) blocks.push(f);
  } else if (body) {
    for (const f of checkMentions(body)) warnings.push(f);
  }

  // LinkedIn classic rule: Hermes store URLs in first comment, not body
  if (platform === 'linkedin' && body) {
    if (/play\.google\.com\/store\/apps\/details\?id=com\.iganapolsky\.hermesmobile/i.test(body)) {
      warnings.push(
        'LinkedIn body contains Play store URL — classic engine rule puts store links in first comment',
      );
    }
  }

  if (platform === 'reddit' && body && /play\.google\.com|apps\.apple\.com|thumbgate\.app\/\?utm/i.test(body)) {
    warnings.push(
      'Reddit body has hard promo links — many subs require discussion-first / links in comment only',
    );
  }

  const allow = blocks.length === 0;
  return {
    allow,
    decision: allow ? 'ALLOW' : 'BLOCK',
    platform,
    campaign,
    blocks,
    warnings,
    logPath: args.log,
    logRows: log.rows ? log.rows.length : 0,
    checkedAt: new Date().toISOString(),
  };
}

function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(err.message);
    console.error(usage);
    process.exit(2);
  }

  if (args.help) {
    console.log(usage);
    process.exit(0);
  }

  let result;
  try {
    result = evaluate(args);
  } catch (err) {
    console.error(err.message);
    process.exit(2);
  }

  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`social-publish-gate: ${result.decision}`);
    console.log(`  platform=${result.platform} campaign=${result.campaign}`);
    if (result.blocks.length) {
      console.log('  BLOCKS:');
      for (const b of result.blocks) console.log(`    - ${b}`);
    }
    if (result.warnings.length) {
      console.log('  WARNINGS:');
      for (const w of result.warnings) console.log(`    - ${w}`);
    }
    if (result.allow) {
      console.log('  OK to publish ONCE. After Post run: node tools/verify-public-post.js --url <permalink> ...');
    } else {
      console.log('  Do NOT click Post/Publish.');
    }
  }

  process.exit(result.allow ? 0 : 1);
}

if (require.main === module) {
  main();
}

module.exports = {
  parseArgs,
  evaluate,
  parseContentLog,
  normalizePlatform,
  isLiveStatus,
  hasDeadFreePlay,
  hasBuyLink,
  checkMentions,
  hookFingerprint,
  LIVE_STATUSES,
  FROZEN_PLATFORMS,
};
