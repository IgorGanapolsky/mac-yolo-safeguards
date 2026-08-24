#!/usr/bin/env node
'use strict';

/**
 * Cloudflare developer-docs high-ROI stack doctor.
 *
 * Source: https://developers.cloudflare.com/
 *         https://developers.cloudflare.com/docs-for-agents/
 *         https://developers.cloudflare.com/fundamentals/reference/markdown-for-agents/
 *         https://developers.cloudflare.com/ai-crawl-control/
 *
 * Implements cheap mechanics. Does not clone Cloudflare products.
 */

const fs = require('fs');
const path = require('path');

const DOCS = 'https://developers.cloudflare.com';
const QUICK_ACTION_MIN_DATE = '2026-03-24';
const REPO_ROOT = path.resolve(__dirname, '..');

/** Product map: homepage developer-platform + related. Verdicts are local truth. */
const PRODUCTS = Object.freeze([
  { id: 'workers', docs: '/workers/', verdict: 'HAVE', reason: 'hermes-control-plane Worker + wrangler' },
  { id: 'd1', docs: '/d1/', verdict: 'HAVE', reason: 'D1 binding DB, migrations in drizzle/' },
  { id: 'observability-logs', docs: '/workers/observability/logs/workers-logs/', verdict: 'HAVE', reason: 'observability.logs.head_sampling_rate=1' },
  { id: 'observability-traces', docs: '/workers/observability/traces/', verdict: 'SKIP', reason: 'billable since 2026-03-01; leave traces unset' },
  { id: 'browser-run', docs: '/browser-run/', verdict: 'ADAPTER', reason: 'Kitesurf adapter; live only with CF token' },
  { id: 'kitesurf', docs: '/browser-run/quick-actions/', verdict: 'ADAPTER', reason: '?browser=kitesurf; no video/WebGL/long auth' },
  { id: 'markdown-for-agents', docs: '/fundamentals/reference/markdown-for-agents/', verdict: 'CLIENT', reason: 'Accept: text/markdown client in this tool' },
  { id: 'docs-for-agents', docs: '/docs-for-agents/', verdict: 'CLIENT', reason: 'llms.txt + index.md + markdown Accept' },
  { id: 'ai-crawl-control', docs: '/ai-crawl-control/', verdict: 'POLICY', reason: 'public AEO allow; dashboard/api deny; MCP waitlist 402' },
  { id: 'pay-per-crawl', docs: '/ai-crawl-control/features/pay-per-crawl/what-is-pay-per-crawl/', verdict: 'WAITLIST', reason: 'private beta; capturedRevenueUsd=0' },
  { id: 'monetization-gateway', docs: '/workers/', verdict: 'WAITLIST', reason: 'x402 waitlist adapter; not merchant-of-record' },
  { id: 'r2', docs: '/r2/', verdict: 'OPTIONAL', reason: 'site-creator hosting.json may bind R2; not ThumbGate core' },
  { id: 'kv', docs: '/kv/', verdict: 'SKIP', reason: 'D1 already stores workspace state' },
  { id: 'hyperdrive', docs: '/hyperdrive/', verdict: 'SKIP', reason: 'no origin Postgres to accelerate' },
  { id: 'workers-ai', docs: '/workers-ai/', verdict: 'SKIP', reason: 'LiteLLM :4010 + $10 cap; do not migrate inference' },
  { id: 'ai-gateway', docs: '/ai-gateway/', verdict: 'SKIP', reason: 'hermes-economic-router already gates paid/external' },
  { id: 'ai-search', docs: '/ai-search/', verdict: 'SKIP', reason: 'ThumbGate RAG already exists; do not clone' },
  { id: 'vectorize', docs: '/vectorize/', verdict: 'SKIP', reason: 'do not add a second vector DB' },
  { id: 'agents-sdk', docs: '/agents/', verdict: 'SKIP', reason: 'do not clone Cloudflare Agents SDK (ECI)' },
  { id: 'agent-memory', docs: '/agent-memory/', verdict: 'SKIP', reason: 'ThumbGate MCP memory is the existing surface' },
  { id: 'agent-lee', docs: '/agent-lee/', verdict: 'SKIP', reason: 'dashboard copilot is Cloudflare-only' },
  { id: 'wallets', docs: '/wallets/', verdict: 'SKIP', reason: 'x402/wallets already approval-gated; no live spend' },
  { id: 'sandbox-sdk', docs: '/sandbox/', verdict: 'SKIP', reason: 'hosted fenced VPS is the sandbox' },
  { id: 'containers', docs: '/containers/', verdict: 'SKIP', reason: 'Worker + VPS already cover compute' },
  { id: 'dynamic-workers', docs: '/dynamic-workers/', verdict: 'SKIP', reason: 'Kitesurf internals; we consume Browser Run' },
  { id: 'workflows', docs: '/workflows/', verdict: 'SKIP', reason: 'Grok workflows already exist; do not clone CF Workflows' },
  { id: 'flagship', docs: '/flagship/', verdict: 'SKIP', reason: 'env flags already; no Flagship SKU' },
  { id: 'turnstile', docs: '/turnstile/', verdict: 'SKIP', reason: 'WorkOS login; no public spam form to wrap' },
  { id: 'email-service', docs: '/email-service/', verdict: 'SKIP', reason: 'Gmail drafts + never-send-without-igor' },
  { id: 'images', docs: '/images/', verdict: 'SKIP', reason: 'not a media pipeline product' },
  { id: 'stream', docs: '/stream/', verdict: 'SKIP', reason: 'not a video host' },
  { id: 'queues', docs: '/queues/', verdict: 'SKIP', reason: 'no CF queue consumer yet' },
  { id: 'durable-objects', docs: '/durable-objects/', verdict: 'SKIP', reason: 'D1 + Worker request isolation is enough' },
  { id: 'pages', docs: '/pages/', verdict: 'SKIP', reason: 'control plane is Workers, not Pages' },
  { id: 'cloudflare-one', docs: '/cloudflare-one/', verdict: 'SKIP', reason: 'enterprise Zero Trust; not this repo' },
  { id: 'tunnel', docs: '/tunnel/', verdict: 'SKIP', reason: 'Tailscale/LAN for Hermes; no CF Tunnel clone' },
]);

