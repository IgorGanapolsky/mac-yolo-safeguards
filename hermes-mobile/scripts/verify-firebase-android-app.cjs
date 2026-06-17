#!/usr/bin/env node
/**
 * Verify FIREBASE_ANDROID_APP_ID is registered for com.iganapolsky.hermesmobile
 * via Firebase Management API (prevents distributing AgentLeash builds by mistake).
 */
const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const EXPECTED_PACKAGE = process.env.HERMES_MOBILE_ANDROID_PACKAGE || 'com.iganapolsky.hermesmobile';
const APP_ID = process.env.FIREBASE_ANDROID_APP_ID || '';
const SA_JSON = process.env.FIREBASE_SERVICE_ACCOUNT_JSON || '';

function fail(message) {
  console.error(`Firebase Android app verification: FAIL\n- ${message}`);
  process.exit(1);
}

if (!APP_ID) {
  fail('FIREBASE_ANDROID_APP_ID is not set');
}
if (!SA_JSON) {
  fail('FIREBASE_SERVICE_ACCOUNT_JSON is not set');
}
if (!/^1:[0-9]+:android:[a-fA-F0-9]+$/.test(APP_ID)) {
  fail(`FIREBASE_ANDROID_APP_ID format invalid: ${APP_ID}`);
}

const saPath = path.join(os.tmpdir(), `firebase-sa-${process.pid}.json`);
fs.writeFileSync(saPath, SA_JSON, { mode: 0o600 });

let apps;
try {
  const raw = execSync('npx --yes firebase-tools@14.4.0 apps:list --json', {
    encoding: 'utf8',
    env: { ...process.env, GOOGLE_APPLICATION_CREDENTIALS: saPath },
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 120_000,
  });
  apps = JSON.parse(raw);
} catch (error) {
  const stderr = error.stderr?.toString?.() || error.message;
  fail(`firebase apps:list failed: ${stderr}`);
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
    `FIREBASE_ANDROID_APP_ID ${APP_ID} not found in Firebase project. Register Android app ${EXPECTED_PACKAGE} in Firebase Console.`,
  );
}

const packageName = match.packageName || match.androidPackageName || match.namespace;
if (!packageName) {
  fail(`Firebase app ${APP_ID} has no packageName in apps:list response`);
}

if (packageName !== EXPECTED_PACKAGE) {
  fail(
    `Firebase app ${APP_ID} is package "${packageName}", expected "${EXPECTED_PACKAGE}". Update FIREBASE_ANDROID_APP_ID to the Hermes Mobile Firebase app.`,
  );
}

console.log(`Firebase Android app verification: PASS (${packageName})`);
