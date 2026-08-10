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
 *   LinkedIn  LINKEDIN_ACCESS_TOKEN  (w_member_social — OPEN/self-serve for your own profile)
 *   Bluesky   BLUESKY_HANDLE + BLUESKY_APP_PASSWORD
 *
 * Deliberately NOT implemented (verified 2026-08-10, do not "fix" these):
 *   X       — no free tier for new developers since Feb 2026; pay-per-use bills
 *             $0.015/post and $0.20 for a post containing a URL. Every ThumbGate
 *             post contains a URL, and the standing rule forbids spending money.
 *   Hashnode— PERMANENTLY FROZEN by AGENTS.md:63 and the hard gate. Do not re-add.
 *   Medium  — stopped issuing integration tokens in 2023; no new integrations.
 *             Supported path is publish to dev.to, then Medium's "Import a Story",
 *             which sets the canonical URL back to dev.to automatically.
 *   Threads — no token path; needs OAuth via a connected account.
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
const LINKEDIN_API = 'https://api.linkedin.com';
// LinkedIn versions its API by YYYYMM and sunsets old ones; override via LINKEDIN_VERSION.
const LINKEDIN_VERSION_DEFAULT = '202607';
const LINKEDIN_MAX_CHARS = 3000;
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

/**
 * Hashnode is PERMANENTLY FROZEN for this repo — AGENTS.md:63 ("no Hashnode") and
 * tools/social-publish-gate.js FROZEN_PLATFORMS. A working publisher was written for it
 * and then removed: shipping one would let the CLI and the skill route around a standing
 * ban that the hard gate enforces. Refusing loudly here is the point; a missing dispatch
 * would just look like an oversight and get "fixed" by the next agent.
 */
function publishHashnodeFrozen() {
  return {
    ok: false,
    code: 2,
    error: 'hashnode is permanently frozen for this repo (AGENTS.md:63 "no Hashnode"; social-publish-gate.js FROZEN_PLATFORMS). Not a capability gap — a policy. Lift the ban in AGENTS.md and the gate first if this should change.',
  };
}

/**
 * LinkedIn — posting to your OWN profile needs only `w_member_social`, which is an OPEN,
 * self-serve permission via the "Share on LinkedIn" product. It is NOT the approval-gated
 * Community Management API; that one is `w_organization_social`, for company pages.
 * So this needs no partner review, no browser, and no third-party service.
 *
 * Details the docs are explicit about and that break the request if missed:
 *  - BOTH `X-Restli-Protocol-Version: 2.0.0` and `Linkedin-Version: YYYYMM` are required.
 *  - Success is 201, and the post id comes back in the `x-restli-id` RESPONSE HEADER,
 *    not in the body. Parsing the body for an id finds nothing and looks like a failure.
 *  - commentary caps at 3000 chars; over that is 400 FIELD_LENGTH_TOO_LONG.
 *  - Plain `#hashtags` are fine on input; LinkedIn converts them on read. Do not pre-escape.
 *
 * Never drive LinkedIn with a scripted browser login instead of this: automating a human
 * session violates LinkedIn's terms and risks the account being restricted, whereas the
 * official API carries no such risk.
 */
async function publishLinkedIn(opts, deps) {
  const token = deps.env.LINKEDIN_ACCESS_TOKEN;
  if (!token) {
    return { ok: false, code: 2, error: 'LINKEDIN_ACCESS_TOKEN not set. Create an app at developer.linkedin.com, add the self-serve "Share on LinkedIn" + "Sign In with LinkedIn" products, and authorize w_member_social. No partner approval needed for your own profile.' };
  }
  const text = opts.text || opts.body;
  if (!text) return { ok: false, code: 2, error: 'linkedin: --text (or --body-file) is required.' };
  if (text.length > LINKEDIN_MAX_CHARS) {
    return { ok: false, code: 2, error: `linkedin: commentary is ${text.length} chars; the limit is ${LINKEDIN_MAX_CHARS} and LinkedIn rejects longer with 400 FIELD_LENGTH_TOO_LONG.` };
  }
  const version = deps.env.LINKEDIN_VERSION || LINKEDIN_VERSION_DEFAULT;
  const headers = {
    authorization: `Bearer ${token}`,
    'x-restli-protocol-version': '2.0.0',
    'linkedin-version': version,
    'content-type': 'application/json',
  };

  if (opts.dryRun) {
    return { ok: true, dryRun: true, wouldSend: { chars: text.length, version }, note: 'author URN resolves at publish time from /v2/userinfo' };
  }

  // The author URN is derived from the OpenID `sub`, not from the vanity profile name.
  let authorUrn = opts.authorUrn;
  if (!authorUrn) {
    const who = await deps.fetch(`${LINKEDIN_API}/v2/userinfo`, { headers: { authorization: `Bearer ${token}` } });
    if (!who.ok) {
      return { ok: false, code: 1, error: `${describeHttpFailure(who.status, 'linkedin(userinfo)')} If 403, the token is missing the openid/profile scope.` };
    }
    const info = await who.json();
    if (!info.sub) return { ok: false, code: 1, error: 'linkedin: /v2/userinfo returned no `sub`, so the author URN cannot be built.' };
    authorUrn = `urn:li:person:${info.sub}`;
  }

  const body = {
    author: authorUrn,
    commentary: text,
    visibility: 'PUBLIC',
    distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
    lifecycleState: 'PUBLISHED',
    isReshareDisabledByAuthor: false,
  };

  const res = await deps.fetch(`${LINKEDIN_API}/rest/posts`, { method: 'POST', headers, body: JSON.stringify(body) });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    let hint = '';
    if (res.status === 403) hint = ' The token likely lacks w_member_social — re-authorize with that scope.';
    if (res.status === 401) hint = ' LinkedIn access tokens expire after 60 days; refresh it.';
    return { ok: false, code: 1, error: `${describeHttpFailure(res.status, 'linkedin')}${hint} ${detail.slice(0, 300)}`.trim() };
  }
  // 201 Created — the id lives in the header, not the body.
  const urn = res.headers.get('x-restli-id');
  if (!urn) return { ok: false, code: 1, error: 'linkedin: 201 but no x-restli-id header, so the post URL cannot be built — treat as unverified.' };
  return { ok: true, url: `https://www.linkedin.com/feed/update/${urn}/`, urn };
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
  // A 2xx alone is not evidence: SPA shells, login walls and error pages all return 200
  // with none of the post on them. Without a required substring there is nothing to check,
  // so this reports NOT verified rather than quietly passing.
  if (!mustContain) {
    return { verified: false, reason: 'no content evidence supplied (mustContain is required) — a 2xx response alone does not prove the post is live' };
  }
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
      : opts.platform === 'hashnode' ? publishHashnodeFrozen
        : opts.platform === 'linkedin' ? publishLinkedIn
          : null;
  if (!publisher) {
    return { ok: false, code: 2, error: `Unsupported platform "${opts.platform}". Only devto, linkedin and bluesky have a token path; see the header for why X, Medium, LinkedIn and Threads do not.` };
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
    else if (a === '--publication-id') o.publicationId = next();
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
  normalizeTags, publishDevto, publishBluesky,
  publishHashnodeFrozen, publishLinkedIn, verifyPublished, run,
};
