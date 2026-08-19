#!/usr/bin/env node
'use strict';

const assert = require('assert');
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const TOOL = path.join(ROOT, 'tools/gurobi-solver-touchpoints.js');
const { mapTouchpoints, TOUCHPOINTS } = require(TOOL);

function main() {
  assert.ok(fs.existsSync(TOOL));
  const map = mapTouchpoints(ROOT);
  assert.strictEqual(map.ok, true, JSON.stringify(map.missing));
  assert.ok(map.narrowest.includes('tools/gurobi-fleet-optimize.py'));
  assert.ok(map.narrowest.includes('tools/gurobi_fleet_lib.py'));
  assert.ok(map.keep_stable.includes('examples/gurobi'));
  assert.ok(map.keep_stable.includes('tools/agent-session-start.js'));
  assert.ok(TOUCHPOINTS.every((tp) => typeof tp.swap === 'boolean'));
  assert.ok(map.items.every((i) => i.exists === true));

  const cli = spawnSync(process.execPath, [TOOL, '--json'], {
    encoding: 'utf8',
    cwd: ROOT,
    timeout: 5_000,
  });
  assert.strictEqual(cli.status, 0, cli.stderr || cli.stdout);
  const parsed = JSON.parse(cli.stdout);
  assert.strictEqual(parsed.rule, 'swap_at_narrowest_interface');
  assert.strictEqual(parsed.ok, true);

  console.log(
    `test-gurobi-solver-touchpoints: PASS narrowest=${parsed.narrowest.join(',')} keep=${parsed.keep_stable.length}`,
  );
}

main();