function docsUrl(productPath) {
  return `${DOCS}${productPath}`;
}

function documentationUrlFor(productId) {
  const row = PRODUCTS.find((p) => p.id === productId);
  return row ? docsUrl(row.docs) : `${DOCS}/`;
}

function forbiddenError(productId, message) {
  return {
    status: 403,
    error: 'forbidden',
    message,
    documentation_url: documentationUrlFor(productId),
  };
}

function catalog(filterVerdict = null) {
  const rows = PRODUCTS.map((p) => ({
    ...p,
    documentation_url: docsUrl(p.docs),
    liveClaim: p.verdict === 'HAVE',
  }));
  return filterVerdict ? rows.filter((r) => r.verdict === filterVerdict) : rows;
}

function crawlPolicyForPath(pathname) {
  const p = String(pathname || '/');
  if (/^\/(dashboard|d|api|mcp)(\/|$)/i.test(p)) {
    return {
      path: p,
      crawlers: 'DENY',
      markdownForAgents: false,
      payPerCrawl: 'WAITLIST',
      contentSignal: 'ai-train=no, search=no, ai-input=no',
      reason: 'private app/API; do not feed agents dashboard HTML',
    };
  }
  return {
    path: p,
    crawlers: 'ALLOW',
    markdownForAgents: true,
    payPerCrawl: 'WAITLIST',
    contentSignal: 'ai-train=yes, search=yes, ai-input=yes',
    reason: 'public docs/marketing; AEO wants GPTBot on content, not /dashboard',
  };
}

function parseCompatibilityDate(source) {
  const m = String(source).match(/compatibility_date["']?\s*[:=]\s*["'](\d{4}-\d{2}-\d{2})["']/);
  return m ? m[1] : null;
}

