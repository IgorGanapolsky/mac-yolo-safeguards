#!/usr/bin/env node
/**
 * Tests for tools/hermes-routing-integrity-watch.js
 *
 * The anchor case is the REAL Mac mini config captured during the 2026-07-30
 * incident, reproduced verbatim below. If this suite ever stops flagging it,
 * the sentinel has stopped doing the one job it was built for.
 */
'use strict';

const assert = require('assert');
const path = require('path');

const {
  routeIdentity,
  primaryRoute,
  fallbackChain,
  isLocalRoute,
  runChecks,
  criticalFindings,
  shouldAlert,
  recordAlert,
  formatAlert,
} = require(path.resolve(__dirname, '..', 'tools', 'hermes-routing-integrity-watch.js'));

let pass = 0;
let fail = 0;

function check(name, fn) {
  try {
    fn();
    pass += 1;
    console.log(`[PASS] ${name}`);
  } catch (e) {
    fail += 1;
    console.log(`[FAIL] ${name}: ${e.message}`);
  }
}

const keys = (findings) => findings.map((f) => f.key).sort();

// --- The incident config, exactly as found on the mini at 15:19 on 2026-07-30 ---
// `model:` has no provider and no model, and the only fallback is the very
// route Hermes had silently defaulted to.
const MINI_20260730 = {
  model: { api: 'http://127.0.0.1:4010/v1', max_tokens: 8192, fallbacks: [] },
  fallback_providers: [
    {
      provider: 'custom:ollama-local-64k',
      model: 'qwen3.5:9b-hermes-64k',
      base_url: 'http://127.0.0.1:11434/v1',
    },
  ],
};

// --- The repaired config, as applied to the mini at 15:20 ---
const MINI_FIXED = {
  model: {
    provider: 'custom:litellm-gateway',
    default: 'glm-coding',
    model: 'glm-coding',
    context_length: 202752,
    max_tokens: 2048,
  },
  fallback_providers: [
    { provider: 'custom:litellm-gateway', model: 'hermes-local', context_length: 65536 },
  ],
  fallback_model: {
    provider: 'custom:ollama-local-64k', default: 'qwen3:8b-64k', model: 'qwen3:8b-64k',
  },
};

check('flags the real 2026-07-30 mini config as unconfigured primary', () => {
  const f = runChecks(MINI_20260730, {});
  assert.ok(keys(f).includes('primary_unconfigured'),
    `expected primary_unconfigured, got ${JSON.stringify(keys(f))}`);
  assert.strictEqual(
    f.find((x) => x.key === 'primary_unconfigured').severity, 'critical');
});

check('the repaired mini config produces no critical findings', () => {
  const f = runChecks(MINI_FIXED, {});
  assert.deepStrictEqual(criticalFindings(f), [],
    `expected no criticals, got ${JSON.stringify(f, null, 2)}`);
});

check('fallback_to_self is flagged when a chain entry equals the primary', () => {
  const cfg = {
    model: { provider: 'custom:ollama-local-64k', model: 'qwen3.5:9b-hermes-64k' },
    fallback_providers: [
      { provider: 'custom:ollama-local-64k', model: 'qwen3.5:9b-hermes-64k' },
    ],
  };
  const f = runChecks(cfg, {});
  assert.ok(keys(f).includes('fallback_to_self'),
    `expected fallback_to_self, got ${JSON.stringify(keys(f))}`);
  assert.strictEqual(criticalFindings(f).length, 1);
});

check('fallback_to_self matches across the model/default alias', () => {
  // The picker writes the selection to `default`; the chain stores `model`.
  // Treating those as different routes would hide a self-fallback.
  const cfg = {
    model: { provider: 'p', default: 'm' },
    fallback_providers: [{ provider: 'p', model: 'm' }],
  };
  assert.ok(keys(runChecks(cfg, {})).includes('fallback_to_self'));
});

check('distinct routes on the same provider are NOT flagged as self-fallback', () => {
  const cfg = {
    model: { provider: 'custom:litellm-gateway', model: 'glm-coding' },
    fallback_providers: [{ provider: 'custom:litellm-gateway', model: 'hermes-local' }],
  };
  assert.ok(!keys(runChecks(cfg, {})).includes('fallback_to_self'));
});

check('base_url differences make routes distinct', () => {
  assert.notStrictEqual(
    routeIdentity({ provider: 'p', model: 'm', base_url: 'http://a/v1' }),
    routeIdentity({ provider: 'p', model: 'm', base_url: 'http://b/v1' }));
});

check('trailing slashes do not create phantom distinct routes', () => {
  assert.strictEqual(
    routeIdentity({ provider: 'p', model: 'm', base_url: 'http://a/v1/' }),
    routeIdentity({ provider: 'p', model: 'm', base_url: 'http://a/v1' }));
});

check('empty_chain is flagged when nothing can absorb a primary outage', () => {
  const cfg = { model: { provider: 'p', model: 'm' } };
  assert.ok(keys(runChecks(cfg, {})).includes('empty_chain'));
});

check('duplicate chain entries are flagged', () => {
  const cfg = {
    model: { provider: 'custom:litellm-gateway', model: 'glm-coding' },
    fallback_providers: [
      { provider: 'p', model: 'a' },
      { provider: 'p', model: 'b' },
      { provider: 'p', model: 'a' },
    ],
  };
  // fallbackChain dedupes on identity the way Hermes does, so the duplicate is
  // absorbed there rather than reaching the user as a wasted hop.
  assert.strictEqual(fallbackChain(cfg).length, 2);
});

