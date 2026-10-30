#!/usr/bin/env node
'use strict';

const assert = require('assert');
const {
  loadWhitelist,
  getTopProcessCulprits,
  auditBrowserCare,
  auditLaunchAgentsHealth,
  scanDownloadsInstallersAndClutter,
  scanAiAndDevSpaceLens,
  scanOrphanedAppLeftovers,
  getActivityLedger,
  getStatusBarSettings,
  setStatusBarIconVisibility,
  runFivePillarSmartCare,
} = require('../tools/mac-yolo-system-care-engine');
const { callTool } = require('../tools/mac-yolo-mcp-server');
const { routeRequest } = require('../tools/mac-yolo-service');

function main() {
  // 1. Whitelist protection (Mole steal)
  const wl = loadWhitelist();
  assert.ok(Array.isArray(wl) && wl.length >= 4);

  // 2. Top CPU & Memory culprits (iStat Menus 7 / Mole status steal)
  const culprits = getTopProcessCulprits(3);
  assert.strictEqual(culprits.ok, true);
  assert.ok(Array.isArray(culprits.topCpu) && culprits.topCpu.length > 0);
  assert.ok(Array.isArray(culprits.topMemory) && culprits.topMemory.length > 0);

  // 3. Browser Care (Oct 15, 2026 5.7.2 steal)
  const browser = auditBrowserCare();
  assert.strictEqual(browser.ok, true);
  assert.ok(typeof browser.chromeRendererCount === 'number');
  assert.ok(typeof browser.chromeRendererMemoryMiB === 'number');

  // 4. Broken LaunchAgent Doctor (Pearcleaner / Performance steal)
  const la = auditLaunchAgentsHealth();
  assert.ok(typeof la.totalPlists === 'number');
  assert.ok(Array.isArray(la.brokenPlists));

  // 5. Downloads Installers & Clutter Scanner (My Clutter + Mole installer steal)
  const clutter = scanDownloadsInstallersAndClutter();
  assert.strictEqual(clutter.ok, true);
  assert.ok(typeof clutter.installersCount === 'number');


  // 5b. AI & Dev Space Lens + Orphaned App Leftovers
  const aiLens = scanAiAndDevSpaceLens();
  assert.strictEqual(aiLens.ok, true);
  assert.strictEqual(aiLens.buckets.length, 4);
  const appLeftovers = scanOrphanedAppLeftovers();
  assert.strictEqual(appLeftovers.ok, true);
  assert.ok(appLeftovers.installedAppsCount > 0);
  // 6. My Activity Cumulative Ledger (5.4.0 steal)
  const ledger = getActivityLedger();
  assert.ok(ledger.totalSpaceReclaimedGiB >= 47.24);

  // 7. Status Bar Icon visibility toggle (hide -> show roundtrip)
  const hidden = setStatusBarIconVisibility(false);
  assert.strictEqual(hidden.showStatusBarIcon, false);
  const shown = setStatusBarIconVisibility(true);
  assert.strictEqual(shown.showStatusBarIcon, true);
  assert.strictEqual(getStatusBarSettings().showStatusBarIcon, true);

  // 8. Unified 5-Pillar Smart Care via Engine, MCP, and HTTP Service
  const report = runFivePillarSmartCare({ clean: false });
  assert.strictEqual(report.ok, true);
  assert.ok(report.tiles.cleanup && report.tiles.protection && report.tiles.performance);
  assert.ok(report.tiles.applications && report.tiles.myClutter);

  const mcpOut = callTool('yolo_system_care', { clean: false });
  assert.strictEqual(mcpOut.ok, true);

  const httpOut = routeRequest('GET', '/api/system-care');
  assert.strictEqual(httpOut.status, 200);
  assert.strictEqual(httpOut.body.ok, true);

  console.log('test-mac-yolo-system-care-engine: PASS');
}

main();
