#!/usr/bin/env node
'use strict';

/**
 * Tests for tools/local-coding-model-selector.js
 * Verifies: model registry, hardware-aware recommendation logic, CLI interface.
 * Pure functions are tested with explicit hardware values (no real hardware needed).
 */

const assert = require('assert');
const { spawnSync } = require('child_process');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SCRIPT = path.join(ROOT, 'tools', 'local-coding-model-selector.js');
const mod = require(SCRIPT);

let pass = 0;
let fail = 0;

function check(name, fn) {
  try {
    fn();
    pass++;
  } catch (e) {
    fail++;
    console.error(`  FAIL: ${name}`);
    console.error(`    ${e.message}`);
  }
}

// --- Model Registry ---------------------------------------------------------

check('MODELS has 4 entries', () => {
  assert.strictEqual(mod.MODELS.length, 4);
});

check('MODELS includes Qwen3-8B', () => {
  const ids = mod.MODELS.map((m) => m.id);
  assert.ok(ids.includes('qwen3:8b'));
});

check('MODELS includes Qwen3-27B', () => {
  const ids = mod.MODELS.map((m) => m.id);
  assert.ok(ids.includes('qwen3:27b'));
});

check('MODELS includes GLM-5.3', () => {
  const ids = mod.MODELS.map((m) => m.id);
  assert.ok(ids.includes('glm-5.3'));
});

check('MODELS includes Qwen3-30B-A3B', () => {
  const ids = mod.MODELS.map((m) => m.id);
  assert.ok(ids.includes('qwen3:30b-a3b'));
});

check('All models have required fields', () => {
  for (const m of mod.MODELS) {
    assert.ok(m.id, `missing id`);
    assert.ok(m.name, `missing name for ${m.id}`);
    assert.ok(typeof m.size_gb === 'number', `missing size_gb for ${m.id}`);
    assert.ok(typeof m.min_ram_gb === 'number', `missing min_ram_gb for ${m.id}`);
    assert.ok(typeof m.min_vram_gb === 'number', `missing min_vram_gb for ${m.id}`);
    assert.ok(typeof m.min_disk_gb === 'number', `missing min_disk_gb for ${m.id}`);
    assert.ok(typeof m.apple_silicon_ok === 'boolean', `missing apple_silicon_ok for ${m.id}`);
  }
});

// --- Recommendation Logic (pure function) -----------------------------------

check('Apple Silicon 64GB RAM recommends all 4 models', () => {
  const r = mod.recommendModels({ ram_gb: 64, vram_gb: null, disk_gb: 200, apple_silicon: true });
  const ids = r.recommended.map((m) => m.id);
  assert.strictEqual(ids.length, 4, `expected 4, got: ${JSON.stringify(ids)}`);
  assert.ok(ids.includes('qwen3:8b'));
  assert.ok(ids.includes('glm-5.3'));
  assert.ok(ids.includes('qwen3:30b-a3b'));
  assert.ok(ids.includes('qwen3:27b'));
});

check('Apple Silicon 16GB RAM recommends only light models', () => {
  const r = mod.recommendModels({ ram_gb: 16, vram_gb: null, disk_gb: 100, apple_silicon: true });
  const ids = r.recommended.map((m) => m.id);
  assert.ok(ids.includes('qwen3:8b'));
  assert.ok(ids.includes('glm-5.3'));
  assert.ok(!ids.includes('qwen3:30b-a3b'), '30B-A3B should not fit in 16GB on Apple Silicon');
  assert.ok(!ids.includes('qwen3:27b'), '27B should not fit in 16GB on Apple Silicon');
});

check('Apple Silicon 8GB RAM recommends nothing, warns', () => {
  const r = mod.recommendModels({ ram_gb: 8, vram_gb: null, disk_gb: 50, apple_silicon: true });
  assert.strictEqual(r.recommended.length, 0);
  assert.ok(r.warnings.length > 0, 'should warn about low RAM');
  assert.ok(r.warnings[0].includes('8GB'));
});

check('Intel 24GB VRAM, 32GB RAM recommends all 4', () => {
  const r = mod.recommendModels({ ram_gb: 32, vram_gb: 24, disk_gb: 100, apple_silicon: false });
  const ids = r.recommended.map((m) => m.id);
  assert.strictEqual(ids.length, 4);
  assert.ok(ids.includes('qwen3:27b'));
});

check('Intel 8GB VRAM, 24GB RAM recommends only models that fit VRAM', () => {
  const r = mod.recommendModels({ ram_gb: 24, vram_gb: 8, disk_gb: 100, apple_silicon: false });
  const ids = r.recommended.map((m) => m.id);
  // Qwen3-8B needs 6GB VRAM, fits in 8GB
  assert.ok(ids.includes('qwen3:8b'));
  // GLM-5.3 needs 8GB VRAM, fits exactly
  assert.ok(ids.includes('glm-5.3'));
  // Qwen3-27B needs 18GB VRAM, doesn't fit in 8GB
  // But RAM is 24GB >= 32GB * 1.5 = 48GB? No, 24 < 48, so no offload
  assert.ok(!ids.includes('qwen3:27b'), '27B needs 18GB VRAM, should not be recommended');
  assert.ok(!ids.includes('qwen3:30b-a3b'), '30B-A3B needs 18GB VRAM, should not be recommended');
});

