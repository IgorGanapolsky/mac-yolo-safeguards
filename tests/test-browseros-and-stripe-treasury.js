#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  readSidecarConfig,
  ensureNativeBrowserOsConfig,
  pruneDirectoryOlderThan,
} = require('../tools/browseros-auto-optimizer');
const {
  calculateTreasuryFeeEconomics,
  runStripeTreasuryAudit,
} = require('../tools/stripe-treasury-finops-engine');

function runTests() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'browseros-treasury-test-'));
  try {
    // 1. BrowserOS Neo native config tuning writes neo.toml (close_after_minutes=5) and audit-retention.json (days=1)
    const cfgRes = ensureNativeBrowserOsConfig({
      browserclawDir: tmpDir,
      closeAfterMinutes: 5,
      retentionDays: 1,
      skipLaunchctl: true,
    });
    assert.strictEqual(fs.existsSync(cfgRes.neoTomlPath), true);
    assert.strictEqual(fs.existsSync(cfgRes.auditRetentionPath), true);
    const toml = fs.readFileSync(cfgRes.neoTomlPath, 'utf8');
    assert.strictEqual(toml.includes('close_after_minutes = 5'), true);
    assert.strictEqual(toml.includes('grouping = "auto"'), true);
    const retention = JSON.parse(fs.readFileSync(cfgRes.auditRetentionPath, 'utf8'));
    assert.strictEqual(retention.mode, 'deleteAfterDays');
    assert.strictEqual(retention.days, 1);

    // 2. pruneDirectoryOlderThan removes stale files (>24h) while preserving fresh files (<24h)
    const replaysDir = path.join(tmpDir, 'replays');
    fs.mkdirSync(replaysDir, { recursive: true });
    const oldFile = path.join(replaysDir, 'old.jsonl');
    const newFile = path.join(replaysDir, 'new.jsonl');
    fs.writeFileSync(oldFile, 'x'.repeat(2048), 'utf8');
    fs.writeFileSync(newFile, 'y'.repeat(1024), 'utf8');
    const twoDaysAgo = new Date(Date.now() - 48 * 3600 * 1000);
    fs.utimesSync(oldFile, twoDaysAgo, twoDaysAgo);

    const pruned = pruneDirectoryOlderThan(replaysDir, 24 * 3600 * 1000);
    assert.strictEqual(pruned.filesRemoved, 1);
    assert.strictEqual(pruned.bytesReclaimed, 2048);
    assert.strictEqual(fs.existsSync(oldFile), false);
    assert.strictEqual(fs.existsSync(newFile), true);

    // 3. Sidecar config parser reads BrowserOS Neo dynamic CDP/proxy/server ports
    const sidecarPath = path.join(tmpDir, 'config.json');
    fs.writeFileSync(
      sidecarPath,
      JSON.stringify({
        instance: { browseros_version: '0.51.2.3', chromium_version: '155.0.8314.26' },
        ports: { cdp: 9115, proxy: 9011, server: 9210 },
      }),
      'utf8'
    );
    const sidecar = readSidecarConfig(sidecarPath);
    assert.strictEqual(sidecar.cdpPort, 9115);
    assert.strictEqual(sidecar.proxyPort, 9011);
    assert.strictEqual(sidecar.serverPort, 9210);

    // 4. Stripe Treasury fee & yield economics across all 5 Mac YOLO tiers
    const econ = calculateTreasuryFeeEconomics();
    assert.strictEqual(econ.fdicInsuredLimitUsd, 250000);
    assert.strictEqual(econ.feeCreditYieldRatePct, 1);
    assert.strictEqual(econ.issuingCardCashbackRatePct, 2);
    assert.strictEqual(econ.totalFeeSavedOneEachHighTicketUsd, 131.88);
    const pilot = econ.tiers.find((t) => t.offer === 'Partner Pilot');
    assert.strictEqual(pilot.grossUsd, 3000);
    assert.strictEqual(pilot.cardFeeUsd, 87.3);
    assert.strictEqual(pilot.achFeeUsd, 5.0);
    assert.strictEqual(pilot.feeSavedPerCloseUsd, 82.3);
    assert.strictEqual(pilot.crosses2kYieldThreshold, true);

    // 5. Offline audit returns financialAccountId fa_65VgiFTvKGdYJdlwLB116SX0GN9FSQ6GK2zYVP00RZIAOu and payoutDestination
    const audit = runStripeTreasuryAudit({ offline: true, enableAutoSweep: true, skipReceipt: true });
    assert.strictEqual(audit.ok, true);
    assert.strictEqual(
      audit.treasuryAdvantages.financialAccountId,
      'fa_65VgiFTvKGdYJdlwLB116SX0GN9FSQ6GK2zYVP00RZIAOu'
    );
    assert.strictEqual(audit.treasuryAdvantages.payoutDestination, 'financial_account_100_pct');
    assert.strictEqual(audit.treasuryAdvantages.autoSweepEnabled, true);

    // 6. Verify MacYoloTranslucentHud.swift no longer contains manual BrowserOS tab-closing prompt
    const hudSwift = fs.readFileSync(
      path.join(__dirname, '..', 'macos', 'MacYoloTranslucentHud.swift'),
      'utf8'
    );
    assert.strictEqual(
      hudSwift.includes('Close a busy tab in BrowserOS if you want the CPU back'),
      false,
      'Manual BrowserOS tab-closing babysitting string must be removed from HUD'
    );
    assert.strictEqual(
      hudSwift.includes('Auto-optimized by Mac YOLO: sweeps idle agent tabs (>3m)'),
      true,
      'Autonomous BrowserOS optimization copy must be present in HUD'
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
  console.log('test-browseros-and-stripe-treasury: PASS (6/6 assertions)');
}

runTests();
