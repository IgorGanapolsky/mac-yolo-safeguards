#!/usr/bin/env node
'use strict';

/**
 * Ona last-mile placement — local-first for our Mac + phone fleet.
 *
 * Source (public):
 *   https://ona.com/stories/ona-joins-openai
 *   Johannes close email 2026-08-14 (newsletter@ona.com → iganapolsky@gmail.com)
 *
 * Transferable ideas we actually run:
 *   1. Work persists across devices (Mac + Hermes Mobile), not a laptop-only session.
 *   2. Customer-controlled context/credentials stay on this Mac (Keychain), not a cloud CDE.
 *   3. Work is reviewable: receipts store a prompt hash + placement, never the prompt.
 *
 * What this is NOT:
 *   - Not Ona Cloud / Gitpod workspaces
 *   - Not an 80% cloud claim (we do not have their VPC)
 *   - Not a new ThumbGate governance product
 */

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const MONTHLY_CAP_USD = 10;
const SOURCE = 'https://ona.com/stories/ona-joins-openai';

const LOCAL_RE = /\b(secret|credential|password|passcode|api[ -]?key|private key|keychain|pii|medical|payroll|ssn|adb|hermes mobile|launchd|launchctl|usb|local only|confidential)\b/i;
const DEVICE_RE = /\b(phone|android|ios|ipad|usb|adb|pair|keychain|launchd|osascript|chrome profile)\b/i;
const CLOUD_ASK_RE = /\b(ona cloud|cloud agent|codex cloud|gitpod|background agent in the cloud)\b/i;

const HARNESS = Object.freeze({
  'hermes-yolo': 'subscription-supergrok',
  'jcode-yolo': 'zai/glm-5.3',
  'hermes-mobile': 'local-mac-gateway',
  grok: 'grok-4.5',
  default: 'local-mac',
});

function monthKey(now = new Date()) {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

function ledgerPath(home = os.homedir()) {
  return path.join(home, '.hermes', 'ona-last-mile-spend.json');
}

function receiptPath(home = os.homedir()) {
  return path.join(home, '.hermes', 'ona-last-mile-receipts.jsonl');
}

function loadBudget(home = os.homedir(), now = new Date()) {
  try {
    const parsed = JSON.parse(fs.readFileSync(ledgerPath(home), 'utf8'));
    if (parsed && parsed.month === monthKey(now)) {
      const spent = Number(parsed.spentUsd) || 0;
      return { month: parsed.month, monthlyCapUsd: MONTHLY_CAP_USD, spentUsd: spent, remainingUsd: Math.max(0, MONTHLY_CAP_USD - spent) };
    }
  } catch { /* fresh */ }
  return { month: monthKey(now), monthlyCapUsd: MONTHLY_CAP_USD, spentUsd: 0, remainingUsd: MONTHLY_CAP_USD };
}

function promptFingerprint(prompt) {
  return crypto.createHash('sha256').update(String(prompt || ''), 'utf8').digest('hex');
}

function classify(prompt = '', options = {}) {
  const text = String(prompt);
  const budget = options.budget || loadBudget(options.home, options.now);
  if (LOCAL_RE.test(text) || DEVICE_RE.test(text)) {
    return {
      place: 'local',
      reason: 'last-mile-device-or-secret',
      harness: HARNESS.default,
      cloudEligible: false,
      budget,
    };
  }
  if (CLOUD_ASK_RE.test(text) && budget.remainingUsd > 0) {
    return {
      place: 'cloud-opt-in',
      reason: 'explicit-cloud-ask-with-budget',
      harness: 'ona-or-codex-cloud',
      cloudEligible: true,
      budget,
    };
  }
  if (CLOUD_ASK_RE.test(text) && budget.remainingUsd <= 0) {
    return {
      place: 'local',
      reason: 'cloud-ask-budget-fallback-local',
      harness: HARNESS.default,
      cloudEligible: false,
      budget,
    };
  }
  return {
    place: 'local',
    reason: 'default-local-first',
    harness: HARNESS.default,
    cloudEligible: false,
    budget,
  };
}

function writeReceipt(decision, prompt, home = os.homedir()) {
  const line = JSON.stringify({
    at: new Date().toISOString(),
    fingerprint: promptFingerprint(prompt),
    place: decision.place,
    reason: decision.reason,
    cloudEligible: decision.cloudEligible,
  });
  fs.mkdirSync(path.dirname(receiptPath(home)), { recursive: true, mode: 0o700 });
  fs.appendFileSync(receiptPath(home), `${line}\n`, { mode: 0o600 });
  return line;
}

function runDoctor(options = {}) {
  const home = options.home || os.homedir();
  const budget = loadBudget(home, options.now);
  return {
    schema: 'ona-last-mile/v1',
    source: SOURCE,
    weAreOna: false,
    claimEightyPercentCloud: false,
    lastMile: ['local-mac', 'hermes-mobile-phone'],
    persistAcrossDevices: 'hermes-mobile + local receipts (hash only)',
    customerControlled: 'macOS Keychain + local files; no cloud CDE',
    reviewable: true,
    storesPromptText: false,
    harnessDefaults: HARNESS,
    budget,
    status: 'LOCAL_FIRST',
  };
}

function main() {
  const args = process.argv.slice(2);
  const json = args.includes('--json');
  const cmd = args.find((a) => !a.startsWith('--')) || 'doctor';
  if (cmd === 'route') {
    const prompt = args.filter((a) => a !== 'route' && a !== '--json').join(' ');
    const decision = classify(prompt);
    if (!args.includes('--no-receipt')) writeReceipt(decision, prompt);
    console.log(JSON.stringify(decision, null, 2));
    return;
  }
  const doc = runDoctor();
  if (json) {
    console.log(JSON.stringify(doc, null, 2));
    return;
  }
  console.log(`Ona last-mile: ${doc.status} (we are not Ona Cloud)`);
  console.log(`  persist=${doc.persistAcrossDevices}`);
  console.log(`  budget $${doc.budget.monthlyCapUsd}/mo remaining=$${doc.budget.remainingUsd}`);
}

if (require.main === module) main();

module.exports = {
  HARNESS,
  MONTHLY_CAP_USD,
  SOURCE,
  classify,
  loadBudget,
  main,
  promptFingerprint,
  runDoctor,
  writeReceipt,
};
