#!/usr/bin/env node
'use strict';

const fs = require('fs');

const usage = `Usage:
  node tools/check-store-links.js [--out check-store-links.md]

Verifies live app-store state against what the repo's social content engine
docs and log promote. Catches drift when a Play/App Store URL goes dark
while social posts or docs still link it as live.

Product state (2026-07-22): both Android packages are published —
free IAP bridge (com.iganapolsky.hermesmobile) and paid download sibling
(com.iganapolsky.hermesmobile.paid). A brief same-day Unpublish toggle on
the free package was reversed; public curl for both is HTTP 200.

This tool is read-only. Requires network access (live Play + iTunes fetches).`;

const PLAY_FREE_URL =
  'https://play.google.com/store/apps/details?id=com.iganapolsky.hermesmobile&hl=en&gl=US';
const PLAY_PAID_URL =
  'https://play.google.com/store/apps/details?id=com.iganapolsky.hermesmobile.paid&hl=en&gl=US';
const ITUNES_LOOKUP_URL =
  'https://itunes.apple.com/lookup?bundleId=com.iganapolsky.hermesmobile&country=us';

const SCANNED_FILES = [
  'docs/social/hermes-mobile-content-engine.md',
  'docs/social/hermes-mobile-content-log.tsv',
];

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--out') {
      args.out = argv[++i];
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

async function fetchStatus(url) {
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: { 'User-Agent': 'Mozilla/5.0 (check-store-links)' },
    });
    return { ok: true, status: res.status, body: await res.text() };
  } catch (error) {
    return { ok: false, status: null, body: '', error: error.message };
  }
}

function playListingLooksLive(body) {
  return /itemprop="name"/.test(body) && /play-lh\.googleusercontent\.com/.test(body);
}

async function checkLiveStores() {
  const failures = [];
  const warnings = [];
  const rows = [];

  const freePlay = await fetchStatus(PLAY_FREE_URL);
  rows.push({ label: 'Play free package (expected 200)', ...freePlay });
  if (!freePlay.ok) {
    warnings.push(`Could not reach Play free package URL: ${freePlay.error}`);
  } else if (freePlay.status !== 200 || !playListingLooksLive(freePlay.body)) {
    failures.push(
      'Play free package (com.iganapolsky.hermesmobile) is not a live public listing — ' +
        `HTTP ${freePlay.status}. Both Android packages should stay published.`
    );
  }

  const paidPlay = await fetchStatus(PLAY_PAID_URL);
  rows.push({ label: 'Play paid package (expected 200)', ...paidPlay });
  if (!paidPlay.ok) {
    warnings.push(`Could not reach Play paid package URL: ${paidPlay.error}`);
  } else if (paidPlay.status !== 200 || !playListingLooksLive(paidPlay.body)) {
    failures.push(
      `Play paid package (com.iganapolsky.hermesmobile.paid) is not a live public listing — ` +
        `HTTP ${paidPlay.status}. Expected 200 alongside the free package.`
    );
  }

  const itunes = await fetchStatus(ITUNES_LOOKUP_URL);
  let resultCount = null;
  if (!itunes.ok) {
    warnings.push(`Could not reach iTunes lookup: ${itunes.error}`);
  } else if (itunes.status === 200) {
    try {
      resultCount = JSON.parse(itunes.body).resultCount;
    } catch (error) {
      warnings.push(`iTunes lookup returned non-JSON body: ${error.message}`);
    }
    if (resultCount !== null && resultCount < 1) {
      failures.push(
        'iOS iTunes lookup returned resultCount 0 — app would be promoted ' +
          'as live when it is not public. Never link the App Store unless ' +
          'this lookup is non-zero.'
      );
    }
  } else {
    warnings.push(`iTunes lookup returned HTTP ${itunes.status}`);
  }
  rows.push({ label: 'iOS iTunes lookup (expected resultCount >= 1)', ...itunes, resultCount });

  return { rows, failures, warnings };
}

