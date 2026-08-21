const test = require('node:test');
const assert = require('node:assert/strict');
const { checkConnection, runMacro } = require('../tools/meta-glasses-hermes-bridge');

test('checks meta glasses bluetooth status', () => {
  const status = checkConnection();
  assert.equal(typeof status.connected, 'boolean');
  assert.equal(status.deviceName, 'RB Meta 00F1');
  assert.equal(status.mac, '80-aa-1c-19-61-c1');
});

test('executes macro commands cleanly', () => {
  const res = runMacro('echo OPENCLAW_OK');
  assert.equal(res.ok, true);
  assert.equal(res.output, 'OPENCLAW_OK');
});
