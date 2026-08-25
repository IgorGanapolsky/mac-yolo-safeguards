'use strict';

/**
 * Unit tests for Cloudflare Kitesurf Browser Run adapter.
 * Fail-closed: no READY / SUCCESS screenshot without Browser Run creds.
 */

const assert = require('assert');
const { KitesurfEngine } = require('../tools/cloudflare-kitesurf-browser');

console.log('Running test-cloudflare-kitesurf-browser.js...');

// Health without creds must be UNAVAILABLE (not fake READY)
{
  const engine = new KitesurfEngine({ accountId: null, apiToken: null });
  const health = engine.getHealthStatus();
  assert.strictEqual(health.kitesurfEngine, 'UNAVAILABLE');
  assert.strictEqual(health.liveClaim, false);
  assert.ok(String(health.reason).includes('CLOUDFLARE'));
}

// Health with creds can claim READY (presence only — not a live network proof)
{
  const engine = new KitesurfEngine({
    accountId: 'acct_test',
    apiToken: 'tok_test',
  });
  const health = engine.getHealthStatus();
  assert.strictEqual(health.kitesurfEngine, 'READY');
  assert.strictEqual(health.liveClaim, true);
}

// CDP frame builder
{
  const frame = KitesurfEngine.buildCdpFrame('Page.captureScreenshot', { format: 'png' }, 42);
  assert.strictEqual(frame.id, 42);
  assert.strictEqual(frame.method, 'Page.captureScreenshot');
}

// Compatibility routing
{
  const simple = KitesurfEngine.evaluateCompatibility('https://example.com/article');
  assert.strictEqual(simple.recommendedEngine, 'kitesurf');

  const webGl = KitesurfEngine.evaluateCompatibility('https://threejs.org/examples', {
    needsWebGL: true,
  });
  assert.strictEqual(webGl.recommendedEngine, 'browser_run_chromium');

  const video = KitesurfEngine.evaluateCompatibility('https://cdn.example/a.mp4');
  assert.strictEqual(video.recommendedEngine, 'browser_run_chromium');
}

// DOM distillation
{
  const md = KitesurfEngine.distillDomToMarkdown(
    '<html><body><h1>Hi</h1><p>x <strong>y</strong></p><script>bad()</script></body></html>',
    'T',
  );
  assert.ok(md.includes('# Hi'));
  assert.ok(md.includes('**y**'));
  assert.ok(!md.includes('bad()'));
}

(async () => {
  // Screenshot without creds → UNAVAILABLE (never fake PNG)
  {
    const engine = new KitesurfEngine({ accountId: null, apiToken: null });
    const res = await engine.render({
      url: 'https://example.com',
      action: 'screenshot',
      output: '/tmp/must-not-exist-kitesurf.png',
    });
    assert.strictEqual(res.status, 'UNAVAILABLE');
    assert.strictEqual(res.liveClaim, false);
  }

  // HTML without creds may succeed via fetch fallback
  {
    const engine = new KitesurfEngine({
      accountId: null,
      apiToken: null,
      fetchImpl: async () => ({
        ok: true,
        text: async () => '<html><body><h1>Example Domain</h1></body></html>',
        headers: { get: () => 'text/html' },
      }),
    });
    const res = await engine.render({
      url: 'https://example.com',
      action: 'html',
    });
    assert.strictEqual(res.status, 'SUCCESS');
    assert.strictEqual(res.engine, 'fetch_html_fallback');
    assert.strictEqual(res.liveClaim, false);
    assert.ok(res.data.markdown.includes('Example Domain'));
  }

  // Screenshot with mocked Browser Run writes real bytes
  {
    const pngish = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x01]);
    const engine = new KitesurfEngine({
      accountId: 'acct',
      apiToken: 'tok',
      fetchImpl: async () => ({
        ok: true,
        arrayBuffer: async () => pngish.buffer.slice(pngish.byteOffset, pngish.byteOffset + pngish.byteLength),
        text: async () => '',
        headers: { get: () => 'image/png' },
      }),
    });
    const out = `/tmp/kitesurf-test-${Date.now()}.png`;
    const res = await engine.render({
      url: 'https://example.com',
      action: 'screenshot',
      output: out,
    });
    assert.strictEqual(res.status, 'SUCCESS');
    assert.strictEqual(res.liveClaim, true);
    assert.ok(res.bytes > 0);
    const fs = require('fs');
    assert.ok(fs.existsSync(out));
    fs.unlinkSync(out);
  }

  console.log('ok tests/test-cloudflare-kitesurf-browser.js');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
