#!/usr/bin/env node
'use strict';

/**
 * Cloudflare Kitesurf adapter (Browser Run).
 *
 * Source: https://blog.cloudflare.com/kitesurf/
 *         https://www.infoq.com/news/2026/08/cloudflare-kitesurf-browser/
 *
 * Mechanic stolen: lightweight agent browser for screenshot/HTML/markdown via
 * Cloudflare Browser Run `?browser=kitesurf`. Not a Chromium clone.
 *
 * Honesty:
 *   - Kitesurf is beta on Browser Run. No public OSS yet.
 *   - Missing CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN → UNAVAILABLE, never READY.
 *   - Screenshot/PDF without creds is UNAVAILABLE, never a fake PNG.
 *   - Screenshot/PDF bytes are validated (magic bytes + content-type) BEFORE they
 *     are written with a .png/.pdf extension. An unvalidatable payload returns
 *     INVALID_PAYLOAD with liveClaim:false and writes nothing — the tool never
 *     asserts liveness over bytes it did not verify.
 *   - HTML extract falls back to plain fetch + distill (not pixel-perfect), and
 *     that fallback still runs after a transient Browser Run 429/503.
 *   - Video / WebGL / long-lived auth → chromium (Browser Run default), not Kitesurf.
 *   - Kitesurf is stateless by design: no persistent session state, no bot-challenge
 *     TLS fingerprinting, and CDP coverage is incomplete. Do not imply otherwise.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { htmlToMarkdown } = require('./lib/html-to-markdown');

const BROWSER_RUN_API = 'https://api.cloudflare.com/client/v4/accounts';
const PLAYGROUND = 'https://kitesurf.cloudflare.app/';
const DOCS = 'https://developers.cloudflare.com/browser-run/quick-actions/';

function cloudflareCreds(env = process.env) {
  const accountId = String(env.CLOUDFLARE_ACCOUNT_ID || env.CF_ACCOUNT_ID || '').trim();
  const token = String(env.CLOUDFLARE_API_TOKEN || env.CF_API_TOKEN || '').trim();
  return {
    accountId,
    token,
    ok: Boolean(accountId && token),
  };
}

function quickActionUrl(accountId, action, query = 'browser=kitesurf') {
  const map = {
    screenshot: 'screenshot',
    pdf: 'pdf',
    html: 'content',
    content: 'content',
    dom_extract: 'content',
    markdown: 'markdown',
  };
  const slug = map[action] || 'content';
  return `${BROWSER_RUN_API}/${encodeURIComponent(accountId)}/browser-run/${slug}?${query}`;
}

function cdpWebSocketUrl(accountId) {
  return `wss://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/browser-run/devtools/browser?browser=kitesurf`;
}

function evaluateCompatibility(url, requirements = {}) {
  const raw = String(url || '');
  const needsChromium =
    Boolean(requirements.needsWebGL) ||
    Boolean(requirements.needsVideo) ||
    Boolean(requirements.needsAuthCookies) ||
    Boolean(requirements.needsBotTls) ||
    /\.(mp4|webm|avi|mkv)(\?|$)/i.test(raw) ||
    /youtube\.com|youtu\.be|vimeo\.com/i.test(raw);

  if (needsChromium) {
    return {
      recommendedEngine: 'browser_run_chromium',
      ladderRung: 2,
      kitesurfOk: false,
      reason: 'video, WebGL, TLS bot-challenge, or long-lived auth — Kitesurf cannot do these yet',
    };
  }
  return {
    recommendedEngine: 'kitesurf',
    ladderRung: 1,
    kitesurfOk: true,
    reason: 'screenshot / HTML / markdown — Kitesurf Browser Run beta',
  };
}

/**
 * Extract Markdown from arbitrary web HTML.
 *
 * Delegates to tools/lib/html-to-markdown.js, which TOKENIZES the document
 * instead of regex-filtering tags out of it. Hand-rolled tag filters are banned
 * by AGENTS.md ("naive script strip") and are the CodeQL js/bad-tag-filter /
 * js/incomplete-multi-character-sanitization / js/double-escaping family. This
 * function ingests arbitrary third-party web content, so it is the last place
 * that should be hand-rolling sanitization.
 */
function distillDomToMarkdown(htmlString, title = 'Page Content') {
  if (!htmlString || typeof htmlString !== 'string') {
    return `# ${title}\n\n*No content extracted.*`;
  }
  const markdown = htmlToMarkdown(htmlString);
  return markdown || `# ${title}\n\n*No content extracted.*`;
}

/**
 * Binary payload signatures. A Browser Run 200 is not proof that the body is an
 * image or a PDF — an error page, a JSON envelope or an empty body all arrive
 * with HTTP 200 in practice. Verify the bytes before claiming a live render.
 */
const BINARY_SIGNATURES = [
  { kind: 'png', ext: 'png', magic: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a] },
  { kind: 'pdf', ext: 'pdf', magic: [0x25, 0x50, 0x44, 0x46, 0x2d] },
  { kind: 'jpeg', ext: 'jpg', magic: [0xff, 0xd8, 0xff] },
];

