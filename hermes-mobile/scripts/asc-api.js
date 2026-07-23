#!/usr/bin/env node
/** Minimal App Store Connect API client (JWT ES256). Used by listing/IAP scripts. */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

function loadEnv(root) {
  const envPath = path.join(root, '.env');
  if (fs.existsSync(envPath)) {
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
      if (val && !process.env[key]?.trim()) process.env[key] = val;
    }
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
  // NOT a password hash: this is an ES256 (ECDSA-SHA256) JWT signature used to
  // authenticate as an App Store Connect API key, per Apple's required auth
  // scheme. SHA256 is the mandated digest for ES256 — not user password storage.
  const sign = crypto.createSign('SHA256');
  sign.update(data);
  sign.end();
  const keyPem = fs.readFileSync(process.env.EXPO_ASC_API_KEY_PATH, 'utf8');
  const privateKey = crypto.createPrivateKey(keyPem);
  const sig = sign.sign({ key: privateKey, dsaEncoding: 'ieee-p1363' }, 'base64url');
  return `${data}.${sig}`;
}

async function ascRequest(method, apiPath, { body, json } = {}) {
  const token = makeJwt();
  const headers = { Authorization: `Bearer ${token}`, Accept: 'application/json' };
  let payload;
  if (json !== undefined) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(json);
  } else if (body !== undefined) {
    payload = body;
  }
  const res = await fetch(`https://api.appstoreconnect.apple.com${apiPath}`, {
    method,
    headers,
    body: payload,
  });
  const text = await res.text();
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    parsed = { raw: text };
  }
  if (!res.ok) {
    const err = new Error(`ASC ${method} ${res.status} ${apiPath}: ${text.slice(0, 800)}`);
    err.status = res.status;
    err.body = parsed;
    throw err;
  }
  return parsed;
}

async function ascGet(apiPath) {
  return ascRequest('GET', apiPath);
}

async function ascPost(apiPath, data) {
  return ascRequest('POST', apiPath, { json: { data } });
}

async function ascPatch(apiPath, data) {
  return ascRequest('PATCH', apiPath, { json: { data } });
}

/**
 * Reserve → chunk upload → commit for ASC binary assets (screenshots, etc.).
 * @param {{ reservePath: string, reserveData: object, assetType: string }} opts
 */
async function ascUploadBinaryAsset(filePath, { reservePath, reserveData, assetType }) {
  const fileBytes = fs.readFileSync(filePath);
  const fileName = path.basename(filePath);
  const fileSize = fileBytes.length;
  // NOT a password hash: Apple's App Store Connect API contract requires the
  // `sourceFileChecksum` attribute on binary-asset PATCH requests to be an MD5
  // hex digest of the uploaded bytes (integrity check, not a security boundary).
  // See https://developer.apple.com/documentation/appstoreconnectapi — changing
  // this algorithm would produce a checksum Apple's servers reject.
  const sourceFileChecksum = crypto.createHash('md5').update(fileBytes).digest('hex');

  const reserved = await ascPost(reservePath, {
    ...reserveData,
    attributes: { ...(reserveData.attributes || {}), fileName, fileSize },
  });
  const asset = reserved.data;
  const ops = asset.attributes?.uploadOperations || [];
  for (const op of ops) {
    const offset = op.offset || 0;
    const length = op.length;
    const chunk = fileBytes.subarray(offset, offset + length);
    const headers = {};
    for (const h of op.requestHeaders || []) headers[h.name] = h.value;
    const res = await fetch(op.url, { method: op.method, headers, body: chunk });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`ASC upload chunk failed ${res.status}: ${errText.slice(0, 200)}`);
    }
  }

  await ascPatch(`/v1/${assetType}/${asset.id}`, {
    type: assetType,
    id: asset.id,
    attributes: { uploaded: true, sourceFileChecksum },
  });
  return asset.id;
}

module.exports = { loadEnv, ascGet, ascPost, ascPatch, ascUploadBinaryAsset };
