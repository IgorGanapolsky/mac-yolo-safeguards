'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { auditSubagentPatterns } = require('../tools/subagent-pattern-auditor');

test('auditSubagentPatterns scores valid subagent architectures 100/100 and catches anti-patterns', () => {
  // Test valid design
  const res1 = auditSubagentPatterns();
  assert.equal(res1.subagentPatternScore, 100);
  assert.equal(res1.grade, 'A+');
  assert.equal(res1.violations.length, 0);

  // Test same-file parallel edit anti-pattern
  const res2 = auditSubagentPatterns([
    { id: 'sub-1', pattern: 'fan_out_fan_in', targetFiles: ['plan.md'] },
    { id: 'sub-2', pattern: 'fan_out_fan_in', targetFiles: ['plan.md'] }
  ]);
  assert.equal(res2.subagentPatternScore, 75);
  assert.ok(res2.violations[0].includes('Same-file parallel edits'));
});
