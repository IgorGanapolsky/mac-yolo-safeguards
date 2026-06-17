#!/usr/bin/env node
/**
 * Fail fast when the configured service account cannot use Firebase App Distribution.
 * Common case: GOOGLE_SERVICE_ACCOUNT_JSON is a Play-upload SA without
 * roles/firebaseappdistro.admin -> 403 on distribute (no invite email sent).
 */
const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

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
if (!clientEmail) {
  fail('Service account JSON missing client_email');
}

console.log(`Firebase distribute auth: checking ${clientEmail} (project_id=${projectId || 'unknown'})`);

const saPath = path.join(os.tmpdir(), `firebase-sa-auth-${process.pid}.json`);
fs.writeFileSync(saPath, SA_JSON, { mode: 0o600 });

try {
  execSync(`npx --yes firebase-tools@14.4.0 appdistribution:testers:list --app "${APP_ID}"`, {
    encoding: 'utf8',
    env: { ...process.env, GOOGLE_APPLICATION_CREDENTIALS: saPath },
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 120_000,
  });
  console.log('Firebase distribute auth: PASS (service account can access App Distribution API)');
} catch (error) {
  const detail = `${error.stdout || ''}\n${error.stderr || ''}\n${error.message || ''}`;
  if (/403|permission|PERMISSION_DENIED/i.test(detail)) {
    fail(
      `Service account ${clientEmail} lacks Firebase App Distribution permission (HTTP 403).\n` +
        '  Fix: Firebase Console -> Project settings -> Service accounts -> generate key,\n' +
        '  OR grant roles/firebaseappdistro.admin on GCP project openclaw-console-mobile-8d53d (587028054730),\n' +
        '  then set GitHub secret FIREBASE_SERVICE_ACCOUNT_JSON on openclaw-console-mobile-8d53d.',
    );
  }
  fail(`appdistribution:testers:list failed: ${detail.slice(0, 600)}`);
} finally {
  try {
    fs.unlinkSync(saPath);
  } catch {
    /* ignore */
  }
}
