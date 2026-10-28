#!/usr/bin/env node
'use strict';

const assert = require('assert');
const { linePromotesAppStore, normalizeIosResultCount } = require('../tools/check-store-links');

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

test('still counts an App Store URL on a line that says it is not public', () => {
  assert.strictEqual(
    linePromotesAppStore('not public https://apps.apple.com/us/app/hermes/id1'),
    true
  );
  assert.strictEqual(
    linePromotesAppStore('https://Apps.Apple.com/us/app/hermes/id1'),
    true
  );
});

test('treats a missing or invalid iTunes resultCount as unknown', () => {
  assert.strictEqual(normalizeIosResultCount(0), 0);
  assert.strictEqual(normalizeIosResultCount(2), 2);
  assert.strictEqual(normalizeIosResultCount(null), null);
  assert.strictEqual(normalizeIosResultCount(undefined), null);
  assert.strictEqual(normalizeIosResultCount('0'), null);
  assert.strictEqual(normalizeIosResultCount(-1), null);
  assert.strictEqual(normalizeIosResultCount(1.5), null);
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
