#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const lm = require('../tools/mac-yolo-local-models');
const { callTool } = require('../tools/mac-yolo-mcp-server');

const GB = 1024 ** 3;
const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'mys-lm-'));
fs.mkdirSync(path.join(tmpHome, '.ollama', 'models'), { recursive: true });

// A 16 GB machine running an F16 8 GB model: over the 40% line, and a Q4 build is suggested.
const big = lm.scan({
  ramBytes: 16 * GB,
  home: tmpHome,
  sizeOf: () => 9 * GB,
  psText: '',
  fetchJson: () => ({ models: [{ name: 'qwen3.5:4b-fp16', size: 8.41 * GB, size_vram: 8.41 * GB, details: { parameter_size: '4B', quantization_level: 'F16' } }] }),
});
assert.strictEqual(big.ollamaReachable, true);
assert.strictEqual(big.loaded.length, 1);
assert.ok(big.loadedShare > 0.5);
assert.ok(big.advice.some((a) => a.level === 'warn' && /ollama stop/.test(a.text)), 'warns when models crowd RAM');
const tip = big.advice.find((a) => a.model === 'qwen3.5:4b-fp16');
assert.ok(tip && /Q4_K_M build would be about 2\.5 GB/.test(tip.text), `suggests a smaller quant: ${tip && tip.text}`);
assert.deepStrictEqual(big.onDisk.map((d) => d.store), ['Ollama']);

// Already-small model on a big machine: no advice at all.
const fine = lm.scan({
  ramBytes: 48 * GB,
  home: tmpHome,
  sizeOf: () => 1,
  psText: '',
  fetchJson: () => ({ models: [{ name: 'small:q4', size: 2.5 * GB, details: { quantization_level: 'Q4_K_M' } }] }),
});
assert.deepStrictEqual(fine.advice, []);

// Ollama not running: reported as unreachable, never as zero models loaded by Ollama.
const off = lm.scan({ ramBytes: 16 * GB, home: tmpHome, sizeOf: () => 1, psText: '', fetchJson: () => null });
assert.strictEqual(off.ollamaReachable, false);
assert.strictEqual(off.loadedBytes, 0);

// Process scan finds llama.cpp and MLX servers by command line.
const procs = lm.modelProcesses('  101 4194304 /opt/homebrew/bin/llama-server -m model.gguf\n  202 1048576 python -m mlx_lm.server\n  303 1000 /usr/bin/vim notes');
assert.deepStrictEqual(procs.map((p) => p.kind), ['llama.cpp', 'MLX']);
assert.strictEqual(procs[0].bytes, 4 * GB);

assert.strictEqual(lm.smallerQuantBytes({ quantization: 'Q4_K_M', bytes: GB }), null, 'no tip for an already-small quant');

// MCP tool is wired and read-only.
const viaMcp = callTool('yolo_local_models', {});
assert.strictEqual(viaMcp.ok, true);
assert.ok(Array.isArray(viaMcp.advice));

fs.rmSync(tmpHome, { recursive: true, force: true });
console.log('test-mac-yolo-local-models: PASS');
