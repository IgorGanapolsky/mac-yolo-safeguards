#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const TOOL = path.join(ROOT, 'tools/agent-memory-before-gen.js');

function run(args, env = {}) {
  return spawnSync(process.execPath, [TOOL, ...args], {
    encoding: 'utf8',
    env: { ...process.env, ...env },
    cwd: ROOT,
  });
}

function tmpStore() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-mem-'));
  return path.join(dir, 'memory.jsonl');
}

function main() {
  const store = tmpStore();

  // empty decide → GENERATE
  let r = run(['decide', '--query', 'score HVAC after hours leak', '--domain', 'ahls', '--store', store, '--json']);
  assert.strictEqual(r.status, 0, r.stderr || r.stdout);
  let j = JSON.parse(r.stdout);
  assert.strictEqual(j.decision, 'GENERATE');
  assert.strictEqual(j.score, 0);
  assert.ok(Array.isArray(j.vanity_metrics_rejected));

  // store then REUSE on near-identical query
  r = run([
    'store',
    '--query',
    'score HVAC shop after-hours missed call leakage',
    '--answer',
    'AHLS: website has no after-hours CTA; score 42; recommend $149 audit.',
    '--domain',
    'ahls',
    '--store',
    store,
    '--json',
  ]);
  assert.strictEqual(r.status, 0, r.stderr || r.stdout);
  j = JSON.parse(r.stdout);
  assert.strictEqual(j.ok, true);
  assert.ok(j.entry.id);

  r = run([
    'decide',
    '--query',
    'score HVAC shop after-hours missed call leakage',
    '--domain',
    'ahls',
    '--store',
    store,
    '--json',
  ]);
  assert.strictEqual(r.status, 0, r.stderr || r.stdout);
  j = JSON.parse(r.stdout);
  assert.strictEqual(j.decision, 'REUSE', JSON.stringify(j));
  assert.ok(j.estimated_tokens_saved >= 3000);
  assert.ok(j.hit && j.hit.answer.includes('AHLS'));

  // related but not identical → ADAPT or REUSE depending on jaccard
  r = run([
    'decide',
    '--query',
    'HVAC plumbing after hours missed call website score audit',
    '--domain',
    'ahls',
    '--store',
    store,
    '--json',
  ]);
  assert.strictEqual(r.status, 0, r.stderr || r.stdout);
  j = JSON.parse(r.stdout);
  assert.ok(['REUSE', 'ADAPT', 'GENERATE'].includes(j.decision), j.decision);
  assert.ok(j.score > 0.2, `expected some similarity, got ${j.score}`);

  // domain isolation: code domain should not REUSE ahls hit unless general
  r = run([
    'decide',
    '--query',
    'score HVAC shop after-hours missed call leakage',
    '--domain',
    'code',
    '--store',
    store,
    '--json',
  ]);
  assert.strictEqual(r.status, 0, r.stderr || r.stdout);
  j = JSON.parse(r.stdout);
  // ahls entry is filtered out for domain=code → GENERATE
  assert.strictEqual(j.decision, 'GENERATE', JSON.stringify(j));

  r = run(['stats', '--store', store, '--json']);
  assert.strictEqual(r.status, 0);
  j = JSON.parse(r.stdout);
  assert.strictEqual(j.count, 1);
  assert.strictEqual(j.by_domain.ahls, 1);

  // hyphenated query should still REUSE the spaced store form
  r = run([
    'decide',
    '--query',
    'score HVAC shop after-hours missed call leakage',
    '--domain',
    'ahls',
    '--store',
    store,
    '--json',
  ]);
  assert.strictEqual(r.status, 0, r.stderr || r.stdout);
  j = JSON.parse(r.stdout);
  assert.strictEqual(j.decision, 'REUSE', `hyphen normalize failed: ${JSON.stringify(j)}`);

  // unit export checks
  const mod = require(TOOL);
  assert.ok(mod.jaccard(mod.tokenize('a b c'), mod.tokenize('a b c')) === 1);
  assert.ok(mod.jaccard(mod.tokenize('alpha beta'), mod.tokenize('gamma delta')) === 0);
  assert.ok(
    mod.jaccard(mod.tokenize('after-hours leak'), mod.tokenize('after hours leak')) === 1,
    'hyphen should tokenize as space',
  );

  console.log('test-agent-memory-before-gen: PASS');
}

main();
