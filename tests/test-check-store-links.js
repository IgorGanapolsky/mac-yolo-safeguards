#!/usr/bin/env node
'use strict';

const assert = require('assert');
const { linePromotesAppStore } = require('../tools/check-store-links');

function test(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`, error.message);
    process.exitCode = 1;
  }
}

test('promotes a real App Store URL', () => {
  assert.strictEqual(
    linePromotesAppStore('Get it: https://apps.apple.com/us/app/hermes/id6786778037'),
    true
  );
  assert.strictEqual(
    linePromotesAppStore('lookup https://itunes.apple.com/lookup?bundleId=com.example'),
    true
  );
});

test('ignores a host that is only a substring or a lookalike', () => {
  assert.strictEqual(
    linePromotesAppStore('https://evil.example/path?next=https://apps.apple.com'),
    false
  );
  assert.strictEqual(linePromotesAppStore('https://apps.apple.com.evil.example/app'), false);
  assert.strictEqual(linePromotesAppStore('https://notapps.apple.com/app'), false);
  assert.strictEqual(
    linePromotesAppStore('Not on the public US App Store (listing returned 404).'),
    false
  );
});

if (process.exitCode) process.exit(process.exitCode);
