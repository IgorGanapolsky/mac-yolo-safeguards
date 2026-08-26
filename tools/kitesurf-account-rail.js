#!/usr/bin/env node
'use strict';

/**
 * Kitesurf account-id rail — complementary to PRs #2010/#2079.
 * Source: https://blog.cloudflare.com/kitesurf/
 *
 * Gap this turn: wrangler OAuth was present, Browser Run still reported
 * UNAVAILABLE because CLOUDFLARE_ACCOUNT_ID was unset. With the account id
 * from `wrangler whoami --json`, Quick Actions (?browser=kitesurf) returned
 * a real PNG of https://thumbgate.app (magic bytes, 1920x1080).
 *
 * Do not vendor Kitesurf/Blitz. Do not dual-edit tools/cloudflare-kitesurf-browser.js.
 * Hosted Worker does not call Browser Run (no Worker secret this change).
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const SOURCE = 'https://blog.cloudflare.com/kitesurf/';
const SCHEMA = 'kitesurf-account-rail/v1';
const BROWSER_RUN_BASE = 'https://api.cloudflare.com/client/v4/accounts';
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const DEFAULT_WRANGLER_TOML = path.join(
  os.homedir(),
  'Library/Preferences/.wrangler/config/default.toml',
);

function honesty() {
  return {
    schema: SCHEMA,
    source: SOURCE,
    clonedKitesurf: false,
    hostedWorkerUsesKitesurf: false,
    dualEditSiblingAdapter: false,
    siblingPRs: ['#2010', '#2079'],
    steal: [
      'one-shot public screenshot/HTML via Browser Run ?browser=kitesurf instead of local Chromium',
      'fail-closed: never claim READY without account id + bearer + PNG magic (screenshots)',
      'auto-fill CLOUDFLARE_ACCOUNT_ID from wrangler whoami when env is empty',
    ],
    skip: [
      'video / WebGL / TLS bot-challenge / long authenticated sessions',
      'vendoring Blitz/Stylo/Parley',
      'wiring Browser Run secrets into the hosted Worker',
      'editing tools/cloudflare-kitesurf-browser.js (sibling #2079/#2010)',
    ],
  };
}

function resolveAccountId(opts = {}) {
  const env = opts.env || process.env;
  if (env.CLOUDFLARE_ACCOUNT_ID) {
    return { accountId: env.CLOUDFLARE_ACCOUNT_ID, source: 'env' };
  }
  if (env.CF_ACCOUNT_ID) {
    return { accountId: env.CF_ACCOUNT_ID, source: 'env' };
  }
  const whoami = opts.whoamiJson || null;
  const fromJson = whoami && whoami.accounts && whoami.accounts[0] && whoami.accounts[0].id;
  if (fromJson) {
    return { accountId: fromJson, source: 'wrangler_whoami' };
  }
  if (opts.execWhoami) {
    try {
      const r = spawnSync('npx', ['wrangler', 'whoami', '--json'], {
        encoding: 'utf8',
        timeout: 20000,
      });
      if (r.status === 0 && r.stdout) {
        const parsed = JSON.parse(r.stdout);
        const id = parsed.accounts && parsed.accounts[0] && parsed.accounts[0].id;
        if (id) return { accountId: id, source: 'wrangler_whoami' };
      }
    } catch {
      // fall through
    }
  }
  return { accountId: null, source: 'none' };
}

function readWranglerOAuth(configPath = DEFAULT_WRANGLER_TOML) {
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

function resolveBearer(opts = {}) {
  const env = opts.env || process.env;
  if (opts.apiToken) return { token: opts.apiToken, source: 'options' };
  if (env.CLOUDFLARE_API_TOKEN) return { token: env.CLOUDFLARE_API_TOKEN, source: 'env' };
  if (env.CF_API_TOKEN) return { token: env.CF_API_TOKEN, source: 'env' };
  const wrangler = readWranglerOAuth(opts.wranglerConfigPath);
  if (wrangler && wrangler.token && !wrangler.expired) {
    return { token: wrangler.token, source: 'wrangler_oauth', expiresAt: wrangler.expiresAt };
  }
  return { token: null, source: 'none' };
}

function evaluateCompatibility(url, requirements = {}) {
  const requiresFullBrowser =
    requirements.needsWebGL ||
    requirements.needsVideo ||
    requirements.needsAuthCookies ||
    /\.(mp4|webm|avi|mkv)$/i.test(String(url || ''));
  if (requiresFullBrowser) {
    return {
      recommendedEngine: 'browser_run_chromium',
      reason: 'Kitesurf is not for video, WebGL, TLS bot challenges, or long auth sessions',
    };
  }
  return {
    recommendedEngine: 'kitesurf',
    reason: 'Public one-shot screenshot/HTML extract',
  };
}

function isPng(buf) {
  return Buffer.isBuffer(buf) && buf.length >= 8 && buf.subarray(0, 8).equals(PNG_MAGIC);
}

function doctor(opts = {}) {
  const account = resolveAccountId(opts);
  const bearer = resolveBearer(opts);
  const configured = Boolean(account.accountId && bearer.token);
  return Object.assign(honesty(), {
    // Credentials alone are CONFIGURED, never READY / liveClaim.
    kitesurfEngine: configured ? 'CONFIGURED' : 'UNAVAILABLE',
    liveClaim: false,
    accountSource: account.source,
    hasAccountId: Boolean(account.accountId),
    credentialSource: bearer.source,
    hasBearer: Boolean(bearer.token),
    reason: configured
      ? `credentials present (${bearer.source}, account via ${account.source}) — CONFIGURED not READY until a Browser Run PNG validates`
      : 'Need Cloudflare account id (env or wrangler whoami) plus bearer (wrangler OAuth or API token)',
  });
}

async function capture(opts) {
  const url = opts.url;
  const action = (opts.action || 'screenshot').toLowerCase();
  const start = Date.now();
  const compat = evaluateCompatibility(url, opts.requirements || {});
  if (compat.recommendedEngine !== 'kitesurf') {
    return {
      status: 'UNAVAILABLE',
      engine: 'kitesurf',
      liveClaim: false,
      error: compat.reason,
      timingMs: Date.now() - start,
    };
  }
  const account = resolveAccountId(opts);
  const bearer = resolveBearer(opts);
  if (!account.accountId || !bearer.token) {
    return {
      status: 'UNAVAILABLE',
      engine: 'kitesurf',
      liveClaim: false,
      error: 'missing account id or bearer — never invent a PNG',
      timingMs: Date.now() - start,
      playground: 'https://kitesurf.cloudflare.app/',
    };
  }
  const kind = action === 'pdf' ? 'pdf' : action === 'html' || action === 'content' ? 'content' : 'screenshot';
  const endpoint = `${BROWSER_RUN_BASE}/${account.accountId}/browser-run/${kind}?browser=kitesurf`;
  const fetchImpl = opts.fetchImpl || globalThis.fetch.bind(globalThis);
  let res;
  try {
    res = await fetchImpl(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${bearer.token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url }),
    });
  } catch (err) {
    return {
      status: 'ERROR',
      engine: 'browser_run_kitesurf',
      liveClaim: false,
      error: `transport: ${err && err.message ? err.message : String(err)}`,
      timingMs: Date.now() - start,
    };
  }
  try {
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      return {
        status: 'ERROR',
        engine: 'browser_run_kitesurf',
        liveClaim: false,
        error: `Browser Run ${kind} HTTP ${res.status}: ${String(text).slice(0, 180)}`,
        timingMs: Date.now() - start,
      };
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (kind === 'screenshot' && !isPng(buf)) {
      return {
        status: 'ERROR',
        engine: 'browser_run_kitesurf',
        liveClaim: false,
        error: 'screenshot body is not a PNG (HTTP 200 is not proof)',
        timingMs: Date.now() - start,
        bytes: buf.length,
      };
    }
    if (opts.output) fs.writeFileSync(opts.output, buf);
    return {
      status: 'SUCCESS',
      engine: 'browser_run_kitesurf',
      liveClaim: true,
      accountSource: account.source,
      credentialSource: bearer.source,
      action: kind,
      bytes: buf.length,
      png: kind === 'screenshot' ? true : undefined,
      output: opts.output || null,
      timingMs: Date.now() - start,
    };
  } catch (err) {
    return {
      status: 'ERROR',
      engine: 'browser_run_kitesurf',
      liveClaim: false,
      error: `transport: ${err && err.message ? err.message : String(err)}`,
      timingMs: Date.now() - start,
    };
  }
}

function parseArgs(argv) {
  const out = { json: false, doctor: false, capture: false, url: '', action: 'screenshot', output: '', execWhoami: true };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const next = argv[i + 1];
    if (a === '--json') out.json = true;
    else if (a === '--doctor' || a === '--health' || a === '--honesty') out.doctor = true;
    else if (a === '--url' && next) {
      out.capture = true;
      out.url = next;
      i += 1;
    } else if (a === '--action' && next) {
      out.action = next;
      i += 1;
    } else if (a === '--output' && next) {
      out.output = next;
      i += 1;
    } else if (a === '--no-whoami') out.execWhoami = false;
  }
  return out;
}

async function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  let result;
  if (args.capture && args.url) {
    result = await capture({
      url: args.url,
      action: args.action,
      output: args.output,
      execWhoami: args.execWhoami,
    });
  } else {
    result = doctor({ execWhoami: args.execWhoami });
  }
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (result.liveClaim === false || result.status === 'ERROR' || result.status === 'UNAVAILABLE') {
    return 1;
  }
  return 0;
}

module.exports = {
  SCHEMA,
  SOURCE,
  PNG_MAGIC,
  honesty,
  resolveAccountId,
  resolveBearer,
  evaluateCompatibility,
  isPng,
  doctor,
  capture,
  main,
};

if (require.main === module) {
  main().then((code) => process.exit(code), (err) => {
    process.stderr.write(`${err && err.message ? err.message : err}\n`);
    process.exit(1);
  });
}
