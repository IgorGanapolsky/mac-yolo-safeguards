#!/usr/bin/env node
/** Minimal App Store Connect API client (JWT ES256). Used by listing/IAP scripts. */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function loadEnv(root) {
  const envPath = path.join(root, '.env');
  if (!fs.existsSync(envPath)) throw new Error('Missing .env');
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq <= 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (val) process.env[key] = val;
  }
  const keyPath = process.env.EXPO_ASC_API_KEY_PATH?.trim();
  if (keyPath && fs.existsSync(keyPath) && !process.env.EXPO_ASC_API_KEY_ID?.trim()) {
    const kid = path.basename(keyPath).match(/AuthKey_(.+)\.p8/)?.[1];
    if (kid) process.env.EXPO_ASC_API_KEY_ID = kid;
  }
  if (!process.env.EXPO_ASC_APP_ID?.trim()) process.env.EXPO_ASC_APP_ID = '6786778037';
  if (!process.env.EXPO_ASC_API_KEY_ISSUER_ID?.trim()) {
    const fallbackEnv = path.join(root, '../../LipoShield/.env');
    if (fs.existsSync(fallbackEnv)) {
      for (const line of fs.readFileSync(fallbackEnv, 'utf8').split('\n')) {
        const m = line.match(/^EXPO_ASC_API_KEY_ISSUER_ID=(.+)$/);
        if (m?.[1]?.trim()) {
          process.env.EXPO_ASC_API_KEY_ISSUER_ID = m[1].trim().replace(/^['"]|['"]$/g, '');
          break;
        }
      }
    }
  }
  for (const key of ['EXPO_ASC_API_KEY_ID', 'EXPO_ASC_API_KEY_ISSUER_ID', 'EXPO_ASC_API_KEY_PATH']) {
    if (!process.env[key]?.trim()) throw new Error(`Missing ${key}`);
  }
}

function makeJwt() {
  const header = Buffer.from(JSON.stringify({ alg: 'ES256', kid: process.env.EXPO_ASC_API_KEY_ID, typ: 'JWT' })).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(
    JSON.stringify({ iss: process.env.EXPO_ASC_API_KEY_ISSUER_ID, iat: now, exp: now + 1200, aud: 'appstoreconnect-v1' }),
  ).toString('base64url');
  const data = `${header}.${payload}`;
  const sign = crypto.createSign('SHA256');
  sign.update(data);
  sign.end();
  const keyPem = fs.readFileSync(process.env.EXPO_ASC_API_KEY_PATH, 'utf8');
  const privateKey = crypto.createPrivateKey(keyPem);
  const sig = sign.sign({ key: privateKey, dsaEncoding: 'ieee-p1363' }, 'base64url');
  return `${data}.${sig}`;
}

async function ascGet(apiPath) {
  const token = makeJwt();
  const res = await fetch(`https://api.appstoreconnect.apple.com${apiPath}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  const body = await res.text();
  let json;
  try {
    json = JSON.parse(body);
  } catch {
    json = { raw: body };
  }
  if (!res.ok) {
    const err = new Error(`ASC ${res.status} ${apiPath}: ${body.slice(0, 500)}`);
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}

async function ascPost(apiPath, data) {
  const token = makeJwt();
  const res = await fetch(`https://api.appstoreconnect.apple.com${apiPath}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ data }),
  });
  const body = await res.text();
  let json;
  try {
    json = JSON.parse(body);
  } catch {
    json = { raw: body };
  }
  if (!res.ok) {
    const err = new Error(`ASC POST ${res.status} ${apiPath}: ${body.slice(0, 800)}`);
    err.status = res.status;
    err.body = json;
    throw err;
  }
  return json;
}

module.exports = { loadEnv, ascGet, ascPost };
