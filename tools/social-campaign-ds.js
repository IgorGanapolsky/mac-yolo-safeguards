#!/usr/bin/env node
'use strict';

/**
 * social-campaign-ds.js — data-science scoreboard for social campaigns.
 *
 * Joins docs/social/hermes-mobile-content-log.tsv (what we published) with
 * first-party funnel attribution counters (what converted on thumbgate.app).
 *
 * This does NOT invent platform impressions (LinkedIn/X APIs still unmeasured).
 * It ranks campaigns by our own landing/sign-in/store click events keyed by
 * utm_campaign / cta_id — the only honest closed loop we control.
 *
 * Usage:
 *   node tools/social-campaign-ds.js
 *   node tools/social-campaign-ds.js --attribution-file path/to/attribution.json
 *   node tools/social-campaign-ds.js --json --lookback-days 30
 *   node tools/social-campaign-ds.js --out social-campaign-ds.md
 *
 * Attribution JSON shape (admin activity dump or fixture):
 *   { "attributionToday": [ { "event", "utmSource", "utmMedium", "utmCampaign", "ctaId", "count" } ] }
 *   or { "rows": [ ...same... ] }
 *   or a bare array.
 *
 * Exit 0 always on successful report (even if sample size is too small to crown a winner).
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const DEFAULT_LOG = path.join(ROOT, 'docs/social/hermes-mobile-content-log.tsv');

const usage = `Usage:
  node tools/social-campaign-ds.js [options]

Options:
  --log PATH                 content log TSV (default docs/social/hermes-mobile-content-log.tsv)
  --attribution-file PATH    JSON dump of funnel attribution rows
  --lookback-days N          content-log window (default 30)
  --min-events N             min attributed events to call a winner (default 5)
  --json                     machine-readable report
  --out PATH                 write markdown report
  --help`;

function parseArgs(argv) {
  const args = {
    log: DEFAULT_LOG,
    lookbackDays: 30,
    minEvents: 5,
    json: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--help' || a === '-h') args.help = true;
    else if (a === '--json') args.json = true;
    else if (a === '--log') args.log = path.resolve(argv[++i]);
    else if (a === '--attribution-file') args.attributionFile = path.resolve(argv[++i]);
    else if (a === '--lookback-days') args.lookbackDays = Number(argv[++i]);
    else if (a === '--min-events') args.minEvents = Number(argv[++i]);
    else if (a === '--out') args.out = argv[++i];
    else throw new Error(`Unknown argument: ${a}`);
  }
  return args;
}

function parseContentLog(logPath) {
  if (!fs.existsSync(logPath)) return [];
  const lines = fs.readFileSync(logPath, 'utf8').split(/\r?\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
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
      platform: get('Platform'),
      hook: get('Hook'),
      campaign: get('Campaign'),
      status: get('Status'),
      postUrl: get('PostURL'),
      outcome: get('Outcome'),
      line: i + 1,
    });
  }
  return rows;
}

function loadAttribution(filePath) {
  if (!filePath) return [];
  if (!fs.existsSync(filePath)) {
    throw new Error(`attribution file not found: ${filePath}`);
  }
  const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw.attributionToday)) return raw.attributionToday;
  if (Array.isArray(raw.rows)) return raw.rows;
  if (Array.isArray(raw.attribution)) return raw.attribution;
  return [];
}

function normalizeToken(s) {
  return String(s || '')
    .trim()
    .toLowerCase();
}

function isLiveStatus(status) {
  const s = normalizeToken(status);
  return s === 'published' || s === 'posted' || s === 'live';
}

function withinLookback(dateStr, lookbackDays) {
  const d = new Date(String(dateStr || '').trim());
  if (Number.isNaN(d.getTime())) return true; // keep undated rows
  const cutoff = Date.now() - lookbackDays * 24 * 60 * 60 * 1000;
  return d.getTime() >= cutoff;
}

/**
 * Build campaign scoreboard.
 * Pure function — exported for tests.
 */
