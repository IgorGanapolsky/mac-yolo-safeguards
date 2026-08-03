#!/usr/bin/env node
'use strict';

const assert = require('assert');
const {
  scanMegafileHits,
  hasDecisionCite,
  buildReport,
  loadMegafiles,
} = require('../tools/megafile-risk-scan');

function test(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (e) {
    console.error(`FAIL ${name}`);
    console.error(e.stack || e.message);
    process.exitCode = 1;
  }
}

test('loadMegafiles non-empty', () => {
  assert.ok(loadMegafiles().length >= 5);
  assert.ok(loadMegafiles().some((m) => m.includes('ChatScreen')));
});

test('scanMegafileHits exact', () => {
  const hits = scanMegafileHits([
    'tools/foo.js',
    'hermes-mobile/src/screens/ChatScreen.tsx',
  ]);
  assert.strictEqual(hits.length, 1);
  assert.strictEqual(hits[0].megafile, 'hermes-mobile/src/screens/ChatScreen.tsx');
});

test('scanMegafileHits none', () => {
  assert.strictEqual(scanMegafileHits(['tools/coord-setup.js']).length, 0);
});

test('hasDecisionCite', () => {
  assert.ok(hasDecisionCite('See D-2026-08-03-coord in Decisions Log'));
  assert.ok(hasDecisionCite('plan.md ownership claimed'));
  assert.ok(!hasDecisionCite('lgtm ship it'));
});

test('buildReport require decision', () => {
  const r = buildReport({
    base: 'origin/main',
    paths: ['hermes-mobile/src/components/ConnectMacGate.tsx'],
    bodyText: 'no cite',
  });
  assert.strictEqual(r.hitCount, 1);
  assert.strictEqual(r.ok, false);
  const r2 = buildReport({
    base: 'origin/main',
    paths: ['hermes-mobile/src/components/ConnectMacGate.tsx'],
    bodyText: 'D-2026-08-03-megafile-ok',
  });
  assert.strictEqual(r2.ok, true);
});

console.log('test-megafile-risk-scan: done');
