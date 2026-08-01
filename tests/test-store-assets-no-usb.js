#!/usr/bin/env node
/**
 * Store assets must never advertise USB.
 *
 * Found 2026-08-01 from a Play Store screenshot the owner sent: the FIRST
 * screenshot a buyer sees read "Home Wi-Fi, Tailscale, or USB", and the mockup
 * inside it listed a machine row "Build server · USB".
 *
 * Two problems, not one:
 *  1. The owner's standing rule is that USB never appears in the product.
 *  2. It is now factually FALSE. The Mac-side adb reverse tunnel was removed and
 *     the launchd service that recreated it disabled, so the store was selling a
 *     transport the product no longer uses.
 *
 * App copy has its own guards; this covers the store surface, which is generated
 * separately and so was missed by all of them.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.resolve(__dirname, '..');
const TARGETS = [
  'hermes-mobile/scripts/generate-store-screenshots.py',
  'hermes-mobile/docs/store-assets/generated-manifest.json',
  'hermes-mobile/docs/store-assets/SCREENSHOT-STORYBOARD.md',
];

let pass = 0;
let fail = 0;
const check = (name, fn) => {
  try { fn(); pass += 1; console.log(`[PASS] ${name}`); }
  catch (e) { fail += 1; console.log(`[FAIL] ${name}: ${e.message}`); }
};

// Case-insensitive whole-word USB. Avoids matching identifiers that merely
// contain the letters.
const USB = /\bUSB\b/i;

for (const rel of TARGETS) {
  check(`no USB in ${rel}`, () => {
    const full = path.join(ROOT, rel);
    assert.ok(fs.existsSync(full), `missing target: ${rel}`);
    const src = fs.readFileSync(full, 'utf8');
    const offenders = src
      .split('\n')
      .map((line, i) => ({ line: line.trim(), n: i + 1 }))
      .filter(({ line }) => USB.test(line));
    assert.deepStrictEqual(
      offenders, [],
      `USB found:\n${offenders.map((o) => `  ${rel}:${o.n}  ${o.line}`).join('\n')}`,
    );
  });
}

check('the matcher discriminates — guard against a vacuous pass', () => {
  assert.ok(USB.test('Home Wi-Fi, Tailscale, or USB'), 'must catch the shipped caption');
  assert.ok(USB.test('        "USB",'), 'must catch the machine row');
  assert.ok(!USB.test('Home Wi-Fi or Tailscale'), 'must not flag the corrected caption');
  assert.ok(!USB.test('busbar'), 'must not flag substrings');
});

check('the corrected caption is actually present', () => {
  const src = fs.readFileSync(
    path.join(ROOT, 'hermes-mobile/scripts/generate-store-screenshots.py'), 'utf8');
  assert.ok(src.includes('Home Wi-Fi or Tailscale'),
    'generator should carry the corrected subtitle');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
