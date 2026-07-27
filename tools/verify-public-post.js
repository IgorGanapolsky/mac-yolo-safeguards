#!/usr/bin/env node
'use strict';

/**
 * verify-public-post.js — HARD post-publish proof for public social URLs.
 *
 * Never claim LIVE from toast, editor URL, or click alone.
 * LIVE = public page returns body with required text / min length.
 *
 * Usage:
 *   node tools/verify-public-post.js --url <https://...> \
 *     [--must-contain "text"]... [--min-body-chars N] [--platform medium] \
 *     [--max-title-only-chars N] [--json]
 *
 * Exit:
 *   0 = LIVE (proof)
 *   1 = PARTIAL / empty / missing required text / title-only Medium
 *   2 = usage / network hard-fail with --strict-network
 *
 * Note: LinkedIn/X often block anonymous fetch. Use --allow-login-wall for those
 * and treat 401/403/soft-wall as inconclusive (exit 1, not LIVE).
 */

const usage = `Usage:
  node tools/verify-public-post.js --url <https://...> [options]

Options:
  --must-contain TEXT     require this substring (repeatable)
  --min-body-chars N      min extracted text length (default: platform-aware)
  --platform NAME         medium|dev.to|x|bluesky|threads|linkedin|hackernews|generic
  --max-title-only-chars  Medium title-only detector threshold (default 400)
  --timeout-ms N          fetch timeout (default 20000)
  --strict-network        exit 2 on network error (default exit 1)
  --allow-login-wall      do not claim LIVE when body looks login-walled
  --json
  --help

Exit 0 LIVE · 1 not proven · 2 error`;

function parseArgs(argv) {
  const args = {
    mustContain: [],
    timeoutMs: 20000,
    maxTitleOnlyChars: 400,
    strictNetwork: false,
    allowLoginWall: false,
    json: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--help' || a === '-h') args.help = true;
    else if (a === '--json') args.json = true;
    else if (a === '--strict-network') args.strictNetwork = true;
    else if (a === '--allow-login-wall') args.allowLoginWall = true;
    else if (a === '--url') args.url = argv[++i];
    else if (a === '--must-contain') args.mustContain.push(argv[++i]);
    else if (a === '--min-body-chars') args.minBodyChars = Number(argv[++i]);
    else if (a === '--platform') args.platform = String(argv[++i]).toLowerCase();
    else if (a === '--max-title-only-chars') args.maxTitleOnlyChars = Number(argv[++i]);
    else if (a === '--timeout-ms') args.timeoutMs = Number(argv[++i]);
    else throw new Error(`Unknown argument: ${a}`);
  }
  return args;
}

function inferPlatform(url, explicit) {
  if (explicit) return explicit.replace(/\s+/g, '');
  const u = String(url || '').toLowerCase();
  if (u.includes('medium.com')) return 'medium';
  if (u.includes('dev.to')) return 'dev.to';
  if (u.includes('bsky.app') || u.includes('bsky.social')) return 'bluesky';
  if (u.includes('threads.net') || u.includes('threads.com')) return 'threads';
  if (u.includes('linkedin.com')) return 'linkedin';
  if (u.includes('x.com/') || u.includes('twitter.com/')) return 'x';
  if (u.includes('news.ycombinator.com')) return 'hackernews';
  if (u.includes('reddit.com')) return 'reddit';
  return 'generic';
}

function defaultMinBody(platform) {
  switch (platform) {
    case 'medium':
      return 500;
    case 'dev.to':
      return 400;
    case 'bluesky':
    case 'threads':
    case 'x':
      return 40;
    case 'hackernews':
      return 20;
    case 'linkedin':
      return 80;
    default:
      return 80;
  }
}

function stripHtml(html) {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractArticleish(html, platform) {
  const h = String(html || '');
  // Prefer <article> body for Medium/dev.to
  const articleMatch = h.match(/<article[\s\S]*?<\/article>/i);
  if (articleMatch) return stripHtml(articleMatch[0]);

  if (platform === 'medium') {
    // Medium often puts story in section or rich content markers
    const section = h.match(/<section[\s\S]*?<\/section>/i);
    if (section) return stripHtml(section[0]);
  }

  if (platform === 'dev.to') {
    const body = h.match(/id=["']article-body["'][\s\S]*?<\/div>/i);
    if (body) return stripHtml(body[0]);
  }

  return stripHtml(h);
}

function looksLoginWalled(text, status, platform) {
  const t = String(text || '').toLowerCase();
  if (status === 401 || status === 403) return true;
  if (platform === 'linkedin' || platform === 'x') {
    if (
      t.includes('sign in')
      || t.includes('log in')
      || t.includes('join linkedin')
      || t.includes('something went wrong')
      || t.length < 100
    ) {
      return true;
    }
  }
  return false;
}

function isMediumTitleOnly(text, titleHint, maxTitleOnlyChars) {
  const t = String(text || '').trim();
  if (t.length === 0) return true;
  if (t.length > maxTitleOnlyChars) return false;
  // Short page that is mostly title + chrome
  const title = String(titleHint || '').trim();
  if (title && t.toLowerCase().includes(title.toLowerCase().slice(0, 40))) {
    // body roughly title-sized
    if (t.length < Math.max(title.length * 3, 200)) return true;
  }
  // Heuristic: very short extracted article
  return t.length < maxTitleOnlyChars && !/\n|\.\s/.test(t.slice(0, 200));
}

async function fetchUrl(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    });
    const body = await res.text();
    return { ok: true, status: res.status, body, finalUrl: res.url };
  } catch (error) {
    return { ok: false, status: null, body: '', error: error.message, finalUrl: url };
  } finally {
    clearTimeout(timer);
  }
}

