#!/usr/bin/env node
'use strict';

/**
 * Offline tests for TensorZero→Hermes LLMOps lifecycle tool.
 *   node tests/test-llmops-lifecycle.js
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const REPO = path.resolve(__dirname, '..');
const tool = path.join(REPO, 'tools/llmops-lifecycle.js');

function run(args, env = {}) {
  return spawnSync(process.execPath, [tool, ...args], {
    cwd: REPO,
    encoding: 'utf8',
    env: { ...process.env, ...env },
    timeout: 120000,
    maxBuffer: 8 * 1024 * 1024,
  });
}

// map pillars
{
  const r = run(['map', '--json']);
  assert.strictEqual(r.status, 0, r.stderr || r.stdout);
  const j = JSON.parse(r.stdout);
  assert.ok(j.pillars.length >= 5);
  assert.ok(j.source.url.includes('2080976597536870529'));
  assert.ok(j.high_roi_now.length >= 3);
}

// record inference + feedback + close-loop (skip network-heavy if needed)
{
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'llmops-home-'));
  const body = path.join(home, 'inf.json');
  fs.writeFileSync(
    body,
    JSON.stringify({
      model: 'hermes-local',
      provider: 'litellm',
      task: 'unit-test inference',
      latency_ms: 12,
      ok: true,
    }),
  );
  const env = { HOME: home };
  const rec = run(['record-inference', '--body-file', body, '--json'], env);
  assert.strictEqual(rec.status, 0, rec.stderr || rec.stdout);
  const inf = JSON.parse(rec.stdout);
  assert.ok(inf.ok && inf.inference.id);

  const fb = run(
    [
      'record-feedback',
      '--inference-id',
      inf.inference.id,
      '--signal',
      'down',
      '--note',
      'empty stream hard stop regression',
      '--json',
    ],
    env,
  );
  assert.strictEqual(fb.status, 0, fb.stderr || fb.stdout);
  const feedback = JSON.parse(fb.stdout);
  assert.strictEqual(feedback.feedback.signal, 'down');

  const storeInf = path.join(home, '.hermes', 'llmops', 'inferences.jsonl');
  const storeFb = path.join(home, '.hermes', 'llmops', 'feedback.jsonl');
  assert.ok(fs.existsSync(storeInf));
  assert.ok(fs.existsSync(storeFb));
}

// doctor local --json (uses real gateway if up)
{
  const r = run(['doctor', '--json', '--skip-mini']);
  // may be exit 1 if gateway down — still must parse
  const j = JSON.parse(r.stdout);
  assert.ok(j.schema_version);
  assert.ok(Array.isArray(j.checks));
  assert.ok(j.checks.some((c) => c.id === 'gateway_models' || c.id === 'eval_check'));
}

// module exports
{
  const m = require(tool);
  assert.ok(typeof m.pillarMap === 'function');
  assert.ok(m.TENSORZERO_SOURCE.url);
}

// map must refuse vendoring archived TensorZero
{
  const r = run(['map', '--json']);
  const j = JSON.parse(r.stdout);
  assert.ok(j.anti_patterns.some((a) => /archived TensorZero/i.test(a)));
}

console.log('PASS tests/test-llmops-lifecycle.js');
