#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  KitesurfEngine,
  cloudflareCreds,
  quickActionUrl,
  cdpWebSocketUrl,
  evaluateCompatibility,
  distillDomToMarkdown,
  getHealthStatus,
} = require('../tools/cloudflare-kitesurf-browser');

function main() {
  const emptyHealth = getHealthStatus({});
  assert.strictEqual(emptyHealth.kitesurf, 'UNAVAILABLE');
  assert.strictEqual(emptyHealth.liveClaim, false);
  assert.match(emptyHealth.reason, /missing/);

  const configured = getHealthStatus({
    CLOUDFLARE_ACCOUNT_ID: 'acct_test',
    CLOUDFLARE_API_TOKEN: 'token_test',
  });
  assert.strictEqual(configured.kitesurf, 'CONFIGURED');
  assert.strictEqual(configured.liveClaim, false);

  assert.strictEqual(cloudflareCreds({}).ok, false);
  const url = quickActionUrl('acct_test', 'screenshot');
  assert.match(url, /browser-run\/screenshot\?browser=kitesurf/);
  assert.match(cdpWebSocketUrl('acct_test'), /browser=kitesurf/);

  const htmlPage = evaluateCompatibility('https://example.com/docs');
  assert.strictEqual(htmlPage.recommendedEngine, 'kitesurf');
  assert.strictEqual(htmlPage.kitesurfOk, true);

  const video = evaluateCompatibility('https://cdn.example.com/clip.mp4');
  assert.strictEqual(video.kitesurfOk, false);
  assert.strictEqual(video.recommendedEngine, 'browser_run_chromium');

  const webgl = evaluateCompatibility('https://threejs.org/examples', { needsWebGL: true });
  assert.strictEqual(webgl.kitesurfOk, false);

  const md = distillDomToMarkdown(
    '<html><head><script>track()</script></head><body><h1>Hello</h1><p>This is <strong>bold</strong> and a <a href="https://example.com">link</a>.</p><ul><li>One</li></ul></body></html>',
  );
  assert.match(md, /# Hello/);
  assert.match(md, /\*\*bold\*\*/);
  assert.match(md, /\[link\]\(https:\/\/example.com\)/);
  assert.match(md, /- One/);
  assert.doesNotMatch(md, /track\(\)/);
}

async function asyncMain() {
  const engine = new KitesurfEngine({ env: {}, fetchImpl: null });
  const missing = await engine.render({ url: 'https://example.com', action: 'screenshot' });
  assert.strictEqual(missing.status, 'UNAVAILABLE');
  assert.strictEqual(missing.liveClaim, false);
  assert.doesNotMatch(String(missing.output || ''), /\.png$/);

  const tmp = path.join(os.tmpdir(), `kitesurf-test-${Date.now()}.png`);
  const pngEngine = new KitesurfEngine({
    env: { CLOUDFLARE_ACCOUNT_ID: 'acct_test', CLOUDFLARE_API_TOKEN: 'token_test' },
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      arrayBuffer: async () => Buffer.from('PNGDATA'),
    }),
  });
  const shot = await pngEngine.render({ url: 'https://example.com', action: 'screenshot', output: tmp });
  assert.strictEqual(shot.status, 'SUCCESS');
  assert.strictEqual(shot.engine, 'kitesurf');
  assert.strictEqual(shot.liveClaim, true);
  assert.strictEqual(fs.readFileSync(tmp, 'utf8'), 'PNGDATA');
  fs.unlinkSync(tmp);

  const denied = await new KitesurfEngine({
    env: { CLOUDFLARE_ACCOUNT_ID: 'acct_test', CLOUDFLARE_API_TOKEN: 'token_test' },
    fetchImpl: async () => ({ ok: false, status: 401 }),
  }).render({ url: 'https://example.com', action: 'screenshot' });
  assert.strictEqual(denied.status, 'DENIED');
  assert.strictEqual(denied.liveClaim, false);

  const fallback = await new KitesurfEngine({
    env: {},
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      text: async () => '<h1>Fallback</h1><p>plain fetch</p>',
    }),
  }).render({ url: 'https://example.com', action: 'html' });
  assert.strictEqual(fallback.status, 'SUCCESS');
  assert.strictEqual(fallback.engine, 'fetch_html_fallback');
  assert.strictEqual(fallback.liveClaim, false);
  assert.match(fallback.markdown, /# Fallback/);
}

main();
asyncMain()
  .then(() => {
    console.log('ok tests/test-cloudflare-kitesurf-browser.js');
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
