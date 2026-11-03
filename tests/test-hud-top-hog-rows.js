#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..');
const hud = path.join(root, 'macos', 'MacYoloTranslucentHud.swift');
const app = path.join(root, 'macos', 'MacYoloSafeguardsApp.swift');
const src = fs.readFileSync(hud, 'utf8');
const twin = fs.readFileSync(app, 'utf8');

assert.strictEqual(src, twin, 'HUD Swift copies must stay byte-identical');
assert.ok(src.includes('These are the top hogs. Tap one to see its processes.'));
assert.ok(src.includes("else if (cardId === 'optimization')"));
assert.ok(src.includes("_expandedDrillRows[dd[e].key || ''] = false"));
assert.ok(src.includes('gap: 14px'));
assert.ok(src.includes('margin-top: 14px'));
assert.ok(!src.includes('openCritiqueModal'));
assert.ok(!src.includes('Gumroad page'));

function extractFunction(name) {
  const start = src.indexOf('function ' + name + '(');
  assert.ok(start > 0, 'missing ' + name);
  let i = src.indexOf('{', start);
  let depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error('unclosed ' + name);
}

const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(
  extractFunction('splitTopHogs') + '\n' +
  extractFunction('hogNameFromLabel') + '\n' +
  extractFunction('chipHogNames') + '\n' +
  extractFunction('rowsForNamedHogs') + '\n' +
  'this.splitTopHogs = splitTopHogs; this.hogNameFromLabel = hogNameFromLabel; this.chipHogNames = chipHogNames; this.rowsForNamedHogs = rowsForNamedHogs;',
  sandbox
);

sandbox._recTitleRendered = 'Top Hogs: syspolicyd (44%) · WindowServer (36%) · omp (2.4G · 12%) ›';
const names = sandbox.chipHogNames();
assert.strictEqual(JSON.stringify(names), JSON.stringify(['syspolicyd', 'WindowServer', 'omp']));

const drill = [
  { key: 'cpu-hog-0', label: '1. WindowServer (1 proc)' },
  { key: 'cpu-hog-1', label: '2. Claude (8 procs)' },
  { key: 'cpu-hog-2', label: '3. syspolicyd (2 procs)' },
  { key: 'cpu-hog-3', label: '4. omp (6 procs)' },
  { key: 'cpu-gpu-detail', label: 'Apple Silicon GPU' },
];
const shown = sandbox.rowsForNamedHogs(drill, names).map(function (row) { return row.key; });
assert.strictEqual(JSON.stringify(shown), JSON.stringify(['cpu-hog-2', 'cpu-hog-0', 'cpu-hog-3']));

const fallback = sandbox.rowsForNamedHogs(drill, []).map(function (row) { return row.key; });
assert.strictEqual(JSON.stringify(fallback), JSON.stringify(['cpu-hog-0', 'cpu-hog-1', 'cpu-hog-2']));

console.log('PASS test-hud-top-hog-rows');
