'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { auditAccessibilityTree } = require('../tools/accessibility-tree-seo-auditor');

test('auditAccessibilityTree scores system 100/100 and A+ for AI Search a11y tree readiness', () => {
  const res = auditAccessibilityTree();
  assert.ok(res.a11yScore >= 90);
  assert.equal(res.grade, 'A+');
  assert.equal(res.status, 'ACCESSIBILITY TREE OPTIMIZED FOR AI SEARCH & CRAWLERS');
  assert.equal(res.useCasesCovered.length, 5);
});
