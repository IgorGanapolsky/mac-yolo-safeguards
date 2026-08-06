'use strict';

/**
 * Unit Tests for AEO V4 & Accessibility Tree Auditor (`tools/aeo-a11y-tree-auditor.js`)
 * Compatible with node tests/test-*.js harness (uses node:assert).
 */

const assert = require('assert');
const { auditAeoV4Factors, auditAccessibilityTree, runAeoA11yDiagnostic } = require('../tools/aeo-a11y-tree-auditor');

console.log('Running test-aeo-a11y-tree-auditor.js...');

// Test 1: Goodie AEO Periodic Table V4 Audit
{
  const aeo = auditAeoV4Factors();
  assert.strictEqual(aeo.robotsBotAllowed, true, 'Expected AI bots unblocked in robots.txt');
  assert.strictEqual(aeo.hasLlmsTxt, true, 'Expected public/llms.txt to be present');
  assert.strictEqual(aeo.status, 'OPTIMAL_AI_SEARCH_VISIBILITY', 'Expected OPTIMAL_AI_SEARCH_VISIBILITY status');
}

// Test 2: Accessibility Tree AI Crawler Audit
{
  const domElements = [
    { tag: 'h1', isInteractive: false, ariaLabel: null, textContent: 'Title', hasParentH2: true },
    { tag: 'button', role: 'button', isInteractive: true, ariaLabel: 'Send message', textContent: 'Send', hasParentH2: true }
  ];
  const a11y = auditAccessibilityTree(domElements);
  assert.strictEqual(a11y.a11yScorePercent, 100, 'Expected 100% accessibility tree score');
  assert.strictEqual(a11y.status, 'A_PLUS (A11Y_TREE_PASSED)', 'Expected A_PLUS rating');
}

// Test 3: Full Diagnostic Execution
{
  const diag = runAeoA11yDiagnostic();
  assert.strictEqual(diag.overallScore, '10/10 (A+)', 'Expected 10/10 (A+) overall score');
}

console.log('ok tests/test-aeo-a11y-tree-auditor.js');
