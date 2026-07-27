#!/usr/bin/env node
'use strict';

const assert = require('assert');
const {
  rowMatches,
  evaluateSentRows,
  buildSentSearchUrl,
  localPart,
  normalizeEmail,
} = require('../tools/chrome-gmail-sent-verify');

let n = 0;
function check(label, fn) {
  fn();
  n += 1;
  console.log(`  ok - ${label}`);
}

check('normalize + localPart', () => {
  assert.strictEqual(normalizeEmail(' A@B.COM '), 'a@b.com');
  assert.strictEqual(localPart('newman@quantstruct.com'), 'newman');
});

check('rowMatches full email and local To:', () => {
  assert.ok(
    rowMatches({
      rowText: 'To: newman@quantstruct.com Quick close-loop: Agent Reliability',
      to: 'newman@quantstruct.com',
    }),
  );
  assert.ok(
    rowMatches({
      rowText: 'To: newman Quick close-loop: Agent Reliability Diagnostic ($499)',
      to: 'newman@quantstruct.com',
    }),
  );
  assert.ok(
    !rowMatches({
      rowText: 'To: aram Quick close-loop: Agent Reliability',
      to: 'newman@quantstruct.com',
    }),
  );
});

check('evaluateSentRows hits', () => {
  const r = evaluateSentRows(
    [
      'To: madhu Quick close-loop: Agent Reliability Diagnostic ($499)',
      'To: newman Quick close-loop: Agent Reliability Diagnostic ($499)',
    ],
    { to: 'newman@quantstruct.com', subject: 'Quick close-loop' },
  );
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.hitCount, 1);
});

check('buildSentSearchUrl', () => {
  const u = buildSentSearchUrl({ to: 'a@b.com', subject: 'Governed' });
  assert.match(u, /mail\.google\.com/);
  assert.match(u, /search/);
});

console.log(`\nPASS ${n}/${n} chrome-gmail-sent-verify`);
