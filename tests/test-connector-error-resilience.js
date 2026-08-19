const assert = require('node:assert/strict');
const test = require('node:test');
const { retryWithBackoff } = require('../tools/hermes-cloud-connector.js');

test('retryWithBackoff retries with growing delay and returns the eventual result', async () => {
  let calls = 0;
  const started = Date.now();
  const result = await retryWithBackoff(async () => {
    calls += 1;
    if (calls < 3) throw new Error('transient');
    return 'ok';
  }, { initialMs: 5, maxMs: 40, label: 'test' });
  assert.equal(result, 'ok');
  assert.equal(calls, 3);
  assert.ok(Date.now() - started >= 10);
});

test('retryWithBackoff caps the delay at maxMs', async () => {
  let calls = 0;
  await retryWithBackoff(async () => {
    calls += 1;
    if (calls < 5) throw new Error('transient');
    return true;
  }, { initialMs: 1, maxMs: 2, label: 'test' });
  assert.equal(calls, 5);
});
