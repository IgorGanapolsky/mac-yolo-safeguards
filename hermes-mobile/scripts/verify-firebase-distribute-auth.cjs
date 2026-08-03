#!/usr/bin/env node
/**
 * Fail fast when the configured service account cannot use Firebase App Distribution.
 * Common case: GOOGLE_SERVICE_ACCOUNT_JSON is a Play-upload SA without
 * roles/firebaseappdistro.admin -> 403 on distribute (no invite email sent).
 */
const { loadFirebaseProject } = require('./load-firebase-project.cjs');
const firebaseProject = loadFirebaseProject();
const crypto = require('crypto');
const https = require('https');

const SA_JSON = process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '';
const APP_ID = process.env.FIREBASE_ANDROID_APP_ID || '';

// js/clear-text-logging (CWE-312/359/532): anything derived from
// FIREBASE_SERVICE_ACCOUNT_JSON (process.env) is taint. Never pass SA-derived
// strings into console.log/error — not even "masked" forms (still a flow).
// Static detail codes (literals only) are safe and must appear so operators
// can distinguish invalid_sa_json / oauth_token_exchange_failed / etc.
function fail(detailCode) {
  const code = typeof detailCode === 'string' && detailCode ? detailCode : 'unknown';
  console.error(
    `Firebase distribute auth: FAIL [${code}] — check CI secret FIREBASE_SERVICE_ACCOUNT_JSON ` +
      'and roles/firebaseappdistro.admin (identity not logged; code is static, not SA-derived).',
  );
  process.exit(1);
}

if (!SA_JSON) {
  fail('missing_sa_json');
}
if (!APP_ID) {
  fail('missing_app_id');
}

let parsed;
try {
  parsed = JSON.parse(SA_JSON);
} catch {
  fail('invalid_sa_json');
}

const clientEmail = parsed.client_email || '';
const privateKey = parsed.private_key || '';
if (!clientEmail) {
  fail('missing_client_email');
}
if (!privateKey) {
  fail('missing_private_key');
}

// No SA-derived fields in logs (CodeQL js/clear-text-logging).
console.log('Firebase distribute auth: checking configured service account for App Distribution');

const projectNumber = firebaseProject.projectNumber;

function base64Url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function requestJson(url, options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, options, (res) => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        let parsedBody = null;
        if (data.trim()) {
          try {
            parsedBody = JSON.parse(data);
          } catch {
            parsedBody = { raw: data };
          }
        }
        resolve({ statusCode: res.statusCode || 0, body: parsedBody, raw: data });
      });
    });
    req.setTimeout(120_000, () => {
      req.destroy(new Error('request timed out'));
    });
    req.on('error', reject);
    if (body) {
      req.write(body);
    }
    req.end();
  });
}

async function getAccessToken() {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: clientEmail,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
  };
  const unsigned = `${base64Url(JSON.stringify(header))}.${base64Url(JSON.stringify(claim))}`;
  const signature = crypto
    .createSign('RSA-SHA256')
    .update(unsigned)
    .sign(privateKey, 'base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
  const assertion = `${unsigned}.${signature}`;
  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion,
  }).toString();
  const response = await requestJson(
    'https://oauth2.googleapis.com/token',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
      },
    },
    body,
  );
  if (response.statusCode !== 200 || !response.body?.access_token) {
    fail('oauth_token_exchange_failed');
  }
  return response.body.access_token;
}

async function verifyAppDistributionAccess() {
  const token = await getAccessToken();
  const response = await requestJson(
    `https://firebaseappdistribution.googleapis.com/v1/projects/${encodeURIComponent(projectNumber)}/groups?pageSize=1`,
    {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
    },
  );

  if (response.statusCode === 200) {
    console.log('Firebase distribute auth: PASS (service account can access App Distribution API)');
    return;
  }

  const detail = response.raw || JSON.stringify(response.body || {});
  if (response.statusCode === 401) {
    fail('app_distribution_401');
  }
  if (/403|permission|PERMISSION_DENIED/i.test(detail) || response.statusCode === 403) {
    // Static remediation only — no SA email/project id in logs.
    console.error(
      'Firebase distribute auth: missing App Distribution permission.\n' +
        '  Fix: Firebase Console -> Project settings -> Service accounts -> key with\n' +
        '  roles/firebaseappdistro.admin, then set GitHub secret FIREBASE_SERVICE_ACCOUNT_JSON.',
    );
    process.exit(1);
  }
  fail('app_distribution_groups_list_failed');
}

verifyAppDistributionAccess().catch(() => {
  fail('unexpected_error');
});
