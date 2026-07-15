#!/usr/bin/env node
/**
 * Attach a VALID ASC build (by CFBundleVersion, default 15) to version 1.1 and submit for review.
 * Usage: node scripts/attach-and-submit-asc-1.1.js [--build 15] [--dry-run]
 */
const path = require('path');
const { loadEnv, ascGet, ascPost } = require('./asc-api');

const ROOT = path.join(__dirname, '..');
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const buildArg = args.find((a) => a.startsWith('--build='));
const targetBuildNumber = buildArg ? buildArg.split('=')[1] : (args[args.indexOf('--build') + 1] || '15');

async function rawPatch(apiPath, body) {
  const crypto = require('crypto');
  const fs = require('fs');
  const header = Buffer.from(JSON.stringify({ alg: 'ES256', kid: process.env.EXPO_ASC_API_KEY_ID, typ: 'JWT' })).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({ iss: process.env.EXPO_ASC_API_KEY_ISSUER_ID, iat: now, exp: now + 1200, aud: 'appstoreconnect-v1' })).toString('base64url');
  const data = `${header}.${payload}`;
  const sign = crypto.createSign('SHA256');
  sign.update(data);
  sign.end();
  const key = crypto.createPrivateKey(fs.readFileSync(process.env.EXPO_ASC_API_KEY_PATH, 'utf8'));
  const token = `${data}.${sign.sign({ key, dsaEncoding: 'ieee-p1363' }, 'base64url')}`;
  const res = await fetch(`https://api.appstoreconnect.apple.com${apiPath}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let parsed;
  try { parsed = JSON.parse(text); } catch { parsed = { raw: text }; }
  if (!res.ok) throw new Error(`PATCH ${res.status} ${apiPath}: ${text.slice(0, 600)}`);
  return parsed;
}

async function main() {
  loadEnv(ROOT);
  const appId = process.env.EXPO_ASC_APP_ID;
  const versions = await ascGet(`/v1/apps/${appId}/appStoreVersions?filter[platform]=IOS&limit=10`);
  const v11 = (versions.data || []).find((v) => v.attributes.versionString === '1.1');
  if (!v11) throw new Error('ASC version 1.1 not found');
  console.log('1.1 state', v11.attributes.appStoreState, v11.id);

  const builds = await ascGet(`/v1/builds?filter[app]=${appId}&limit=20&sort=-uploadedDate`);
  const build = (builds.data || []).find(
    (b) => String(b.attributes.version) === String(targetBuildNumber) && b.attributes.processingState === 'VALID',
  );
  if (!build) {
    console.log('Available builds:', (builds.data || []).map((b) => `${b.attributes.version}/${b.attributes.processingState}`).join(', '));
    throw new Error(`No VALID build ${targetBuildNumber}`);
  }
  console.log('Attaching build', build.attributes.version, build.id);

  if (dryRun) {
    console.log(JSON.stringify({ dryRun: true, versionId: v11.id, buildId: build.id }, null, 2));
    return;
  }

  await rawPatch(`/v1/appStoreVersions/${v11.id}/relationships/build`, {
    data: { type: 'builds', id: build.id },
  });
  console.log('build attached');

  // encryption declaration if needed
  try {
    await rawPatch(`/v1/builds/${build.id}`, {
      data: {
        type: 'builds',
        id: build.id,
        attributes: { usesNonExemptEncryption: false },
      },
    });
    console.log('encryption declared false');
  } catch (e) {
    console.warn('encryption patch skipped:', e.message.slice(0, 200));
  }

  process.env.ASC_APP_VERSION = '1.1';
  require('child_process').execSync('node scripts/submit-asc-for-review.js', {
    cwd: ROOT,
    stdio: 'inherit',
    env: process.env,
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
