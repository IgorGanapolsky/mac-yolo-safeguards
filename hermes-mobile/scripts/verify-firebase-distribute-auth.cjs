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

function fail(message) {
  console.error(`Firebase distribute auth: FAIL\n- ${message}`);
  process.exit(1);
}

if (!SA_JSON) {
  fail('FIREBASE_SERVICE_ACCOUNT_JSON is not set (see scripts/sync-firebase-secrets.sh)');
}
if (!APP_ID) {
  fail('FIREBASE_ANDROID_APP_ID is not set');
}

let parsed;
try {
  parsed = JSON.parse(SA_JSON);
} catch {
  fail('Service account JSON is not valid JSON');
}

const clientEmail = parsed.client_email || '';
const projectId = parsed.project_id || '';
const privateKey = parsed.private_key || '';
if (!clientEmail) {
  fail('Service account JSON missing client_email');
}
if (!privateKey) {
  fail('Service account JSON missing private_key');
}

function maskIdentifier(value) {
  const atIndex = value.indexOf('@');
  if (atIndex <= 1) return '***';
  return `${value.slice(0, 2)}***${value.slice(atIndex)}`;
}

console.log(`Firebase distribute auth: checking ${maskIdentifier(clientEmail)} (project_id=${projectId || 'unknown'})`);

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
    fail(`OAuth token exchange failed (${response.statusCode}): ${response.raw.slice(0, 600)}`);
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
    fail(`Service account OAuth succeeded, but App Distribution rejected the token (HTTP 401): ${detail.slice(0, 600)}`);
  }
  if (/403|permission|PERMISSION_DENIED/i.test(detail) || response.statusCode === 403) {
    fail(
      `Service account ${clientEmail} lacks Firebase App Distribution permission (HTTP ${response.statusCode}).\n` +
        '  Fix: Firebase Console -> Hermes Mobile -> Project settings -> Service accounts -> generate key,\n' +
        `  OR grant roles/firebaseappdistro.admin on Hermes Mobile Firebase (${firebaseProject.projectNumber}),\n` +
        '  then set GitHub secret FIREBASE_SERVICE_ACCOUNT_JSON.',
    );
  }
  fail(`App Distribution groups.list failed (${response.statusCode}): ${detail.slice(0, 600)}`);
}

verifyAppDistributionAccess().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
