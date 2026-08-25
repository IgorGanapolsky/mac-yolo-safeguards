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
  validateBinaryPayload,
  getHealthStatus,
} = require('../tools/cloudflare-kitesurf-browser');

/** Minimal real PNG/PDF byte prefixes for payload-validation tests. */
const PNG_BYTES = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  Buffer.alloc(64, 7),
]);
const PDF_BYTES = Buffer.concat([Buffer.from('%PDF-1.7\n'), Buffer.alloc(64, 7)]);

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

  // Extraction now goes through the tokenizer helper: the exact end-tag spelling
  // CodeQL flagged (`</script >`, with the space) must not leak the body.
  const spaced = distillDomToMarkdown('<p>keep</p><script>alert(1)</script >tail');
  assert.doesNotMatch(spaced, /alert\(1\)/);
  assert.ok(!spaced.includes('<'), 'no raw < may survive extraction');
  assert.match(spaced, /keep/);

  // Payload validation: HTTP 200 is not proof the bytes are an image or a PDF.
  assert.strictEqual(validateBinaryPayload(Buffer.from('PNGDATA'), 'screenshot').ok, false);
  assert.strictEqual(validateBinaryPayload(Buffer.alloc(0), 'screenshot').ok, false);
  assert.strictEqual(validateBinaryPayload(Buffer.from('{\"errors\":[]}'), 'screenshot').ok, false);
  assert.strictEqual(validateBinaryPayload(PDF_BYTES, 'screenshot').ok, false, 'a PDF is not a screenshot');
  assert.strictEqual(validateBinaryPayload(PNG_BYTES, 'screenshot').ok, true);
  assert.strictEqual(validateBinaryPayload(PNG_BYTES, 'screenshot').detectedKind, 'png');
  assert.strictEqual(validateBinaryPayload(PDF_BYTES, 'pdf').ok, true);
  assert.strictEqual(
    validateBinaryPayload(PNG_BYTES, 'screenshot', 'application/json').ok,
    false,
    'content-type must be able to veto',
  );
}

