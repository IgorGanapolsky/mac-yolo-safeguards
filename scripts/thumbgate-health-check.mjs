#!/usr/bin/env node
// Production health check for thumbgate.app - TeamViewer monitoring-tooling steal.
//
// TeamViewer open-sources api-example-scripts + a Grafana datasource so operators
// can watch their control plane from outside. Our control plane had no automated
// external check - every deploy was verified by hand. This is that check: hit the
// public /api/health endpoint, classify the response, exit nonzero on trouble so
// CI/cron can page. No secrets, no auth - /api/health is public by design.
//
// Usage:
//   node scripts/thumbgate-health-check.mjs
//   node scripts/thumbgate-health-check.mjs --url https://app.thumbgate.app --json
//   node scripts/thumbgate-health-check.mjs --timeout 8000

export function classifyHealth({ status, body }) {
  if (status === 0) return { ok: false, level: 'unreachable', detail: 'no HTTP response (DNS/TLS/timeout)' };
  // Cloudflare 1027 (account/quota suspension) is a BODY error code, not an HTTP
  // status; check it before the generic buckets so it is not swallowed as 5xx.
  if (body && body.error === 1027) return { ok: false, level: 'suspended', detail: 'Cloudflare 1027 - daily quota' };
  if (status === 429) return { ok: false, level: 'rate_limited', detail: 'HTTP 429 - quota exhausted' };
  if (status >= 500) return { ok: false, level: 'server_error', detail: `HTTP ${status}` };
  if (status >= 400) return { ok: false, level: 'client_error', detail: `HTTP ${status}` };
  if (status !== 200) return { ok: false, level: 'unexpected', detail: `HTTP ${status}` };
  if (body && (body.status === 'ok' || body.ok === true || body.healthy === true)) {
    return { ok: true, level: 'healthy', detail: 'HTTP 200 + healthy body' };
  }
  return { ok: true, level: 'reachable', detail: 'HTTP 200 (no explicit health field)' };
}

export function parseArgs(argv) {
  const args = { url: 'https://thumbgate.app', json: false, timeout: 10000, path: '/api/health' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--url') args.url = String(argv[++i] || args.url).replace(/\/+$/, '');
    else if (a === '--path') args.path = String(argv[++i] || args.path);
    else if (a === '--json') args.json = true;
    else if (a === '--timeout') args.timeout = Number(argv[++i]) || args.timeout;
  }
  return args;
}

async function probe(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, redirect: 'follow' });
    let body = null;
    try { body = await res.json(); } catch { body = null; }
    return { status: res.status, body };
  } catch {
    return { status: 0, body: null };
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const target = args.url + args.path;
  const result = await probe(target, args.timeout);
  const verdict = classifyHealth(result);
  if (args.json) console.log(JSON.stringify({ target, httpStatus: result.status, ...verdict }));
  else console.log(`${verdict.ok ? 'OK' : 'FAIL'} [${verdict.level}] ${target} - ${verdict.detail}`);
  process.exit(verdict.ok ? 0 : 1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
