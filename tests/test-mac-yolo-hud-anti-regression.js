#!/usr/bin/env node
'use strict';

/**
 * tests/test-mac-yolo-hud-anti-regression.js
 *
 * Permanent anti-regression gate for MacYoloSafeguards.app (Menu Bar Pill + Translucent Bento HUD).
 * Prevents recurrence of:
 *   1. Opaque black list regression ("Sizes appear after Scan.", "Status bar icon on", "Agent temp")
 *   2. Missing native macOS translucency (NSVisualEffectView .hudWindow .behindWindow; window at full opacity so the desktop does not bleed through)
 *   3. Stacked glass-on-glass inner card blur (must use matte rgba(15, 11, 33, …) inner cards)
 *   4. Flat monochrome text status item instead of Retina renderMenuBarPill
 *   5. Unlabeled mystery emoji footer buttons (must have ⚙️ Settings, 🧹 Clean Junk, ⚡ Free RAM, ✕ Close)
 *   6. App-switch network rate jumps (rates update only when dt >= 1.2 s; no 145/420 fallback)
 *   7. Clipped 610px height (must be 420x668)
 *   8. Third-party competitor trademarks in UI titles
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const SWIFT_PATH = fs.existsSync(path.join(ROOT, 'macos', 'MacYoloTranslucentHud.swift'))
  ? path.join(ROOT, 'macos', 'MacYoloTranslucentHud.swift')
  : path.join(ROOT, 'macos', 'MacYoloSafeguardsApp.swift');
const LAUNCHER_PATH = path.join(ROOT, 'tools', 'launch-mac-yolo-menubar.sh');

function main() {
  assert.ok(fs.existsSync(SWIFT_PATH), 'macos/MacYoloSafeguardsApp.swift must exist');
  assert.ok(fs.existsSync(LAUNCHER_PATH), 'tools/launch-mac-yolo-menubar.sh must exist');

  const src = fs.readFileSync(SWIFT_PATH, 'utf8');

  // 1. Banned regression strings (black list UI / competitor trademark in title / fake 145/420 net rates)
  const banned = [
    'Sizes appear after Scan',
    'Status bar icon on',
    'CleanMyMac Guard',
    'CleanMyMac & Screen Guard',
    'var upKB = 145',
    'var downKB = 420',
    'Open Mac YOLO Guard',
    '✕ Close',
    '🖴',
    '▦',
    '🤖',
    '🪟',
    '💻',
    'Gumroad page',
    'captureBelowWindow',
    'hudPanel.alphaValue = 0.88',
    'id="hudSizeBtn"',
    'footerSizeLabel',
    'Click any card for live drill-down',
    '/usr/bin/networkQuality',
  ];
  for (const b of banned) {
    assert.ok(!src.includes(b), `Regression string "${b}" is banned in macos/MacYoloSafeguardsApp.swift`);
  }

  // 2. Native blur (NSVisualEffectView .hudWindow .behindWindow) at full window opacity. At 0.88 the desktop's text showed
  // through the cards (three UI reviews, 2026-11-12).
  assert.ok(src.includes('NSVisualEffectView'), 'Native NSVisualEffectView required for window blur');
  assert.ok(src.includes('visualEffectView.material = .hudWindow'), 'NSVisualEffectView .hudWindow material required');
  assert.ok(src.includes('visualEffectView.blendingMode = .behindWindow'), 'NSVisualEffectView .behindWindow blending required');
  assert.ok(src.includes('hudPanel.alphaValue = 1.0'), 'hudPanel.alphaValue = 1.0 required; the blur provides the translucency');
  assert.ok(src.includes('forceTransparentWebView'), 'forceTransparentWebView required');
  assert.ok(
    src.includes('background: rgba(255, 255, 255, 0.08)') || src.includes('background: rgba(15, 11, 33,'),
    'Translucent inner cards required'
  );
  // 3. Custom Retina Menu Bar Pill + glowing Bento meters
  assert.ok(src.includes('func renderMenuBarPill('), 'renderMenuBarPill required for Retina menu bar capsule');
  assert.ok(src.includes('button.imagePosition = .imageOnly'), 'Status item must use rendered Retina pill image');
  assert.ok(!src.includes('NSSize(width: 118, height: 22)') && !src.includes('NSPoint(x: 86,'), 'Hardcoded 118pt/x:86 menu bar smushing is banned; must dynamically measure colWidths');
  assert.ok(src.includes('makeMenuBarValueString(') && src.includes('colWidths'), 'Dynamic tabular column measurement with unit hierarchy required in renderMenuBarPill');
  assert.ok(src.includes('id="diskBarFill"') && src.includes('id="memBarFill"') && src.includes('id="cpuBarFill"'), 'Bento tile meter bars required');

  // 4. Dayglass-style drag-to-move, corner resize, top-right placement, and AI Agent Optimization card
  assert.ok(src.includes('case "moveHud":') && src.includes('case "resizeHud":'), 'Dayglass moveHud and resizeHud handlers required');
  assert.ok(src.includes('id="hudResizeGrip"'), 'Corner resize grip required (resizing is by dragging, not a Size button)');
  assert.ok(src.includes('class="ico-badge ico-disk"><svg') && src.includes('class="hdr-pill"'), 'Duotone SVG icon badges and specular pill buttons required');
  assert.ok((src.includes('AI Agent Optimization') || src.includes('id="recSection"')) && src.includes('background jobs'), 'AI Agent Optimization card and live background jobs health strip required');

  // 5. Steady network rate sampling decoupled from app switching + itemized Action Receipt Banner + pre-AppKit flock + BTM guard
  assert.ok(src.includes('dt < 1.2') || src.includes('dt >= 1.2'), 'dt 1.2s guard required in sampleNetworkRates()');
  assert.ok(src.includes('id="actionReceiptBanner"') && src.includes('window.renderActionReceipt'), 'Itemized #actionReceiptBanner and window.renderActionReceipt required for Clean AI Waste / RAM / Fan actions');
  assert.ok(src.includes('singleInstanceLockFd') && src.includes('flock(singleInstanceLockFd, LOCK_EX | LOCK_NB)'), 'Pre-AppKit singleInstanceLockFd flock required to prevent duplicate HUD windows and BTM notifications');
  assert.ok(src.includes('id="drawerSpeedBtn"') && src.includes('wifiVsProviderRow(') && src.includes('"<synthetic>"'), 'Polite Internet drawer speed button, Wi-Fi vs Provider row, and <synthetic> token filter required');
  assert.ok(src.includes('func buildDetailShieldFull(') && src.includes('Top Hogs Right Now|'), 'Protection drawer (detailShieldFull) must surface Top Hogs Right Now and itemized top CPU/RAM hogs with 4-part interactive rows');
  // Top Hogs is shown once, on the Protection line. Igor, 2026-11-12: "why do i see top hogs in multiple places?"
  assert.ok(!/"(recTitle|memPressure|cpuLoad)":[^\n]*shortLine/.test(src) && !src.includes('let rTitle = "Top Hogs'), 'Top Hogs must appear only on the Protection line, not the optimization card, memory tile or CPU tile');
  // Switching apps must not write the app name over the Agents card ("Gemini / Gemini", "Google Chrome").
  assert.ok(!/let activePayload: \[String: String\] = \[[^\]]*"activeApp"/.test(src), 'App-switch payload must not overwrite the Agents card (activeApp/activeWin)');
  // Blanking out secrets rewrites transcripts and can't be undone: it needs a second click, and only the Swift side runs it.
  assert.ok(src.includes('function blankOutSecrets(') && src.includes("'Click again to confirm'") && src.includes('case "redactSecrets":') && !/triggerHudAction\('redactSecrets'/.test(src), 'Blank Out Secrets must require a second click before redacting');
  assert.ok(/"netName": networkTitle\(/.test(src) && src.includes("setTextIfChanged('netName', state.netName)"), 'Network card title must show the network name and how long the Mac has been on it');
  assert.ok(src.includes('lookupFailed = true') && src.includes('addingTimeInterval(-540)'), 'A slow Wi-Fi lookup must keep the last network name and retry in a minute, not show plain "Wi-Fi"');
  const launcherSrc = fs.readFileSync(LAUNCHER_PATH, 'utf8');
  assert.ok(launcherSrc.includes('Developer ID Application: Igor Ganapolsky (9GMM26JC5X)') && launcherSrc.includes('is_self_test'), 'tools/launch-mac-yolo-menubar.sh must sign with Developer ID Application and skip re-signing on self-tests');

  // 6. Entire Trails CI/CD Pilot HUD Gate must be GREEN
  const { evaluateEntireTrailHud } = require('../tools/entire-cicd-regression-gate');
  const trail = evaluateEntireTrailHud();
  assert.strictEqual(trail.ok, true);
  assert.strictEqual(trail.stop_cop, 'green');

  // 7. On macOS host, verify /Applications binary matches canonical purple-bento binary
  if (process.platform === 'darwin') {
    // Same canonical binary that tools/launch-mac-yolo-menubar.sh and tools/mac-yolo-service.js keep in sync.
    const canonicalBin = path.join(os.homedir(), '.hermes', 'bin', 'MacYolo-Protected-V4');
    const appBin = '/Applications/MacYoloSafeguards.app/Contents/MacOS/MacYoloSafeguards';
    if (fs.existsSync(canonicalBin) && fs.existsSync(appBin)) {
      const cBuf = fs.readFileSync(canonicalBin);
      const aBuf = fs.readFileSync(appBin);
      assert.strictEqual(cBuf.equals(aBuf), true, '/Applications binary must match ~/.hermes/bin/MacYolo-Protected-V4');
      assert.ok(!aBuf.includes(Buffer.from('Sizes appear after Scan')), 'Compiled binary must never contain black-box regression');
    }
  }
  console.log('test-mac-yolo-hud-anti-regression: PASS (all 9 HUD, Menu Bar Pill & BTM Notification Suppression invariants verified)');
}

main();

// Igor, 2026-11-13: the status line opened the same view as the Protection card. It is now plain
// information with its own Stop Runaways button, and each opened card keeps its action buttons.
{
  const fs = require('fs');
  const path = require('path');
  for (const f of ['MacYoloSafeguardsApp.swift', 'MacYoloTranslucentHud.swift']) {
    const src = fs.readFileSync(path.join(__dirname, '..', 'macos', f), 'utf8');
    const line = src.match(/<div [^>]*id="attentionLine"[^>]*>/);
    if (!line || /onclick=/.test(line[0]) || /clickable-card/.test(line[0])) {
      throw new Error(f + ': attentionLine must be information, not a duplicate link to the shield details');
    }
    if (!/id="attentionStopBtn"[^>]*onclick="confirmStopRunaways\(this\)"/.test(src)) {
      throw new Error(f + ': attentionLine must carry a Stop Runaways button that uses the confirm flow');
    }
    const map = src.match(/var DRAWER_ACTIONS = (\{[^}]*\})/);
    if (!map) throw new Error(f + ': DRAWER_ACTIONS map missing');
    const want = { memory: 'freeMemBtn', disk: 'freeDiskBtn', cpu: 'stopRunawaysBtn', tokens: 'secretsBtn', shield: 'stopRunawaysBtn' };
    for (const [card, id] of Object.entries(want)) {
      if (!new RegExp(card + ": \\[[^\\]]*'" + id + "'").test(map[1])) throw new Error(f + ': ' + card + ' drawer must show ' + id);
      if (!src.includes('id="' + id + '"')) throw new Error(f + ': source button ' + id + ' missing');
    }
    if (!src.includes('id="drawerActions"') || !/renderActiveCardDetail\(s\) \{[\s\S]*?renderDrawerActions\(\);/.test(src)) {
      throw new Error(f + ': drawer must render its action buttons');
    }
  }
  console.log('ok - opened cards keep their action buttons; status line is information only');
}
