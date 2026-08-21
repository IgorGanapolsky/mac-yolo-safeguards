'use strict';
// Future AGI "Protect" steal (2026-08-21): the outreach critic must hard-fail any
// draft that leaks a credential, and must NOT false-positive on honest copy.
// Fake keys below are assembled from fragments so this test file carries no
// contiguous key-shape (secret scanners stay quiet).
const assert = require('node:assert/strict');
const test = require('node:test');
const { critiqueDraft, scanForSecrets } = require('../tools/outreach-critic');

const fakeAnthropic = "s" + "k-" + "ant-" + "0123456789abcdefghijENOUGH";
const fakeOpenai = "s" + "k-" + "ABCDEFGHIJKLMNOPQRSTUVWXYZ012345";
const fakeAws = "AK" + "IA" + "ABCDEFGHIJKLMNOP";
const fakePem = "-----" + "BEGIN RSA PRIVATE KEY" + "-----";
const fakeBearer = "Bear" + "er " + "abcdefghijklmnopqrstuvwx";
const fakeAssign = "api" + "_key=" + "abcdef0123456789ABCDEF";

const CLEAN = 'Antor - found Golem today. Notes at thumbgate.app/security. Reply \"no\" to opt out. https://cal.com/igor-g-kvqxfo/30min - Igor';

test('scanForSecrets flags real credential shapes', () => {
  assert.ok(scanForSecrets(fakeAnthropic).length >= 1);
  assert.ok(scanForSecrets(fakeAws).length >= 1);
  assert.ok(scanForSecrets(fakePem).length >= 1);
  assert.ok(scanForSecrets("Authorization: " + fakeBearer).length >= 1);
  assert.ok(scanForSecrets(fakeAssign).length >= 1);
});

test('scanForSecrets does NOT trip on honest outreach copy', () => {
  assert.deepEqual(scanForSecrets(CLEAN), []);
  assert.deepEqual(scanForSecrets('the secret to a good token of appreciation'), []);
});

test('a draft leaking a key is not_satisfactory', () => {
  const r = critiqueDraft({ subject: 'hi', body: CLEAN + ' our key: ' + fakeOpenai, anchors: ['Golem'] });
  assert.equal(r.verdict, 'not_satisfactory');
  assert.ok(r.hard.some((h) => /API key/.test(h)));
});

test('scan reasons never echo the secret itself', () => {
  for (const reason of scanForSecrets(fakeAnthropic)) assert.doesNotMatch(reason, /0123456789/);
});