async function asyncMain() {
  const engine = new KitesurfEngine({ env: {}, fetchImpl: null });
  const missing = await engine.render({ url: 'https://example.com', action: 'screenshot' });
  assert.strictEqual(missing.status, 'UNAVAILABLE');
  assert.strictEqual(missing.liveClaim, false);
  assert.doesNotMatch(String(missing.output || ''), /\.png$/);

  const CREDS = { CLOUDFLARE_ACCOUNT_ID: 'acct_test', CLOUDFLARE_API_TOKEN: 'token_test' };

  // A validated PNG is written and MAY claim liveness.
  const tmp = path.join(os.tmpdir(), `kitesurf-test-${Date.now()}.png`);
  const pngEngine = new KitesurfEngine({
    env: CREDS,
    fetchImpl: async () => ({ ok: true, status: 200, arrayBuffer: async () => PNG_BYTES }),
  });
  const shot = await pngEngine.render({ url: 'https://example.com', action: 'screenshot', output: tmp });
  assert.strictEqual(shot.status, 'SUCCESS');
  assert.strictEqual(shot.engine, 'kitesurf');
  assert.strictEqual(shot.liveClaim, true);
  assert.strictEqual(shot.payloadValidated, true);
  assert.strictEqual(shot.detectedKind, 'png');
  assert.ok(fs.readFileSync(tmp).equals(PNG_BYTES));
  fs.unlinkSync(tmp);

  // REGRESSION (review thread, tools/cloudflare-kitesurf-browser.js:179):
  // unvalidated bytes must NOT be written as .png and must NOT claim liveness.
  // This is the same fabrication defect as inventing host telemetry: never
  // assert a live render over bytes that were never checked.
  const badTmp = path.join(os.tmpdir(), `kitesurf-bad-${Date.now()}.png`);
  for (const [label, payload] of [
    ['non-image string', Buffer.from('PNGDATA')],
    ['empty body', Buffer.alloc(0)],
    ['json error envelope', Buffer.from('{"success":false,"errors":[{"code":10000}]}')],
    ['html error page', Buffer.from('<!doctype html><h1>502</h1>')],
  ]) {
    const res = await new KitesurfEngine({
      env: CREDS,
      fetchImpl: async () => ({ ok: true, status: 200, arrayBuffer: async () => payload }),
    }).render({ url: 'https://example.com', action: 'screenshot', output: badTmp });
    assert.strictEqual(res.status, 'INVALID_PAYLOAD', `${label} must not be SUCCESS`);
    assert.strictEqual(res.liveClaim, false, `${label} must not claim liveness`);
    assert.ok(!res.output, `${label} must not report an artifact path`);
    assert.strictEqual(fs.existsSync(badTmp), false, `${label} must not write a file`);
    assert.match(res.reason, /refusing to write/);
  }

  // A PDF body returned for a screenshot request is still a mismatch.
  const wrongKind = await new KitesurfEngine({
    env: CREDS,
    fetchImpl: async () => ({ ok: true, status: 200, arrayBuffer: async () => PDF_BYTES }),
  }).render({ url: 'https://example.com', action: 'screenshot' });
  assert.strictEqual(wrongKind.status, 'INVALID_PAYLOAD');
  assert.strictEqual(wrongKind.liveClaim, false);

  // A content-type that contradicts the bytes also blocks the live claim.
  const ctLies = await new KitesurfEngine({
    env: CREDS,
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      headers: { get: (h) => (h === 'content-type' ? 'application/json' : null) },
      arrayBuffer: async () => PNG_BYTES,
    }),
  }).render({ url: 'https://example.com', action: 'screenshot' });
  assert.strictEqual(ctLies.status, 'INVALID_PAYLOAD');
  assert.strictEqual(ctLies.liveClaim, false);

  // REGRESSION (review thread, tools/cloudflare-kitesurf-browser.js:166):
  // a transient Browser Run error on a TEXT action must still reach the
  // documented plain-fetch fallback. Configuring credentials must never make
  // extraction less available than running without them.
  for (const status of [429, 503, 500, 502, 504, 408]) {
    let call = 0;
    const transient = await new KitesurfEngine({
      env: CREDS,
      fetchImpl: async () => {
        call++;
        if (call === 1) return { ok: false, status };
        return { ok: true, status: 200, text: async () => '<h1>Recovered</h1>' };
      },
    }).render({ url: 'https://example.com', action: 'html' });
    assert.strictEqual(transient.status, 'SUCCESS', `HTTP ${status} must fall back`);
    assert.strictEqual(transient.engine, 'fetch_html_fallback');
    assert.strictEqual(transient.liveClaim, false);
    assert.match(transient.markdown, /# Recovered/);
    assert.strictEqual(transient.browserRunFallback.httpStatus, status);
  }

  // A thrown transport error on a text action falls back the same way.
  let threwOnce = 0;
  const thrown = await new KitesurfEngine({
    env: CREDS,
    fetchImpl: async () => {
      threwOnce++;
      if (threwOnce === 1) throw new Error('ECONNRESET');
      return { ok: true, status: 200, text: async () => '<h1>Recovered</h1>' };
    },
  }).render({ url: 'https://example.com', action: 'markdown' });
  assert.strictEqual(thrown.status, 'SUCCESS');
  assert.strictEqual(thrown.engine, 'fetch_html_fallback');
  assert.match(thrown.browserRunFallback.reason, /ECONNRESET/);

  // A transient error on a BINARY action has no text fallback — still fails fast.
  const transientBinary = await new KitesurfEngine({
    env: CREDS,
    fetchImpl: async () => ({ ok: false, status: 503 }),
  }).render({ url: 'https://example.com', action: 'screenshot' });
  assert.strictEqual(transientBinary.status, 'ERROR');
  assert.strictEqual(transientBinary.liveClaim, false);

  // 404 is not transient: it must not be retried into the fallback.
  const notFound = await new KitesurfEngine({
    env: CREDS,
    fetchImpl: async () => ({ ok: false, status: 404 }),
  }).render({ url: 'https://example.com', action: 'html' });
  assert.strictEqual(notFound.status, 'ERROR');
  assert.strictEqual(notFound.engine, 'kitesurf');

  // 401/403 stay DENIED for text actions too — auth does not heal on retry.
  const deniedText = await new KitesurfEngine({
    env: CREDS,
    fetchImpl: async () => ({ ok: false, status: 403 }),
  }).render({ url: 'https://example.com', action: 'html' });
  assert.strictEqual(deniedText.status, 'DENIED');
  assert.strictEqual(deniedText.liveClaim, false);

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
