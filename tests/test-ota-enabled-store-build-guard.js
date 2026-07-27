#!/usr/bin/env node
// The Android binary live on Play (v1.4/vc19) was built during the Expo billing freeze with
// updates.enabled=false + checkAutomatically=NEVER — those users can never receive a hotfix.
// It nearly recurred on 2026-07-27: the thaw was set as a GitHub Actions variable, but EAS
// builds read the EAS environment, where it was absent.
const assert = require('assert');
const { evaluateUpdates } = require('../hermes-mobile/scripts/assert-ota-enabled-for-store-build.js');

let failures = 0;
const check = (name, fn) => {
  try { fn(); console.log(`  ok   ${name}`); }
  catch (e) { failures += 1; console.error(`  FAIL ${name}: ${e.message}`); }
};

check('the exact shipped-binary config is flagged as OTA-incapable', () => {
  const v = evaluateUpdates({ updates: { enabled: false, checkAutomatically: 'NEVER' } });
  assert.strictEqual(v.willReceiveOta, false);
});

check('a thawed config is OTA-capable', () => {
  const v = evaluateUpdates({ updates: { enabled: true, checkAutomatically: 'ON_LOAD' } });
  assert.strictEqual(v.willReceiveOta, true);
});

check('enabled:true but checkAutomatically NEVER is still NOT capable', () => {
  // Half-thawed config would look fine to a careless eye.
  const v = evaluateUpdates({ updates: { enabled: true, checkAutomatically: 'NEVER' } });
  assert.strictEqual(v.willReceiveOta, false);
});

check('missing updates block is treated as capable (Expo default), not silently failing', () => {
  assert.strictEqual(evaluateUpdates({}).willReceiveOta, true);
});

console.log(failures ? `ota guard: ${failures} failed` : 'ota guard: all checks passed');
process.exit(failures ? 1 : 0);
