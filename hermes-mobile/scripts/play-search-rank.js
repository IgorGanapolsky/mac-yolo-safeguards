#!/usr/bin/env node

const DEFAULT_PACKAGE = 'com.iganapolsky.hermesmobile';
const DEFAULT_QUERIES = [
  'hermes mobile',
  'hermes ai agent leash',
  'ai agent leash',
  'ai agent remote control',
  'claude code remote',
  'approve ai agent',
  'ai coding agent',
  'ai agent phone control',
];

function extractPackageIds(html) {
  const ids = [];
  const seen = new Set();
  const pattern = /\/store\/apps\/details\?id=([A-Za-z0-9._]+)/g;
  let match;

  while ((match = pattern.exec(html)) !== null) {
    const packageId = match[1];
    if (!seen.has(packageId)) {
      seen.add(packageId);
      ids.push(packageId);
    }
  }

  return ids;
}

function rankPackage(packageIds, packageId) {
  const index = packageIds.indexOf(packageId);
  return index === -1 ? null : index + 1;
}

function parseArgs(argv) {
  const options = {
    packageId: DEFAULT_PACKAGE,
    queries: [],
    language: 'en',
    country: 'US',
    json: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--query') options.queries.push(argv[++index]);
    else if (arg === '--package') options.packageId = argv[++index];
    else if (arg === '--language') options.language = argv[++index];
    else if (arg === '--country') options.country = argv[++index];
    else if (arg === '--json') options.json = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (options.queries.some((query) => !query)) {
    throw new Error('--query requires a value');
  }
  if (options.queries.length === 0) options.queries = [...DEFAULT_QUERIES];
  return options;
}

async function fetchSearchHtml(query, { language, country }) {
  const url = new URL('https://play.google.com/store/search');
  url.searchParams.set('q', query);
  url.searchParams.set('c', 'apps');
  url.searchParams.set('hl', language);
  url.searchParams.set('gl', country);

  const response = await fetch(url, {
    headers: { 'user-agent': 'Hermes-Mobile-Play-Rank-Probe/1.0' },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`${query}: Google Play returned HTTP ${response.status}`);
  return { html: await response.text(), url: url.toString() };
}

async function collectRanks(options) {
  const results = [];
  for (const query of options.queries) {
    const { html, url } = await fetchSearchHtml(query, options);
    const packageIds = extractPackageIds(html);
    results.push({
      query,
      rank: rankPackage(packageIds, options.packageId),
      resultCount: packageIds.length,
      url,
    });
  }

  return {
    checkedAt: new Date().toISOString(),
    packageId: options.packageId,
    market: `${options.language}-${options.country}`,
    results,
  };
}

function printHuman(report) {
  console.log(`Google Play search rank for ${report.packageId} (${report.market})`);
  for (const result of report.results) {
    const rank = result.rank === null ? `not in first ${result.resultCount}` : `#${result.rank}`;
    console.log(`${result.query}\t${rank}`);
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const report = await collectRanks(options);
  if (options.json) console.log(JSON.stringify(report, null, 2));
  else printHuman(report);
}

if (require.main === module) {
  main().catch((error) => {
    console.error(`Play rank probe failed: ${error.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  DEFAULT_QUERIES,
  extractPackageIds,
  parseArgs,
  rankPackage,
};
