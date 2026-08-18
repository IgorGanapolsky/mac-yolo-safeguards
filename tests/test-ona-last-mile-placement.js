#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const place = require('../tools/ona-last-mile-placement');

const REPO = path.resolve(__dirname, '..');

function tmpHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ona-last-mile-'));
}

function run() {
  assert.strictEqual(place.MONTHLY_CAP_USD, 10);
  assert.strictEqual(place.HARNESS['jcode-yolo'], 'zai/glm-5.3');
  assert.strictEqual(place.HARNESS['hermes-mobile'], 'local-mac-gateway');
  console.log('PASS 1 invariants: $10, harnesses stay local-first');

  const secret = place.classify('rotate the api key in Keychain');
  assert.strictEqual(secret.place, 'local');
  assert.strictEqual(secret.cloudEligible, false);
  const phone = place.classify('pair Hermes Mobile over adb usb');
  assert.strictEqual(phone.place, 'local');
  console.log('PASS 2 secrets and phone stay local');

  const ordinary = place.classify('implement a TypeScript helper');
  assert.strictEqual(ordinary.place, 'local');
  assert.strictEqual(ordinary.reason, 'default-local-first');
  console.log('PASS 3 ordinary work defaults local (no fake 80% cloud)');

  const cloud = place.classify('run this on an Ona Cloud background agent');
  assert.strictEqual(cloud.place, 'cloud-opt-in');
  const home = tmpHome();
  fs.mkdirSync(path.join(home, '.hermes'), { recursive: true });
  fs.writeFileSync(
    path.join(home, '.hermes', 'ona-last-mile-spend.json'),
    JSON.stringify({ month: place.loadBudget(home).month, monthlyCapUsd: 10, spentUsd: 10 }),
  );
  const blocked = place.classify('run this on an Ona Cloud background agent', { home });
  assert.strictEqual(blocked.place, 'local');
  assert.match(blocked.reason, /budget-fallback/);
  console.log('PASS 4 explicit cloud only with remaining $10');

  const doc = place.runDoctor({ home });
  assert.strictEqual(doc.weAreOna, false);
  assert.strictEqual(doc.claimEightyPercentCloud, false);
  assert.strictEqual(doc.storesPromptText, false);
  assert.strictEqual(doc.budget.monthlyCapUsd, 10);
  console.log('PASS 5 doctor: not Ona, no 80% cloud claim, no prompt text');

  const fp = place.promptFingerprint('never store me');
  assert.strictEqual(fp.length, 64);
  place.writeReceipt(ordinary, 'never store me', home);
  const receipt = fs.readFileSync(path.join(home, '.hermes', 'ona-last-mile-receipts.jsonl'), 'utf8');
  assert.ok(receipt.includes(fp));
  assert.ok(!receipt.includes('never store me'));
  console.log('PASS 6 receipts hash-only');

  const cli = path.join(REPO, 'bin', 'ona-last-mile');
  const cliDoc = spawnSync(cli, ['doctor', '--json'], { encoding: 'utf8' });
  assert.strictEqual(cliDoc.status, 0, cliDoc.stderr);
  assert.strictEqual(JSON.parse(cliDoc.stdout).status, 'LOCAL_FIRST');
  const cliRoute = spawnSync(cli, ['route', '--no-receipt', 'review customer password'], { encoding: 'utf8' });
  assert.strictEqual(JSON.parse(cliRoute.stdout).place, 'local');
  console.log('PASS 7 CLI doctor + route');

  fs.rmSync(home, { recursive: true, force: true });
  console.log('\nALL ONA LAST-MILE TESTS PASSED (7/7)');
}

run();