function buildScoreboard({ contentRows, attributionRows, lookbackDays, minEvents }) {
  const recent = contentRows.filter((r) => withinLookback(r.date, lookbackDays));
  const byCampaign = new Map();

  function ensure(campaign) {
    const key = campaign || '(no-campaign)';
    if (!byCampaign.has(key)) {
      byCampaign.set(key, {
        campaign: key,
        postsLive: 0,
        postsPartial: 0,
        postsBlocked: 0,
        postsDrafted: 0,
        platforms: new Set(),
        postUrls: [],
        hooks: [],
        landingViews: 0,
        signInClicks: 0,
        playStoreClicks: 0,
        appStoreClicks: 0,
        playStorePreviews: 0,
        appStorePreviews: 0,
        freeControlClicks: 0,
        cloudContinuityClicks: 0,
        otherAttributed: 0,
        attributedTotal: 0,
        ctaIds: new Set(),
        landingCtaIds: new Set(),
        storeClickRows: [],
        utmSources: new Set(),
      });
    }
    return byCampaign.get(key);
  }

  for (const row of recent) {
    const bucket = ensure(row.campaign);
    const st = normalizeToken(row.status);
    if (isLiveStatus(st)) {
      bucket.postsLive += 1;
      if (row.postUrl && row.postUrl.startsWith('http')) bucket.postUrls.push(row.postUrl);
      if (row.hook) bucket.hooks.push(row.hook.slice(0, 80));
    } else if (st === 'partial') bucket.postsPartial += 1;
    else if (st === 'blocked') bucket.postsBlocked += 1;
    else if (st === 'drafted') bucket.postsDrafted += 1;
    if (row.platform) bucket.platforms.add(row.platform);
  }

  // Match attribution rows onto campaigns via utm_campaign exact or cta_id prefix.
  const campaignKeys = [...byCampaign.keys()].filter((k) => k !== '(no-campaign)');

  function matchCampaign(utmCampaign, ctaId) {
    const uc = normalizeToken(utmCampaign);
    const cta = normalizeToken(ctaId);
    if (uc) {
      const candidates = campaignKeys.map((key) => ({
        key,
        normalized: normalizeToken(key),
      }));
      const exact = candidates.find((candidate) => candidate.normalized === uc);
      if (exact) return exact.key;
      // Prefer the longest substantial loose match so prefix-related campaign
      // IDs cannot steal an exact-but-later campaign's attribution.
      const loose = candidates
        .filter(
          (candidate) =>
            uc.includes(candidate.normalized) ||
            candidate.normalized.includes(uc),
        )
        .sort((left, right) => right.normalized.length - left.normalized.length);
      if (loose[0]) return loose[0].key;
    }
    if (cta) {
      for (const key of campaignKeys) {
        const nk = normalizeToken(key);
        if (cta.startsWith(nk) || nk.startsWith(cta.split('_')[0] || '')) {
          // Prefer cta prefix match only when substantial
          if (nk.length >= 8 && cta.includes(nk.slice(0, Math.min(12, nk.length)))) return key;
        }
      }
      // group unmatched but present cta under synthetic campaign
      return `cta:${ctaId}`;
    }
    if (uc) return `utm:${utmCampaign}`;
    return '(unattributed-token)';
  }

  for (const row of attributionRows) {
    const event = String(row.event || '');
    const count = Number(row.count || 0) || 0;
    if (count <= 0) continue;
    const utmCampaign = row.utmCampaign || row.utm_campaign || '';
    const ctaId = row.ctaId || row.cta_id || '';
    const utmSource = row.utmSource || row.utm_source || '';
    const key = matchCampaign(utmCampaign, ctaId);
    const bucket = ensure(key);
    if (ctaId) bucket.ctaIds.add(String(ctaId));
    if (utmSource) bucket.utmSources.add(String(utmSource));
    switch (event) {
      case 'landing_view':
        bucket.attributedTotal += count;
        bucket.landingViews += count;
        if (ctaId) bucket.landingCtaIds.add(normalizeToken(ctaId));
        break;
      case 'sign_in_click':
        bucket.attributedTotal += count;
        bucket.signInClicks += count;
        break;
      case 'play_store_click':
        bucket.attributedTotal += count;
        bucket.playStoreClicks += count;
        bucket.storeClickRows.push({ ctaId: normalizeToken(ctaId), count });
        break;
      case 'app_store_click':
        bucket.attributedTotal += count;
        bucket.appStoreClicks += count;
        bucket.storeClickRows.push({ ctaId: normalizeToken(ctaId), count });
        break;
      case 'play_store_preview':
        bucket.playStorePreviews += count;
        break;
      case 'app_store_preview':
        bucket.appStorePreviews += count;
        break;
      case 'free_control_click':
        bucket.attributedTotal += count;
        bucket.freeControlClicks += count;
        break;
      case 'cloud_continuity_click':
        bucket.attributedTotal += count;
        bucket.cloudContinuityClicks += count;
        break;
      default:
        bucket.attributedTotal += count;
        bucket.otherAttributed += count;
    }
  }

  const rows = [...byCampaign.values()].map((b) => {
    const conversionProxy =
      b.signInClicks + b.playStoreClicks + b.appStoreClicks + b.cloudContinuityClicks;
    const landingStoreClicks = b.storeClickRows
      .filter(
        (row) => row.ctaId && b.landingCtaIds.has(row.ctaId),
      )
      .reduce((total, row) => total + row.count, 0);
    const directStoreClicks =
      b.playStoreClicks + b.appStoreClicks - landingStoreClicks;
    const journeyType =
      b.landingViews > 0 && directStoreClicks > 0
        ? 'mixed'
        : b.landingViews > 0
        ? 'landing'
        : b.playStoreClicks + b.appStoreClicks > 0
          ? 'direct_store'
          : 'unknown';
    const ctrProxy =
      journeyType === 'landing'
        ? Math.round((conversionProxy / b.landingViews) * 1000) / 1000
        : null;
    return {
      campaign: b.campaign,
      journeyType,
      postsLive: b.postsLive,
      postsPartial: b.postsPartial,
      postsBlocked: b.postsBlocked,
      postsDrafted: b.postsDrafted,
      platforms: [...b.platforms].sort(),
      postUrls: b.postUrls.slice(0, 5),
      sampleHook: b.hooks[0] || '',
      landingViews: b.landingViews,
      signInClicks: b.signInClicks,
      playStoreClicks: b.playStoreClicks,
      appStoreClicks: b.appStoreClicks,
      landingStoreClicks,
      directStoreClicks,
      playStorePreviews: b.playStorePreviews,
      appStorePreviews: b.appStorePreviews,
      freeControlClicks: b.freeControlClicks,
      cloudContinuityClicks: b.cloudContinuityClicks,
      otherAttributed: b.otherAttributed,
      attributedTotal: b.attributedTotal,
      conversionProxy,
      ctrProxy,
      ctaIds: [...b.ctaIds].slice(0, 10),
      utmSources: [...b.utmSources].slice(0, 10),
    };
  });

  // Rank: attributedTotal desc, then conversionProxy, then postsLive
  rows.sort((a, b) => {
    if (b.attributedTotal !== a.attributedTotal) return b.attributedTotal - a.attributedTotal;
    if (b.conversionProxy !== a.conversionProxy) return b.conversionProxy - a.conversionProxy;
    return b.postsLive - a.postsLive;
  });

  const landingMeasurable = rows.filter(
    (r) => r.journeyType === 'landing' && r.attributedTotal >= minEvents,
  );
  const directMeasurable = rows.filter(
    (r) => r.journeyType === 'direct_store' && r.attributedTotal >= minEvents,
  );
  const mixedMeasurable = rows.filter(
    (r) => r.journeyType === 'mixed' && r.attributedTotal >= minEvents,
  );
  const hasMixedJourneys =
    mixedMeasurable.length > 0 ||
    (landingMeasurable.length > 0 && directMeasurable.length > 0);
  const measurable = hasMixedJourneys
    ? []
    : landingMeasurable.length > 0
      ? landingMeasurable
      : directMeasurable;
  const comparisonJourney =
    hasMixedJourneys || measurable.length === 0
      ? null
      : measurable[0].journeyType;
  let winner = null;
  let runnerUp = null;
  let decision = 'INSUFFICIENT_DATA';
  if (hasMixedJourneys) {
    decision = 'MIXED_JOURNEYS';
  } else if (measurable.length >= 2) {
    winner = measurable[0];
    runnerUp = measurable[1];
    if (winner.attributedTotal > runnerUp.attributedTotal) {
      decision = 'WINNER';
    } else {
      decision = 'TIE';
    }
  } else if (measurable.length === 1) {
    winner = measurable[0];
    decision = 'SINGLE_VARIANT';
  }

  const lessons = [];
  if (decision === 'MIXED_JOURNEYS') {
    lessons.push(
      'Direct-store and landing-page journeys are reported separately; campaigns that reuse one campaign across both journey types are fail-closed as mixed. Collect enough campaigns within one clean journey cohort before crowning a winner.',
    );
  }
  if (decision === 'INSUFFICIENT_DATA') {
    lessons.push(
      `Need ≥${minEvents} attributed funnel events per campaign within the same journey cohort (have ${attributionRows.length} raw rows). Keep UTM+cta_id on every CTA; re-run after traffic.`,
    );
  }
  if (decision === 'WINNER' && winner && runnerUp) {
    lessons.push(
      `Campaign "${winner.campaign}" leads "${runnerUp.campaign}" within the ${comparisonJourney} journey on attributed events (${winner.attributedTotal} vs ${runnerUp.attributedTotal}). Double down on winner hook/platform; park or rewrite loser.`,
    );
  }
  const liveNoAttr = rows.filter((r) => r.postsLive > 0 && r.attributedTotal === 0);
  if (liveNoAttr.length) {
    lessons.push(
      `${liveNoAttr.length} LIVE campaign(s) have zero attributed funnel hits — CTAs may lack matching utm_campaign/cta_id, or traffic did not land on thumbgate.app.`,
    );
  }

  const nextExperiments = [];
  if (winner && winner.sampleHook) {
    nextExperiments.push({
      hypothesis: `Winner hook style from ${winner.campaign} beats a control rewrite on the same primary channel`,
      control: winner.sampleHook,
      treatment: `(rewrite) ${winner.sampleHook.slice(0, 40)}… + stronger install CTA`,
      utmCampaign: `${winner.campaign}-ab`,
      ctaIdPattern: `${winner.campaign}-ab-{a|b}_{channel}`,
      primaryMetric: 'landing_view + play_store_click + sign_in_click (7d)',
      stopRule: `crown winner at ≥${minEvents} attributed events and ≥20% relative lift, else extend 7d`,
    });
  } else {
    nextExperiments.push({
      hypothesis: 'Install-funnel honesty hook vs credential-leak hook on LinkedIn',
      control: 'evidence-installs style (pair → first chat)',
      treatment: 'credential-leak / GitGuardian style',
      utmCampaign: 'ab-hook-install-vs-leak',
      ctaIdPattern: 'ab-hook-{install|leak}_linkedin',
      primaryMetric: 'landing_view + play_store_click (7d)',
      stopRule: `≥${minEvents} events/variant before calling winner`,
    });
  }

  return {
    generatedAt: new Date().toISOString(),
    lookbackDays,
    minEvents,
    contentRows: recent.length,
    attributionRows: attributionRows.length,
    decision,
    comparisonJourney,
    winner: winner
      ? { campaign: winner.campaign, attributedTotal: winner.attributedTotal, conversionProxy: winner.conversionProxy }
      : null,
    runnerUp: runnerUp
      ? {
          campaign: runnerUp.campaign,
          attributedTotal: runnerUp.attributedTotal,
          conversionProxy: runnerUp.conversionProxy,
        }
      : null,
    campaigns: rows,
    lessons,
    nextExperiments,
    ragCaptureStub: {
      signal: decision === 'WINNER' ? 'up' : 'down',
      title: `social-campaign-ds ${decision}`,
      body: lessons.join(' '),
    },
  };
}

