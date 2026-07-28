#!/usr/bin/env node
'use strict';

const assert = require('assert');
const {
  templateDraft,
  parseModelJson,
  normalizeOffer,
  buildDraft,
  parseArgs,
} = require('../tools/revenue-local-draft');

function test(name, fn) {
  try {
    const result = fn();
    if (result && typeof result.then === 'function') {
      return result
        .then(() => console.log(`PASS ${name}`))
        .catch((error) => {
          console.error(`FAIL ${name}`);
          console.error(error.stack || error.message);
          process.exitCode = 1;
        });
    }
    console.log(`PASS ${name}`);
    return Promise.resolve();
  } catch (error) {
    console.error(`FAIL ${name}`);
    console.error(error.stack || error.message);
    process.exitCode = 1;
    return Promise.resolve();
  }
}

async function main() {
  await test('normalizeOffer maps aliases', () => {
    assert.strictEqual(normalizeOffer('diagnostic'), 'diagnostic');
    assert.strictEqual(normalizeOffer('Hardening Sprint'), 'hardening');
    assert.strictEqual(normalizeOffer('Partner Pilot'), 'pilot');
  });

  await test('templateDraft includes payment url and offer amount', () => {
    const d = templateDraft({
      label: 'Acme',
      offer: 'diagnostic',
      notes: 'runaway loops on CI',
    });
    assert.strictEqual(d.ok, true);
    assert.strictEqual(d.source, 'template');
    assert.ok(d.subject.includes('Acme'));
    assert.ok(d.body.includes('http'));
    assert.strictEqual(d.gross_potential_usd, 499);
    assert.ok(d.payment_url.startsWith('http'));
  });

  await test('parseModelJson extracts fenced or raw JSON', () => {
    const a = parseModelJson('```json\n{"subject":"S","body":"B"}\n```');
    assert.strictEqual(a.subject, 'S');
    const b = parseModelJson('noise {"subject":"X","body":"Y"} tail');
    assert.strictEqual(b.body, 'Y');
    assert.strictEqual(parseModelJson('nope'), null);
  });

  await test('buildDraft forceTemplate is offline', async () => {
    const d = await buildDraft({
      label: 'Beta',
      offer: 'pilot',
      forceTemplate: true,
    });
    assert.strictEqual(d.source, 'template');
    assert.strictEqual(d.gross_potential_usd, 3000);
  });

  await test('parseArgs accepts flags', () => {
    const a = parseArgs(['--label', 'z', '--offer', 'hardening', '--json', '--template']);
    assert.strictEqual(a.label, 'z');
    assert.strictEqual(a.offer, 'hardening');
    assert.strictEqual(a.json, true);
    assert.strictEqual(a.forceTemplate, true);
  });

  if (process.exitCode) process.exit(process.exitCode);
}

main();
