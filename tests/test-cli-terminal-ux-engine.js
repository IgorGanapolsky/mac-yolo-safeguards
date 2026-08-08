'use strict';

/**
 * Unit Tests for CLI Terminal UX & Telemetry Engine (`tools/cli-terminal-ux-engine.js`)
 * Compatible with node tests/test-*.js harness (uses node:assert).
 */

const assert = require('assert');
const { formatTokenTelemetryLine, enableTerminalUxEnhancements, runCliTerminalUxBenchmark } = require('../tools/cli-terminal-ux-engine');

console.log('Running test-cli-terminal-ux-engine.js...');

// Test 1: Tokens In / Tokens Out Telemetry Formatting
{
  const res = formatTokenTelemetryLine('Hello input prompt', 'Hello output response', 'gpt-4o');
  assert.ok(res.tokensIn > 0, 'Expected positive input tokens');
  assert.ok(res.tokensOut > 0, 'Expected positive output tokens');
  assert.strictEqual(res.totalTokens, res.tokensIn + res.tokensOut, 'Expected totalTokens === tokensIn + tokensOut');
  assert.ok(res.formattedLine.includes('Tokens In:'), 'Expected Tokens In in output string');
  assert.ok(res.formattedLine.includes('Tokens Out:'), 'Expected Tokens Out in output string');
}

// Test 2: Terminal UX Enhancements
{
  const ux = enableTerminalUxEnhancements(null);
  assert.strictEqual(ux.bracketedPasteEnabled, true, 'Expected bracketed paste enabled');
  assert.strictEqual(ux.status, 'TERMINAL_UX_OPTIMIZED', 'Expected TERMINAL_UX_OPTIMIZED status');
}

// Test 3: Full Diagnostic Benchmark
{
  const diag = runCliTerminalUxBenchmark();
  assert.strictEqual(diag.overallRating, '10/10 (CLI_UX_TELEMETRY_A_PLUS)', 'Expected 10/10 rating');
}

console.log('ok tests/test-cli-terminal-ux-engine.js');
