#!/usr/bin/env node
'use strict';

/**
 * CLI hub for inference engineering.
 *
 *   node tools/inference-eng/index.js scorecard
 *   node tools/inference-eng/index.js overview
 *   node tools/inference-eng/index.js library --list
 *   node tools/inference-eng/index.js fleet --json
 *   node tools/inference-eng/index.js tasks
 *   node tools/inference-eng/index.js metrics --json
 *   node tools/inference-eng/index.js optimize --json
 *   node tools/inference-eng/index.js pipeline coding-fix --json
 */

const { spawnSync } = require('child_process');
const path = require('path');

const DIR = __dirname;
const map = {
  scorecard: 'scorecard.js',
  fleet: 'fleet-health.js',
  'fleet-health': 'fleet-health.js',
  overview: 'overview.js',
  library: 'model-library.js',
  'model-library': 'model-library.js',
  tasks: 'task-registry.js',
  metrics: 'metrics.js',
  optimize: 'optimizer.js',
  optimizer: 'optimizer.js',
  pipeline: 'pipeline.js',
  degrade: 'degradation.js',
  degradation: 'degradation.js',
};

const cmd = process.argv[2] || 'scorecard';
const rest = process.argv.slice(3);
const file = map[cmd];
if (!file) {
  console.error(`Unknown command: ${cmd}. Known: ${Object.keys(map).join(', ')}`);
  process.exit(2);
}
// pipeline: first arg is name without --name for convenience
const args = cmd === 'pipeline' && rest[0] && !rest[0].startsWith('-')
  ? ['--name', rest[0], ...rest.slice(1)]
  : rest[0] === undefined && cmd === 'tasks'
    ? ['--list']
    : rest;

const r = spawnSync(process.execPath, [path.join(DIR, file), ...args], { stdio: 'inherit' });
process.exit(r.status == null ? 1 : r.status);
