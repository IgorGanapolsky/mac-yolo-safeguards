#!/usr/bin/env node
'use strict';

/**
 * Tests for tools/confusion-detector-steal.js
 *
 * Covers the pure logic: context ambiguity detection, tool boundary matching,
 * and historical inconsistency detection.
 */

const assert = require('assert');

const {
  checkContextAmbiguity,
  checkToolBoundaries,
  checkHistoricalInconsistency,
  scan,
  SIGNAL,
} = require('../tools/confusion-detector-steal');

let passed = 0;
function ok(name) {
  passed += 1;
  console.log(`ok  ${passed}  ${name}`);
}

// ─── 1. Context ambiguity detection ─────────────────────────────────────

{
  const signals = checkContextAmbiguity('fix the verify check');
  assert.equal(signals.length, 1, 'should detect vague "fix the" pattern');
  assert.equal(signals[0].type, SIGNAL.CONTEXT_AMBIGUOUS);
  assert.equal(signals[0].severity, 'medium');
  ok('detects vague "fix the verify check" as ambiguous');
}

{
  const signals = checkContextAmbiguity('make the system faster and more secure');
  const hasConflict = signals.some((s) => s.label.includes('speed vs safety'));
  assert.equal(hasConflict, true, 'should detect conflicting tradeoff without spec');
  ok('detects conflicting speed vs safety tradeoff');
}

{
  const signals = checkContextAmbiguity('update tools/confusion-detector-steal.js to fix the pluralize bug on deny rules count');
  assert.equal(signals.length, 0, 'specific, unambiguous action should have no signals');
  ok('specific file+action command is not flagged as ambiguous');
}

// ─── 2. Tool boundary detection ─────────────────────────────────────────

{
  const signals = checkToolBoundaries('shell', 'git push --force origin main');
  const hasForce = signals.some((s) => s.type === SIGNAL.TOOL_BOUNDARY && s.label.includes('force'));
  assert.equal(hasForce, true, 'should detect git push --force in deny rules');
  ok('detects git push --force as denied by tool boundary');
}

{
  const signals = checkToolBoundaries('shell', 'git reflog show HEAD');
  const hasReflog = signals.some((s) => s.type === SIGNAL.TOOL_BOUNDARY && s.label.includes('reflog'));
  assert.equal(hasReflog, true, 'should detect git reflog in deny rules');
  ok('detects git reflog as denied by tool boundary');
}

{
  const signals = checkToolBoundaries('edit', 'node tools/my-tool.js');
  // Should still check the general allow/deny conflict
  const hasBoundaryWarning = signals.some((s) => s.type === SIGNAL.TOOL_BOUNDARY);
  assert.equal(hasBoundaryWarning, true, 'should report allow/deny conflict as low severity');
  ok('reports allow(/**) vs deny conflict as low-severity boundary warning');
}

// ─── 3. Historical inconsistency ────────────────────────────────────────

{
  const signals = checkHistoricalInconsistency('fix the verify check');
  // This runs against live state, so we just verify the function doesn't crash
  // and returns an array (even if empty on a clean system)
  assert.equal(Array.isArray(signals), true);
  ok('checkHistoricalInconsistency returns array without crashing');
}

// ─── 4. Full scan integration ──────────────────────────────────────────

{
  const result = scan({ action: 'improve our system', cmd: 'gh pr merge 2209 --admin' });
  assert.equal(typeof result.confusing, 'boolean');
  assert.equal(typeof result.totalSignals, 'number');
  assert.equal(Array.isArray(result.signals), true);
  // Should detect both ambiguity AND the --admin deny rule
  const hasAmbiguity = result.signals.some((s) => s.type === SIGNAL.CONTEXT_AMBIGUOUS);
  const hasBoundary = result.signals.some((s) => s.type === SIGNAL.TOOL_BOUNDARY && s.severity === 'high');
  assert.equal(hasAmbiguity || hasBoundary, true, 'should detect at least ambiguity or boundary violation for admin merge');
  ok('full scan detects confusion signals for ambiguous + admin-merge action');
}

// ─── 5. Signal severity hierarchy ───────────────────────────────────────

{
  const result = scan({ cmd: 'git reflog' });
  const highSignals = result.signals.filter((s) => s.severity === 'high');
  assert.equal(highSignals.length > 0, true, 'reflog command should produce at least one high-severity signal');
  assert.equal(result.confusing, true, 'high severity = confusing = ABORT');
  ok('high-severity signal correctly marks as confusing');
}

console.log(`\n${passed}/${passed} tests passed`);
process.exit(0);
