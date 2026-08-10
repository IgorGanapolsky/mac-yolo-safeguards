#!/usr/bin/env node
'use strict';

/**
 * social-publish.js — token-only publisher for unattended runs.
 *
 * Why this exists
 * ---------------
 * The content engine's scheduled runs execute in an ephemeral cloud container
 * (CLAUDE_CODE_REMOTE=true), not on the Mac. There is no logged-in browser, and
 * tools/secret-store.js is macOS-Keychain-only, so every session-based publish path
 * is structurally unavailable. Four consecutive runs (2026-08-05 -> 2026-08-10)
 * published nothing for this reason.
 *
 * Token-based publishing is the fix: a single secret per platform, no OAuth dance,
 * no browser. Set the env var and unattended runs publish.
 *
 *   dev.to    DEVTO_API_KEY
 *   Bluesky   BLUESKY_HANDLE + BLUESKY_APP_PASSWORD
 *
 * Deliberately NOT implemented (verified 2026-08-10, do not "fix" these):
 *   X       — no free tier for new developers since Feb 2026; pay-per-use bills
 *             $0.015/post and $0.20 for a post containing a URL. Every ThumbGate
 *             post contains a URL, and the standing rule forbids spending money.
 *   Medium  — stopped issuing integration tokens in 2023; no new integrations.
 *             Supported path is publish to dev.to, then Medium's "Import a Story",
 *             which sets the canonical URL back to dev.to automatically.
 *   LinkedIn/Threads — no token path; they need OAuth via a connected account.
 *
 * Honesty contract: this tool refuses to report success without re-fetching the
 * resulting URL and confirming it contains the intended content. A publish whose
 * URL cannot be verified exits non-zero and must be logged Blocked, never Published.
 *
 * Usage:
 *   node tools/social-publish.js --platform devto --title "T" --body-file post.md \
 *     [--tags a,b,c] [--canonical-url URL] [--dry-run] [--json]
 *   node tools/social-publish.js --platform bluesky --text "..." [--dry-run] [--json]
 *
 * Exit:
 *   0 = published AND verified
 *   1 = not published, or published but unverifiable (caller must log Blocked)
 *   2 = usage error / missing credential
 */

const fs = require('fs');

const BLUESKY_PDS = 'https://bsky.social';
const DEVTO_API = 'https://dev.to/api/articles';
const BLUESKY_MAX_GRAPHEMES = 300;

/* ------------------------------------------------------------------ *
 * Pure helpers — unit-testable without network or credentials.
 * ------------------------------------------------------------------ */

/**
 * Bluesky facets use BYTE offsets into the UTF-8 encoding, with an inclusive
 * start and an exclusive end — not JS string indices. Getting this wrong is not
 * a cosmetic bug: a post whose CTA link has no facet renders the URL as dead
 * plain text, so the one thing the post exists to do silently stops working.
 * Multi-byte characters (emoji, curly quotes) shift every subsequent offset.
 */
function detectLinkFacets(text) {
  const facets = [];
  // Trailing ),.,! etc. are punctuation the author wrote, not part of the URL.
  const re = /https?:\/\/[^\s]+/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    let url = m[0].replace(/[.,;:!?)\]}'"]+$/, '');
    const byteStart = Buffer.byteLength(text.slice(0, m.index), 'utf8');
    const byteEnd = byteStart + Buffer.byteLength(url, 'utf8');
    facets.push({
      index: { byteStart, byteEnd },
      features: [{ $type: 'app.bsky.richtext.facet#link', uri: url }],
    });
  }
  return facets;
}

/** Bluesky counts graphemes, not UTF-16 code units; emoji must count as one. */
function graphemeLength(text) {
  if (typeof Intl !== 'undefined' && Intl.Segmenter) {
    return [...new Intl.Segmenter('en', { granularity: 'grapheme' }).segment(text)].length;
  }
  return [...text].length;
}

/**
 * dev.to returns 429 with Retry-After that is SOMETIMES an integer number of
 * seconds and SOMETIMES an RFC 7231 HTTP-date. Treating the date form as a
 * number yields NaN and a retry storm against a rate limiter.
 * Returns milliseconds to wait, or null when unparseable.
 */
