'use strict';

const assert = require('node:assert/strict');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const test = require('node:test');
const { canonicalRequest, createIdentity, loadConfig, saveConfig, signedHeaders } = require('../tools/hermes-cloud-connector');

test('device signature verifies against the paired public JWK', () => {
  const identity = createIdentity('test-mac');
  const config = { ...identity, deviceId: 'device-1' };
  const body = JSON.stringify({ ok: true });
  const headers = signedHeaders(config, 'POST', '/api/device/heartbeat', body, 1_700_000_000_000, 'nonce-1');
  const canonical = canonicalRequest('POST', '/api/device/heartbeat', headers['x-hermes-timestamp'], headers['x-hermes-nonce'], body);
  const publicKey = crypto.createPublicKey({ key: identity.publicJwk, format: 'jwk' });
  assert.equal(crypto.verify('sha256', Buffer.from(canonical), { key: publicKey, dsaEncoding: 'ieee-p1363' }, Buffer.from(headers['x-hermes-signature'], 'base64url')), true);
});

test('connector config is private and round-trips', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-connector-'));
  const file = path.join(root, 'cloud-connector.json');
  saveConfig(file, { deviceId: 'device-1' });
  assert.deepEqual(loadConfig(file), { deviceId: 'device-1' });
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
});