const ACCEPTED_KINDS = { screenshot: ['png', 'jpeg'], pdf: ['pdf'] };

function detectBinaryKind(buf) {
  for (const sig of BINARY_SIGNATURES) {
    if (buf.length >= sig.magic.length && sig.magic.every((b, i) => buf[i] === b)) return sig;
  }
  return null;
}

function payloadPreview(buf) {
  return buf.subarray(0, 16).toString('hex');
}

/**
 * Validate that `buf` really is the binary kind `action` promises.
 * Returns { ok, kind, ext, reason } — never throws.
 */
function validateBinaryPayload(buf, action, contentType = null) {
  const accepted = ACCEPTED_KINDS[action] || [];
  if (!buf || buf.length === 0) {
    return { ok: false, reason: 'empty_payload', detectedKind: null, bytes: 0 };
  }
  const ct = String(contentType || '').toLowerCase();
  if (ct && (ct.includes('application/json') || ct.startsWith('text/'))) {
    return {
      ok: false,
      reason: `content-type ${ct} is not a ${action} payload`,
      detectedKind: null,
      bytes: buf.length,
      preview: payloadPreview(buf),
    };
  }
  const sig = detectBinaryKind(buf);
  if (!sig || !accepted.includes(sig.kind)) {
    return {
      ok: false,
      reason: `payload is not ${accepted.join('/')} (magic bytes ${payloadPreview(buf)})`,
      detectedKind: sig ? sig.kind : null,
      bytes: buf.length,
      preview: payloadPreview(buf),
    };
  }
  return { ok: true, detectedKind: sig.kind, ext: sig.ext, bytes: buf.length };
}

/** Upstream statuses worth falling back on rather than failing the whole call. */
const RETRYABLE_HTTP = new Set([408, 425, 429, 500, 502, 503, 504]);

function headerValue(res, name) {
  try {
    if (res && res.headers && typeof res.headers.get === 'function') return res.headers.get(name);
  } catch {
    /* header bag absent in stubs */
  }
  return null;
}

function getHealthStatus(env = process.env) {
  const creds = cloudflareCreds(env);
  return {
    product: 'Cloudflare Kitesurf',
    liveClaim: false,
    kitesurf: creds.ok ? 'CONFIGURED' : 'UNAVAILABLE',
    reason: creds.ok
      ? 'CLOUDFLARE_ACCOUNT_ID + CLOUDFLARE_API_TOKEN present; not probed until --action'
      : 'missing CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN',
    playground: PLAYGROUND,
    docs: DOCS,
    queryParam: 'browser=kitesurf',
    unsupported: ['video', 'WebGL', 'realistic TLS bot challenges', 'long-lived authenticated sessions'],
    fallbackHtml: 'fetch',
  };
}

class KitesurfEngine {
  constructor(options = {}) {
    this.env = options.env || process.env;
    this.fetchImpl = options.fetchImpl || globalThis.fetch;
  }

