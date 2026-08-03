#!/usr/bin/env node
'use strict';

const assert = require('assert');
const { load, validate, toMarkdown } = require('../tools/ai-services-catalog');
const { collect } = require('../tools/agent-anomaly-detect');

function test(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (e) {
    console.error(`FAIL ${name}`, e.message);
    process.exitCode = 1;
  }
}

test('catalog loads 5 services', () => {
  const c = load();
  assert.strictEqual(c.services.length, 5);
  assert.strictEqual(c.journey.length, 3);
});

test('catalog validates', () => {
  const errors = validate(load());
  assert.deepStrictEqual(errors, [], errors.join('; '));
});

test('markdown includes District attribution', () => {
  const md = toMarkdown(load());
  assert.ok(md.includes('District'));
  assert.ok(md.includes('Anomaly') || md.includes('anomaly') || md.includes('Full-Cycle'));
});

test('anomaly detect returns structure', () => {
  const r = collect();
  assert.ok(typeof r.ok === 'boolean');
  assert.ok(Array.isArray(r.anomalies));
  assert.ok(r.serviceId === 'agent-anomaly-detection');
  assert.ok(r.districtAnalog.includes('Anomaly'));
});

console.log('test-ai-services-catalog: done');
