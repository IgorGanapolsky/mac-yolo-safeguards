#!/usr/bin/env node
'use strict';

/**
 * Obscura high-ROI adapter for thumbgate.app.
 *
 * Source: https://github.com/h4ckf0r0day/obscura
 *         https://obscura.sh/
 *
 * Steal: SSRF deny-by-default, CDP bind 127.0.0.1, zero-state sessions.
 * Do not clone the Rust/V8 engine, stealth fingerprints, or Obscura Cloud.
 */

const { evaluateSsrf, SOURCE } = require('./lib/ssrf-guard');

const PLAYS = Object.freeze([
  {
    id: 'ssrf-deny-private',
    verdict: 'ADAPTER',
    analog: 'tools/lib/ssrf-guard.js + hosted-tool-approvals',
    reason: 'Block loopback/RFC1918/link-local/metadata unless operator override',
  },
  {
    id: 'cdp-loopback-bind',
    verdict: 'ADAPTER',
    analog: 'evaluateCdpBind()',
    reason: 'Docker -p 127.0.0.1:9222:9222; never 0.0.0.0',
  },
  {
    id: 'zero-state-session',
    verdict: 'ADAPTER',
    analog: 'evaluateBrowserSession()',
    reason: 'Fresh sandbox; never reuse interactive Chrome cookies',
  },
  {
    id: 'mcp-origin-allowlist',
    verdict: 'ADAPTER',
    analog: 'evaluateMcpHttp()',
    reason: 'HTTP MCP Origin allowlist when bound off-loopback is refused',
  },
  {
    id: 'nav-timeout',
    verdict: 'HAVE',
    analog: 'existing tool timeouts / HITL TTL',
    reason: 'Hung pages must not stall hosted Hermes',
  },
  {
    id: 'rust-v8-engine',
    verdict: 'SKIP',
    analog: null,
    reason: 'Do not clone Obscura; hosted uses Cloudflare Worker + optional Kitesurf',
  },
  {
    id: 'stealth-fingerprint',
    verdict: 'SKIP',
    analog: null,
    reason: 'Anti-detect / tracker-block is their product; not thumbgate.app',
  },
  {
    id: 'residential-proxies',
    verdict: 'SKIP',
    analog: null,
    reason: 'NodeMaven/ProxyEmpire waitlist; we are not a proxy broker',
  },
  {
    id: 'obscura-cloud',
    verdict: 'SKIP',
    analog: null,
    reason: 'Hosted offer is $10/mo fenced VPS Hermes, not Obscura Cloud',
  },
  {
    id: 'continuity-chrome-profile',
    verdict: 'SKIP',
    analog: null,
    reason: 'Never hero Continuity or attach to Igor daily Chrome',
  },
]);

function catalog(filterVerdict = null) {
  const rows = PLAYS.map((p) => ({
    ...p,
    documentation_url: SOURCE,
    liveClaim: p.verdict === 'HAVE',
  }));
  return filterVerdict ? rows.filter((r) => r.verdict === filterVerdict) : rows;
}

function evaluateCdpBind(bindHost) {
  const h = String(bindHost || '').toLowerCase().replace(/^\[|\]$/g, '');
  const ok = h === '127.0.0.1' || h === 'localhost' || h === '::1';
  return {
    allowed: ok,
    decision: ok ? 'ALLOW' : 'BLOCK',
    reason: ok
      ? 'CDP bound to loopback'
      : 'CDP must bind 127.0.0.1 / ::1 (Obscura docker -p 127.0.0.1:9222:9222)',
    liveClaim: false,
    documentation_url: SOURCE,
  };
}

function evaluateBrowserSession(input = {}) {
  if (input.reuseInteractiveChrome) {
    return {
      allowed: false,
      decision: 'BLOCK',
      reason: 'Zero-state sessions: never reuse the interactive Chrome profile',
      liveClaim: false,
      documentation_url: SOURCE,
    };
  }
  if (input.persistCookiesAcrossJobs) {
    return {
      allowed: false,
      decision: 'BLOCK',
      reason: 'Cookies must not bleed between agent jobs',
      liveClaim: false,
      documentation_url: SOURCE,
    };
  }
  return {
    allowed: true,
    decision: 'ALLOW',
    reason: 'ephemeral session',
    liveClaim: false,
    documentation_url: SOURCE,
  };
}

