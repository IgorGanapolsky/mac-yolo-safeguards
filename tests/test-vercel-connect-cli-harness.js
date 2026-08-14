#!/usr/bin/env node
'use strict';

const assert = require('assert');
const { spawnSync } = require('child_process');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const TOOL = path.join(ROOT, 'tools/vercel-connect-cli-harness.js');
const mod = require(TOOL);

function run(args) {
  return spawnSync(process.execPath, [TOOL, ...args], {
    encoding: 'utf8',
    cwd: ROOT,
  });
}

function main() {
  // pure helpers
  const help = mod.parseConnectHelp('Commands:\n  create\n  list\n  token\n  attach\n  detach\n  remove\n  open');
  assert.strictEqual(help.hasConnect, true);
  assert.ok(help.subcommands.includes('create'));
  assert.ok(help.subcommands.includes('token'));

  const recipe = mod.buildRecipe(
    { service: 'slack', name: 'hermes-ops-slack', needsCredentials: true, products: ['hermes-control-plane'] },
    { project: 'hermes-control-plane' },
  );
  assert.ok(recipe.commands.create.includes('vercel connect create slack'));
  assert.ok(recipe.commands.attach.includes('--project hermes-control-plane'));
  assert.ok(recipe.commands.token.includes('vercel connect token'));

  // plan is deterministic, no network
  const plan = mod.plan();
  assert.strictEqual(plan.ok, true);
  assert.ok(plan.immediate.length >= 3);
  assert.ok(plan.immediate.every((i) => i.roi === 1));
  assert.ok(plan.how_this_helps.length >= 3);
  assert.ok(plan.not_a_fit.some((n) => /shopify/i.test(n) || /commerce/i.test(n)));
  // shopify is backlog not immediate
  assert.ok(!plan.immediate.some((i) => i.service === 'shopify'));
  assert.ok(plan.backlog.some((i) => i.service === 'shopify'));

  // offline probe never claims 10/10 theater
  const probe = mod.probe({ offline: true });
  assert.strictEqual(probe.ok, true);
  assert.strictEqual(probe.offline, true);
  assert.strictEqual(probe.ready, false);
  assert.ok(Array.isArray(probe.honesty.doesNotClaim));
  assert.ok(probe.honesty.doesNotClaim.some((s) => /10\/10/i.test(s)));

  // CLI plan --json
  let r = run(['plan', '--json']);
  assert.strictEqual(r.status, 0, r.stderr || r.stdout);
  const planJson = JSON.parse(r.stdout);
  assert.strictEqual(planJson.action, 'plan');
  assert.ok(planJson.immediate.some((i) => i.service === 'github'));
  assert.ok(planJson.immediate.some((i) => i.service === 'mcp.linear.app'));

  // recipe
  r = run(['recipe', '--service', 'stripe', '--name', 'continuity-stripe', '--project', 'hermes-control-plane', '--json']);
  assert.strictEqual(r.status, 0, r.stderr || r.stdout);
  const rec = JSON.parse(r.stdout);
  assert.ok(rec.recipe.commands.create.includes('stripe'));
  assert.ok(rec.recipe.commands.attach.includes('hermes-control-plane'));

  // offline probe via CLI — never claims theater status as truth
  r = run(['probe', '--offline', '--json']);
  assert.strictEqual(r.status, 0, r.stderr || r.stdout);
  const p = JSON.parse(r.stdout);
  assert.strictEqual(p.ready, false);
  assert.ok(p.honesty && p.honesty.doesNotClaim.some((s) => /10\/10/i.test(s)));
  assert.ok(!p.overallStatus);
  assert.notStrictEqual(p.ready, true);

  // catalog integrity
  assert.ok(mod.HIGH_ROI_CATALOG.every((c) => c.service && c.name && c.roi >= 1 && c.roi <= 3));

  console.log('test-vercel-connect-cli-harness: PASS');
}

main();
