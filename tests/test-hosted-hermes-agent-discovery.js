'use strict';

/**
 * Agent-discovery contract for the $10 Hosted Hermes offer.
 * Martech GEO steal is structured offer facts only — no invented ratings.
 * Compatible with node tests/test-*.js harness (uses node:assert).
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

console.log('Running test-hosted-hermes-agent-discovery.js...');

{
  const llms = read('public/llms.txt');
  for (const needle of ['Hosted Hermes', '$10', '14-day', 'thumbgate.app', 'fenced VPS']) {
    assert.ok(llms.includes(needle), `public/llms.txt must contain "${needle}"`);
  }
  assert.doesNotMatch(llms, /npx thumbgate/);
  assert.doesNotMatch(llms, /Machine Safety Guardrails/);
  assert.match(llms, /Codex-sub-on-laptop is not the \$10 offer/);
  assert.match(llms, /Do not wrap ChatGPT Plus into thumbgate\.app/);
}

{
  const page = read('apps/hermes-control-plane/app/page.tsx');
  assert.match(page, /"@type": "Offer"/);
  assert.match(page, /price: "10"/);
  assert.ok(
    /unitCode:\s*"MON"/.test(page) || (/priceSpecification/.test(page) && /monthly/i.test(page)),
    'JSON-LD Offer must include unitCode MON or monthly priceSpecification',
  );
  assert.doesNotMatch(page, /AggregateRating/);
}

{
  const route = read('apps/hermes-control-plane/app/llms.txt/route.ts');
  assert.match(route, /Hosted Hermes/);
  assert.match(route, /\$10/);
  assert.match(route, /14-day trial/);
  assert.match(route, /no phone leash/i);
  assert.match(route, /Is Codex-sub-on-laptop the \$10 offer\? No/);
  assert.match(route, /Do not wrap ChatGPT Plus into thumbgate\.app/);
}

console.log('ok tests/test-hosted-hermes-agent-discovery.js');