function parseRetryAfter(value, nowMs) {
  if (value === undefined || value === null || value === '') return null;
  const raw = String(value).trim();
  if (/^\d+$/.test(raw)) return Number(raw) * 1000;
  const when = Date.parse(raw);
  if (Number.isNaN(when)) return null;
  return Math.max(0, when - (nowMs === undefined ? Date.now() : nowMs));
}

/** Map an HTTP status to an actionable message; 401/403/429 mean different fixes. */
function describeHttpFailure(status, platform) {
  if (status === 401) return `${platform}: 401 — credential missing, malformed, or revoked. Re-issue the token.`;
  if (status === 403) return `${platform}: 403 — credential authenticated but lacks permission for this action.`;
  if (status === 422) return `${platform}: 422 — payload rejected (often a duplicate title or invalid tag).`;
  if (status === 429) return `${platform}: 429 — rate limited. Honor Retry-After; do not hammer.`;
  if (status >= 500) return `${platform}: ${status} — upstream error, safe to retry later.`;
  return `${platform}: HTTP ${status}.`;
}

/** Split front-matter-free markdown body; dev.to wants tags as an array, max 4. */
function normalizeTags(raw) {
  if (!raw) return [];
  return String(raw)
    .split(',')
    .map((t) => t.trim().toLowerCase().replace(/[^a-z0-9]/g, ''))
    .filter(Boolean)
    .slice(0, 4);
}

/* ------------------------------------------------------------------ *
 * Publishers
 * ------------------------------------------------------------------ */

async function publishDevto(opts, deps) {
  const key = deps.env.DEVTO_API_KEY;
  if (!key) {
    return { ok: false, code: 2, error: 'DEVTO_API_KEY not set. Single secret, no OAuth — set it and unattended runs publish.' };
  }
  const article = {
    title: opts.title,
    body_markdown: opts.body,
    published: true,
    tags: normalizeTags(opts.tags),
  };
  if (opts.canonicalUrl) article.canonical_url = opts.canonicalUrl;

  if (opts.dryRun) {
    return { ok: true, dryRun: true, wouldSend: { ...article, body_markdown: `<${article.body_markdown.length} chars>` } };
  }

  const res = await deps.fetch(DEVTO_API, {
    method: 'POST',
    headers: { 'api-key': key, 'content-type': 'application/json' },
    body: JSON.stringify({ article }),
  });

  if (!res.ok) {
    const retryMs = res.status === 429 ? parseRetryAfter(res.headers.get('retry-after')) : null;
    return {
      ok: false,
      code: 1,
      error: describeHttpFailure(res.status, 'dev.to'),
      retryAfterMs: retryMs,
      body: await res.text().catch(() => ''),
    };
  }
  const json = await res.json();
  return { ok: true, url: json.url || json.canonical_url, id: json.id };
}

async function publishBluesky(opts, deps) {
  const handle = deps.env.BLUESKY_HANDLE;
  const password = deps.env.BLUESKY_APP_PASSWORD;
  if (!handle || !password) {
    return { ok: false, code: 2, error: 'BLUESKY_HANDLE and BLUESKY_APP_PASSWORD required. App passwords remain supported for scripting your own account.' };
  }

  const len = graphemeLength(opts.text);
  if (len > BLUESKY_MAX_GRAPHEMES) {
    return { ok: false, code: 2, error: `Bluesky post is ${len} graphemes; limit is ${BLUESKY_MAX_GRAPHEMES}. Shorten before publishing.` };
  }

  const facets = detectLinkFacets(opts.text);
  const record = {
    $type: 'app.bsky.feed.post',
    text: opts.text,
    createdAt: deps.now().toISOString(),
    ...(facets.length ? { facets } : {}),
  };

  if (opts.dryRun) {
    return { ok: true, dryRun: true, wouldSend: record, facetCount: facets.length };
  }

  const sessRes = await deps.fetch(`${BLUESKY_PDS}/xrpc/com.atproto.server.createSession`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ identifier: handle, password }),
  });
  if (!sessRes.ok) {
    return { ok: false, code: 1, error: describeHttpFailure(sessRes.status, 'bluesky(createSession)') };
  }
  const sess = await sessRes.json();

  const postRes = await deps.fetch(`${BLUESKY_PDS}/xrpc/com.atproto.repo.createRecord`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${sess.accessJwt}` },
    body: JSON.stringify({ repo: sess.did, collection: 'app.bsky.feed.post', record }),
  });
  if (!postRes.ok) {
    return { ok: false, code: 1, error: describeHttpFailure(postRes.status, 'bluesky(createRecord)') };
  }
  const out = await postRes.json();
  const rkey = String(out.uri || '').split('/').pop();
  return { ok: true, url: `https://bsky.app/profile/${handle}/post/${rkey}`, uri: out.uri, facetCount: facets.length };
}

