#!/usr/bin/env node
'use strict';

const assert = require('assert');
const { spawnSync } = require('child_process');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const TOOL = path.join(ROOT, 'tools/mcp-seo-data-harness.js');
const mod = require(TOOL);

function run(args) {
  return spawnSync(process.execPath, [TOOL, ...args], {
    encoding: 'utf8',
    cwd: ROOT,
    env: { ...process.env, SEMRUSH_API_KEY: '', GITHUB_MCP_PAT: process.env.GITHUB_MCP_PAT || '' },
  });
}

function main() {
  // pure helpers
  assert.strictEqual(mod.envPresent([]).ready, true);
  assert.strictEqual(mod.envPresent(['TOTALLY_UNSET_ENV_XYZ_123']).ready, false);
  assert.strictEqual(mod.headerLooksEmptyBearer({ headers: { Authorization: 'Bearer ' } }), true);
  assert.strictEqual(
    mod.headerLooksEmptyBearer({ headers: { Authorization: 'Bearer ${SEMRUSH_API_KEY:-}' } }),
    true,
  );

  // inventory never invents CONNECTED for GSC
  const inv = mod.inventory();
  assert.strictEqual(inv.ok, true);
  const gsc = inv.sources.find((s) => s.id === 'gsc');
  assert.ok(gsc);
  assert.notStrictEqual(gsc.status, 'READY');
  assert.ok(!inv.summary.ready.includes('gsc'));
  assert.ok(inv.summary.theaterRejected.some((t) => /10\/10/i.test(t)));

  // plan + prompts
  const plan = mod.plan();
  assert.ok(plan.how_this_helps.length >= 3);
  assert.ok(plan.not_a_fit.some((n) => /ahrefs|semrush|seo agency/i.test(n)));

  const prompts = mod.prompts({ property: 'thumbgate.app' });
  assert.ok(prompts.items.every((i) => /Using the /i.test(i.prompt) || i.mcp === 'chain' || i.mcp === 'grepai' || i.mcp === 'github'));
  assert.ok(prompts.items.some((i) => i.prompt.includes('Using the Semrush MCP')));
  assert.ok(prompts.items.some((i) => i.prompt.includes('Using the Search Console MCP')));
  assert.ok(prompts.items.some((i) => i.prompt.includes('thumbgate.app')));

  // CLI
  let r = run(['inventory', '--json']);
  assert.strictEqual(r.status, 0, r.stderr || r.stdout);
  const j = JSON.parse(r.stdout);
  assert.strictEqual(j.action, 'inventory');
  assert.ok(!JSON.stringify(j).includes('10/10 (MCP DATA PIPELINE ACTIVE)'));
  assert.ok(!j.sources.some((s) => s.status === 'CONNECTED'));

  r = run(['prompts', '--property', 'example.com', '--json']);
  assert.strictEqual(r.status, 0, r.stderr || r.stdout);
  const p = JSON.parse(r.stdout);
  // Host pin for fixture property (avoid CodeQL incomplete URL-substring).
  assert.strictEqual(p.property, 'example.com');
  assert.ok(typeof p.items[0].prompt === 'string' && p.items[0].prompt.length > 0);

  r = run(['gaps', '--json']);
  assert.strictEqual(r.status, 0, r.stderr || r.stdout);
  const g = JSON.parse(r.stdout);
  assert.ok(Array.isArray(g.gaps));

  r = run(['plan', '--json']);
  assert.strictEqual(r.status, 0, r.stderr || r.stdout);

  console.log('test-mcp-seo-data-harness: PASS');
}

main();