function renderMarkdown(report) {
  const lines = [
    '# Social campaign data science',
    '',
    `Generated: ${report.generatedAt}`,
    `Lookback: ${report.lookbackDays}d · content rows: ${report.contentRows} · attribution rows: ${report.attributionRows}`,
    `Decision: **${report.decision}**`,
    '',
    '## Ranking',
    '',
    '| Campaign | Journey | Live posts | Attr total | Landing | Landing store | Direct store | Sign-in | Play | iOS | Previews | Continuity | CTR proxy |',
    '|----------|---------|------------|------------|---------|---------------|--------------|---------|------|-----|----------|------------|-----------|',
  ];
  for (const c of report.campaigns) {
    lines.push(
      `| ${c.campaign} | ${c.journeyType} | ${c.postsLive} | ${c.attributedTotal} | ${c.landingViews} | ${c.landingStoreClicks} | ${c.directStoreClicks} | ${c.signInClicks} | ${c.playStoreClicks} | ${c.appStoreClicks} | ${c.playStorePreviews + c.appStorePreviews} | ${c.cloudContinuityClicks} | ${c.ctrProxy ?? 'n/a'} |`,
    );
  }
  lines.push('', '## Lessons', '');
  for (const l of report.lessons) lines.push(`- ${l}`);
  lines.push('', '## Next experiment', '');
  for (const e of report.nextExperiments) {
    lines.push(`- **Hypothesis:** ${e.hypothesis}`);
    lines.push(`  - control: ${e.control}`);
    lines.push(`  - treatment: ${e.treatment}`);
    lines.push(`  - utm_campaign: \`${e.utmCampaign}\``);
    lines.push(`  - cta_id: \`${e.ctaIdPattern}\``);
    lines.push(`  - metric: ${e.primaryMetric}`);
    lines.push(`  - stop: ${e.stopRule}`);
  }
  lines.push(
    '',
    '## RAG capture stub',
    '',
    '```',
    JSON.stringify(report.ragCaptureStub, null, 2),
    '```',
    '',
    '## Honesty',
    '',
    '- Platform impressions (LinkedIn/X native) are **not** in this report unless you add an API later.',
    '- Web funnel is first-party UTM/cta_id only — privacy-safe tokens, no PII.',
    '- Link-preview crawlers are visible but excluded from attributed totals and winner decisions.',
    '- Direct-store and landing-page journeys are never ranked against each other.',
    '- A campaign with both landing and direct-store CTAs is marked mixed and excluded from winner decisions.',
    '- Small-n: do not crown a winner below min-events.',
    '',
  );
  return lines.join('\n');
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

  const contentRows = parseContentLog(args.log);
  let attributionRows = [];
  try {
    attributionRows = loadAttribution(args.attributionFile);
  } catch (err) {
    console.error(err.message);
    process.exit(2);
  }

  const report = buildScoreboard({
    contentRows,
    attributionRows,
    lookbackDays: args.lookbackDays,
    minEvents: args.minEvents,
  });

  if (args.json) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    const md = renderMarkdown(report);
    console.log(md);
    if (args.out) {
      fs.writeFileSync(args.out, md.endsWith('\n') ? md : `${md}\n`);
      console.error(`Wrote ${args.out}`);
    }
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  parseArgs,
  parseContentLog,
  loadAttribution,
  buildScoreboard,
  renderMarkdown,
  isLiveStatus,
};
