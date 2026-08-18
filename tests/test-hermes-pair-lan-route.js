#!/usr/bin/env node
'use strict';

/**
 * Regression tests for tools/hermes-mobile-pair.js route election.
 *
 * P0 2026-08-13: a phone on the same Wi-Fi as the Mac could not connect. The pair server
 * preferred Tailscale unconditionally whenever the Mac had a tailnet IP, so it advertised
 * http://100.87.85.85:8642 to a phone with the Tailscale VPN switched OFF. The LAN branch
 * in resolvePhoneReachablePairServerUrl was unreachable dead code.
 *
 * The fix answers on the interface the request arrived on. These tests pin that decision
 * table so the Tailscale-always behaviour cannot come back.
 */

const assert = require('assert');

const {
  isCgnatIpv4,
  normalizeRemoteIp,
  isLanClient,
  withGatewayHost,
  resolveClientGatewayUrl,
  buildRouteAlternates,
} = require('../tools/hermes-mobile-pair.js');

let pass = 0;
let fail = 0;
function check(name, fn) {
  try {
    fn();
    pass += 1;
    console.log(`  [PASS] ${name}`);
  } catch (err) {
    fail += 1;
    console.log(`  [FAIL] ${name}: ${err.message}`);
  }
}

console.log('hermes-mobile-pair route election');

// ---------------------------------------------------------------- classifiers
check('CGNAT range 100.64/10 is recognised as tailnet', () => {
  assert.strictEqual(isCgnatIpv4('100.87.85.85'), true);
  assert.strictEqual(isCgnatIpv4('100.64.0.1'), true);
  assert.strictEqual(isCgnatIpv4('100.127.255.254'), true);
});

check('public 100.x outside CGNAT is not tailnet', () => {
  assert.strictEqual(isCgnatIpv4('100.63.255.255'), false);
  assert.strictEqual(isCgnatIpv4('100.128.0.1'), false);
});

check('IPv4-mapped IPv6 peers are normalised', () => {
  assert.strictEqual(normalizeRemoteIp('::ffff:172.29.12.116'), '172.29.12.116');
  assert.strictEqual(normalizeRemoteIp('172.29.12.116'), '172.29.12.116');
  assert.strictEqual(normalizeRemoteIp(undefined), '');
});

check('LAN clients are recognised across all RFC1918 ranges', () => {
  assert.strictEqual(isLanClient('172.29.12.116'), true); // the office network
  assert.strictEqual(isLanClient('192.168.1.42'), true);
  assert.strictEqual(isLanClient('10.0.0.7'), true);
  assert.strictEqual(isLanClient('::ffff:192.168.1.42'), true);
});

check('tailnet, loopback and unknown peers are NOT LAN clients', () => {
  assert.strictEqual(isLanClient('100.87.85.85'), false); // Tailscale — already correct
  assert.strictEqual(isLanClient('127.0.0.1'), false); // adb reverse — USB path owns it
  assert.strictEqual(isLanClient(''), false);
  assert.strictEqual(isLanClient(undefined), false);
});

// ------------------------------------------------------------------ url swap
check('withGatewayHost swaps host only, preserving scheme and port', () => {
  assert.strictEqual(
    withGatewayHost('http://100.87.85.85:8642', '172.29.12.111'),
    'http://172.29.12.111:8642',
  );
  assert.strictEqual(withGatewayHost('not a url', '172.29.12.111'), 'not a url');
});

// -------------------------------------------------------------- the P0 itself
const TAILSCALE_SEED = { gatewayUrl: 'http://100.87.85.85:8642' };
const LAN_IP = '172.29.12.111';

check('P0: a Wi-Fi phone gets the LAN gateway, not the tailnet one', () => {
  assert.strictEqual(
    resolveClientGatewayUrl(TAILSCALE_SEED, LAN_IP, '172.29.12.116'),
    'http://172.29.12.111:8642',
  );
});

check('a phone on the tailnet still gets the tailnet gateway', () => {
  assert.strictEqual(
    resolveClientGatewayUrl(TAILSCALE_SEED, LAN_IP, '100.87.85.90'),
    'http://100.87.85.85:8642',
  );
});

check('an unknown/cellular peer keeps the canonical answer', () => {
  assert.strictEqual(
    resolveClientGatewayUrl(TAILSCALE_SEED, LAN_IP, undefined),
    'http://100.87.85.85:8642',
  );
});

check('P0 2026-08-18: Wi-Fi phone never receives USB loopback primary', () => {
  const usbSeed = { gatewayUrl: 'http://127.0.0.1:8642' };
  assert.strictEqual(
    resolveClientGatewayUrl(usbSeed, LAN_IP, '172.29.12.116'),
    'http://172.29.12.111:8642',
  );
});

check('USB/loopback peer still keeps loopback canonical', () => {
  const usbSeed = { gatewayUrl: 'http://127.0.0.1:8642' };
  assert.strictEqual(
    resolveClientGatewayUrl(usbSeed, LAN_IP, '127.0.0.1'),
    'http://127.0.0.1:8642',
  );
});

check('USB primary still publishes LAN + Tailscale alternates', () => {
  const usbSeed = { gatewayUrl: 'http://127.0.0.1:8642' };
  const alts = buildRouteAlternates(usbSeed, LAN_IP);
  assert.strictEqual(alts.lanGatewayUrl, 'http://172.29.12.111:8642');
  assert.strictEqual(alts.usbGatewayUrl, 'http://127.0.0.1:8642');
  // tailscaleGatewayUrl present only when this Mac has a tailnet IP — optional
  assert.ok(!('tailscaleGatewayUrl' in alts) || String(alts.tailscaleGatewayUrl).includes('100.'));
});

check('an unusable LAN IP falls back to the canonical answer', () => {
  assert.strictEqual(
    resolveClientGatewayUrl(TAILSCALE_SEED, '127.0.0.1', '172.29.12.116'),
    'http://100.87.85.85:8642',
  );
  assert.strictEqual(
    resolveClientGatewayUrl(TAILSCALE_SEED, '', '172.29.12.116'),
    'http://100.87.85.85:8642',
  );
});

check('a seed with no gateway stays empty rather than inventing one', () => {
  assert.strictEqual(resolveClientGatewayUrl({}, LAN_IP, '172.29.12.116'), '');
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