/* ------------------------------------------------------------------ *
 * Verify-after-publish — the honesty contract.
 * ------------------------------------------------------------------ */

async function verifyPublished(url, mustContain, deps) {
  try {
    const res = await deps.fetch(url, { headers: { 'user-agent': 'thumbgate-content-engine/1.0' } });
    if (!res.ok) return { verified: false, reason: `refetch returned HTTP ${res.status}` };
    const body = await res.text();
    if (mustContain && !body.includes(mustContain)) {
      return { verified: false, reason: 'refetched page did not contain the expected text' };
    }
    return { verified: true, bodyChars: body.length };
  } catch (err) {
    return { verified: false, reason: `refetch failed: ${err.message}` };
  }
}

/* ------------------------------------------------------------------ */

async function run(opts, deps) {
  const publisher = opts.platform === 'devto' ? publishDevto
    : opts.platform === 'bluesky' ? publishBluesky
      : null;
  if (!publisher) {
    return { ok: false, code: 2, error: `Unsupported platform "${opts.platform}". Only devto and bluesky have a token path; see the header for why X, Medium, LinkedIn and Threads do not.` };
  }

  const published = await publisher(opts, deps);
  if (!published.ok || published.dryRun) return published;

  if (!published.url) {
    return { ok: false, code: 1, error: 'Publish call succeeded but returned no URL — cannot verify, so this is not Published.' };
  }

  const check = await verifyPublished(published.url, opts.mustContain, deps);
  return {
    ok: check.verified,
    code: check.verified ? 0 : 1,
    url: published.url,
    verified: check.verified,
    ...(check.verified ? { bodyChars: check.bodyChars } : { error: `Published to ${published.url} but could NOT verify: ${check.reason}. Log this Blocked, not Published.` }),
    ...(published.facetCount !== undefined ? { facetCount: published.facetCount } : {}),
  };
}

function parseArgs(argv) {
  const o = { tags: '', dryRun: false, json: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--platform') o.platform = next();
    else if (a === '--title') o.title = next();
    else if (a === '--text') o.text = next();
    else if (a === '--body-file') o.body = fs.readFileSync(next(), 'utf8');
    else if (a === '--tags') o.tags = next();
    else if (a === '--canonical-url') o.canonicalUrl = next();
    else if (a === '--must-contain') o.mustContain = next();
    else if (a === '--dry-run') o.dryRun = true;
    else if (a === '--json') o.json = true;
  }
  return o;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const deps = { fetch: globalThis.fetch, env: process.env, now: () => new Date() };
  const result = await run(opts, deps);
  if (opts.json) {
    console.log(JSON.stringify(result, null, 2));
  } else if (result.ok && result.dryRun) {
    console.log(`DRY RUN ok — ${opts.platform}${result.facetCount !== undefined ? `, ${result.facetCount} link facet(s)` : ''}`);
  } else if (result.ok) {
    console.log(`PUBLISHED + VERIFIED: ${result.url}`);
  } else {
    console.error(result.error || 'failed');
  }
  process.exit(result.ok ? 0 : (result.code || 1));
}

if (require.main === module) {
  main().catch((err) => { console.error(err.message); process.exit(1); });
}

module.exports = {
  detectLinkFacets, graphemeLength, parseRetryAfter, describeHttpFailure,
  normalizeTags, publishDevto, publishBluesky, verifyPublished, run,
};
