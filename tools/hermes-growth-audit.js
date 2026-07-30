#!/usr/bin/env node
'use strict';

/**
 * Honest growth-observability audit.
 *
 * Local mode validates every publishable social/store artifact. --live adds
 * public store availability and production D1 counter readback. Missing
 * provider/experiment proof remains "unverified"; it is never promoted to a
 * passing state because another layer is healthy.
 */

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const CONTENT_LOG = path.join(
  ROOT,
  'docs/social/hermes-mobile-content-log.tsv',
);
const CONTROL_PLANE = path.join(ROOT, 'apps/hermes-control-plane');

const COPY_RULES = [
  {
    name: 'retired-play-package',
    pattern:
      /play\.google\.com\/store\/apps\/details\?[^)\s]*\bid=com\.iganapolsky\.hermesmobile(?:[&#)\s]|$)/gi,
  },
  {
    name: 'obsolete-subscription-copy',
    pattern:
      /(?:10[^.\n]{0,40}approvals?\s*\/\s*week|\$19\.99\s*\/\s*(?:mo|month)|free[^.\n]{0,80}10 approvals?|honest\s+free\s+tier|free\s+tier\s+covers|stay\s+on\s+(?:the\s+)?free\s+tier|free\s+(?:chat|pairing)|free\s+to\s+pair)/gi,
  },
  {
    name: 'obsolete-ios-review-state',
    pattern:
      /\biOS\b[^.\n]{0,60}\b(?:in review|not (?:live|available)|when (?:the )?app store approves?)\b/gi,
  },
  {
    name: 'obsolete-demo-backdoor',
    pattern: /[?&]demo=1\b/gi,
  },
];

function listPublishableFiles(root) {
  const social = path.join(root, 'hermes-mobile/docs/social');
  const ready = path.join(social, 'ready-to-post');
  const files = [];
  const walkMarkdown = (directory, excludedNames = new Set()) => {
    if (!fs.existsSync(directory)) return;
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) walkMarkdown(target, excludedNames);
      else if (
        entry.name.endsWith('.md') &&
        !excludedNames.has(entry.name)
      ) {
        files.push(target);
      }
    }
  };
  const readme = path.join(social, 'README.md');
  if (fs.existsSync(readme)) files.push(readme);
  // PUBLISHED.md is an immutable historical receipt, not reusable copy.
  walkMarkdown(ready, new Set(['PUBLISHED.md']));
  if (fs.existsSync(social)) {
    for (const entry of fs.readdirSync(social, { withFileTypes: true })) {
      if (entry.isDirectory() && entry.name.startsWith('week-')) {
        walkMarkdown(path.join(social, entry.name));
      }
    }
  }
  return [...new Set(files)].sort();
}

function auditPublishableStoreCopy(root = ROOT) {
  const files = listPublishableFiles(root);
  const findings = [];
  for (const file of files) {
    const body = fs.readFileSync(file, 'utf8');
    for (const rule of COPY_RULES) {
      rule.pattern.lastIndex = 0;
      const match = rule.pattern.exec(body);
      if (!match) continue;
      const line = body.slice(0, match.index).split(/\r?\n/).length;
      findings.push({
        rule: rule.name,
        file: path.relative(root, file),
        line,
        excerpt: match[0].slice(0, 120),
      });
    }
  }
  return {
    status: findings.length === 0 ? 'pass' : 'fail',
    filesScanned: files.length,
    findings,
  };
}

