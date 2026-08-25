#!/usr/bin/env node
'use strict';

/**
 * Cloudflare Kitesurf via Browser Run (agent-first WASM browser).
 * Source: https://blog.cloudflare.com/kitesurf/
 *
 * Steal the mechanic (ephemeral Workers browser, ?browser=kitesurf). Do not
 * vendor Chromium. Fail-closed: never claim READY / SUCCESS screenshot without
 * account id + bearer (wrangler OAuth with browser write, or API token that
 * can call Browser Run).
 *
 * Credential order (when not overridden via options):
 *   1. wrangler OAuth (~/Library/Preferences/.wrangler/config/default.toml)
 *   2. CLOUDFLARE_API_TOKEN / CF_API_TOKEN
 * Account.Browser Run-only tokens often 401; wrangler oauth with browser(write)
 * is the proven local rail (2026-08-25).
 *
 * Usage:
 *   node tools/cloudflare-kitesurf-browser.js --health --json
 *   node tools/cloudflare-kitesurf-browser.js --url "https://example.com" --action html --json
 *   node tools/cloudflare-kitesurf-browser.js --url "https://example.com" --action screenshot --output /tmp/out.png
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const BROWSER_RUN_BASE = 'https://api.cloudflare.com/client/v4/accounts';
const DEFAULT_WRANGLER_CONFIG = path.join(
  os.homedir(),
  'Library/Preferences/.wrangler/config/default.toml',
);

class KitesurfEngine {
  constructor(options = {}) {
    const explicitAccount = Object.prototype.hasOwnProperty.call(options, 'accountId');
    const explicitToken = Object.prototype.hasOwnProperty.call(options, 'apiToken');

    this.accountId = explicitAccount
      ? options.accountId
      : options.accountId ||
        process.env.CLOUDFLARE_ACCOUNT_ID ||
        process.env.CF_ACCOUNT_ID ||
        null;

    this.endpoint = options.endpoint || process.env.KITESURF_CDP_ENDPOINT || null;
    this.timeoutMs = options.timeoutMs || 30000;
    this.fetchImpl = options.fetchImpl || globalThis.fetch.bind(globalThis);
    this.credentialSource = 'none';
    this._fallbackToken = null;
    this._fallbackSource = null;

    if (explicitToken) {
      this.apiToken = options.apiToken || null;
      this.credentialSource = this.apiToken ? 'options' : 'none';
      return;
    }

    const wrangler = KitesurfEngine.readWranglerOAuth(options.wranglerConfigPath);
    const envToken =
      process.env.CLOUDFLARE_API_TOKEN || process.env.CF_API_TOKEN || null;

    // Prefer live wrangler OAuth (browser write) over env tokens that often 401.
    if (wrangler && wrangler.token && !wrangler.expired) {
      this.apiToken = wrangler.token;
      this.credentialSource = 'wrangler_oauth';
      if (envToken && envToken !== wrangler.token) {
        this._fallbackToken = envToken;
        this._fallbackSource = 'env';
      }
      return;
    }

    if (envToken) {
      this.apiToken = envToken;
      this.credentialSource = 'env';
      if (wrangler && wrangler.token) {
        this._fallbackToken = wrangler.token;
        this._fallbackSource = 'wrangler_oauth';
      }
      return;
    }

    this.apiToken = null;
  }

  /**
   * Read wrangler OAuth bearer from local config. Never logs the token.
   * @returns {{ token: string, expiresAt: string|null, expired: boolean }|null}
   */
  static readWranglerOAuth(configPath = DEFAULT_WRANGLER_CONFIG) {
    try {
      if (!configPath || !fs.existsSync(configPath)) return null;
      const text = fs.readFileSync(configPath, 'utf8');
      const tokenMatch = text.match(/^\s*oauth_token\s*=\s*"([^"]+)"/m);
      if (!tokenMatch) return null;
      const expMatch = text.match(/^\s*expiration_time\s*=\s*"([^"]+)"/m);
      const expiresAt = expMatch ? expMatch[1] : null;
      let expired = false;
      if (expiresAt) {
        const ms = Date.parse(expiresAt);
        if (Number.isFinite(ms)) expired = ms <= Date.now();
      }
      return { token: tokenMatch[1], expiresAt, expired };
    } catch {
      return null;
    }
  }

  hasBrowserRunCreds() {
    return Boolean(this.accountId && this.apiToken);
  }

  liveClaim() {
    if (!this.hasBrowserRunCreds()) {
      return {
        liveClaim: false,
        reason:
          'missing CLOUDFLARE_ACCOUNT_ID and bearer (wrangler OAuth or CLOUDFLARE_API_TOKEN)',
      };
    }
    return {
      liveClaim: true,
      reason: `Browser Run credentials present (${this.credentialSource})`,
    };
  }

  static buildCdpFrame(method, params = {}, id = 1) {
    return { id, method, params };
  }

  static evaluateCompatibility(url, requirements = {}) {
    const requiresFullBrowser =
      requirements.needsWebGL ||
      requirements.needsVideo ||
      requirements.needsAuthCookies ||
      /\.(mp4|webm|avi|mkv)$/i.test(url);

    if (requiresFullBrowser) {
      return {
        recommendedEngine: 'browser_run_chromium',
        ladderRung: 2,
        reason:
          'Workload needs full Chromium (WebGL, media, TLS bot challenge, or long auth session)',
      };
    }

    return {
      recommendedEngine: 'kitesurf',
      ladderRung: 1,
      reason: 'One-shot screenshot / HTML extract suitable for Kitesurf beta',
    };
  }

  /**
   * Best-effort HTML→markdown for LLM context (not an XSS sanitizer).
   * Uses iterative tag removal so nested/odd markup cannot bypass a single pass.
   */
  static distillDomToMarkdown(htmlString, title = 'Page Content') {
    if (!htmlString || typeof htmlString !== 'string') {
      return `# ${title}\n\n*No content extracted.*`;
    }

    let cleaned = String(htmlString);
    // Drop whole element blocks without regex (avoids incomplete multi-char sanitization)
    cleaned = KitesurfEngine._stripHtmlBlocks(cleaned, [
      ['<script', '</script'],
      ['<style', '</style'],
      ['<svg', '</svg'],
    ]);
    cleaned = KitesurfEngine._stripHtmlComments(cleaned);

    cleaned = cleaned
      .replace(/<h1\b[^>]*>/gi, '\n# ')
      .replace(/<\/h1>/gi, '\n')
      .replace(/<h2\b[^>]*>/gi, '\n## ')
      .replace(/<\/h2>/gi, '\n')
      .replace(/<h3\b[^>]*>/gi, '\n### ')
      .replace(/<\/h3>/gi, '\n')
      .replace(/<li\b[^>]*>/gi, '\n- ')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/(p|div|tr|table|ul|ol)>/gi, '\n');

    // Inline markdown markers before stripping remaining tags
    cleaned = cleaned
      .replace(/<strong\b[^>]*>/gi, '**')
      .replace(/<\/strong>/gi, '**')
      .replace(/<b\b[^>]*>/gi, '**')
      .replace(/<\/b>/gi, '**')
      .replace(/<em\b[^>]*>/gi, '*')
      .replace(/<\/em>/gi, '*')
      .replace(/<i\b[^>]*>/gi, '*')
      .replace(/<\/i>/gi, '*')
      .replace(/<code\b[^>]*>/gi, '`')
      .replace(/<\/code>/gi, '`');
      // <a> tags are stripped below; keep visible link text only

    cleaned = cleaned
      .replace(/<[^>]+>/g, ' ')
      .replace(/&nbsp;/gi, ' ')
      .replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>')
      .replace(/&quot;/gi, '"')
      .replace(/&#39;/gi, "'")
      .replace(/&amp;/gi, '&')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]{2,}/g, ' ')
      .trim();

    return cleaned.length ? cleaned : `# ${title}\n\n*No content extracted.*`;
  }

  /** Case-insensitive indexOf from offset. */
  static _indexOfCi(haystack, needle, from = 0) {
    return haystack.toLowerCase().indexOf(needle.toLowerCase(), from);
  }

  /** Remove <!-- ... --> comments without regex. */
  static _stripHtmlComments(html) {
    let out = '';
    let i = 0;
    while (i < html.length) {
      const start = html.indexOf('<!--', i);
      if (start === -1) {
        out += html.slice(i);
        break;
      }
      out += html.slice(i, start);
      const end = html.indexOf('-->', start + 4);
      if (end === -1) break;
      i = end + 3;
    }
    return out;
  }

  /**
   * Remove <tag ...> ... </tag> blocks by scanning (not regex).
   * pairs: [['<script','</script'], ...]
   */
  static _stripHtmlBlocks(html, pairs) {
    let cleaned = html;
    for (const [openTok, closeTok] of pairs) {
      let guard = 0;
      while (guard++ < 1000) {
        const start = KitesurfEngine._indexOfCi(cleaned, openTok, 0);
        if (start === -1) break;
        const gt = cleaned.indexOf('>', start);
        if (gt === -1) break;
        const endOpen = KitesurfEngine._indexOfCi(cleaned, closeTok, gt + 1);
        if (endOpen === -1) {
          cleaned = cleaned.slice(0, start) + ' ' + cleaned.slice(gt + 1);
          continue;
        }
        const endGt = cleaned.indexOf('>', endOpen);
        if (endGt === -1) break;
        cleaned = cleaned.slice(0, start) + ' ' + cleaned.slice(endGt + 1);
      }
    }
    return cleaned;
  }

  getHealthStatus() {
    const claim = this.liveClaim();
    return {
      kitesurfEngine: claim.liveClaim ? 'READY' : 'UNAVAILABLE',
      version: '1.2.0',
      source: 'https://blog.cloudflare.com/kitesurf/',
      browserRun: claim.liveClaim ? 'CREDENTIALS_PRESENT' : 'NO_CREDENTIALS',
      credentialSource: this.credentialSource,
      liveClaim: claim.liveClaim,
      reason: claim.reason,
      htmlFallback: 'fetch',
      notes:
        'Screenshot/PDF need Browser Run. Prefer wrangler OAuth (browser write). Without creds, html may still fetch; never invent a PNG.',
    };
  }

  async render({
    url,
    action = 'screenshot',
    output = null,
    viewport = { width: 1280, height: 720 },
    requirements = {},
    browser = 'kitesurf',
  }) {
    const startTime = Date.now();
    const compat = KitesurfEngine.evaluateCompatibility(url, requirements);
    const normalized = (action || 'screenshot').toLowerCase();

    if (compat.recommendedEngine !== 'kitesurf' && browser === 'kitesurf') {
      return {
        status: 'UNAVAILABLE',
        engine: 'kitesurf',
        timingMs: Date.now() - startTime,
        error: compat.reason,
        hint: 'Use browser=chromium via Browser Run default, or BrowserOS/Playwright locally',
        liveClaim: false,
      };
    }

    if (normalized === 'html' || normalized === 'dom_extract') {
      if (this.hasBrowserRunCreds()) {
        try {
          const html = await this._browserRunContent(url, browser);
          const md = KitesurfEngine.distillDomToMarkdown(html, url);
          if (output) fs.writeFileSync(output, md, 'utf8');
          return {
            status: 'SUCCESS',
            engine: `browser_run_${browser}`,
            timingMs: Date.now() - startTime,
            output: output || null,
            data: { url, markdown: md, htmlLength: html.length },
            liveClaim: true,
          };
        } catch (err) {
          // Fall through to plain fetch
        }
      }
      try {
        const html = await this._fetchHtml(url);
        const md = KitesurfEngine.distillDomToMarkdown(html, url);
        if (output) fs.writeFileSync(output, md, 'utf8');
        return {
          status: 'SUCCESS',
          engine: 'fetch_html_fallback',
          timingMs: Date.now() - startTime,
          output: output || null,
          data: { url, markdown: md, htmlLength: html.length },
          liveClaim: false,
          note: 'HTML via fetch — not Kitesurf. Set CLOUDFLARE_* for Browser Run.',
        };
      } catch (err) {
        return {
          status: 'ERROR',
          engine: 'fetch_html_fallback',
          timingMs: Date.now() - startTime,
          error: err.message,
          liveClaim: false,
        };
      }
    }

    // screenshot / pdf — require live Browser Run; never fake a file
    if (!this.hasBrowserRunCreds()) {
      return {
        status: 'UNAVAILABLE',
        engine: 'kitesurf',
        timingMs: Date.now() - startTime,
        error:
          'CLOUDFLARE_ACCOUNT_ID + bearer required for screenshot/PDF (wrangler OAuth or CLOUDFLARE_API_TOKEN)',
        liveClaim: false,
        playground: 'https://kitesurf.cloudflare.app/',
      };
    }

    try {
      const artifact = await this._browserRunScreenshotOrPdf(url, normalized, browser);
      const dest =
        output ||
        path.join(
          '/tmp',
          `kitesurf-${Date.now()}.${normalized === 'pdf' ? 'pdf' : 'png'}`,
        );
      fs.writeFileSync(dest, artifact);
      return {
        status: 'SUCCESS',
        engine: `browser_run_${browser}`,
        timingMs: Date.now() - startTime,
        output: dest,
        bytes: artifact.length,
        liveClaim: true,
        credentialSource: this.credentialSource,
        viewport,
      };
    } catch (err) {
      return {
        status: 'ERROR',
        engine: `browser_run_${browser}`,
        timingMs: Date.now() - startTime,
        error: err.message,
        liveClaim: true,
        credentialSource: this.credentialSource,
      };
    }
  }

  async _fetchHtml(url) {
    const res = await this.fetchImpl(url, {
      headers: { Accept: 'text/html,application/xhtml+xml' },
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!res.ok) throw new Error(`fetch HTML HTTP ${res.status}`);
    return res.text();
  }

  _authHeaders() {
    return {
      Authorization: `Bearer ${this.apiToken}`,
      'Content-Type': 'application/json',
    };
  }

  _promoteFallbackCreds() {
    if (!this._fallbackToken) return false;
    this.apiToken = this._fallbackToken;
    this.credentialSource = this._fallbackSource || 'fallback';
    this._fallbackToken = null;
    this._fallbackSource = null;
    return true;
  }

  async _browserRunScreenshotOrPdf(url, action, browser) {
    const kind = action === 'pdf' ? 'pdf' : 'screenshot';
    const endpoint = `${BROWSER_RUN_BASE}/${this.accountId}/browser-run/${kind}?browser=${encodeURIComponent(browser)}`;
    let res = await this.fetchImpl(endpoint, {
      method: 'POST',
      headers: this._authHeaders(),
      body: JSON.stringify({ url }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!res.ok && res.status === 401 && this._promoteFallbackCreds()) {
      res = await this.fetchImpl(endpoint, {
        method: 'POST',
        headers: this._authHeaders(),
        body: JSON.stringify({ url }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Browser Run ${kind} HTTP ${res.status}: ${body.slice(0, 240)}`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length) throw new Error(`Browser Run ${kind} returned empty body`);
    return buf;
  }

  async _browserRunContent(url, browser) {
    const endpoint = `${BROWSER_RUN_BASE}/${this.accountId}/browser-run/content?browser=${encodeURIComponent(browser)}`;
    let res = await this.fetchImpl(endpoint, {
      method: 'POST',
      headers: this._authHeaders(),
      body: JSON.stringify({ url }),
      signal: AbortSignal.timeout(this.timeoutMs),
    });
    if (!res.ok && res.status === 401 && this._promoteFallbackCreds()) {
      res = await this.fetchImpl(endpoint, {
        method: 'POST',
        headers: this._authHeaders(),
        body: JSON.stringify({ url }),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    }
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`Browser Run content HTTP ${res.status}: ${body.slice(0, 240)}`);
    }
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      const json = await res.json();
      return json.result || json.html || json.content || JSON.stringify(json);
    }
    return res.text();
  }
}

function main() {
  const args = process.argv.slice(2);
  const jsonMode = args.includes('--json');
  const healthMode = args.includes('--health');
  const engine = new KitesurfEngine();

  if (healthMode) {
    const health = engine.getHealthStatus();
    if (jsonMode) {
      console.log(JSON.stringify(health, null, 2));
    } else {
      console.log('=== Cloudflare Kitesurf (Browser Run) ===');
      console.log(`Status:     ${health.kitesurfEngine}`);
      console.log(`Live claim: ${health.liveClaim}`);
      console.log(`Reason:     ${health.reason}`);
      console.log(`Source:     ${health.source}`);
    }
    process.exit(health.liveClaim ? 0 : 2);
  }

  let url = '';
  let action = 'screenshot';
  let output = '';
  let browser = 'kitesurf';

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--url' && args[i + 1]) url = args[++i];
    else if (args[i] === '--action' && args[i + 1]) action = args[++i];
    else if (args[i] === '--output' && args[i + 1]) output = args[++i];
    else if (args[i] === '--browser' && args[i + 1]) browser = args[++i];
  }

  if (!url) {
    console.log(
      'Usage: node tools/cloudflare-kitesurf-browser.js --url <url> [--action screenshot|html|pdf] [--output <path>] [--browser kitesurf|chromium] [--json] [--health]',
    );
    process.exit(0);
  }

  engine.render({ url, action, output, browser }).then((res) => {
    if (jsonMode) {
      console.log(JSON.stringify(res, null, 2));
    } else {
      console.log(`[kitesurf] ${res.status} via ${res.engine} (${res.timingMs}ms) liveClaim=${res.liveClaim}`);
      if (res.output) console.log(`Artifact: ${res.output}`);
      if (res.error) console.log(`Error: ${res.error}`);
    }
    process.exit(res.status === 'SUCCESS' ? 0 : 1);
  });
}

if (require.main === module) {
  main();
}

module.exports = { KitesurfEngine };