function scanDocsForStaleUnpublishClaims(live) {
  const failures = [];
  const warnings = [];
  const rows = [];
  const freeLive =
    live.rows.find((row) => row.label.startsWith('Play free package'))?.status === 200;

  for (const filePath of SCANNED_FILES) {
    if (!fs.existsSync(filePath)) {
      rows.push({ file: filePath, exists: false, staleLines: [] });
      continue;
    }
    const text = fs.readFileSync(filePath, 'utf8');
    const staleLines = [];
    text.split('\n').forEach((line, index) => {
      const mentionsFreePackage =
        line.includes('com.iganapolsky.hermesmobile') &&
        !line.includes('com.iganapolsky.hermesmobile.paid');
      const claimsUnpublished = /unpublish|404|retired|dead link/i.test(line);
      if (freeLive && mentionsFreePackage && claimsUnpublished) {
        staleLines.push({ lineNumber: index + 1, text: line.trim() });
      }
    });
    rows.push({ file: filePath, exists: true, staleLines });
    for (const hit of staleLines) {
      warnings.push(
        `${filePath}:${hit.lineNumber} still documents the free Play package as unpublished ` +
          `while the live listing is HTTP 200: ${hit.text.slice(0, 120)}`
      );
    }
  }
  return { rows, failures, warnings };
}

function renderConsole(live, docs) {
  console.log('Store link freshness check');
  for (const row of live.rows) {
    console.log(`  ${row.label}: ${row.status ?? row.error ?? 'unknown'}`);
  }
  for (const row of docs.rows) {
    console.log(
      `  ${row.file}: ${row.exists ? `${row.staleLines.length} stale unpublish line(s)` : 'missing'}`
    );
  }
  const failures = [...live.failures, ...docs.failures];
  const warnings = [...live.warnings, ...docs.warnings];
  for (const warning of warnings) {
    console.log(`warn\t${warning}`);
  }
  console.log(`Failures: ${failures.length}`);
  console.log(`Warnings: ${warnings.length}`);
  console.log(`Status: ${failures.length === 0 ? 'PASS' : 'FAIL'}`);
  for (const failure of failures) {
    console.log(`fail\t${failure}`);
  }
  return failures;
}

function renderMarkdown(live, docs, failures) {
  const warnings = [...live.warnings, ...docs.warnings];
  const lines = [
    `# Store Link Freshness Check - ${new Date().toISOString().slice(0, 10)}`,
    '',
    'Read-only report. Verifies live Play/App Store state against what the',
    'content-engine docs and log promote.',
    '',
    `- Failures: ${failures.length}`,
    `- Status: ${failures.length === 0 ? 'PASS' : 'FAIL'}`,
    '',
    '## Live store checks',
    '',
    '| Check | Result |',
    '|---|---|',
  ];
  for (const row of live.rows) {
    lines.push(`| ${row.label} | ${row.status ?? row.error ?? 'unknown'} |`);
  }
  lines.push('', '## Doc/log scan for stale unpublish claims', '');
  for (const row of docs.rows) {
    lines.push(
      `- ${row.file}: ${row.exists ? `${row.staleLines.length} stale unpublish line(s)` : 'missing'}`
    );
  }
  lines.push('', '## Failures', '');
  if (failures.length === 0) {
    lines.push('None.');
  } else {
    for (const failure of failures) {
      lines.push(`- ${failure}`);
    }
  }
  if (warnings.length > 0) {
    lines.push('', '## Warnings', '');
    for (const warning of warnings) {
      lines.push(`- ${warning}`);
    }
  }
  return lines.join('\n');
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage);
    process.exit(0);
  }
  const live = await checkLiveStores();
  const docs = scanDocsForStaleUnpublishClaims(live);
  const failures = renderConsole(live, docs);
  if (args.out) {
    fs.writeFileSync(args.out, `${renderMarkdown(live, docs, failures)}\n`);
    console.log('');
    console.log(`Store link freshness check written: ${args.out}`);
  }
  if (failures.length > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error.message);
  console.error('');
  console.error(usage);
  process.exit(2);
});
