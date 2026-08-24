#!/usr/bin/env node
'use strict';

const assert = require('assert');
const path = require('path');
const {
  PRODUCTS,
  QUICK_ACTION_MIN_DATE,
  catalog,
  crawlPolicyForPath,
  forbiddenError,
  parseCompatibilityDate,
  auditWrangler,
  parseMarkdownResponse,
  fetchMarkdown,
  getHealthStatus,
} = require('../tools/cloudflare-developer-stack');

function headers(map) {
  return {
    get(k) {
      return map[k.toLowerCase()] || map[k] || null;
    },
  };
}

function main() {
  assert.strictEqual(QUICK_ACTION_MIN_DATE, '2026-03-24');

  const have = catalog('HAVE').map((p) => p.id);
  assert.ok(have.includes('workers'));
  assert.ok(have.includes('d1'));

  const skip = catalog('SKIP').map((p) => p.id);
  assert.ok(skip.includes('workers-ai'));
  assert.ok(skip.includes('agents-sdk'));
  assert.ok(skip.includes('wallets'));
  assert.ok(skip.includes('observability-traces'));
  assert.ok(skip.includes('cloudflare-one'));

  const wait = catalog('WAITLIST').map((p) => p.id);
  assert.ok(wait.includes('pay-per-crawl'));
  assert.ok(wait.includes('monetization-gateway'));

  for (const row of catalog()) {
    assert.strictEqual(row.liveClaim, row.verdict === 'HAVE');
    assert.match(row.documentation_url, /^https:\/\/developers\.cloudflare\.com\//);
  }

  const pub = crawlPolicyForPath('/blog/post');
  assert.strictEqual(pub.crawlers, 'ALLOW');
  assert.strictEqual(pub.markdownForAgents, true);
  assert.strictEqual(pub.payPerCrawl, 'WAITLIST');

  const dash = crawlPolicyForPath('/dashboard');
  assert.strictEqual(dash.crawlers, 'DENY');
  assert.strictEqual(dash.markdownForAgents, false);
  assert.match(dash.contentSignal, /ai-train=no/);

  const api = crawlPolicyForPath('/api/tasks');
  assert.strictEqual(api.crawlers, 'DENY');

  const denied = forbiddenError('observability-traces', 'do not enable billable traces');
  assert.strictEqual(denied.status, 403);
  assert.match(denied.documentation_url, /observability\/traces/);

  assert.strictEqual(parseCompatibilityDate('compatibility_date: "2026-07-20"'), '2026-07-20');
  assert.ok(parseCompatibilityDate('compatibility_date: "2026-07-20"') >= QUICK_ACTION_MIN_DATE);

  const repo = path.resolve(__dirname, '..');
  const audit = auditWrangler(repo);
  assert.strictEqual(audit.liveClaim, false);
  assert.strictEqual(audit.ok, true);
  assert.strictEqual(audit.compatibility_date, '2026-07-20');
  const byId = Object.fromEntries(audit.checks.map((c) => [c.id, c]));
  assert.strictEqual(byId.traces_off.ok, true);
  assert.strictEqual(byId.nodejs_compat.ok, true);
  assert.strictEqual(byId.d1_binding.ok, true);
  assert.strictEqual(byId.logs_full_sample.ok, true);
  assert.strictEqual(byId.compatibility_date.ok, true);
  for (const c of audit.checks) {
    assert.match(c.documentation_url, /^https:\/\/developers\.cloudflare\.com\//);
  }

  const parsed = parseMarkdownResponse(
    headers({
      'content-type': 'text/markdown; charset=utf-8',
      'x-markdown-tokens': '725',
      'x-original-tokens': '12345',
      'content-signal': 'ai-train=yes, search=yes, ai-input=yes',
    }),
    '# Hello',
  );
  assert.strictEqual(parsed.isMarkdown, true);
  assert.strictEqual(parsed.markdownTokens, 725);
  assert.strictEqual(parsed.originalTokens, 12345);
  assert.ok(parsed.tokenSavings > 0.9);
  assert.match(parsed.contentSignal, /ai-train=yes/);

  const html = parseMarkdownResponse(headers({ 'content-type': 'text/html' }), '<html>');
  assert.strictEqual(html.isMarkdown, false);

  const health = getHealthStatus(repo);
  assert.strictEqual(health.liveClaim, false);
  assert.strictEqual(health.wranglerOk, true);
  assert.ok(health.skipCount >= 10);
  assert.doesNotMatch(JSON.stringify(health), /10\/10/);
}

async function asyncMain() {
  const result = await fetchMarkdown('https://developers.cloudflare.com/workers/', async () => ({
    ok: true,
    status: 200,
    headers: headers({
      'content-type': 'text/markdown; charset=utf-8',
      'x-markdown-tokens': '100',
      'x-original-tokens': '800',
    }),
    text: async () => '---\ntitle: Workers\n---\n# Workers\n',
  }));
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.liveClaim, false);
  assert.strictEqual(result.markdownTokens, 100);
  assert.match(result.preview, /Workers/);
  assert.match(result.documentation_url, /markdown-for-agents/);
}

main();
asyncMain()
  .then(() => {
    console.log('ok tests/test-cloudflare-developer-stack.js');
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