  async render({ url, action = 'screenshot', output = null, requirements = {} } = {}) {
    const started = Date.now();
    const compat = evaluateCompatibility(url, requirements);
    const creds = cloudflareCreds(this.env);
    const needsBinary = action === 'screenshot' || action === 'pdf';

    if (!compat.kitesurfOk) {
      return {
        status: 'SKIPPED_UNSUPPORTED',
        engine: compat.recommendedEngine,
        liveClaim: false,
        timingMs: Date.now() - started,
        reason: compat.reason,
      };
    }

    // Records why Browser Run did not answer, so the plain-fetch fallback below
    // can report the real upstream cause instead of silently pretending it was
    // the only path tried.
    let browserRunFallback = null;

    if (creds.ok && typeof this.fetchImpl === 'function') {
      try {
        const endpoint = quickActionUrl(creds.accountId, action);
        const res = await this.fetchImpl(endpoint, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${creds.token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ url }),
        });

        if (!res || !res.ok) {
          const status = res && res.status;
          const denied = status === 401 || status === 403;
          const retryable = RETRYABLE_HTTP.has(status);
          // Binary actions have no text fallback, and an auth failure will not
          // heal on retry — those still fail fast. A transient upstream error on
          // a text action must NOT make extraction less available than running
          // with no credentials at all: fall through to the documented fallback.
          if (needsBinary || denied || !retryable) {
            return {
              status: denied ? 'DENIED' : 'ERROR',
              engine: 'kitesurf',
              liveClaim: false,
              timingMs: Date.now() - started,
              httpStatus: status || null,
              reason: `browser-run ${action} HTTP ${status || 'error'}`,
            };
          }
          browserRunFallback = {
            httpStatus: status,
            reason: `browser-run ${action} HTTP ${status} (transient) — using plain-fetch fallback`,
          };
        } else if (needsBinary) {
          const buf = Buffer.from(await res.arrayBuffer());
          const contentType = headerValue(res, 'content-type');
          const check = validateBinaryPayload(buf, action, contentType);
          if (!check.ok) {
            // Unvalidated bytes are never written with a .png/.pdf extension and
            // never carry liveClaim. Say what arrived instead of asserting a render.
            return {
              status: 'INVALID_PAYLOAD',
              engine: 'kitesurf',
              liveClaim: false,
              timingMs: Date.now() - started,
              httpStatus: res.status || 200,
              bytes: check.bytes,
              contentType: contentType || null,
              detectedKind: check.detectedKind,
              preview: check.preview || null,
              reason: `browser-run returned HTTP 200 but ${check.reason}; refusing to write it as .${action === 'pdf' ? 'pdf' : 'png'} or claim a live render`,
            };
          }
          const dest =
            output || path.join(os.tmpdir(), `kitesurf-${Date.now()}.${check.ext}`);
          fs.writeFileSync(dest, buf);
          return {
            status: 'SUCCESS',
            engine: 'kitesurf',
            liveClaim: true,
            timingMs: Date.now() - started,
            output: dest,
            bytes: buf.length,
            detectedKind: check.detectedKind,
            contentType: contentType || null,
            payloadValidated: true,
          };
        } else {
          const text = typeof res.text === 'function' ? await res.text() : '';
          return {
            status: 'SUCCESS',
            engine: 'kitesurf',
            liveClaim: true,
            timingMs: Date.now() - started,
            markdown: distillDomToMarkdown(text, url),
            bytes: Buffer.byteLength(text),
          };
        }
      } catch (err) {
        if (needsBinary) {
          return {
            status: 'ERROR',
            engine: 'kitesurf',
            liveClaim: false,
            timingMs: Date.now() - started,
            reason: err.message,
          };
        }
        browserRunFallback = {
          httpStatus: null,
          reason: `browser-run ${action} threw (${err.message}) — using plain-fetch fallback`,
        };
      }
    }

    if (needsBinary) {
      return {
        status: 'UNAVAILABLE',
        engine: 'none',
        liveClaim: false,
        timingMs: Date.now() - started,
        reason: 'screenshot/pdf need Browser Run credentials; refusing to write a fake image',
      };
    }

    if (typeof this.fetchImpl !== 'function') {
      return {
        status: 'UNAVAILABLE',
        engine: 'none',
        liveClaim: false,
        timingMs: Date.now() - started,
        reason: 'no fetch implementation',
      };
    }

    const page = await this.fetchImpl(url, { method: 'GET' });
    if (!page || !page.ok) {
      return {
        status: 'ERROR',
        engine: 'fetch_html_fallback',
        liveClaim: false,
        timingMs: Date.now() - started,
        httpStatus: page && page.status,
        reason: `fetch HTML HTTP ${page && page.status}`,
        browserRunFallback,
      };
    }
    const html = await page.text();
    return {
      status: 'SUCCESS',
      engine: 'fetch_html_fallback',
      liveClaim: false,
      timingMs: Date.now() - started,
      markdown: distillDomToMarkdown(html, url),
      bytes: Buffer.byteLength(html),
      browserRunFallback,
    };
  }
}

function parseArgs(argv) {
  const out = { json: false, health: false, url: '', action: 'screenshot', output: '' };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--json') out.json = true;
    else if (argv[i] === '--health') out.health = true;
    else if (argv[i] === '--url' && argv[i + 1]) out.url = argv[++i];
    else if (argv[i] === '--action' && argv[i + 1]) out.action = argv[++i];
    else if (argv[i] === '--output' && argv[i + 1]) out.output = argv[++i];
  }
  return out;
}

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.health) {
    const health = getHealthStatus();
    if (args.json) console.log(JSON.stringify(health, null, 2));
    else {
      console.log(`kitesurf: ${health.kitesurf} liveClaim=${health.liveClaim}`);
      console.log(`reason: ${health.reason}`);
      console.log(`playground: ${health.playground}`);
    }
    return 0;
  }
  if (!args.url) {
    console.error('Usage: node tools/cloudflare-kitesurf-browser.js --url <url> [--action screenshot|html|markdown|pdf] [--output path] [--json] [--health]');
    return 1;
  }
  const engine = new KitesurfEngine();
  const res = await engine.render({ url: args.url, action: args.action, output: args.output || null });
  if (args.json) console.log(JSON.stringify(res, null, 2));
  else {
    console.log(`[kitesurf] ${res.status} engine=${res.engine} liveClaim=${res.liveClaim}`);
    if (res.reason) console.log(`reason: ${res.reason}`);
    if (res.output) console.log(`artifact: ${res.output}`);
  }
  return res.status === 'SUCCESS' ? 0 : 2;
}

if (require.main === module) {
  main().then((code) => process.exit(code)).catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}

module.exports = {
  KitesurfEngine,
  cloudflareCreds,
  quickActionUrl,
  cdpWebSocketUrl,
  evaluateCompatibility,
  distillDomToMarkdown,
  validateBinaryPayload,
  detectBinaryKind,
  RETRYABLE_HTTP,
  getHealthStatus,
  main,
};
