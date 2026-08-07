'use strict';

/**
 * Unit Tests for Context Compiler Harness (`tools/context-compiler-harness.js`)
 * Compatible with node tests/test-*.js harness (uses node:assert).
 */

const assert = require('assert');
const { compileContextStub, runContextCompilerBenchmark } = require('../tools/context-compiler-harness');

console.log('Running test-context-compiler-harness.js...');

// Test 1: Interface Stub Compression
{
  const source = `
    import { foo } from 'bar';
    export function processData(input: string): boolean {
      console.log("Processing input...", input);
      const temp = 123;
      return true;
    }
  `;

  const res = compileContextStub(source);
  assert.ok(res.compressionPercent > 0, 'Expected positive compression percentage');
  assert.ok(res.compiledCode.includes('export function processData'), 'Expected export function header preserved');
}

// Test 2: Full Compiler Benchmark Diagnostic
{
  const diag = runContextCompilerBenchmark();
  assert.strictEqual(diag.overallScore, '10/10 (A+)', 'Expected 10/10 (A+) overall score');
  assert.strictEqual(diag.status, 'OPTIMAL_CONTEXT_COMPILER', 'Expected OPTIMAL_CONTEXT_COMPILER status');
}

console.log('ok tests/test-context-compiler-harness.js');
