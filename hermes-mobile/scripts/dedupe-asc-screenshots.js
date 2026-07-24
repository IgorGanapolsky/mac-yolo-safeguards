#!/usr/bin/env node
/**
 * Post-deliver ASC screenshot dedupe.
 *
 * fastlane deliver can retry failed uploads and leave identical checksum twins
 * in APP_IPHONE_67 (seen 2026-07-13). This keeps one asset per checksum.
 *
 * Refuses to mutate while WAITING_FOR_REVIEW / IN_REVIEW.
 */
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { loadEnv, ascGet } = require('./asc-api');

const ROOT = path.join(__dirname, '..');

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
  const privateKey = crypto.createPrivateKey(fs.readFileSync(process.env.EXPO_ASC_API_KEY_PATH, 'utf8'));
  const sig = sign.sign({ key: privateKey, dsaEncoding: 'ieee-p1363' }, 'base64url');
  return `${data}.${sig}`;
}

async function ascDelete(apiPath) {
  const res = await fetch(`https://api.appstoreconnect.apple.com${apiPath}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${makeJwt()}`, Accept: 'application/json' },
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`ASC DELETE ${res.status} ${apiPath}: ${text.slice(0, 400)}`);
  return res.status;
}

async function main() {
  loadEnv(ROOT);
  const appId = process.env.EXPO_ASC_APP_ID;
  const versionString = process.env.ASC_APP_VERSION || '1.0';
  const dryRun = ['1', 'true', 'yes'].includes((process.env.ASC_DEDUPE_DRY_RUN || '').toLowerCase());

  const versions = await ascGet(`/v1/apps/${appId}/appStoreVersions?filter[platform]=IOS&limit=10`);
  const version = (versions.data || []).find((v) => v.attributes?.versionString === versionString);
  if (!version) throw new Error(`Version ${versionString} not found`);

  const state = version.attributes?.appStoreState;
  if (state === 'WAITING_FOR_REVIEW' || state === 'IN_REVIEW') {
    console.log(JSON.stringify({ ok: false, skipped: true, reason: 'in_review_lock', state }, null, 2));
    process.exit(0);
  }

  const locs = await ascGet(`/v1/appStoreVersions/${version.id}/appStoreVersionLocalizations?limit=5`);
  const report = [];
  for (const loc of locs.data || []) {
    const sets = await ascGet(`/v1/appStoreVersionLocalizations/${loc.id}/appScreenshotSets?limit=20`);
    for (const set of sets.data || []) {
      const shots = await ascGet(`/v1/appScreenshotSets/${set.id}/appScreenshots?limit=50`);
      const byChecksum = new Map();
      for (const s of shots.data || []) {
        const c = s.attributes?.sourceFileChecksum || s.id;
        if (!byChecksum.has(c)) byChecksum.set(c, []);
        byChecksum.get(c).push(s);
      }
      let deleted = 0;
      for (const [, list] of byChecksum) {
        if (list.length <= 1) continue;
        for (const extra of list.slice(1)) {
          if (!dryRun) await ascDelete(`/v1/appScreenshots/${extra.id}`);
          deleted += 1;
        }
      }
      report.push({
        locale: loc.attributes?.locale,
        displayType: set.attributes?.screenshotDisplayType,
        before: (shots.data || []).length,
        uniqueChecksums: byChecksum.size,
        deleted,
      });
    }
  }

  console.log(JSON.stringify({ ok: true, dryRun, state, report }, null, 2));
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