function evaluateMcpHttp(input = {}) {
  const bind = evaluateCdpBind(input.bindHost == null ? '127.0.0.1' : input.bindHost);
  if (!bind.allowed) {
    return {
      allowed: false,
      status: 403,
      reason: bind.reason,
      liveClaim: false,
      documentation_url: SOURCE,
    };
  }
  const allowlist = Array.isArray(input.allowedOrigins) ? input.allowedOrigins : [];
  const origin = String(input.origin || '');
  if (allowlist.length && origin && !allowlist.includes(origin)) {
    return {
      allowed: false,
      status: 403,
      reason: 'Origin not in MCP allowlist',
      liveClaim: false,
      documentation_url: SOURCE,
    };
  }
  return {
    allowed: true,
    status: 200,
    reason: 'loopback MCP or origin allowlisted',
    liveClaim: false,
    documentation_url: SOURCE,
  };
}

function getHealthStatus() {
  const skip = catalog('SKIP');
  const have = catalog('HAVE');
  const adapter = catalog('ADAPTER');
  return {
    protocol: 'obscura-browser-guard',
    source: SOURCE,
    product: 'thumbgate.app hosted Hermes',
    liveClaim: false,
    skipCount: skip.length,
    haveCount: have.length,
    adapterCount: adapter.length,
    skip: skip.map((p) => p.id),
    note: 'Mechanics not product. Do not clone Obscura, stealth, proxies, or Continuity.',
  };
}

function parseArgs(argv) {
  const out = {
    json: false,
    health: false,
    catalog: false,
    ssrf: false,
    cdp: false,
    session: false,
    mcp: false,
    url: '',
    bind: '127.0.0.1',
    origin: '',
    allowPrivate: false,
    reuseChrome: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') out.json = true;
    else if (a === '--health') out.health = true;
    else if (a === '--catalog') out.catalog = true;
    else if (a === '--ssrf') out.ssrf = true;
    else if (a === '--cdp-bind') out.cdp = true;
    else if (a === '--session') out.session = true;
    else if (a === '--mcp') out.mcp = true;
    else if (a === '--url' && argv[i + 1]) out.url = argv[++i];
    else if (a === '--bind' && argv[i + 1]) out.bind = argv[++i];
    else if (a === '--origin' && argv[i + 1]) out.origin = argv[++i];
    else if (a === '--allow-private-network') out.allowPrivate = true;
    else if (a === '--reuse-chrome') out.reuseChrome = true;
  }
  return out;
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  const print = (obj) => {
    console.log(args.json || typeof obj !== 'string' ? JSON.stringify(obj, null, 2) : obj);
  };
  if (args.catalog) {
    print({ liveClaim: false, source: SOURCE, plays: catalog() });
    return 0;
  }
  if (args.ssrf) {
    print(evaluateSsrf(args.url, { allowPrivateNetwork: args.allowPrivate }));
    return 0;
  }
  if (args.cdp) {
    print(evaluateCdpBind(args.bind));
    return 0;
  }
  if (args.session) {
    print(evaluateBrowserSession({ reuseInteractiveChrome: args.reuseChrome }));
    return 0;
  }
  if (args.mcp) {
    print(evaluateMcpHttp({ bindHost: args.bind, origin: args.origin }));
    return 0;
  }
  print(getHealthStatus());
  return 0;
}

if (require.main === module) {
  process.exit(main());
}

module.exports = {
  SOURCE,
  PLAYS,
  catalog,
  evaluateSsrf,
  evaluateCdpBind,
  evaluateBrowserSession,
  evaluateMcpHttp,
  getHealthStatus,
  main,
};
