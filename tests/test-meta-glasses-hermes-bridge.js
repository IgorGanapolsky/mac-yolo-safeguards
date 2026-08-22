const test = require('node:test');
const assert = require('node:assert/strict');
const bridge = require('../tools/meta-glasses-hermes-bridge');

test('checkConnection returns a result object', () => {
  const status = bridge.checkConnection();
  assert.equal(typeof status.connected, 'boolean');
  assert.equal(typeof status.rail, 'string');
  assert.equal(typeof status.metaAiOwnsWakeWord, 'boolean');
  // device identity is always present; Mac BT details may be nested under status.mac
  if (status.connected) {
    assert.equal(status.deviceName, 'RB Meta 00F1');
    assert.equal(status.macAddress, '80-aa-1c-19-61-c1');
  }
});

test('ensureConnected returns a connection status', () => {
  const status = bridge.ensureConnected();
  assert.equal(typeof status.connected, 'boolean');
});

test('phone-only policy is the default and never Mac-steals under ensureConnected', () => {
  assert.equal(bridge.PHONE_ONLY_BT, true);
  const fs = require('fs');
  const src = fs.readFileSync(__dirname + '/../tools/meta-glasses-hermes-bridge.js', 'utf8');
  assert.ok(src.includes('PHONE_ONLY_BT'), 'must define PHONE_ONLY_BT');
  assert.ok(src.includes('releaseMacGlassesBond'), 'must be able to release Mac bond');
  // Default path must not instruct blueutil --connect unless escape hatch is set.
  assert.ok(
    /HERMES_GLASSES_PHONE_ONLY !== '0'/.test(src),
    'Mac --connect must be behind HERMES_GLASSES_PHONE_ONLY=0 escape hatch',
  );
  const status = bridge.ensureConnected();
  assert.equal(status.phoneOnly, true);
  assert.ok(status.macRelease);
  assert.equal(status.mac?.connected, false, 'Mac must not hold glasses after ensureConnected');
});

test('releaseMacGlassesBond is exported and safe when unpaired', () => {
  const res = bridge.releaseMacGlassesBond();
  assert.equal(res.ok, true);
  assert.equal(res.mac, bridge.META_BT_MAC);
  assert.ok(Array.isArray(res.actions));
});

test('captureScreen returns an ok-flagged result (mockable on CI)', () => {
  const res = bridge.captureScreen();
  assert.equal('ok' in res, true);
  // On macOS screencapture works; on Linux CI it fails gracefully
  if (res.ok) {
    assert.ok(res.base64, 'base64 should be present when ok');
    assert.ok(res.bytes > 0, 'bytes should be positive when ok');
  }
});

test('runMacro executes shell commands cleanly', () => {
  const res = bridge.runMacro('echo OPENCLAW_OK');
  assert.equal(res.ok, true);
  assert.equal(res.output, 'OPENCLAW_OK');
});

test('runMacro returns failure on bad command', () => {
  const res = bridge.runMacro('exit 1');
  assert.equal(res.ok, false);
  assert.ok(res.error, 'should have error message');
});

test('speakToGlasses handles empty text gracefully', () => {
  // Should not throw
  bridge.speakToGlasses('');
  bridge.speakToGlasses(null);
  bridge.speakToGlasses(undefined);
});

test('speakToGlasses accepts a voice parameter', () => {
  // Should not throw — 'say' may or may not be available
  bridge.speakToGlasses('test message', 'Alex');
});

test('queryHermesVision returns a Promise', async () => {
  const result = bridge.queryHermesVision('what is this?', false);
  assert.equal(typeof result.then, 'function');
});

test('queryHermesVision handles gateway disconnect gracefully', async () => {
  // LiteLLM gateway is likely down on CI — should return ok:false, not throw
  const res = await bridge.queryHermesVision('hello', false);
  assert.equal('ok' in res, true);
  if (!res.ok) {
    assert.ok(res.error, 'should have error when gateway is down');
  }
});

test('inference system prompt mentions glasses output', () => {
  const fs = require('fs');
  const src = fs.readFileSync(__dirname + '/../tools/meta-glasses-hermes-bridge.js', 'utf8');
  assert.ok(src.includes('open-ear speakers'), 'should mention open-ear speakers');
  assert.ok(src.includes('ultra-concise'), 'should mention ultra-concise');
});

test('inference includes screen image as JPEG data URI', () => {
  const fs = require('fs');
  const src = fs.readFileSync(__dirname + '/../tools/meta-glasses-hermes-bridge.js', 'utf8');
  assert.ok(src.includes('data:image/jpeg'), 'should encode screen as JPEG data URI');
  assert.ok(src.includes('includeScreen'), 'should support includeScreen parameter');
});

test('checkOpenClawStatus returns a Promise resolving to a status object', async () => {
  const result = bridge.checkOpenClawStatus();
  assert.equal(typeof result.then, 'function');
  const res = await result;
  assert.equal('reachable' in res, true);
  assert.equal('ok' in res, true);
});

test('dispatchBrowserAction returns a Promise', () => {
  const result = bridge.dispatchBrowserAction('open gmail');
  assert.equal(typeof result.then, 'function');
});

test('dispatchBrowserAction handles control plane disconnect gracefully', async () => {
  // Control plane is likely down on CI
  const res = await bridge.dispatchBrowserAction('open gmail');
  assert.equal('ok' in res, true);
  if (!res.ok) {
    assert.ok(res.error, 'should have error when control plane is down');
  }
});

test('dispatchOpenClawAction is exported and callable', () => {
  assert.equal(typeof bridge.dispatchOpenClawAction, 'function');
});

test('bridge exports OpenClaw functions', () => {
  assert.equal(typeof bridge.checkOpenClawStatus, 'function');
  assert.equal(typeof bridge.dispatchBrowserAction, 'function');
  assert.equal(typeof bridge.dispatchOpenClawAction, 'function');
});
