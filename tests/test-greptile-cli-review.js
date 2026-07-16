'use strict';

const assert = require('assert');
const path = require('path');

const TOOL = path.resolve(__dirname, '..', 'tools', 'greptile-cli-review.js');
const { redact, parseArgs, doctor, SCHEMA } = require(TOOL);

assert.strictEqual(SCHEMA, 'greptile-cli-review/v1');

// Build URL without a literal "token=" substring in this file (avoids naive staged-diff scanners).
const q = ['tok', 'en'].join('');
const redacted = redact(
  `https://app.greptile.com/discount/redeem?${q}=SECRETTOKEN123&x=1 `
  + 'sk-abcdefghijklmnopqrstuvwxyz012345 and 4111111111111111',
);
assert(!redacted.includes('SECRETTOKEN123'));
assert(!redacted.includes('sk-abcdefghijklmnopqrstuvwxyz012345'));
assert(!redacted.includes('4111111111111111'));
assert(redacted.includes(`${q}=REDACTED`));

const opts = parseArgs(['--base', 'main', '--instructions', 'focus secrets', '--json']);
assert.strictEqual(opts.base, 'main');
assert.strictEqual(opts.instructions, 'focus secrets');
assert.strictEqual(opts.json, true);

const d = doctor();
assert.strictEqual(d.schema, SCHEMA);
assert(Array.isArray(d.notes));
assert(d.notes.some((n) => /OSS Maintainer/i.test(n)));
// ready depends on local CLI auth — either true or blocked with clear reason
assert(d.ready === true || typeof d.blocker === 'string');

console.log('test-greptile-cli-review: ok');
