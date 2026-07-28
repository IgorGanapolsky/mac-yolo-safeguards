#!/usr/bin/env node
/**
 * Read-only App Store Connect audit.
 *
 * There was a Google Play production audit but no iOS equivalent, so when
 * `eas submit` failed with nothing but "Something went wrong when submitting
 * your app to Apple App Store Connect" there was no way to see what Apple
 * actually thought the app's state was. EAS surfaces no error: the submission
 * record returns `error: null`, `logFiles: []`, `canRetry: false`.
 *
 * Reads only. No build, no submit, no edit. Prints the app's App Store version
 * records and its most recent uploaded builds.
 *
 * Env: ASC_KEY_ID, ASC_ISSUER_ID, ASC_APP_ID, and one of ASC_KEY_PATH /
 * ASC_KEY_BASE64.
 */
const crypto = require('crypto');
const fs = require('fs');

const KEY_ID = process.env.ASC_KEY_ID;
const ISSUER_ID = process.env.ASC_ISSUER_ID;
const APP_ID = process.env.ASC_APP_ID;

function loadPrivateKey() {
  if (process.env.ASC_KEY_BASE64) {
    return Buffer.from(process.env.ASC_KEY_BASE64, 'base64').toString('utf8');
  }
  if (process.env.ASC_KEY_PATH) {
    return fs.readFileSync(process.env.ASC_KEY_PATH, 'utf8');
  }
  throw new Error('Provide ASC_KEY_BASE64 or ASC_KEY_PATH');
}

const b64url = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');

/**
 * ASC requires ES256. Node's default ECDSA output is DER; JWS needs the raw
 * r||s pair, which is what dsaEncoding: 'ieee-p1363' produces.
 */
function mintToken(privateKey, nowSeconds) {
  const header = { alg: 'ES256', kid: KEY_ID, typ: 'JWT' };
  const payload = {
    iss: ISSUER_ID,
    iat: nowSeconds,
    exp: nowSeconds + 600,
    aud: 'appstoreconnect-v1',
  };
  const signingInput = `${b64url(header)}.${b64url(payload)}`;
  const signature = crypto.sign('sha256', Buffer.from(signingInput), {
    key: privateKey,
    dsaEncoding: 'ieee-p1363',
  });
  return `${signingInput}.${signature.toString('base64url')}`;
}

async function ascGet(token, path) {
  const response = await fetch(`https://api.appstoreconnect.apple.com${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`ASC ${path} -> HTTP ${response.status}: ${body.slice(0, 600)}`);
  }
  return JSON.parse(body);
}

async function main() {
  for (const [name, value] of Object.entries({ KEY_ID, ISSUER_ID, APP_ID })) {
    if (!value) throw new Error(`Missing required env: ${name}`);
  }
  const token = mintToken(loadPrivateKey(), Math.floor(Date.now() / 1000));

  const versions = await ascGet(
    token,
    `/v1/apps/${APP_ID}/appStoreVersions?limit=5&fields[appStoreVersions]=versionString,appStoreState,createdDate,releaseType`,
  );
  console.log('App Store version records (newest first):');
  for (const version of versions.data || []) {
    const a = version.attributes || {};
    console.log(`  ${a.versionString}  state=${a.appStoreState}  release=${a.releaseType}  created=${(a.createdDate || '').slice(0, 10)}`);
  }
  if (!(versions.data || []).length) console.log('  (none)');

  const builds = await ascGet(
    token,
    `/v1/builds?filter[app]=${APP_ID}&limit=8&sort=-uploadedDate&fields[builds]=version,processingState,uploadedDate,expired`,
  );
  console.log('\nUploaded builds (newest first):');
  for (const build of builds.data || []) {
    const a = build.attributes || {};
    console.log(`  build ${a.version}  processing=${a.processingState}  expired=${a.expired}  uploaded=${(a.uploadedDate || '').slice(0, 16)}`);
  }
  if (!(builds.data || []).length) console.log('  (none)');
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
