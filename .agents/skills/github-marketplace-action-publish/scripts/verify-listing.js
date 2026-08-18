#!/usr/bin/env node
'use strict';

/**
 * Evidence-only GitHub Marketplace Action listing check.
 * A release title or repo banner is not a listing.
 * An empty search is not proof a slug is missing.
 *
 * Usage:
 *   node verify-listing.js
 *   node verify-listing.js --slug thumbgate-agent-governance --uses IgorGanapolsky/ThumbGate
 *   node verify-listing.js --json
 *
 * Exit: 0 live · 2 not live · 1 probe failed
 */

const https = require('https');
const { URL } = require('url');

const DEFAULTS = {
  slug: 'thumbgate-agent-governance',
  uses: 'IgorGanapolsky/ThumbGate',
  query: 'ThumbGate Agent Governance',
};

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,80}$/;
const USES_RE = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

function slugFromActionName(name) {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+/, '')
    .replace(/-+$/, '');
}

function parseArgs(argv) {
  const out = { ...DEFAULTS, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') out.json = true;
    else if (a === '--slug' && argv[i + 1]) out.slug = argv[++i];
    else if (a === '--uses' && argv[i + 1]) out.uses = argv[++i];
    else if (a === '--query' && argv[i + 1]) out.query = argv[++i];
  }
  return out;
}

function assertSafeArgs(args) {
  if (!SLUG_RE.test(args.slug)) {
    throw new Error(`unsafe --slug (expected [a-z0-9-]): ${args.slug}`);
  }
  if (!USES_RE.test(args.uses)) {
    throw new Error(`unsafe --uses (expected Owner/Repo): ${args.uses}`);
  }
}

function extractTitle(html) {
  const m = String(html || '').match(/<title>([^<]+)<\/title>/i);
  return m ? m[1].replace(/\s+/g, ' ').trim() : '';
}

function extractUses(html, repo) {
  if (!USES_RE.test(repo)) return [];
  const escaped = repo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`${escaped}@[v0-9][A-Za-z0-9._-]*`, 'g');
  return [...new Set(String(html || '').match(re) || [])];
}

function isGithubNotFound(status, html, title) {
  return (
    status === 404 ||
    /This is not the web page you are looking for/i.test(html || '') ||
    /Page not found/i.test(title || '')
  );
}

function fetchText(urlStr, hops = 0) {
  if (hops > 5) return Promise.reject(new Error('too many redirects'));
  const u = new URL(urlStr);
  if (u.protocol !== 'https:' || u.hostname !== 'github.com') {
    return Promise.reject(new Error(`refusing non-github host: ${u.hostname}`));
  }
  return new Promise((resolve, reject) => {
    const req = https.get(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        headers: { 'User-Agent': 'thumbgate-marketplace-verify/1.1', Accept: 'text/html' },
        timeout: 15000,
      },
      (res) => {
        const loc = res.headers.location;
        if (loc && [301, 302, 303, 307, 308].includes(res.statusCode)) {
          res.resume();
          const next = new URL(loc, urlStr).toString();
          fetchText(next, hops + 1).then(resolve, reject);
          return;
        }
        let body = '';
        res.setEncoding('utf8');
        res.on('data', (c) => {
          if (body.length < 400000) body += c;
        });
        res.on('end', () => resolve({ status: res.statusCode, url: urlStr, body }));
      },
    );
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('timeout'));
    });
    req.on('error', reject);
  });
}

function evaluate(args, listing, search) {
  const title = extractTitle(listing.body);
  const uses = extractUses(listing.body, args.uses);
  const notFound = isGithubNotFound(listing.status, listing.body, title);
  const searchHasSlug = Boolean(search && search.body && search.body.includes(`/marketplace/actions/${args.slug}`));
  const searchZero = Boolean(search && search.body && /0 results/i.test(search.body) && !searchHasSlug);
  const live = listing.status === 200 && !notFound && title.length > 0;
  const listingUrl = `https://github.com/marketplace/actions/${args.slug}`;
  return {
    live,
    listing: { url: listingUrl, http: listing.status, title, notFound, uses },
    search: {
      url: `https://github.com/marketplace?type=actions&query=${encodeURIComponent(args.query)}`,
      http: search && search.status ? search.status : 0,
      hasSlug: searchHasSlug,
      zeroResults: searchZero,
      error: search && search.error ? search.error : null,
    },
    claim: live
      ? `LIVE: ${listingUrl} (${title}) uses=${uses.join(',') || 'not-in-html'}`
      : `NOT LIVE: listing http=${listing.status} notFound=${notFound} searchHasSlug=${searchHasSlug}`,
  };
}

async function probe(args) {
  assertSafeArgs(args);
  const listingUrl = `https://github.com/marketplace/actions/${args.slug}`;
  const searchUrl = `https://github.com/marketplace?type=actions&query=${encodeURIComponent(args.query)}`;
  const listing = await fetchText(listingUrl);
  let search = { status: 0, body: '', error: null };
  try {
    search = await fetchText(searchUrl);
  } catch (err) {
    search = { status: 0, body: '', error: String(err && err.message ? err.message : err) };
  }
  return evaluate(args, listing, search);
}

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const report = await probe(args);
  if (args.json) process.stdout.write(JSON.stringify(report, null, 2) + '\n');
  else {
    process.stdout.write(report.claim + '\n');
    process.stdout.write(`listing ${report.listing.http} ${report.listing.url}\n`);
    process.stdout.write(`search slug=${report.search.hasSlug} zero=${report.search.zeroResults}\n`);
    if (report.listing.uses.length) process.stdout.write(`uses ${report.listing.uses.join(' ')}\n`);
  }
  process.exit(report.live ? 0 : 2);
}

module.exports = {
  DEFAULTS,
  slugFromActionName,
  parseArgs,
  assertSafeArgs,
  extractTitle,
  extractUses,
  isGithubNotFound,
  evaluate,
  probe,
  main,
};

if (require.main === module) {
  main().catch((err) => {
    process.stderr.write(String(err && err.message ? err.message : err) + '\n');
    process.exit(1);
  });
}
