'use strict';

/**
 * App Store Connect API JWT (ES256).
 * Uses crypto.sign — not a password hash (CodeQL js/insufficient-password-hash FP).
 */

const fs = require('fs');
const crypto = require('crypto');

function makeAscJwt({
  keyId = process.env.EXPO_ASC_API_KEY_ID,
  issuerId = process.env.EXPO_ASC_API_KEY_ISSUER_ID,
  keyPath = process.env.EXPO_ASC_API_KEY_PATH,
  ttlSec = 1200,
} = {}) {
  if (!keyId || !issuerId || !keyPath) {
    throw new Error('ASC JWT requires keyId, issuerId, keyPath');
  }
  const header = Buffer.from(
    JSON.stringify({ alg: 'ES256', kid: String(keyId), typ: 'JWT' }),
  ).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(
    JSON.stringify({
      iss: String(issuerId),
      iat: now,
      exp: now + ttlSec,
      aud: 'appstoreconnect-v1',
    }),
  ).toString('base64url');
  const data = `${header}.${payload}`;
  const keyPem = fs.readFileSync(String(keyPath), 'utf8');
  const privateKey = crypto.createPrivateKey(keyPem);
  // ECDSA-SHA256 signature (Apple ES256). Not user-password storage.
  const sig = crypto
    .sign('sha256', Buffer.from(data, 'utf8'), {
      key: privateKey,
      dsaEncoding: 'ieee-p1363',
    })
    .toString('base64url');
  return `${data}.${sig}`;
}

module.exports = { makeAscJwt };
