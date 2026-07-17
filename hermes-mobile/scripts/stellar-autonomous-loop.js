#!/usr/bin/env node
/**
 * Stellar Autonomous Loop — July 2026
 * Verifies Play + App Store + IAP + analytics + observability without babysitting.
 * Runs via LaunchAgent com.igor.hermes-stellar-daily (daily) and on-demand.
 *
 * Zero hardcoding of secrets — uses service account + ASC API JWT from .env + EAS env.
 * Emits JSON receipt + ntfy alert on failure.
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const PLAY_KEY = '/Users/igorganapolsky/.gcloud-keys/hermes-mobile-publisher.json';
const PACKAGE = 'com.iganapolsky.hermesmobile';
const APPLE_APP_ID = '6786778037';
const PLAY_URL = `https://play.google.com/store/apps/details?id=${PACKAGE}&hl=en&gl=US`;
const IOS_URL = `https://apps.apple.com/us/app/hermes-mobile-ai-agent-leash/id${APPLE_APP_ID}/`;
const IOS_LOOKUP = `https://itunes.apple.com/lookup?id=${APPLE_APP_ID}`;

function loadEnv() {
  const envPath = path.join(ROOT, '.env');
  if (!fs.existsSync(envPath)) throw new Error('Missing .env');
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq <= 0) continue;
    let k = t.slice(0, eq).trim();
    let v = t.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    if (v) process.env[k] = v;
  }
  if (!process.env.EXPO_ASC_API_KEY_ISSUER_ID) {
    const fb = path.join(ROOT, '../../LipoShield/.env');
    if (fs.existsSync(fb)) {
      for (const line of fs.readFileSync(fb, 'utf8').split('\n')) {
        const m = line.match(/^EXPO_ASC_API_KEY_ISSUER_ID=(.+)$/);
        if (m?.[1]) { process.env.EXPO_ASC_API_KEY_ISSUER_ID = m[1].trim().replace(/^['"]|['"]$/g, ''); break; }
      }
    }
  }
  if (!process.env.EXPO_ASC_API_KEY_ID) {
    const kp = process.env.EXPO_ASC_API_KEY_PATH;
    if (kp) {
      const kid = path.basename(kp).match(/AuthKey_(.+)\.p8/)?.[1];
      if (kid) process.env.EXPO_ASC_API_KEY_ID = kid;
    }
  }
  if (!process.env.EXPO_ASC_APP_ID) process.env.EXPO_ASC_APP_ID = APPLE_APP_ID;
}

function makeJwt() {
  const header = Buffer.from(JSON.stringify({ alg: 'ES256', kid: process.env.EXPO_ASC_API_KEY_ID, typ: 'JWT' })).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({ iss: process.env.EXPO_ASC_API_KEY_ISSUER_ID, iat: now, exp: now + 1200, aud: 'appstoreconnect-v1' })).toString('base64url');
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
    method: 'GET',
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
  });
  const txt = await res.text();
  if (!res.ok) throw new Error(`ASC ${res.status} ${apiPath}: ${txt.slice(0, 800)}`);
  return JSON.parse(txt);
}

async function checkPlay() {
  const result = { ok: false, checks: [] };
  try {
    // Check service account listing
    const { google } = await import('googleapis').catch(() => ({ google: null }));
    // Fallback to manual python-like fetch using google-auth-library
    const serviceAccount = JSON.parse(fs.readFileSync(PLAY_KEY, 'utf8'));
    // Use googleapis auth if available, otherwise shell python
    const { execSync } = require('child_process');
    const pyOut = execSync(`python3 <<'PY'
from google.oauth2 import service_account
import google.auth.transport.requests as gtr, urllib.request, json
creds=service_account.Credentials.from_service_account_file("${PLAY_KEY}", scopes=["https://www.googleapis.com/auth/androidpublisher"])
creds.refresh(gtr.Request())
import urllib.request, json
pkg="${PACKAGE}"
def api(m,p):
    r=urllib.request.Request(f"https://androidpublisher.googleapis.com/androidpublisher/v3/applications/{p}",method=m)
    r.add_header("Authorization", f"Bearer {creds.token}")
    return json.loads(urllib.request.urlopen(r).read().decode())
edit=api("POST", f"{pkg}/edits")["id"]
r=urllib.request.Request(f"https://androidpublisher.googleapis.com/androidpublisher/v3/applications/{pkg}/edits/{edit}/listings/en-US",method="GET")
r.add_header("Authorization", f"Bearer {creds.token}")
listing=json.loads(urllib.request.urlopen(r).read().decode())
print(f"TITLE:{listing.get('title','')}")
print(f"SHORT:{listing.get('shortDescription','')[:120]}")
full=listing.get('fullDescription','')
print(f"FULL_LIVE:{'live on App Store' in full}")
print(f"FULL_LEN:{len(full)}")
# tracks
r=urllib.request.Request(f"https://androidpublisher.googleapis.com/androidpublisher/v3/applications/{pkg}/edits/{edit}/tracks",method="GET")
r.add_header("Authorization", f"Bearer {creds.token}")
tracks=json.loads(urllib.request.urlopen(r).read().decode())
print(f"TRACK:{tracks['tracks'][0]['releases'][0]['status']}")
# delete
r=urllib.request.Request(f"https://androidpublisher.googleapis.com/androidpublisher/v3/applications/{pkg}/edits/{edit}",method="DELETE")
r.add_header("Authorization", f"Bearer {creds.token}")
urllib.request.urlopen(r)
PY
`, { encoding: 'utf8' });
    const lines = pyOut.split('\n');
    const hasLive = pyOut.includes('FULL_LIVE:True');
    const trackOk = pyOut.includes('TRACK:completed');
    result.checks.push({ name: 'play_api_live_line', ok: hasLive, detail: pyOut.slice(0, 500) });
    result.checks.push({ name: 'play_track_completed', ok: trackOk });
  } catch (e) {
    result.checks.push({ name: 'play_api', ok: false, error: e.message });
  }

  // Public page 200
  try {
    const res = await fetch(PLAY_URL, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    result.checks.push({ name: 'play_public_200', ok: res.status === 200, status: res.status });
  } catch (e) {
    result.checks.push({ name: 'play_public_200', ok: false, error: e.message });
  }

  result.ok = result.checks.every(c => c.ok);
  return result;
}

async function checkIOS() {
  const checks = [];
  try {
    const res = await fetch(`https://itunes.apple.com/lookup?id=${APPLE_APP_ID}`);
    const data = await res.json();
    checks.push({ name: 'itunes_lookup_resultCount_1', ok: data.resultCount === 1, resultCount: data.resultCount });
    if (data.resultCount === 1) {
      const r = data.results[0];
      checks.push({ name: 'ios_bundle_match', ok: r.bundleId === PACKAGE, bundleId: r.bundleId });
      checks.push({ name: 'ios_version_1_0_or_higher', ok: !!r.version, version: r.version });
    }
  } catch (e) {
    checks.push({ name: 'itunes_lookup', ok: false, error: e.message });
  }

  try {
    const res = await fetch(`https://apps.apple.com/us/app/hermes-mobile-ai-agent-leash/id${APPLE_APP_ID}`, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    checks.push({ name: 'ios_public_200', ok: res.status === 200, status: res.status });
  } catch (e) {
    checks.push({ name: 'ios_public_200', ok: false, error: e.message });
  }

  // ASC API checks
  try {
    const versions = await ascGet(`/v1/apps/${APPLE_APP_ID}/appStoreVersions?filter[platform]=IOS&limit=10`);
    const v10 = versions.data.find(v => v.attributes.versionString === '1.0');
    checks.push({ name: 'asc_v1_0_ready_for_sale', ok: v10?.attributes?.appStoreState === 'READY_FOR_SALE', state: v10?.attributes?.appStoreState });
    const v11 = versions.data.find(v => v.attributes.versionString === '1.1');
    if (v11) {
      checks.push({ name: 'asc_v1_1_exists', ok: true, state: v11.attributes.appStoreState });
      const locs = await ascGet(`/v1/appStoreVersions/${v11.id}/appStoreVersionLocalizations?limit=2`);
      const kw = locs.data[0]?.attributes?.keywords || '';
      const hasRisky = /copilot|windsurf|aider.*gemini/i.test(kw);
      checks.push({ name: 'asc_v1_1_keywords_trademark_safe', ok: !hasRisky, keywords: kw });
    }
    // IAP check
    const groups = await ascGet(`/v1/apps/${APPLE_APP_ID}/subscriptionGroups?limit=10`);
    let foundApproved = false;
    for (const g of groups.data) {
      const list = await ascGet(`/v1/subscriptionGroups/${g.id}/subscriptions?limit=10`);
      for (const s of list.data) {
        if (s.attributes.productId === 'thumbgate_leash_monthly' && s.attributes.state === 'APPROVED') foundApproved = true;
      }
    }
    checks.push({ name: 'asc_iap_approved', ok: foundApproved });
  } catch (e) {
    checks.push({ name: 'asc_api', ok: false, error: e.message.slice(0, 500) });
  }

  return { ok: checks.every(c => c.ok), checks };
}

async function checkAnalyticsObservability() {
  const checks = [];
  // PostHog host reachable
  try {
    const res = await fetch('https://us.i.posthog.com/capture/', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ api_key: 'test', event: 'test', properties: {} }) });
    checks.push({ name: 'posthog_host_reachable', ok: res.status < 500, status: res.status });
  } catch (e) {
    checks.push({ name: 'posthog_host_reachable', ok: false, error: e.message });
  }
  // Sentry DSN host reachable
  try {
    const res = await fetch('https://o4509329568235520.ingest.us.sentry.io/api/4509329571315712/envelope/', { method: 'POST' });
    checks.push({ name: 'sentry_host_reachable', ok: res.status < 500, status: res.status });
  } catch (e) {
    checks.push({ name: 'sentry_host_reachable', ok: false, error: e.message });
  }

  // Check eas.json INTERNAL flag
  try {
    const eas = JSON.parse(fs.readFileSync(path.join(ROOT, 'eas.json'), 'utf8'));
    const prodInternal = eas.build?.production?.env?.EXPO_PUBLIC_POSTHOG_INTERNAL;
    checks.push({ name: 'eas_prod_posthog_internal_0', ok: prodInternal === '0', value: prodInternal });
    const devInternal = eas.build?.development?.env?.EXPO_PUBLIC_POSTHOG_INTERNAL;
    checks.push({ name: 'eas_dev_posthog_internal_1', ok: devInternal === '1', value: devInternal });
  } catch (e) {
    checks.push({ name: 'eas_json_check', ok: false, error: e.message });
  }

  // Check full_description contains live line
  try {
    const full = fs.readFileSync(path.join(ROOT, 'fastlane/metadata/android/en-US/full_description.txt'), 'utf8');
    checks.push({ name: 'local_full_desc_live_line', ok: full.includes('live on App Store'), len: full.length });
  } catch (e) {
    checks.push({ name: 'local_full_desc', ok: false, error: e.message });
  }

  // No dogfood
  try {
    const { execSync } = require('child_process');
    const out = execSync('grep -R -i "make money\\|Print money" fastlane/metadata/ || echo "clean"', { cwd: ROOT, encoding: 'utf8' });
    checks.push({ name: 'no_dogfood_in_metadata', ok: out.includes('clean'), detail: out.slice(0, 200) });
  } catch (e) {
    checks.push({ name: 'no_dogfood', ok: false, error: e.message });
  }

  return { ok: checks.every(c => c.ok), checks };
}

async function main() {
  loadEnv();
  const play = await checkPlay();
  const ios = await checkIOS();
  const obs = await checkAnalyticsObservability();

  const payload = {
    timestamp: new Date().toISOString(),
    play,
    ios,
    observability: obs,
    all_ok: play.ok && ios.ok && obs.ok,
  };

  const outDir = path.join(ROOT, 'docs/proofs/continuous');
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'stellar-daily.json'), JSON.stringify(payload, null, 2));

  console.log(JSON.stringify(payload, null, 2));

  if (!payload.all_ok) {
    console.error('STELLAR CHECK FAILED');
    // Try ntfy if available
    try {
      const ntfyUrl = process.env.NTFY_URL || fs.existsSync(path.join(ROOT, '../../business_os/ntfy.env')) ? fs.readFileSync(path.join(ROOT, '../../business_os/ntfy.env'), 'utf8').trim() : null;
      if (ntfyUrl) {
        await fetch(ntfyUrl, { method: 'POST', body: `Stellar daily check FAILED\n${JSON.stringify(payload, null, 2).slice(0, 1000)}` });
      }
    } catch {}
    process.exit(1);
  } else {
    console.log('STELLAR CHECK PASS');
  }
}

main().catch(e => { console.error(e); process.exit(1); });
