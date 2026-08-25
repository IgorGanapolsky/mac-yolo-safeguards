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
const { htmlToMarkdown } = require('./lib/html-to-markdown');

const BROWSER_RUN_BASE = 'https://api.cloudflare.com/client/v4/accounts';
const DEFAULT_WRANGLER_CONFIG = path.join(
  os.homedir(),
  'Library/Preferences/.wrangler/config/default.toml',
);
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const PDF_MAGIC = Buffer.from('%PDF');

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
    // Credential presence alone is never a live operational claim.
    // liveClaim becomes true only after a successful Browser Run payload.
    if (!this.hasBrowserRunCreds()) {
      return {
        liveClaim: false,
        configured: false,
        reason:
          'missing CLOUDFLARE_ACCOUNT_ID and bearer (wrangler OAuth or CLOUDFLARE_API_TOKEN)',
      };
    }
    return {
      liveClaim: false,
      configured: true,
      reason: `Browser Run credentials present (${this.credentialSource}) — unprobed; not READY until a live payload validates`,
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
    // Shared tokenizer — never hand-roll script/tag strip (AGENTS.md CodeQL hygiene).
    const body = htmlToMarkdown(htmlString);
    if (!body) return `# ${title}\n\n*No content extracted.*`;
    return `# ${title}\n\n${body}`;
  }

  static assertArtifactMagic(buf, kind) {
    if (!Buffer.isBuffer(buf) || buf.length === 0) {
      throw new Error(`Browser Run ${kind} returned empty body`);
    }
    const head = buf.subarray(0, 16).toString('utf8');
    if (head.trimStart().startsWith('{') || head.trimStart().startsWith('<')) {
      throw new Error(
        `Browser Run ${kind} returned non-binary envelope (${head.slice(0, 80).replace(/\s+/g, ' ')})`,
      );
    }
    if (kind === 'pdf') {
      if (!buf.subarray(0, 4).equals(PDF_MAGIC)) {
        throw new Error('Browser Run pdf missing %PDF magic');
      }
      return;
    }
    if (buf.length < PNG_MAGIC.length || !buf.subarray(0, PNG_MAGIC.length).equals(PNG_MAGIC)) {
      throw new Error('Browser Run screenshot missing PNG magic');
    }
  }

  getHealthStatus() {
    const claim = this.liveClaim();
    let status = 'UNAVAILABLE';
    let browserRun = 'NO_CREDENTIALS';
    if (claim.configured) {
      status = 'CONFIGURED';
      browserRun = 'CREDENTIALS_PRESENT_UNPROBED';
    }
    if (claim.liveClaim) {
      status = 'READY';
      browserRun = 'LIVE_VALIDATED';
    }
    return {
      kitesurfEngine: status,
      version: '1.3.0',
      source: 'https://blog.cloudflare.com/kitesurf/',
      browserRun,
      credentialSource: this.credentialSource,
      liveClaim: claim.liveClaim,
      configured: Boolean(claim.configured),
      reason: claim.reason,
      htmlFallback: 'fetch',
      notes:
        'Screenshot/PDF need Browser Run. Prefer wrangler OAuth (browser write). Creds alone → CONFIGURED (not READY). Never invent a PNG.',
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
        liveClaim: false,
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
    const ct = String(res.headers.get('content-type') || '').toLowerCase();
    if (ct.includes('application/json') || ct.includes('text/html') || ct.includes('text/plain')) {
      const body = await res.text().catch(() => '');
      throw new Error(
        `Browser Run ${kind} returned ${ct || 'unexpected'} envelope: ${body.slice(0, 160)}`,
      );
    }
    const buf = Buffer.from(await res.arrayBuffer());
    KitesurfEngine.assertArtifactMagic(buf, kind);
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