check('Intel 8GB VRAM, 64GB RAM recommends with offload warning', () => {
  const r = mod.recommendModels({ ram_gb: 64, vram_gb: 8, disk_gb: 100, apple_silicon: false });
  const ids = r.recommended.map((m) => m.id);
  // Qwen3-27B needs 18GB VRAM but 64GB RAM >= 32GB * 1.5 = 48GB, so offload applies
  assert.ok(ids.includes('qwen3:27b'));
  const bigOne = r.recommended.find((m) => m.id === 'qwen3:27b');
  assert.ok(bigOne.offload, 'should mark as offload');
  assert.ok(bigOne.warning, 'should have offload warning');
});

check('Insufficient disk space triggers disk_warning', () => {
  const r = mod.recommendModels({ ram_gb: 64, vram_gb: 24, disk_gb: 3, apple_silicon: true });
  // 3GB disk is less than any model's min_disk_gb (5GB for Qwen3-8B)
  const lightModel = r.recommended.find((m) => m.id === 'qwen3:8b');
  assert.ok(lightModel.disk_warning, 'should warn about insufficient disk');
});

check('Result has correct structure', () => {
  const r = mod.recommendModels({ ram_gb: 64, vram_gb: 24, disk_gb: 200, apple_silicon: true });
  assert.strictEqual(typeof r.ok, 'boolean');
  assert.ok(r.hardware);
  assert.ok(r.hardware.ram_gb === 64);
  assert.ok(r.hardware.apple_silicon === true);
  assert.ok(Array.isArray(r.recommended));
  assert.ok(Array.isArray(r.warnings));
  assert.strictEqual(r.model_count, 4);
});

// --- CLI Interface ----------------------------------------------------------

check('CLI: models --json outputs valid JSON with 4 models', () => {
  const r = spawnSync(process.execPath, [SCRIPT, 'models', '--json'], {
    encoding: 'utf8',
    timeout: 10000,
  });
  assert.strictEqual(r.status, 0, r.stderr);
  const d = JSON.parse(r.stdout);
  assert.strictEqual(d.models.length, 4);
});

check('CLI: recommend with explicit hardware outputs JSON', () => {
  const r = spawnSync(process.execPath, [SCRIPT, 'recommend', '--vram', '24', '--ram', '64', '--disk', '200', '--apple-silicon', 'true', '--json'], {
    encoding: 'utf8',
    timeout: 10000,
  });
  assert.strictEqual(r.status, 0, r.stderr);
  const d = JSON.parse(r.stdout);
  assert.strictEqual(d.ok, true);
  assert.strictEqual(d.hardware.ram_gb, 64);
  assert.ok(d.recommended.length >= 1);
});

check('CLI: recommend with insufficient RAM outputs 0 recommendations', () => {
  const r = spawnSync(process.execPath, [SCRIPT, 'recommend', '--vram', '0', '--ram', '4', '--disk', '10', '--apple-silicon', 'false', '--json'], {
    encoding: 'utf8',
    timeout: 10000,
  });
  assert.strictEqual(r.status, 0, r.stderr);
  const d = JSON.parse(r.stdout);
  assert.strictEqual(d.recommended.length, 0);
  assert.ok(d.warnings.length > 0);
});

check('CLI: models (no --json) outputs human-readable text', () => {
  const r = spawnSync(process.execPath, [SCRIPT, 'models'], {
    encoding: 'utf8',
    timeout: 10000,
  });
  assert.strictEqual(r.status, 0, r.stderr);
  assert.ok(r.stdout.includes('Qwen3-8B'));
  assert.ok(r.stdout.includes('Qwen3-27B'));
  assert.ok(r.stdout.includes('GLM-5.3'));
});

check('CLI: help works', () => {
  const r = spawnSync(process.execPath, [SCRIPT, 'help'], {
    encoding: 'utf8',
    timeout: 10000,
  });
  assert.strictEqual(r.status, 0, r.stderr);
  assert.ok(r.stdout.includes('Usage:'));
});

check('CLI: unknown command returns exit 1', () => {
  const r = spawnSync(process.execPath, [SCRIPT, 'bogus'], {
    encoding: 'utf8',
    timeout: 10000,
  });
  assert.strictEqual(r.status, 1);
});

// --- Summary ----------------------------------------------------------------

console.log(`test-local-coding-model-selector: ${pass + fail} tests, ${pass} passed, ${fail} failed`);

if (fail > 0) {
  process.exit(1);
}
