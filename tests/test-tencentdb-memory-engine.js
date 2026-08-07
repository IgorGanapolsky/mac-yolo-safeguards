#!/usr/bin/env node
'use strict';
/**
 * Tests for tools/tencentdb-memory-engine.js — the local layered-memory engine.
 *
 * Mirrors the exact evidence contract from tools/tencentdb-memory-readiness.js:
 *   short_term_refs  -> refs/ dir populated
 *   mermaid_canvas   -> canvas.mmd exists + matches mermaid syntax regex
 *   layered_ltm      -> conversation/ + atoms.jsonl + scenarios/ + persona.md exist
 *   traceable_recall -> atoms.jsonl carries node_id/result_ref
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ENGINE = path.join(__dirname, '..', 'tools', 'tencentdb-memory-engine.js');
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'tencentdb-memory-engine-'));

const MERMAID_RE = /graph\s+(TD|LR|RL|BT)|flowchart\s+(TD|LR|RL|BT)|stateDiagram|sequenceDiagram/;

function run(args) {
  return execFileSync(process.execPath, [ENGINE, ...args], { encoding: 'utf8' }).trim();
}

let passed = 0;
function ok(name) { passed += 1; console.log(`ok ${passed} - ${name}`); }

function cleanup() {
  try { fs.rmSync(ROOT, { recursive: true, force: true }); } catch (_) { /* best effort */ }
}

try {
  // 1. init creates the full layered layout
  run(['init', '--root', ROOT]);
  for (const f of ['refs', 'conversation', 'scenarios']) {
    assert.ok(fs.existsSync(path.join(ROOT, f)), `${f} dir missing after init`);
  }
  for (const f of ['atoms.jsonl', 'persona.md', 'canvas.mmd']) {
    assert.ok(fs.existsSync(path.join(ROOT, f)), `${f} missing after init`);
  }
  ok('init creates refs/conversation/scenarios/atoms/persona/canvas');

  // 2. short_term_refs: offload populates refs/
  run(['offload', '--root', ROOT, '--name', 'readiness-run', '--text', 'raw tool output line 1\nline 2']);
  const refs = fs.readdirSync(path.join(ROOT, 'refs'));
  assert.strictEqual(refs.length, 1, 'expected exactly 1 offloaded ref');
  assert.ok(refs[0].endsWith('.md'), 'ref file must be markdown');
  const refBody = fs.readFileSync(path.join(ROOT, 'refs', refs[0]), 'utf8');
  assert.ok(refBody.includes('line 2'), 'ref file should carry the offloaded payload');
  ok('offload writes refs/ with stable result_ref and payload');

  // 3. mermaid_canvas: canvas.mmd has mermaid syntax and can be updated
  assert.ok(MERMAID_RE.test(fs.readFileSync(path.join(ROOT, 'canvas.mmd'), 'utf8')), 'canvas must be mermaid');
  run(['canvas', '--root', ROOT, '--state', 'MemoryWarm', '--title', 'TencentDB_Engine']);
  const canvas = fs.readFileSync(path.join(ROOT, 'canvas.mmd'), 'utf8');
  assert.ok(MERMAID_RE.test(canvas), 'updated canvas still mermaid');
  ok('canvas.mmd contains mermaid stateDiagram syntax');

  // 4. layered_ltm: scenario + persona present
  run(['scenario', '--root', ROOT, '--slug', 'context-compaction', '--text', '70k token prompt -> compress via offload+canvas']);
  assert.ok(fs.readdirSync(path.join(ROOT, 'scenarios')).some((f) => f.startsWith('context-compaction')), 'scenario file missing');
  assert.ok(fs.readFileSync(path.join(ROOT, 'persona.md'), 'utf8').includes('Persona'), 'persona.md missing');
  ok('scenarios/ + persona.md satisfy layered LTM');

  // 5. traceable_recall: atoms.jsonl entries carry node_id + result_ref
  run(['atom', '--root', ROOT, '--layer', 'L1', '--text', 'traceable fact', '--ref', 'refs/readiness-run.md']);
  const atoms = fs.readFileSync(path.join(ROOT, 'atoms.jsonl'), 'utf8').trim().split('\n').filter(Boolean)
    .map((l) => JSON.parse(l));
  assert.ok(atoms.length >= 3, 'expected at least 3 atoms (offload + scenario + atom)');
  for (const a of atoms) {
    assert.ok(a.node_id, 'atom missing node_id');
    assert.ok(a.result_ref, 'atom missing result_ref');
    assert.ok(a.layer, 'atom missing layer');
  }
  ok('atoms.jsonl entries are node_id/result_ref traceable');

  // 6. status reports counts and is valid JSON in --json mode
  const statusJson = JSON.parse(run(['status', '--root', ROOT, '--json']));
  assert.ok(statusJson.counts.refs >= 1, 'status refs count wrong');
  assert.ok(statusJson.counts.atoms >= 3, 'status atoms count wrong');
  assert.ok(statusJson.counts.scenarios >= 1, 'status scenarios count wrong');
  ok('status --json reports layer counts');

  // 7. Re-run against a fresh root must be idempotent for init
  const ROOT2 = path.join(ROOT, '..', 'tencentdb-memory-engine-idempotent-' + Date.now());
  run(['init', '--root', ROOT2]);
  run(['init', '--root', ROOT2]); // second init must not throw
  assert.ok(fs.existsSync(path.join(ROOT2, 'canvas.mmd')), 'idempotent init keeps canvas');
  fs.rmSync(ROOT2, { recursive: true, force: true });
  ok('init is idempotent');

  console.log(`\n${passed} passed`);
  cleanup();
} catch (e) {
  cleanup();
  console.error(`FAIL: ${e.message}`);
  process.exit(1);
}
