/**
 * tests/test-structural-refactoring-engine.js
 *
 * Test suite for SWE-Bench ProMax Structural Refactoring Engine & Concurrency Sentinel
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { StructuralRefactoringEngine } = require('../tools/structural-refactoring-engine');

test('Pillar 1: Structure & Symbol DAG Analysis', async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promax-struct-'));
  const testFile = path.join(tmpDir, 'sampleModule.js');

  const code = `
const fs = require('fs');
const { EventEmitter } = require('events');

class DataProcessor extends EventEmitter {
  processData(items) {
    return items.map(x => x * 2);
  }
}

async function runPipeline(input) {
  const proc = new DataProcessor();
  return proc.processData(input);
}

module.exports = {
  DataProcessor,
  runPipeline
};
`;

  fs.writeFileSync(testFile, code, 'utf8');

  const engine = new StructuralRefactoringEngine({ rootDir: tmpDir });
  const result = engine.analyzeStructure(testFile);

  assert.strictEqual(result.file, 'sampleModule.js');
  assert.ok(result.hash.length === 64, 'SHA-256 hash computed');
  assert.strictEqual(result.symbols.classes.length, 1);
  assert.strictEqual(result.symbols.classes[0].name, 'DataProcessor');
  assert.strictEqual(result.symbols.classes[0].extends, 'EventEmitter');
  assert.strictEqual(result.symbols.functions.length, 1);
  assert.strictEqual(result.symbols.functions[0].name, 'runPipeline');
  assert.ok(result.symbols.exports.includes('DataProcessor'));
  assert.ok(result.symbols.exports.includes('runPipeline'));
  assert.strictEqual(result.symbols.imports.length, 2);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('Pillar 2: Concurrency & Temporal Invariant Sentinel', async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promax-concurrency-'));
  const hazardousFile = path.join(tmpDir, 'hazard.js');

  const codeHazard = `
let globalState = 0;

async function updateUserBalance(amount) {
  const current = globalState;
  await fetch('https://api.example.com/deduct');
  globalState = current + amount;
}

function onClickButton() {
  updateUserBalance(10);
}
`;

  fs.writeFileSync(hazardousFile, codeHazard, 'utf8');

  const engine = new StructuralRefactoringEngine({ rootDir: tmpDir });
  const result = engine.analyzeConcurrencyInvariants(hazardousFile);

  assert.ok(result.concurrencySafetyScore < 80, 'Score reflects concurrency hazards');
  const issueTypes = result.issues.map(i => i.type);
  assert.ok(issueTypes.includes('UNSYNCHRONIZED_ASYNC_STATE_HAZARD'));
  assert.ok(issueTypes.includes('MISSING_IDEMPOTENCY_KEY'));
  assert.ok(issueTypes.includes('MISSING_CLICK_DEBOUNCE_GUARD'));

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('Pillar 3: Atomic Mutation with Rollback on Test Failure', async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promax-atomic-'));
  const testFile = path.join(tmpDir, 'calc.js');
  const initialContent = 'function add(a, b) { return a + b; }\nmodule.exports = { add };';
  fs.writeFileSync(testFile, initialContent, 'utf8');

  const engine = new StructuralRefactoringEngine({ rootDir: tmpDir });

  // Plan that breaks functionality and fails test
  const plan = {
    mutations: [
      {
        file: 'calc.js',
        type: 'REPLACE_CHUNK',
        target: 'return a + b;',
        replacement: 'return a - b;', // Intentional bug
      },
    ],
    testCommand: 'node -e "const { add } = require(\'./calc\'); if (add(2, 3) !== 5) process.exit(1);"',
  };

  const result = engine.executeAtomicMutation(plan);

  assert.strictEqual(result.success, false);
  assert.strictEqual(result.status, 'ROLLED_BACK_ON_TEST_FAILURE');

  // Verify file was restored byte-identical
  const restoredContent = fs.readFileSync(testFile, 'utf8');
  assert.strictEqual(restoredContent, initialContent, 'File restored to exact initial content');

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('Pillar 3: Atomic Mutation Commits on Test Success', async (t) => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'promax-commit-'));
  const testFile = path.join(tmpDir, 'calc.js');
  const initialContent = 'function add(a, b) { return a + b; }\nmodule.exports = { add };';
  fs.writeFileSync(testFile, initialContent, 'utf8');

  const engine = new StructuralRefactoringEngine({ rootDir: tmpDir });

  const plan = {
    mutations: [
      {
        file: 'calc.js',
        type: 'REPLACE_CHUNK',
        target: 'return a + b;',
        replacement: 'return Number(a) + Number(b);', // Safe refactoring
      },
    ],
    testCommand: 'node -e "const { add } = require(\'./calc\'); if (add(2, 3) !== 5) process.exit(1);"',
  };

  const result = engine.executeAtomicMutation(plan);

  assert.strictEqual(result.success, true);
  assert.strictEqual(result.status, 'COMMITTED');

  const finalContent = fs.readFileSync(testFile, 'utf8');
  assert.ok(finalContent.includes('Number(a) + Number(b)'));

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('Pillar 4: SWE-Bench ProMax 4-Axis Benchmark Evaluator', async (t) => {
  const engine = new StructuralRefactoringEngine();
  const evaluation = engine.evaluateSWEBenchProMaxScore(['tools/two-word-primer.js']);

  assert.strictEqual(evaluation.benchmark, 'SWE-Bench ProMax 2026');
  assert.ok(evaluation.finalScore >= 80);
  assert.ok(evaluation.axes.crossFileStructuralCoherence > 0);
  assert.ok(evaluation.axes.temporalConcurrencyInvariants > 0);
  assert.strictEqual(evaluation.axes.deterministicTestReversibility, 100);
});
