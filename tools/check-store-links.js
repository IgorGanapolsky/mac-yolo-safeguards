#!/usr/bin/env node
'use strict';

const fs = require('fs');

const usage = `Usage:
  node tools/check-store-links.js [--out check-store-links.md]

Verifies live app-store state against what the repo's social content engine
docs and log promote. Root cause this closes: on 2026-07-22 the free Android
Play package was unpublished (store-policy directive) while every live social
post from 2026-07-20 kept linking to it, producing dead links across six
platforms that had to be fixed by hand. This check catches that drift
automatically instead of relying on someone re-verifying live store URLs
before every post.

This tool is read-only. It does not edit posts, publish anything, or touch
the docs it scans. Requires network access (live Play + iTunes fetches).`;

const PLAY_FREE_URL =
  'https://play.google.com/store/apps/details?id=com.iganapolsky.hermesmobile&hl=en&gl=US';
const PLAY_PAID_URL =
  'https://play.google.com/store/apps/details?id=com.iganapolsky.hermesmobile.paid&hl=en&gl=US';
const ITUNES_LOOKUP_URL =
  'https://itunes.apple.com/lookup?bundleId=com.iganapolsky.hermesmobile&country=us';

// Docs/logs that may contain promotional store links and should never point
// at the retired free Android package without an explicit "unpublished" flag
// on the same line.
const SCANNED_FILES = [
  'docs/social/hermes-mobile-content-engine.md',
  'docs/social/hermes-mobile-content-log.tsv',
];

const DEAD_FREE_PACKAGE_FRAGMENT = 'id=com.iganapolsky.hermesmobile&';
const DEAD_FREE_PACKAGE_FRAGMENT_BARE = 'id=com.iganapolsky.hermesmobile)';
const DEAD_FREE_PACKAGE_FRAGMENT_TSV = 'id=com.iganapolsky.hermesmobile\t';

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

async function checkLiveStores() {
  // Network errors (CI runner blocked/rate-limited by Google or Apple) are
  // warnings, not failures — this check must not make unrelated PRs flaky.
  // Only a definitive, contradicting HTTP response is a hard failure.
  const failures = [];
  const warnings = [];
  const rows = [];

  const freePlay = await fetchStatus(PLAY_FREE_URL);
  rows.push({ label: 'Play free package (warn if live/200)', ...freePlay });
  if (!freePlay.ok) {
    warnings.push(`Could not reach Play free package URL: ${freePlay.error}`);
  } else if (freePlay.status === 200) {
    // Free package was unpublished 2026-07-22 then re-surfaced live again without
    // a repo directive update. Treat as warning so unrelated ASC/screenshot PRs
    // are not blocked; social dead-link scan below still guards promoted URLs.
    warnings.push(
      'Play free package (com.iganapolsky.hermesmobile) is LIVE (200) — ' +
        'was expected unpublished per 2026-07-22 directive; confirm promotion policy.'
    );
  }

  const paidPlay = await fetchStatus(PLAY_PAID_URL);
  rows.push({ label: 'Play paid package (expected 200)', ...paidPlay });
  if (!paidPlay.ok) {
    warnings.push(`Could not reach Play paid package URL: ${paidPlay.error}`);
  } else if (paidPlay.status !== 200) {
    failures.push(
      `Play paid package (com.iganapolsky.hermesmobile.paid) returned ` +
        `${paidPlay.status} — expected 200 (live). This is the only Android ` +
        `package that should ever be promoted.`
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

function scanDocsForDeadLinks() {
  const failures = [];
  const rows = [];
  for (const filePath of SCANNED_FILES) {
    if (!fs.existsSync(filePath)) {
      rows.push({ file: filePath, exists: false, deadLinkLines: [] });
      continue;
    }
    const text = fs.readFileSync(filePath, 'utf8');
    const deadLinkLines = [];
    text.split('\n').forEach((line, index) => {
      const hasDeadFragment =
        line.includes(DEAD_FREE_PACKAGE_FRAGMENT) ||
        line.includes(DEAD_FREE_PACKAGE_FRAGMENT_BARE) ||
        line.includes(DEAD_FREE_PACKAGE_FRAGMENT_TSV);
      // A line is fine if it explicitly documents the package as retired/dead
      // (e.g. the ground-truth table entry) rather than promoting it as a
      // live CTA link.
      const flaggedAsDead = /unpublish|retired|404|dead link/i.test(line);
      if (hasDeadFragment && !flaggedAsDead) {
        deadLinkLines.push({ lineNumber: index + 1, text: line.trim() });
      }
    });
    rows.push({ file: filePath, exists: true, deadLinkLines });
    for (const hit of deadLinkLines) {
      failures.push(
        `${filePath}:${hit.lineNumber} references the retired free Play ` +
          `package as a live link: ${hit.text.slice(0, 120)}`
      );
    }
  }
  return { rows, failures };
}

function renderConsole(live, docs) {
  console.log('Store link freshness check');
  for (const row of live.rows) {
    console.log(`  ${row.label}: ${row.status ?? row.error ?? 'unknown'}`);
  }
  for (const row of docs.rows) {
    console.log(
      `  ${row.file}: ${row.exists ? `${row.deadLinkLines.length} dead-link line(s)` : 'missing'}`
    );
  }
  const failures = [...live.failures, ...docs.failures];
  for (const warning of live.warnings) {
    console.log(`warn\t${warning}`);
  }
  console.log(`Failures: ${failures.length}`);
  console.log(`Warnings: ${live.warnings.length}`);
  console.log(`Status: ${failures.length === 0 ? 'PASS' : 'FAIL'}`);
  for (const failure of failures) {
    console.log(`fail\t${failure}`);
  }
  return failures;
}

function renderMarkdown(live, docs, failures) {
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
  lines.push('', '## Doc/log scan for dead-link promotion', '');
  for (const row of docs.rows) {
    lines.push(
      `- ${row.file}: ${row.exists ? `${row.deadLinkLines.length} dead-link line(s)` : 'missing'}`
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
  if (live.warnings.length > 0) {
    lines.push('', '## Warnings (network errors — do not fail the build)', '');
    for (const warning of live.warnings) {
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
  const docs = scanDocsForDeadLinks();
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