function stripJsComments(src) {
  return String(src)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

function auditWrangler(repoRoot = REPO_ROOT) {
  const targetPath = path.join(repoRoot, 'apps/hermes-control-plane/build/cloudflare-target.mjs');
  const vitePath = path.join(repoRoot, 'apps/hermes-control-plane/vite.config.ts');
  const source = fs.existsSync(targetPath) ? fs.readFileSync(targetPath, 'utf8') : '';
  const vite = fs.existsSync(vitePath) ? fs.readFileSync(vitePath, 'utf8') : '';
  const code = stripJsComments(source);
  const date = parseCompatibilityDate(source) || parseCompatibilityDate(vite);
  const tracesOn = /traces\s*:\s*\{\s*enabled\s*:\s*true/.test(code);
  const nodeCompat = source.includes('nodejs_compat') || vite.includes('nodejs_compat');
  const d1 = /binding:\s*["']DB["']/.test(source);
  const logsFull = /head_sampling_rate:\s*1/.test(code);
  const quickActionOk = Boolean(date && date >= QUICK_ACTION_MIN_DATE);
  const kitesurfTool = fs.existsSync(path.join(repoRoot, 'tools/cloudflare-kitesurf-browser.js'));
  const x402Tool = fs.existsSync(path.join(repoRoot, 'tools/cloudflare-monetization-gateway.js'));
  const checks = [
    { id: 'compatibility_date', ok: quickActionOk, detail: date, min: QUICK_ACTION_MIN_DATE, documentation_url: documentationUrlFor('browser-run') },
    { id: 'nodejs_compat', ok: nodeCompat, documentation_url: documentationUrlFor('workers') },
    { id: 'd1_binding', ok: d1, documentation_url: documentationUrlFor('d1') },
    { id: 'logs_full_sample', ok: logsFull, documentation_url: documentationUrlFor('observability-logs') },
    { id: 'traces_off', ok: !tracesOn, documentation_url: documentationUrlFor('observability-traces') },
    { id: 'kitesurf_adapter', ok: kitesurfTool, documentation_url: documentationUrlFor('kitesurf') },
    { id: 'x402_adapter', ok: x402Tool, documentation_url: documentationUrlFor('monetization-gateway') },
  ];
  return {
    liveClaim: false,
    quickActionMinDate: QUICK_ACTION_MIN_DATE,
    compatibility_date: date,
    ok: checks.filter((c) => ['compatibility_date', 'nodejs_compat', 'd1_binding', 'logs_full_sample', 'traces_off'].includes(c.id)).every((c) => c.ok),
    checks,
  };
}

function parseMarkdownResponse(headers, body) {
  const get = (k) => {
    if (!headers) return null;
    if (typeof headers.get === 'function') return headers.get(k);
    return headers[k] || headers[k.toLowerCase()] || null;
  };
  const markdownTokens = Number(get('x-markdown-tokens') || 0);
  const originalTokens = Number(get('x-original-tokens') || 0);
  const contentType = String(get('content-type') || '');
  const contentSignal = get('content-signal') || null;
  const isMarkdown = /text\/markdown/i.test(contentType);
  const savings = originalTokens > 0 ? Number((1 - markdownTokens / originalTokens).toFixed(4)) : null;
  return {
    isMarkdown,
    markdownTokens: markdownTokens || null,
    originalTokens: originalTokens || null,
    tokenSavings: savings,
    contentSignal,
    bytes: Buffer.byteLength(String(body || '')),
  };
}

async function fetchMarkdown(url, fetchImpl = globalThis.fetch) {
  if (typeof fetchImpl !== 'function') {
    return { ok: false, status: 0, reason: 'no_fetch', liveClaim: false };
  }
  const res = await fetchImpl(url, { headers: { Accept: 'text/markdown' } });
  const body = typeof res.text === 'function' ? await res.text() : '';
  const parsed = parseMarkdownResponse(res.headers, body);
  return {
    ok: Boolean(res.ok && parsed.isMarkdown),
    status: res.status,
    url,
    liveClaim: false,
    documentation_url: documentationUrlFor('markdown-for-agents'),
    ...parsed,
    preview: String(body).slice(0, 240),
  };
}

function getHealthStatus(repoRoot = REPO_ROOT) {
  const audit = auditWrangler(repoRoot);
  const skip = catalog('SKIP').map((p) => p.id);
  return {
    product: 'cloudflare-developer-stack',
    liveClaim: false,
    source: DOCS,
    wranglerOk: audit.ok,
    skipCount: skip.length,
    haveCount: catalog('HAVE').length,
    waitlist: catalog('WAITLIST').map((p) => p.id),
    note: 'Do not clone Workers AI, Agents SDK, Wallets, or enable billable traces. Stripe $10 hosted remains cash path.',
  };
}

function parseArgs(argv) {
  const out = { json: false, health: false, catalog: false, audit: false, docs: false, product: 'workers', url: '', path: '/' };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--json') out.json = true;
    else if (argv[i] === '--health') out.health = true;
    else if (argv[i] === '--catalog') out.catalog = true;
    else if (argv[i] === '--audit') out.audit = true;
    else if (argv[i] === '--docs') out.docs = true;
    else if (argv[i] === '--product' && argv[i + 1]) out.product = argv[++i];
    else if (argv[i] === '--url' && argv[i + 1]) out.url = argv[++i];
    else if (argv[i] === '--path' && argv[i + 1]) out.path = argv[++i];
    else if (argv[i] === '--crawl-policy') out.crawl = true;
  }
  return out;
}

async function main(argv = process.argv.slice(2), opts = {}) {
  const args = parseArgs(argv);
  const print = (obj) => {
    if (args.json) console.log(JSON.stringify(obj, null, 2));
    else console.log(typeof obj === 'string' ? obj : JSON.stringify(obj));
  };
  if (args.health) {
    print(getHealthStatus(opts.repoRoot));
    return 0;
  }
  if (args.catalog) {
    print({ liveClaim: false, products: catalog() });
    return 0;
  }
  if (args.audit) {
    print(auditWrangler(opts.repoRoot));
    return 0;
  }
  if (args.crawl) {
    print(crawlPolicyForPath(args.path));
    return 0;
  }
  if (args.docs) {
    const row = PRODUCTS.find((p) => p.id === args.product) || PRODUCTS[0];
    const url = args.url || `${DOCS}${row.docs}`.replace(/\/$/, '/index.md');
    const result = await fetchMarkdown(url, opts.fetchImpl || globalThis.fetch);
    print(result);
    return result.ok ? 0 : 2;
  }
  print(getHealthStatus(opts.repoRoot));
  return 0;
}

if (require.main === module) {
  main().then((code) => process.exit(code)).catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}

module.exports = {
  PRODUCTS,
  QUICK_ACTION_MIN_DATE,
  catalog,
  crawlPolicyForPath,
  forbiddenError,
  documentationUrlFor,
  parseCompatibilityDate,
  auditWrangler,
  parseMarkdownResponse,
  fetchMarkdown,
  getHealthStatus,
  main,
};
