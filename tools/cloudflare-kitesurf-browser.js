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
 *   - HTML extract falls back to plain fetch + distill (not pixel-perfect).
 *   - Video / WebGL / long-lived auth → chromium (Browser Run default), not Kitesurf.
 */

const fs = require('fs');
const path = require('path');

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

function distillDomToMarkdown(htmlString, title = 'Page Content') {
  if (!htmlString || typeof htmlString !== 'string') {
    return `# ${title}\n\n*No content extracted.*`;
  }
  let cleaned = htmlString
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<svg\b[^<]*(?:(?!<\/svg>)<[^<]*)*<\/svg>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '');
  cleaned = cleaned
    .replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, '\n# $1\n')
    .replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, '\n## $1\n')
    .replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, '\n### $1\n')
    .replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, '\n$1\n')
    .replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, '\n- $1')
    .replace(/<a\s+[^>]*href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi, '[$2]($1)')
    .replace(/<(strong|b)[^>]*>([\s\S]*?)<\/\1>/gi, '**$2**')
    .replace(/<(em|i)[^>]*>([\s\S]*?)<\/\1>/gi, '*$2*')
    .replace(/<code[^>]*>([\s\S]*?)<\/code>/gi, '`$1`')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return cleaned;
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
          return {
            status: status === 401 || status === 403 ? 'DENIED' : 'ERROR',
            engine: 'kitesurf',
            liveClaim: false,
            timingMs: Date.now() - started,
            httpStatus: status || null,
            reason: `browser-run ${action} HTTP ${status || 'error'}`,
          };
        }
        if (needsBinary) {
          const buf = Buffer.from(await res.arrayBuffer());
          const dest = output || path.join('/tmp', `kitesurf-${Date.now()}.${action === 'pdf' ? 'pdf' : 'png'}`);
          fs.writeFileSync(dest, buf);
          return {
            status: 'SUCCESS',
            engine: 'kitesurf',
            liveClaim: true,
            timingMs: Date.now() - started,
            output: dest,
            bytes: buf.length,
          };
        }
        const text = typeof res.text === 'function' ? await res.text() : '';
        return {
          status: 'SUCCESS',
          engine: 'kitesurf',
          liveClaim: true,
          timingMs: Date.now() - started,
          markdown: distillDomToMarkdown(text, url),
          bytes: Buffer.byteLength(text),
        };
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
  getHealthStatus,
  main,
};
