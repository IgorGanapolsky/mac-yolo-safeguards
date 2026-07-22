#!/usr/bin/env node
'use strict';

const assert = require('assert');
const { PROD_CLIENT_ID, STAGING_CLIENT_ID, PROD_AUTHKIT_HOST, EXPECTED_METHODS } = require('../tools/workos-production-guard');

function test(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    console.error(`FAIL ${name}`);
    console.error(error.stack || error.message);
    process.exitCode = 1;
  }
}

test('exports stable production client and authkit host constants', () => {
  assert.match(PROD_CLIENT_ID, /^client_/);
  assert.match(STAGING_CLIENT_ID, /^client_/);
  assert.notStrictEqual(PROD_CLIENT_ID, STAGING_CLIENT_ID);
  assert.match(PROD_AUTHKIT_HOST, /authkit\.app$/);
  assert.doesNotMatch(PROD_AUTHKIT_HOST, /staging/i);
});

test('guard module loads', () => {
  const mod = require('../tools/workos-production-guard');
  assert.equal(typeof mod.check, 'function');
});

test('expected sign-in methods are non-empty with lowercase markers', () => {
  assert.ok(Array.isArray(EXPECTED_METHODS));
  assert.ok(EXPECTED_METHODS.length > 0);
  for (const method of EXPECTED_METHODS) {
    assert.equal(typeof method.name, 'string');
    assert.equal(method.marker, method.marker.toLowerCase());
  }
});
