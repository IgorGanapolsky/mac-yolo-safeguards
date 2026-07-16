#!/usr/bin/env node
/**
 * Tier-0 E2E gate: validate the Maestro flow library WITHOUT needing an emulator, so it can
 * run on every PR in the existing ubuntu mobile-checks job. Catches the cheap-but-common
 * breakages that otherwise only surface on a device: wrong/missing appId, drift from the
 * real bundle id, empty/malformed flows, and a missing critical-path flow.
 *
 * This is the fast tier under the (heavier, emulator-based) Maestro run. It does not replace
 * running the flows — it guarantees they are structurally valid and target the real app
 * before the expensive tier ever boots.
 */
const fs = require('fs');
const path = require('path');

const APP_DIR = path.resolve(__dirname, '..');
const FLOW_DIR = path.join(APP_DIR, '.maestro');

// Critical user journeys that MUST always have a flow. Adding a journey here makes its
// absence a CI failure — the point is that these can never silently disappear.
const REQUIRED_FLOWS = [
  'launch',
  'chat',
  'approvals',
  'navigation',
  'ship-guard',
  'chat-send-persistence',
  'regression-default-hermes-tab',
  'regression-glanceable-tab',
  'regression-chat-send-visible',
  'regression-leash-refresh',
  'regression-chat-header-model',
  'regression-composer-typeable',
  'stranger-cold-start',
  'fresh-user-suite',
  'fresh-user-cold-start',
  'fresh-user-tabs',
  'fresh-user-leash-paywall',
  'wrong-key-repair',
  'tailscale-profile-disconnected-copy',
  'picker-two-machines',
  'pairCode-deep-link',
];

function bundleIdFromAppJson() {
  const app = JSON.parse(fs.readFileSync(path.join(APP_DIR, 'app.json'), 'utf8'));
  const android = app.expo?.android?.package;
  const ios = app.expo?.ios?.bundleIdentifier;
  if (!android || !ios) throw new Error('app.json missing android.package or ios.bundleIdentifier');
  if (android !== ios) {
    // Not fatal, but flows use one appId — warn so a divergence is visible.
    console.warn(`  warn: android.package (${android}) !== ios.bundleIdentifier (${ios})`);
  }
  return android;
}

function main() {
  const errors = [];
  if (!fs.existsSync(FLOW_DIR)) {
    console.error('FAIL: .maestro/ directory not found');
    process.exit(1);
  }
  const bundleId = bundleIdFromAppJson();
  const files = fs.readdirSync(FLOW_DIR).filter((f) => f.endsWith('.yaml') || f.endsWith('.yml'));
  if (files.length === 0) errors.push('.maestro/ has no flow files');

  for (const file of files) {
    const full = path.join(FLOW_DIR, file);
    const text = fs.readFileSync(full, 'utf8');
    if (text.trim().length === 0) {
      errors.push(`${file}: empty flow`);
      continue;
    }
    const appIdLine = text.split(/\r?\n/).find((l) => /^appId:/.test(l.trim()));
    if (!appIdLine) {
      errors.push(`${file}: missing 'appId:' declaration`);
      continue;
    }
    const appId = appIdLine.replace(/^appId:/, '').trim().replace(/['"]/g, '');
    if (appId !== bundleId) {
      errors.push(`${file}: appId '${appId}' does not match app bundle id '${bundleId}'`);
    }
    // A flow with only an appId and no steps is a no-op that passes vacuously on device.
    if (!/^---/m.test(text) || text.split(/^---/m)[1]?.trim().length === 0) {
      errors.push(`${file}: has appId but no flow steps after the '---' separator`);
    }
  }

  const names = files.map((f) => f.replace(/\.(ya?ml)$/, ''));
  for (const required of REQUIRED_FLOWS) {
    if (!names.some((n) => n === required || n.startsWith(`${required}-`) || n.startsWith(`${required}.`))) {
      errors.push(`missing REQUIRED critical-path flow: ${required}.yaml`);
    }
  }

  if (errors.length > 0) {
    console.error(`Maestro flow validation FAILED (${errors.length} issue${errors.length > 1 ? 's' : ''}):`);
    for (const e of errors) console.error(`  - ${e}`);
    process.exit(1);
  }
  console.log(`Maestro flow validation OK: ${files.length} flows, all target ${bundleId}, all critical flows present.`);
}

main();