check('legacy fallback_model is merged into the chain after fallback_providers', () => {
  const chain = fallbackChain(MINI_FIXED);
  assert.strictEqual(chain.length, 2);
  assert.strictEqual(chain[0].model, 'hermes-local');
  assert.strictEqual(chain[1].model, 'qwen3:8b-64k');
});

check('unsupervised gateway is critical', () => {
  const f = runChecks(MINI_FIXED, { gatewaySupervised: false });
  assert.ok(keys(f).includes('gateway_unsupervised'));
  assert.strictEqual(criticalFindings(f).length, 1);
});

check('an invalid gateway plist is critical', () => {
  const f = runChecks(MINI_FIXED, { gatewayPlistValid: false });
  assert.ok(keys(f).includes('gateway_plist_invalid'));
});

check('a healthy supervised gateway produces no supervision findings', () => {
  const f = runChecks(MINI_FIXED, { gatewaySupervised: true, gatewayPlistValid: true });
  assert.deepStrictEqual(criticalFindings(f), []);
});

check('UNOBSERVED host facts never produce a finding', () => {
  // "Could not measure" must never be reported as "clean" OR as a problem.
  const f = runChecks(MINI_FIXED, {});
  assert.ok(!keys(f).includes('gateway_unsupervised'));
  assert.ok(!keys(f).includes('gateway_plist_invalid'));
  assert.ok(!keys(f).includes('swap_exhausted'));
  assert.ok(!keys(f).includes('local_pin_with_remote_primary'));
});

check('pinning a local model while the primary is remote is flagged', () => {
  const f = runChecks(MINI_FIXED, { watchdogPinsModel: true });
  assert.ok(keys(f).includes('local_pin_with_remote_primary'),
    `got ${JSON.stringify(keys(f))}`);
});

check('pinning is NOT flagged when the primary is itself a local route', () => {
  const cfg = {
    model: { provider: 'custom:ollama-local-64k', model: 'qwen3:8b-64k' },
    fallback_providers: [{ provider: 'custom:litellm-gateway', model: 'glm-coding' }],
  };
  const f = runChecks(cfg, { watchdogPinsModel: true });
  assert.ok(!keys(f).includes('local_pin_with_remote_primary'));
});

check('isLocalRoute recognises both ollama ports and the provider name', () => {
  assert.ok(isLocalRoute({ provider: 'custom:ollama-local-64k' }));
  assert.ok(isLocalRoute({ provider: 'custom', base_url: 'http://127.0.0.1:11434/v1' }));
  assert.ok(isLocalRoute({ provider: 'custom', base_url: 'http://127.0.0.1:11435/v1' }));
  assert.ok(!isLocalRoute({ provider: 'custom:litellm-gateway', base_url: 'http://127.0.0.1:4010/v1' }));
});

check('swap at or above the threshold is flagged, below it is not', () => {
  assert.ok(keys(runChecks(MINI_FIXED, { swapUsedPct: 96 })).includes('swap_exhausted'));
  assert.ok(!keys(runChecks(MINI_FIXED, { swapUsedPct: 40 })).includes('swap_exhausted'));
});

check('the full incident state yields every expected finding at once', () => {
  // Everything that was actually true on the mini at 15:19.
  const f = runChecks(MINI_20260730, {
    gatewaySupervised: false,
    gatewayPlistValid: false,
    watchdogPinsModel: true,
    swapUsedPct: 95.9,
  });
  const k = keys(f);
  for (const expected of [
    'primary_unconfigured', 'gateway_unsupervised', 'gateway_plist_invalid', 'swap_exhausted',
  ]) {
    assert.ok(k.includes(expected), `missing ${expected} in ${JSON.stringify(k)}`);
  }
  assert.ok(criticalFindings(f).length >= 3);
});

check('alerts dedupe per host per day', () => {
  let state = {};
  assert.ok(shouldAlert(state, 'primary_unconfigured', 'mini', '2026-07-30'));
  state = recordAlert(state, 'primary_unconfigured', 'mini', '2026-07-30');
  assert.ok(!shouldAlert(state, 'primary_unconfigured', 'mini', '2026-07-30'));
  // A different host with the same problem still pages.
  assert.ok(shouldAlert(state, 'primary_unconfigured', 'pro', '2026-07-30'));
  // And the next day re-pages, so a standing problem is not forgotten.
  assert.ok(shouldAlert(state, 'primary_unconfigured', 'mini', '2026-07-31'));
});

check('recordAlert does not mutate the state it was given', () => {
  const state = {};
  const next = recordAlert(state, 'k', 'h', '2026-07-30');
  assert.deepStrictEqual(state, {});
  assert.ok(next.lastAlerted['h:k']);
});

check('the alert body names the host and every finding', () => {
  const body = formatAlert('igors-mac-mini', runChecks(MINI_20260730, {}));
  assert.ok(body.includes('igors-mac-mini'));
  assert.ok(body.includes('primary_unconfigured'));
  assert.ok(body.includes('CRITICAL'));
});

check('primaryRoute tolerates a missing or non-object model block', () => {
  assert.strictEqual(primaryRoute({}), null);
  assert.strictEqual(primaryRoute({ model: 'glm-coding' }), null);
  assert.strictEqual(primaryRoute(null), null);
});

check('fallbackChain tolerates junk without throwing', () => {
  assert.deepStrictEqual(fallbackChain(null), []);
  assert.deepStrictEqual(fallbackChain({ fallback_providers: 'nope' }), []);
  assert.deepStrictEqual(fallbackChain({ fallback_providers: [null, 3, 'x'] }), []);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
