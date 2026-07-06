const assert = require('assert');
const { shouldSendDeveloperLeashUnlock } = require('../tools/hermes-mobile-pair.js');

function testDefaultPairingDoesNotAutoUnlock() {
  assert.strictEqual(shouldSendDeveloperLeashUnlock(new Set()), false);
  assert.strictEqual(shouldSendDeveloperLeashUnlock(new Set(['--no-adb', '--open'])), false);
}

function testExplicitDevUnlockFlag() {
  assert.strictEqual(shouldSendDeveloperLeashUnlock(new Set(['--dev-unlock'])), true);
  assert.strictEqual(
    shouldSendDeveloperLeashUnlock(new Set(['--dev-unlock', '--no-serve'])),
    true,
  );
}

function main() {
  testDefaultPairingDoesNotAutoUnlock();
  testExplicitDevUnlockFlag();
  console.log('test-hermes-mobile-pair: ok');
}

main();
