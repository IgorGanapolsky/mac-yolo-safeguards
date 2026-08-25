#!/usr/bin/env node
'use strict';

const assert = require('assert');
const {
  honesty,
  resolveAccountId,
  evaluateCompatibility,
  isPng,
  PNG_MAGIC,
  doctor,
  capture,
} = require('../tools/kitesurf-account-rail');

const h = honesty();
assert.strictEqual(h.clonedKitesurf, false);
assert.strictEqual(h.hostedWorkerUsesKitesurf, false);
assert.strictEqual(h.dualEditSiblingAdapter, false);
assert.ok(h.siblingPRs.includes('#2079'));

assert.deepStrictEqual(resolveAccountId({ env: {} }), { accountId: null, source: 'none' });
assert.deepStrictEqual(
  resolveAccountId({ env: { CLOUDFLARE_ACCOUNT_ID: 'acct-from-env' } }),
  { accountId: 'acct-from-env', source: 'env' },
);
assert.deepStrictEqual(
  resolveAccountId({
    env: {},
    whoamiJson: { accounts: [{ id: '0cae7e525b9750f258704159b9bba785' }] },
  }),
  { accountId: '0cae7e525b9750f258704159b9bba785', source: 'wrangler_whoami' },
);

assert.strictEqual(evaluateCompatibility('https://thumbgate.app').recommendedEngine, 'kitesurf');
assert.strictEqual(
  evaluateCompatibility('https://cdn.example/clip.mp4').recommendedEngine,
  'browser_run_chromium',
);
assert.strictEqual(
  evaluateCompatibility('https://thumbgate.app/d', { needsAuthCookies: true }).recommendedEngine,
  'browser_run_chromium',
);

assert.strictEqual(isPng(Buffer.concat([PNG_MAGIC, Buffer.alloc(24, 1)])), true);
assert.strictEqual(isPng(Buffer.from('not-a-png')), false);

const missing = doctor({ env: {}, wranglerConfigPath: '/tmp/no-such-wrangler.toml' });
assert.strictEqual(missing.liveClaim, false);
assert.strictEqual(missing.kitesurfEngine, 'UNAVAILABLE');

const pngBody = Buffer.concat([PNG_MAGIC, Buffer.alloc(64, 7)]);
const fakeFetchOk = async () => ({
  ok: true,
  status: 200,
  arrayBuffer: async () => pngBody,
  text: async () => '',
});

(async () => {
  const denied = await capture({
    url: 'https://thumbgate.app',
    env: {},
    wranglerConfigPath: '/tmp/no-such-wrangler.toml',
    fetchImpl: fakeFetchOk,
  });
  assert.strictEqual(denied.status, 'UNAVAILABLE');
  assert.strictEqual(denied.liveClaim, false);

  const video = await capture({
    url: 'https://cdn.example/clip.mp4',
    env: { CLOUDFLARE_ACCOUNT_ID: 'acct', CLOUDFLARE_API_TOKEN: 'test-token-not-secret' },
    fetchImpl: fakeFetchOk,
  });
  assert.strictEqual(video.status, 'UNAVAILABLE');

  const ok = await capture({
    url: 'https://thumbgate.app',
    env: { CLOUDFLARE_ACCOUNT_ID: 'acct', CLOUDFLARE_API_TOKEN: 'test-token-not-secret' },
    fetchImpl: fakeFetchOk,
  });
  assert.strictEqual(ok.status, 'SUCCESS');
  assert.strictEqual(ok.liveClaim, true);
  assert.strictEqual(ok.png, true);
  assert.ok(ok.bytes >= 8);

  const lying200 = await capture({
    url: 'https://thumbgate.app',
    env: { CLOUDFLARE_ACCOUNT_ID: 'acct', CLOUDFLARE_API_TOKEN: 'test-token-not-secret' },
    fetchImpl: async () => ({
      ok: true,
      status: 200,
      arrayBuffer: async () => Buffer.from('{"success":true}'),
      text: async () => '{"success":true}',
    }),
  });
  assert.strictEqual(lying200.status, 'ERROR');
  assert.strictEqual(lying200.liveClaim, false);
  assert.match(lying200.error, /not a PNG/);

  console.log('ok tests/test-kitesurf-account-rail.js');
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
