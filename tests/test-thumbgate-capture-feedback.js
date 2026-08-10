#!/usr/bin/env node
'use strict';

/**
 * Proves the CLI's signature is accepted by the SERVER'S verification path.
 *
 * The failure this guards against is nasty: a canonical-string or encoding mismatch
 * fails as "invalid device signature", which looks like a bad key and sends you
 * debugging credentials instead of formats. My first draft signed
 * [deviceId, timestamp, nonce, body] — the server actually signs
 * [METHOD, pathname, timestamp, nonce, base64url(sha256(body))]. Nothing but an
 * interop test catches that.
 *
 * So this reimplements lib/device-auth.ts's verify with WebCrypto (importKey jwk,
 * ECDSA P-256/SHA-256, fromBase64Url) and checks the CLI's output against it.
 * Offline, no credentials, no network.
 */

const assert = require('assert');
const crypto = require('crypto');
const { canonicalString, sha256Base64Url, sign, parseArgs } = require('../tools/thumbgate-capture-feedback.js');

let passed = 0;
async function t(name, fn) {
  try { await fn(); console.log(`  ok  ${name}`); passed++; }
  catch (err) { console.error(`  FAIL ${name}\n       ${err.message}`); process.exitCode = 1; }
}

// Mirrors lib/security.ts: base64url of the SHA-256 digest.
async function serverSha256(value) {
  const digest = await crypto.webcrypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  return Buffer.from(digest).toString('base64url');
}

// Mirrors lib/security.ts fromBase64Url.
function fromBase64Url(value) {
  return Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

// Mirrors lib/device-auth.ts verification, including canonical construction.
async function serverVerify({ method, pathname, timestamp, nonce, body, signature, publicJwk }) {
  const bodyHash = await serverSha256(body);
  const canonical = [method.toUpperCase(), pathname, timestamp, nonce, bodyHash].join('\n');
  const key = await crypto.webcrypto.subtle.importKey(
    'jwk', publicJwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['verify']);
  return crypto.webcrypto.subtle.verify(
    { name: 'ECDSA', hash: 'SHA-256' }, key,
    fromBase64Url(signature), new TextEncoder().encode(canonical));
}

(async () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const privB64 = privateKey.export({ format: 'der', type: 'pkcs8' }).toString('base64');
  const publicJwk = publicKey.export({ format: 'jwk' });

  const body = JSON.stringify({ agentId: 'claude', kind: 'mistake', title: 'x', body: 'y' });
  const timestamp = '1786400000000';
  const nonce = 'test-nonce-0001';

  console.log('signature interop with the server verifier');

  await t('a CLI-produced signature verifies under the server path', async () => {
    const sig = sign(canonicalString({ method: 'POST', pathname: '/api/lessons/agent', timestamp, nonce, body }), privB64);
    const ok = await serverVerify({ method: 'POST', pathname: '/api/lessons/agent', timestamp, nonce, body, signature: sig, publicJwk });
    assert.strictEqual(ok, true, 'server rejected a signature the CLI produced');
  });

  await t('signing the raw body instead of its hash is REJECTED (the bug this test exists for)', async () => {
    const wrong = sign(['POST', '/api/lessons/agent', timestamp, nonce, body].join('\n'), privB64);
    const ok = await serverVerify({ method: 'POST', pathname: '/api/lessons/agent', timestamp, nonce, body, signature: wrong, publicJwk });
    assert.strictEqual(ok, false, 'a wrong canonical string must not verify');
  });

  await t('omitting method+pathname (my first draft) is REJECTED', async () => {
    const wrong = sign(['device-1', timestamp, nonce, body].join('\n'), privB64);
    const ok = await serverVerify({ method: 'POST', pathname: '/api/lessons/agent', timestamp, nonce, body, signature: wrong, publicJwk });
    assert.strictEqual(ok, false);
  });

  await t('a tampered body invalidates the signature', async () => {
    const sig = sign(canonicalString({ method: 'POST', pathname: '/api/lessons/agent', timestamp, nonce, body }), privB64);
    const ok = await serverVerify({ method: 'POST', pathname: '/api/lessons/agent', timestamp, nonce, body: body.replace('mistake', 'success'), signature: sig, publicJwk });
    assert.strictEqual(ok, false, 'body tampering must break verification');
  });

  await t('a different path invalidates the signature (no cross-endpoint replay)', async () => {
    const sig = sign(canonicalString({ method: 'POST', pathname: '/api/lessons/agent', timestamp, nonce, body }), privB64);
    const ok = await serverVerify({ method: 'POST', pathname: '/api/device/heartbeat', timestamp, nonce, body, signature: sig, publicJwk });
    assert.strictEqual(ok, false);
  });

  console.log('hash encoding matches lib/security.ts');

  await t('sha256Base64Url agrees with the server helper', async () => {
    assert.strictEqual(sha256Base64Url(body), await serverSha256(body));
    assert.strictEqual(sha256Base64Url(''), await serverSha256(''));
  });

  await t('signatures are raw r||s, not DER (WebCrypto rejects DER)', () => {
    const sig = Buffer.from(sign('x', privB64), 'base64url');
    assert.strictEqual(sig.length, 64, `P-256 raw signature must be 64 bytes, got ${sig.length}`);
    assert.notStrictEqual(sig[0], 0x30, 'a leading 0x30 means DER encoding leaked through');
  });

  console.log('arg parsing');
  await t('parses flags into an object', () => {
    assert.deepStrictEqual(parseArgs(['--agent', 'a', '--kind', 'mistake']), { agent: 'a', kind: 'mistake' });
  });

  await t('a trailing boolean flag is true, and does NOT swallow a value', () => {
    // Regression: the naive parser made a trailing --dry-run undefined, so the guard
    // fell through and the "dry" run hit the network for real.
    assert.deepStrictEqual(parseArgs(['--agent', 'a', '--dry-run']), { agent: 'a', 'dry-run': true });
  });

  await t('a boolean flag mid-list does not eat the following flag', () => {
    assert.deepStrictEqual(parseArgs(['--dry-run', '--agent', 'a']), { 'dry-run': true, agent: 'a' });
  });

  console.log(`\n${passed} passed${process.exitCode ? ' — WITH FAILURES' : ''}`);
})();