function summarizeContentLog(logPath = CONTENT_LOG) {
  if (!fs.existsSync(logPath)) {
    return {
      totalRows: 0,
      statusCounts: {},
      publishedWithReceipt: 0,
      publishedWithoutReceipt: 0,
    };
  }
  const lines = fs
    .readFileSync(logPath, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.trim());
  if (lines.length < 2) {
    return {
      totalRows: 0,
      statusCounts: {},
      publishedWithReceipt: 0,
      publishedWithoutReceipt: 0,
    };
  }
  const header = lines[0].split('\t');
  const statusIndex = header.indexOf('Status');
  const urlIndex = header.indexOf('PostURL');
  const statusCounts = {};
  let publishedWithReceipt = 0;
  let publishedWithoutReceipt = 0;

  for (const line of lines.slice(1)) {
    const columns = line.split('\t');
    const status = String(columns[statusIndex] || 'unknown').trim().toLowerCase();
    const postUrl = String(columns[urlIndex] || '').trim();
    statusCounts[status] = (statusCounts[status] || 0) + 1;
    if (status === 'published') {
      if (/^https?:\/\//i.test(postUrl)) publishedWithReceipt += 1;
      else publishedWithoutReceipt += 1;
    }
  }

  return {
    totalRows: lines.length - 1,
    statusCounts: Object.fromEntries(
      Object.entries(statusCounts).sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    ),
    publishedWithReceipt,
    publishedWithoutReceipt,
  };
}

function parseD1JsonOutput(stdout) {
  const clean = String(stdout).replace(/\u001b\[[0-9;]*m/g, '');
  const lines = clean.split(/\r?\n/);
  for (let index = lines.length - 1; index >= 0; index -= 1) {
    const candidate = lines.slice(index).join('\n').trim();
    if (!candidate.startsWith('[') && !candidate.startsWith('{')) continue;
    try {
      return JSON.parse(candidate);
    } catch {
      // Continue toward an earlier possible JSON boundary.
    }
  }
  throw new Error('Wrangler output did not contain a JSON result payload');
}

function auditExperimentProof(root = ROOT) {
  const proofDirectory = path.join(
    root,
    'hermes-mobile/docs/proofs/store-experiments',
  );
  if (!fs.existsSync(proofDirectory)) {
    return {
      status: 'unverified',
      reason: 'No paid-store experiment proof directory exists.',
      activeExperimentCount: 0,
    };
  }
  const active = [];
  for (const name of fs.readdirSync(proofDirectory)) {
    if (!name.endsWith('.json')) continue;
    try {
      const proof = JSON.parse(
        fs.readFileSync(path.join(proofDirectory, name), 'utf8'),
      );
      const packageMatches =
        proof.packageName === 'com.iganapolsky.hermesmobile.paid' ||
        proof.appleAppId === '6786778037';
      if (
        packageMatches &&
        ['active', 'running', 'live'].includes(
          String(proof.status || '').toLowerCase(),
        ) &&
        proof.experimentId
      ) {
        active.push({
          file: name,
          experimentId: proof.experimentId,
          provider: proof.provider || 'unknown',
        });
      }
    } catch {
      // Invalid proof cannot count as active provider evidence.
    }
  }
  return active.length
    ? { status: 'pass', activeExperimentCount: active.length, active }
    : {
        status: 'unverified',
        reason:
          'No provider-visible active experiment receipt matches the paid apps.',
        activeExperimentCount: 0,
      };
}

async function checkPublicStores(fetchImpl = fetch) {
  const paidPlayUrl =
    'https://play.google.com/store/apps/details?id=com.iganapolsky.hermesmobile.paid&hl=en_US';
  const retiredPlayUrl =
    'https://play.google.com/store/apps/details?id=com.iganapolsky.hermesmobile&hl=en_US';
  const appleLookupUrl =
    'https://itunes.apple.com/lookup?id=6786778037&country=us';
  const requestOptions = {
    redirect: 'follow',
    signal: AbortSignal.timeout(15_000),
  };
  const [paidPlay, retiredPlay, apple] = await Promise.all([
    fetchImpl(paidPlayUrl, requestOptions),
    fetchImpl(retiredPlayUrl, requestOptions),
    fetchImpl(appleLookupUrl, requestOptions),
  ]);
  const applePayload = apple.ok ? await apple.json() : { resultCount: 0 };
  const appleApp = Array.isArray(applePayload.results)
    ? applePayload.results[0]
    : null;
  const pass =
    paidPlay.ok &&
    retiredPlay.status === 404 &&
    apple.ok &&
    applePayload.resultCount === 1;
  return {
    status: pass ? 'pass' : 'fail',
    googlePlay: {
      paidStatus: paidPlay.status,
      retiredStatus: retiredPlay.status,
    },
    appStore: {
      status: apple.status,
      resultCount: applePayload.resultCount || 0,
      version: appleApp?.version || null,
      price: appleApp?.formattedPrice || null,
      averageUserRating: appleApp?.averageUserRating ?? null,
      userRatingCount: appleApp?.userRatingCount ?? null,
    },
  };
}

function queryRemoteFunnel() {
  const wrangler = path.join(
    CONTROL_PLANE,
    'node_modules/.bin/wrangler',
  );
  if (!fs.existsSync(wrangler)) {
    throw new Error(
      'Control-plane dependencies are required for live D1 readback.',
    );
  }
  const sql = [
    "SELECT day, event, count FROM funnel_counters",
    "WHERE day >= date('now', '-30 days')",
    "AND event IN ('landing_view','sign_in_click','play_store_click','app_store_click')",
    'ORDER BY day DESC, event;',
    "SELECT day, event, utm_source, utm_medium, utm_campaign, cta_id, count",
    'FROM funnel_attribution_counters',
    "WHERE day >= date('now', '-30 days')",
    "AND event IN ('landing_view','sign_in_click','play_store_click','app_store_click')",
    'ORDER BY day DESC, event LIMIT 500;',
  ].join(' ');
  const stdout = execFileSync(
    wrangler,
    [
      'd1',
      'execute',
      'hermes-control-plane',
      '--remote',
      '--command',
      sql,
      '--json',
    ],
    {
      cwd: CONTROL_PLANE,
      encoding: 'utf8',
      env: { ...process.env, CI: '1' },
      maxBuffer: 5 * 1024 * 1024,
      timeout: 30_000,
    },
  );
  const payload = parseD1JsonOutput(stdout);
  const resultSets = Array.isArray(payload) ? payload : [];
  return {
    status: resultSets.every((result) => result.success !== false)
      ? 'pass'
      : 'fail',
    aggregateRows: resultSets[0]?.results || [],
    attributedRows: resultSets[1]?.results || [],
  };
}

async function queryAppStoreAnalytics() {
  const {
    loadEnv,
    ascGet,
    ascPost,
  } = require('../hermes-mobile/scripts/asc-api');
  const {
    buildStatus,
  } = require('./app-store-analytics-reports');
  loadEnv(path.join(ROOT, 'hermes-mobile'));
  const status = await buildStatus(
    { get: ascGet, post: ascPost },
    process.env.EXPO_ASC_APP_ID || '6786778037',
    null,
  );
  const categories = {};
  let reportCount = 0;
  for (const request of status.requests) {
    reportCount += request.reports.reportCount;
    for (const [category, count] of Object.entries(
      request.reports.categories,
    )) {
      categories[category] = (categories[category] || 0) + count;
    }
  }
  return {
    status: status.activeOngoingRequestCount > 0 ? 'pass' : 'fail',
    appId: status.appId,
    activeOngoingRequestCount: status.activeOngoingRequestCount,
    requestIds: status.requests.map((request) => request.id),
    reportCount,
    categories,
    verifiedAt: status.verifiedAt,
  };
}

async function buildAudit({ live = false } = {}) {
  const report = {
    generatedAt: new Date().toISOString(),
    publishableStoreCopy: auditPublishableStoreCopy(ROOT),
    contentLog: summarizeContentLog(CONTENT_LOG),
    storeExperiments: auditExperimentProof(ROOT),
  };
  if (live) {
    try {
      report.publicStores = await checkPublicStores();
    } catch (error) {
      report.publicStores = {
        status: 'unverified',
        error: error instanceof Error ? error.message : String(error),
      };
    }
    try {
      report.productionFunnel = queryRemoteFunnel();
    } catch (error) {
      report.productionFunnel = {
        status: 'unverified',
        error: error instanceof Error ? error.message : String(error),
      };
    }
    try {
      report.appStoreAnalytics = await queryAppStoreAnalytics();
    } catch (error) {
      report.appStoreAnalytics = {
        status: 'unverified',
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
  return report;
}

function failedChecks(report) {
  const checks = [
    ['publishableStoreCopy', report.publishableStoreCopy?.status],
    ['storeExperiments', report.storeExperiments?.status],
  ];
  if (report.publicStores) {
    checks.push(['publicStores', report.publicStores.status]);
  }
  if (report.productionFunnel) {
    checks.push(['productionFunnel', report.productionFunnel.status]);
  }
  if (report.appStoreAnalytics) {
    checks.push(['appStoreAnalytics', report.appStoreAnalytics.status]);
  }
  return checks
    .filter(([, status]) => status !== 'pass')
    .map(([name, status]) => ({ name, status }));
}

function parseArgs(argv) {
  const args = { json: false, live: false, strict: false };
  for (const arg of argv) {
    if (arg === '--json') args.json = true;
    else if (arg === '--live') args.live = true;
    else if (arg === '--strict') args.strict = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    console.log(`Usage:
  node tools/hermes-growth-audit.js [--live] [--strict] [--json]

--live    Verify public stores and read production D1 funnel counters.
--strict  Exit 1 for every failed or unverified proof surface.`);
    return;
  }
  const report = await buildAudit({ live: args.live });
  report.failedChecks = failedChecks(report);
  console.log(JSON.stringify(report, null, args.json ? 2 : 2));
  if (args.strict && report.failedChecks.length > 0) process.exitCode = 1;
}

if (require.main === module) {
  main().catch((error) => {
    console.error(
      JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      }),
    );
    process.exitCode = 1;
  });
}

module.exports = {
  auditExperimentProof,
  auditPublishableStoreCopy,
  buildAudit,
  checkPublicStores,
  failedChecks,
  parseArgs,
  parseD1JsonOutput,
  queryAppStoreAnalytics,
  queryRemoteFunnel,
  summarizeContentLog,
};
