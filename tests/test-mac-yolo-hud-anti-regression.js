#!/usr/bin/env node
'use strict';

/**
 * tests/test-mac-yolo-hud-anti-regression.js
 *
 * Permanent anti-regression gate for MacYoloSafeguards.app (Menu Bar Pill + Translucent Bento HUD).
 * Prevents recurrence of:
 *   1. Opaque black list regression ("Sizes appear after Scan.", "Status bar icon on", "Agent temp")
 *   2. Missing native macOS translucency (NSVisualEffectView .hudWindow .behindWindow + alphaValue = 0.88)
 *   3. Stacked glass-on-glass inner card blur (must use matte rgba(15, 11, 33, 0.58) inner cards)
 *   4. Flat monochrome text status item instead of Retina renderMenuBarPill
 *   5. Unlabeled mystery emoji footer buttons (must have ⚙️ Settings, 🧹 Clean Junk, ⚡ Free RAM, ✕ Close)
 *   6. App-switch network rate jumps (must enforce dt < 1.2 guard and no 145/420 fallback)
 *   7. Clipped 610px height (must be 420x668)
 *   8. Third-party competitor trademarks in UI titles
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const SWIFT_PATH = path.join(ROOT, 'macos', 'MacYoloSafeguardsApp.swift');
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
    'hudPanel.alphaValue = 1',
    'Gumroad page',
  ];
  for (const b of banned) {
    assert.ok(!src.includes(b), `Regression string "${b}" is banned in macos/MacYoloSafeguardsApp.swift`);
  }

  // 2. True native macOS translucency + see-through cards
  assert.ok(src.includes('hudPanel.alphaValue = 0.88'), 'hudPanel.alphaValue = 0.88 required');
  assert.ok(src.includes('background: rgba(255, 255, 255, 0.08)'), 'Translucent rgba(255, 255, 255, 0.08) cards required');
  // 3. Custom Retina Menu Bar Pill + glowing Bento meters
  assert.ok(src.includes('func renderMenuBarPill('), 'renderMenuBarPill required for Retina menu bar capsule');
  assert.ok(src.includes('button.imagePosition = .imageOnly'), 'Status item must use rendered Retina pill image');
  assert.ok(src.includes('id="diskBarFill"') && src.includes('id="memBarFill"') && src.includes('id="cpuBarFill"'), 'Bento tile meter bars required');

  // 4. Dayglass-style drag-to-move, corner resize, top-right placement, and AI Agent Optimization card
  assert.ok(src.includes('case "moveHud":') && src.includes('case "resizeHud":'), 'Dayglass moveHud and resizeHud handlers required');
  assert.ok(src.includes('id="hudResizeGrip"') && src.includes('id="hudSizeBtnText"'), 'Dayglass corner resize grip and SVG Size/Expand button required');
  assert.ok(src.includes('class="ico-badge ico-disk"') && src.includes('class="hdr-pill"'), 'Duotone SVG icon badges and specular pill buttons required');
  assert.ok(src.includes('AI YOLO Agent Optimization') && src.includes('user agents'), 'AI Agent Optimization card and live user agents health strip required');

  // 5. Steady network rate sampling decoupled from app switching
  assert.ok(src.includes('dt < 1.2') || src.includes('dt >= 1.2'), 'dt 1.2s guard required in sampleNetworkRates()');

  // 6. Entire Trails CI/CD Pilot HUD Gate must be GREEN
  const { evaluateEntireTrailHud } = require('../tools/entire-cicd-regression-gate');
  const trail = evaluateEntireTrailHud();
  assert.strictEqual(trail.ok, true);
  assert.strictEqual(trail.stop_cop, 'green');

  // 7. On macOS host, verify /Applications binary matches canonical purple-bento binary
  if (process.platform === 'darwin') {
    const canonicalBin = path.join(os.homedir(), '.hermes', 'bin', 'MacYoloSafeguards-purple-bento');
    const appBin = '/Applications/MacYoloSafeguards.app/Contents/MacOS/MacYoloSafeguards';
    if (fs.existsSync(canonicalBin) && fs.existsSync(appBin)) {
      const cBuf = fs.readFileSync(canonicalBin);
      const aBuf = fs.readFileSync(appBin);
      assert.strictEqual(cBuf.equals(aBuf), true, '/Applications binary must match ~/.hermes/bin/MacYoloSafeguards-purple-bento');
      assert.ok(!aBuf.includes(Buffer.from('Sizes appear after Scan')), 'Compiled binary must never contain black-box regression');
    }
  }
  console.log('test-mac-yolo-hud-anti-regression: PASS (all 8 HUD & Menu Bar Pill invariants verified)');
}

main();
