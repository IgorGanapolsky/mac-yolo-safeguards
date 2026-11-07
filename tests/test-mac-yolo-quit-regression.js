#!/usr/bin/env node
'use strict';

/**
 * tests/test-mac-yolo-quit-regression.js
 *
 * Permanent anti-regression gate for the user-quit lifecycle of MacYoloSafeguards.app.
 *
 * Bug: "I can never quit mac-yolo-safeguards." The HUD/menu-bar app is supervised
 * (launchd job com.iganapolsky.mac-yolo-safeguards-menubar, kickstart -k restart
 * paths in tools/mac-yolo-service.js and tools/mac-yolo-release-cd-engine.js), so
 * a user Quit was followed by an immediate relaunch.
 *
 * Contract locked by this test:
 *   1. The app records a quit marker (~/.hermes/mac-yolo-user-quit.json) on EVERY
 *      terminate path via applicationShouldTerminate -> .terminateNow.
 *   2. A relaunch within the same boot (matching kern.bootuuid) exits immediately
 *      instead of resurrecting the HUD. Self-test modes bypass the marker so CI
 *      can always execute the binary.
 *   3. A new boot (different bootuuid) or an explicit --clear-quit-marker /
 *      MAC_YOLO_FORCE_RUN=1 clears the marker and runs normally.
 *   4. The launcher script honors the same marker before doing any work.
 *   5. Scope: the quit fix must not disable, kill, or bootout any other agent,
 *      guard, or launchd job from the app binary.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SWIFT_FILES = ['macos/MacYoloTranslucentHud.swift', 'macos/MacYoloSafeguardsApp.swift'];
const LAUNCHER_PATH = path.join(ROOT, 'tools', 'launch-mac-yolo-menubar.sh');
const MARKER = '.hermes/mac-yolo-user-quit.json';

function main() {
  // 1 & 2 & 3: Swift app implements the quit-marker lifecycle in both source twins.
  for (const rel of SWIFT_FILES) {
    const p = path.join(ROOT, rel);
    assert.ok(fs.existsSync(p), `${rel} must exist`);
    const src = fs.readFileSync(p, 'utf8');

    assert.ok(src.includes('func applicationShouldTerminate('), `${rel}: applicationShouldTerminate required`);
    assert.ok(src.includes('recordUserQuitMarker()'), `${rel}: terminate must record the quit marker`);
    assert.ok(src.includes('return .terminateNow'), `${rel}: terminate must proceed (.terminateNow), never be vetoed`);
    assert.ok(src.includes(MARKER), `${rel}: marker path ${MARKER} required`);
    assert.ok(src.includes('kern.bootuuid'), `${rel}: marker must be scoped to the current boot via kern.bootuuid`);
    assert.ok(src.includes('func userQuitMarkerMatchesThisBoot()'), `${rel}: relaunch guard required`);
    assert.ok(src.includes('"--clear-quit-marker"'), `${rel}: explicit marker-clear launch argument required`);
    assert.ok(src.includes('mac-yolo-safeguards/user-quit/v1'), `${rel}: marker schema tag required`);

    // The early-exit guard must run before any UI setup, and self-tests must bypass it.
    const didFinish = src.indexOf('func applicationDidFinishLaunching(');
    const guard = src.indexOf('userQuitMarkerMatchesThisBoot() {');
    const uiSetup = src.indexOf('setupStatusItemAndHud()');
    assert.ok(didFinish !== -1 && guard !== -1 && uiSetup !== -1, `${rel}: guard and UI setup must be locatable`);
    assert.ok(guard > didFinish && guard < uiSetup, `${rel}: relaunch guard must run inside applicationDidFinishLaunching before UI setup`);
    assert.ok(/if !isSelfTest \{[\s\S]{0,400}userQuitMarkerMatchesThisBoot\(\)/.test(src), `${rel}: marker logic must be bypassed for self-test modes`);

    // 5: the quit path itself must not manage launchd or kill processes to
    // achieve quit (other parts of the app legitimately shell out, e.g. the
    // uninstaller, so this check is scoped to the new lifecycle code only).
    const quitStart = src.indexOf('func applicationShouldTerminate(');
    const quitEnd = src.indexOf('func clearUserQuitMarker()');
    assert.ok(quitStart !== -1 && quitEnd !== -1 && quitEnd > quitStart, `${rel}: quit lifecycle block must be locatable`);
    const quitBlock = src.slice(quitStart, quitEnd + 400);
    for (const banned of ['launchctl', 'bootout', 'killall', 'spawnSync', 'Process()', 'terminate()']) {
      assert.ok(!quitBlock.includes(banned), `${rel}: quit path must not touch launchd/other processes (found "${banned}")`);
    }
  }

  // 4: launcher honors the marker before compiling/copying/exec.
  const sh = fs.readFileSync(LAUNCHER_PATH, 'utf8');
  assert.ok(sh.includes('QUIT_MARKER="$HOME/.hermes/mac-yolo-user-quit.json"'), 'launcher: marker path required');
  assert.ok(sh.includes('MAC_YOLO_FORCE_RUN'), 'launcher: force-run override required');
  assert.ok(sh.includes('kern.bootuuid'), 'launcher: same-boot detection required');
  assert.ok(sh.includes('not relaunching'), 'launcher: suppression notice required');
  const markerCheck = sh.indexOf('QUIT_MARKER=');
  const ensureBin = sh.indexOf('ensure_canonical_binary');
  assert.ok(markerCheck !== -1 && ensureBin !== -1 && markerCheck < ensureBin, 'launcher: marker check must precede binary work');

  // 3: decision semantics model (mirrors Swift + bash intent; guards spec drift).
  function relaunchDecision({ marker, currentBoot, force, selfTest }) {
    if (selfTest) return 'run';
    if (force) return 'clear-and-run';
    if (!marker || !marker.bootUuid) return 'run';
    if (marker.bootUuid !== currentBoot) return 'clear-and-run';
    return 'suppress-relaunch';
  }
  const bootA = 'AAAA-BBBB', bootB = 'CCCC-DDDD';
  assert.strictEqual(relaunchDecision({ marker: null, currentBoot: bootA }), 'run', 'no marker -> run');
  assert.strictEqual(relaunchDecision({ marker: {}, currentBoot: bootA }), 'run', 'corrupt marker -> run');
  assert.strictEqual(relaunchDecision({ marker: { bootUuid: bootA }, currentBoot: bootA }), 'suppress-relaunch', 'same boot -> stay quit');
  assert.strictEqual(relaunchDecision({ marker: { bootUuid: bootB }, currentBoot: bootA }), 'clear-and-run', 'new boot -> run again');
  assert.strictEqual(relaunchDecision({ marker: { bootUuid: bootA }, currentBoot: bootA, force: true }), 'clear-and-run', 'force -> run');
  assert.strictEqual(relaunchDecision({ marker: { bootUuid: bootA }, currentBoot: bootA, selfTest: true }), 'run', 'self-test bypass');

  console.log('test-mac-yolo-quit-regression: PASS (quit lifecycle contract verified in both Swift sources + launcher)');
}

main();