function extractTitle(html) {
  const m = String(html || '').match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? stripHtml(m[1]) : '';
}

async function verify(args) {
  const url = args.url;
  const platform = inferPlatform(url, args.platform);
  const minBody = Number.isFinite(args.minBodyChars)
    ? args.minBodyChars
    : defaultMinBody(platform);

  if (!url || !/^https?:\/\//i.test(url)) {
    return {
      status: 'ERROR',
      live: false,
      reason: 'Missing or invalid --url (must be http(s))',
      exitCode: 2,
    };
  }

  // Never treat editor/draft URLs as LIVE
  if (/\/edit\//i.test(url) || /\/new$/i.test(url) || /hashnode\.com\/draft/i.test(url)) {
    return {
      status: 'PARTIAL',
      live: false,
      reason: 'URL looks like editor/draft — not a public permalink',
      url,
      platform,
      exitCode: 1,
    };
  }

  const fetched = await fetchUrl(url, args.timeoutMs);
  if (!fetched.ok) {
    return {
      status: 'UNKNOWN',
      live: false,
      reason: `Network error: ${fetched.error}`,
      url,
      platform,
      exitCode: args.strictNetwork ? 2 : 1,
    };
  }

  if (fetched.status >= 400) {
    return {
      status: 'PARTIAL',
      live: false,
      reason: `HTTP ${fetched.status}`,
      url,
      platform,
      httpStatus: fetched.status,
      exitCode: 1,
    };
  }

  const title = extractTitle(fetched.body);
  const text = extractArticleish(fetched.body, platform);
  const missing = [];
  for (const needle of args.mustContain) {
    if (!text.toLowerCase().includes(String(needle).toLowerCase())
      && !fetched.body.toLowerCase().includes(String(needle).toLowerCase())) {
      missing.push(needle);
    }
  }

  if (looksLoginWalled(text, fetched.status, platform)) {
    return {
      status: 'INCONCLUSIVE',
      live: false,
      reason:
        'Login wall or empty public body — cannot prove LIVE via anonymous fetch. Use Chrome innerText on the public URL.',
      url,
      platform,
      httpStatus: fetched.status,
      bodyChars: text.length,
      title,
      exitCode: 1,
    };
  }

  if (platform === 'medium' && isMediumTitleOnly(text, title, args.maxTitleOnlyChars)) {
    return {
      status: 'PARTIAL',
      live: false,
      reason: `Medium looks title-only (extracted ${text.length} chars < meaningful body). Do not claim LIVE.`,
      url,
      platform,
      httpStatus: fetched.status,
      bodyChars: text.length,
      title,
      sample: text.slice(0, 200),
      exitCode: 1,
    };
  }

  if (text.length < minBody) {
    return {
      status: 'PARTIAL',
      live: false,
      reason: `Body too short (${text.length} < min ${minBody})`,
      url,
      platform,
      httpStatus: fetched.status,
      bodyChars: text.length,
      title,
      sample: text.slice(0, 200),
      exitCode: 1,
    };
  }

  if (missing.length > 0) {
    return {
      status: 'PARTIAL',
      live: false,
      reason: `Missing required text: ${missing.map((m) => JSON.stringify(m)).join(', ')}`,
      url,
      platform,
      httpStatus: fetched.status,
      bodyChars: text.length,
      title,
      missing,
      exitCode: 1,
    };
  }

  return {
    status: 'LIVE',
    live: true,
    reason: 'Public page has required body content',
    url,
    finalUrl: fetched.finalUrl,
    platform,
    httpStatus: fetched.status,
    bodyChars: text.length,
    title,
    sample: text.slice(0, 160),
    exitCode: 0,
  };
}

async function main() {
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

  const result = await verify(args);

  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`verify-public-post: ${result.status}`);
    console.log(`  url=${result.url || args.url}`);
    if (result.platform) console.log(`  platform=${result.platform}`);
    if (result.bodyChars != null) console.log(`  bodyChars=${result.bodyChars}`);
    if (result.title) console.log(`  title=${result.title.slice(0, 120)}`);
    console.log(`  reason=${result.reason}`);
    if (result.live) {
      console.log('  OK to mark content log Published/LIVE with this URL.');
    } else {
      console.log('  Do NOT mark LIVE. Fix body or recover URL from profile first.');
    }
  }

  process.exit(result.exitCode);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err.message || err);
    process.exit(2);
  });
}

module.exports = {
  parseArgs,
  verify,
  inferPlatform,
  stripHtml,
  extractArticleish,
  isMediumTitleOnly,
  defaultMinBody,
};
