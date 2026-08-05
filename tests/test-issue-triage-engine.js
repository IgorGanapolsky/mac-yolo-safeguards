'use strict';

/**
 * Unit tests for Cloudflare/Astro-Inspired AI Issue Triage Engine
 */

const assert = require('assert');
const { triageIssue, runTriage } = require('../tools/issue-triage-engine');

console.log('Testing Issue Triage Engine...');

const mockIssue = {
  number: 132,
  title: 'P0: make connection identity + auth invariants release-blocking',
  labels: [{ name: 'priority:p0' }, { name: 'area:hermes-mobile' }],
  state: 'OPEN'
};

const triaged = triageIssue(mockIssue);
assert.strictEqual(triaged.number, 132, 'Correct issue number');
assert.strictEqual(triaged.priority, 'P0', 'Correctly identified P0 priority');
assert.strictEqual(triaged.area, 'area:hermes-mobile', 'Correctly identified area label');
assert.strictEqual(triaged.isBlocked, false, 'Not blocked');

const fullReport = runTriage();
assert.strictEqual(fullReport.ok, true, 'runTriage returned ok');
assert.ok(Array.isArray(fullReport.issues), 'issues is an array');

console.log('✅ All test-issue-triage-engine tests PASSED cleanly.');
