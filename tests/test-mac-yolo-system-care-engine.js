#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
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
  if (fs.existsSync('/Applications')) assert.ok(appLeftovers.installedAppsCount > 0);
  // 6. My Activity Cumulative Ledger (5.4.0 steal)
  const ledgerDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mac-yolo-ledger-'));
  const missingLedger = getActivityLedger(path.join(ledgerDir, 'missing.json'));
  assert.deepStrictEqual(missingLedger, {
    totalSpaceReclaimedGiB: 0,
    runawayLoopsStopped: 0,
    estimatedHoursSaved: 0,
    lastSmartCareAt: null,
  });
  const ledgerFile = path.join(ledgerDir, 'ledger.json');
  fs.writeFileSync(ledgerFile, JSON.stringify({ totalSpaceReclaimedGiB: 12.5, lastSmartCareAt: '2026-11-01T00:00:00.000Z' }));
  const recordedLedger = getActivityLedger(ledgerFile);
  assert.strictEqual(recordedLedger.totalSpaceReclaimedGiB, 12.5);
  assert.strictEqual(recordedLedger.runawayLoopsStopped, 0);
  assert.strictEqual(recordedLedger.lastSmartCareAt, '2026-11-01T00:00:00.000Z');
  fs.rmSync(ledgerDir, { recursive: true, force: true });

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

  // 9. Action audit log: one line per decision, basename only, rotation at 5 MB, stats.
  {
    const { logDecisions, actionStats } = require('../tools/mac-yolo-action-log');
    const { runawayDecisions } = require('../tools/mac-yolo-system-care-engine');
    const { parsePs } = require('../tools/mac-yolo-agent-guard');
    const auditDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yolo-actions-'));
    const env = { MAC_YOLO_ACTION_LOG_DIR: auditDir };
    const now = Date.parse('2026-11-12T12:00:00Z');
    const SESSION = '/Users/someone/Library/Application Support/Claude/claude-code/2.1.321/abc/claude.app/Contents/MacOS/claude --token sk-abcdefghij1234';
    const procs = parsePs([
      `10 1 400000 01:00:00 ?? ${SESSION}`,
      '70 10 4096 00:05 ?? find /Users/someone -name secret@example.com',
      '72 1 8192 09:00 ?? find /Users/someone -name *.log',
    ].join('\n'));
    const decisions = runawayDecisions(procs, new Set([72]));
    assert.deepStrictEqual(decisions.map((d) => [d.proc.pid, d.decision, d.killed]), [[70, 'spare', false], [72, 'kill', true]]);
    logDecisions('coolDownFans', decisions, { env, now, cpu: new Map([[72, 97.5]]) });
    const lines = fs.readFileSync(path.join(auditDir, 'actions.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
    assert.strictEqual(lines.length, 2);
    const allowed = ['ts', 'runId', 'action', 'pid', 'name', 'decision', 'reason', 'cpuPct', 'rssMB', 'killed'];
    for (const l of lines) assert.deepStrictEqual(Object.keys(l), allowed);
    const raw = fs.readFileSync(path.join(auditDir, 'actions.jsonl'), 'utf8');
    assert.ok(!/someone|\/Users|sk-|@example|-name|secret/.test(raw), 'no args, paths or user names in the log');
    assert.deepStrictEqual([lines[1].name, lines[1].decision, lines[1].cpuPct, lines[1].rssMB, lines[1].killed], ['find', 'kill', 97.5, 8, true]);
    assert.strictEqual(lines[0].cpuPct, null);
    const stats = actionStats({ days: 7, env, now: now + 1000 });
    assert.deepStrictEqual(stats, { days: 7, runs: 1, kills: 1, killed: 1, spares: 1, mbFreed: 8 });
    assert.strictEqual(actionStats({ days: 7, env, now: now + 8 * 86400000 }).runs, 0, 'old entries fall outside the window');
    // Rotation: a small cap forces actions.jsonl -> actions.jsonl.1, one older copy kept.
    for (let i = 0; i < 6; i += 1) logDecisions('coolDownFans', decisions, { env, now: now + i, maxBytes: 600, cpu: new Map() });
    assert.ok(fs.existsSync(path.join(auditDir, 'actions.jsonl.1')), 'rotated copy exists');
    assert.ok(!fs.existsSync(path.join(auditDir, 'actions.jsonl.2')), 'only one rotated copy is kept');
    assert.ok(fs.statSync(path.join(auditDir, 'actions.jsonl')).size <= 600);
    fs.rmSync(auditDir, { recursive: true, force: true });
  }

  console.log('test-mac-yolo-system-care-engine: PASS');
}

main();
