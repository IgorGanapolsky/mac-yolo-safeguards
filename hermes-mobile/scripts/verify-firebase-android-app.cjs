#!/usr/bin/env node
/**
 * Verify FIREBASE_ANDROID_APP_ID matches the legacy upgrade package
 * com.iganapolsky.agentleash (in-place updates for existing testers).
 */
const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const EXPECTED_PACKAGE =
  process.env.HERMES_MOBILE_ANDROID_PACKAGE || 'com.iganapolsky.agentleash';
const APP_ID = process.env.FIREBASE_ANDROID_APP_ID || '';
const SA_JSON =
  process.env.FIREBASE_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '';

function fail(message) {
  console.error(`Firebase Android app verification: FAIL\n- ${message}`);
  process.exit(1);
}

if (!APP_ID) {
  fail('FIREBASE_ANDROID_APP_ID is not set');
}
if (!SA_JSON) {
  fail('FIREBASE_SERVICE_ACCOUNT_JSON (or GOOGLE_SERVICE_ACCOUNT_JSON) is not set');
}
if (!/^1:[0-9]+:android:[a-fA-F0-9]+$/.test(APP_ID)) {
  fail(`FIREBASE_ANDROID_APP_ID format invalid: ${APP_ID}`);
}

const saPath = path.join(os.tmpdir(), `firebase-sa-${process.pid}.json`);
fs.writeFileSync(saPath, SA_JSON, { mode: 0o600 });

const projectNumber = APP_ID.split(':')[1];
if (!projectNumber) {
  fail(`Could not parse project number from FIREBASE_ANDROID_APP_ID: ${APP_ID}`);
}

let apps;
try {
  const stdout = execSync(
    `npx --yes firebase-tools@14.4.0 apps:list --project ${projectNumber} --json`,
    {
      encoding: 'utf8',
      env: { ...process.env, GOOGLE_APPLICATION_CREDENTIALS: saPath },
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 180_000,
    },
  );
  const jsonText = stdout.includes('[') ? stdout.slice(stdout.indexOf('[')) : stdout;
  apps = JSON.parse(jsonText);
} catch (error) {
  const detail = error.stdout?.toString?.() || error.stderr?.toString?.() || error.message;
  fail(`firebase apps:list failed: ${detail.slice(0, 500)}`);
} finally {
  try {
    fs.unlinkSync(saPath);
  } catch {
    /* ignore */
  }
}

const list = Array.isArray(apps) ? apps : apps.result || apps.apps || [];
const match = list.find((app) => app.appId === APP_ID || app.appID === APP_ID);

if (!match) {
  fail(
    `FIREBASE_ANDROID_APP_ID ${APP_ID} not found. Use the Firebase Android app for ${EXPECTED_PACKAGE}.`,
  );
}

const packageName = match.packageName || match.androidPackageName || match.namespace;
if (!packageName) {
  fail(`Firebase app ${APP_ID} has no packageName in apps:list response`);
}

if (packageName !== EXPECTED_PACKAGE) {
  fail(
    `Firebase app ${APP_ID} is "${packageName}", expected "${EXPECTED_PACKAGE}" for in-place upgrade.`,
  );
}

console.log(`Firebase Android app verification: PASS (${packageName})`);
