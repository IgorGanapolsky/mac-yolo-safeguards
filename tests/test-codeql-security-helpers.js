#!/usr/bin/env node
'use strict';

const assert = require('assert');
const { hostnameOf, hostIsOrSubdomain } = require('../tools/lib/safe-url-host');
const { stripHtml } = require('../tools/lib/safe-html-strip');
const { summarize } = require('../tools/codeql-alert-sync');

function test(name, fn) {
  try {
    fn();
    console.log(`PASS ${name}`);
  } catch (e) {
    console.error(`FAIL ${name}`, e.message);
    process.exitCode = 1;
  }
}

test('hostnameOf rejects evil subdomain trick', () => {
  assert.strictEqual(hostnameOf('https://evil.com/?x=reddit.com'), 'evil.com');
  assert.strictEqual(hostnameOf('https://reddit.com.evil.com/'), 'reddit.com.evil.com');
  assert.strictEqual(hostnameOf('https://www.reddit.com/r/x'), 'www.reddit.com');
});

test('hostIsOrSubdomain', () => {
  assert.ok(hostIsOrSubdomain('www.reddit.com', 'reddit.com'));
  assert.ok(hostIsOrSubdomain('reddit.com', 'reddit.com'));
  assert.ok(!hostIsOrSubdomain('notreddit.com', 'reddit.com'));
  assert.ok(!hostIsOrSubdomain('reddit.com.evil.com', 'reddit.com'));
});

test('stripHtml removes script with space before >', () => {
  const s = stripHtml('<p>hi</p><script>alert(1)</script ><b>x</b>');
  assert.ok(!/alert/.test(s));
  assert.ok(s.includes('hi'));
  assert.ok(s.includes('x'));
});

test('stripHtml entity decode single pass', () => {
  assert.strictEqual(stripHtml('a &amp; b'), 'a & b');
  assert.strictEqual(stripHtml('&lt;tag&gt;'), '<tag>');
});

test('summarize counts', () => {
  const s = summarize([
    { rule: { id: 'js/x', security_severity_level: 'high' } },
    { rule: { id: 'js/x', severity: 'warning' } },
  ]);
  assert.strictEqual(s.open, 2);
  assert.strictEqual(s.byRule['js/x'], 2);
});

console.log('test-codeql-security-helpers: done');


// CodeQL js/bad-tag-filter: end tags may be </script\t bar>
{
  const dirty = '<p>x</p><script>alert(1)</script\t bar>y';
  const out = stripHtml(dirty);
  assert.ok(!/alert\(1\)/.test(out), 'must strip script end tags with whitespace/attrs before >');
  console.log('PASS stripHtml removes script with tab/attr before >');
}
