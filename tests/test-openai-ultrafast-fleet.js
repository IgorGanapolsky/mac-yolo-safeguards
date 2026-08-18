#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const fleet = require('../tools/openai-ultrafast-fleet');

const REPO = path.resolve(__dirname, '..');

function tmpHome() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ultrafast-fleet-'));
}

function run() {
  assert.strictEqual(fleet.MODEL, 'gpt-5.6-sol');
  assert.strictEqual(fleet.SERVICE_TIER, 'ultrafast');
  assert.strictEqual(fleet.MONTHLY_CAP_USD, 10);
  assert.strictEqual(fleet.TARGET_TPS, 750);
  assert.strictEqual(fleet.HARNESS_DEFAULTS['jcode-yolo'], 'zai/glm-5.3');
  assert.strictEqual(fleet.HARNESS_DEFAULTS['hermes-yolo'], 'subscription-supergrok');
  console.log('PASS 1 invariants + harness defaults stay off Sol');

  const payload = fleet.buildUltrafastPayload('incident: read production logs now');
  assert.strictEqual(payload.model, 'gpt-5.6-sol');
  assert.strictEqual(payload.service_tier, 'ultrafast');
  console.log('PASS 2 payload uses service_tier=ultrafast');

  const def = fleet.selectRoute('implement a TypeScript API');
  assert.strictEqual(def.ultrafast, false);
  assert.strictEqual(def.model, 'zai/glm-5.3');
  const local = fleet.selectRoute('review customer password and private key');
  assert.strictEqual(local.route, 'local');
  const uf = fleet.selectRoute('use ultrafast for this live production outage logs');
  assert.strictEqual(uf.ultrafast, true);
  assert.strictEqual(uf.model, 'gpt-5.6-sol');
  console.log('PASS 3 route: default GLM, sensitive local, explicit+urgent Ultrafast');

  const home = tmpHome();
  fs.writeFileSync(path.join(home, '.zshrc'), 'export JCODE_DEFAULT_PROVIDER=zai\nexport JCODE_MODEL=glm-5.3\n');
  const applied = fleet.apply({
    home,
    files: [path.join(home, '.zshrc'), path.join(home, '.zprofile')],
    plistPath: path.join(home, 'Library', 'LaunchAgents', `${fleet.PLIST_LABEL}.plist`),
    load: false,
  });
  const zsh = fs.readFileSync(path.join(home, '.zshrc'), 'utf8');
  assert.ok(zsh.includes('OPENAI_ULTRAFAST_MONTHLY_CAP_USD=10'));
  assert.ok(zsh.includes('OPENAI_SERVICE_TIER=ultrafast'));
  assert.ok(zsh.includes('OPENAI_ULTRAFAST_DEFAULT=0'));
  assert.ok(!zsh.includes('JCODE_DEFAULT_PROVIDER=openai'));
  assert.match(zsh, /JCODE_DEFAULT_PROVIDER=zai/);
  const again = fleet.applyShellRc({ home, files: [path.join(home, '.zshrc')] });
  const zsh2 = fs.readFileSync(path.join(home, '.zshrc'), 'utf8');
  assert.strictEqual((zsh2.match(/openai-ultrafast-fleet/g) || []).length, 2, 'begin+end once');
  assert.strictEqual(again[0].changed, false);
  const plist = fs.readFileSync(applied.launchd.plist, 'utf8');
  assert.ok(plist.includes('OPENAI_ULTRAFAST_MONTHLY_CAP_USD 10'));
  assert.ok(!plist.includes('JCODE_DEFAULT_PROVIDER'));
  const envFile = fs.readFileSync(applied.hermesEnvFile, 'utf8');
  assert.ok(!/sk-|api[_-]?key=/i.test(envFile));
  console.log('PASS 4 persist $10 cap, no Sol default, idempotent, no secrets');

  const ledger = fleet.loadLedger(home);
  ledger.spentUsd = 10;
  fleet.saveLedger(ledger, home);
  const blocked = fleet.selectRoute('use ultrafast for this live production outage logs', { home });
  assert.strictEqual(blocked.ultrafast, false);
  assert.strictEqual(blocked.model, 'zai/glm-5.3');
  assert.match(blocked.reason, /budget-fallback/);
  console.log('PASS 5 $10 exhausted falls back to GLM-5.3');

  const doc = fleet.runDoctor({ home });
  assert.strictEqual(doc.budget.monthlyCapUsd, 10);
  assert.strictEqual(doc.ultrafastIsDefault, false);
  assert.strictEqual(doc.persistPinsJcodeToOpenai, false);
  assert.strictEqual(doc.previewLimited, true);
  assert.strictEqual(doc.operational750Tps, false);
  assert.strictEqual(doc.measuredTps, null);
  assert.ok(!JSON.stringify(doc).includes('OPERATIONAL_750_TPS'));
  assert.strictEqual(doc.ready, true);
  assert.strictEqual(doc.defaultInteractiveCoder, 'zai/glm-5.3');
  console.log('PASS 6 doctor: preview, opt-in, $10, not default Sol, no fake 750 TPS');

  const jcodeHome = tmpHome();
  const jcodeCfg = path.join(jcodeHome, '.jcode', 'config.toml');
  fs.mkdirSync(path.dirname(jcodeCfg), { recursive: true });
  fs.writeFileSync(jcodeCfg, '[provider]\ndefault_provider = "openai"\ndefault_model = "gpt-5.6-luna"\nopenai_service_tier = "ultrafast"\n');
  const healed = fleet.healJcodeDefault({ home: jcodeHome });
  assert.strictEqual(healed.changed, true);
  assert.strictEqual(healed.defaultProvider, 'zai');
  assert.strictEqual(healed.defaultModel, 'glm-5.3');
  const healedText = fs.readFileSync(jcodeCfg, 'utf8');
  assert.match(healedText, /openai_service_tier = "ultrafast"/);
  assert.ok(!healedText.includes('default_provider = "openai"'));
  console.log('PASS 6b jcode heal: openai/luna → zai/glm-5.3, keep preview tier hint');

  const cli = path.join(REPO, 'bin', 'ultrafast-fleet');
  const cliDoc = spawnSync(cli, ['doctor', '--json'], { encoding: 'utf8' });
  assert.strictEqual(cliDoc.status, 0, cliDoc.stderr);
  const cliJson = JSON.parse(cliDoc.stdout);
  assert.strictEqual(cliJson.serviceTier, 'ultrafast');
  assert.strictEqual(cliJson.budget.monthlyCapUsd, 10);
  const cliRoute = spawnSync(cli, ['route', 'implement a feature'], { encoding: 'utf8' });
  assert.strictEqual(JSON.parse(cliRoute.stdout).ultrafast, false);
  console.log('PASS 7 CLI doctor + route');

  fs.rmSync(home, { recursive: true, force: true });
  fs.rmSync(jcodeHome, { recursive: true, force: true });
  console.log('\nALL OPENAI ULTRAFAST FLEET TESTS PASSED (7/7)');
}

run();
