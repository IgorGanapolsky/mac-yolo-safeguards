#!/usr/bin/env node
'use strict';

/**
 * Print a stable prefix pack for agent prompts (cache-friendly head).
 *
 *   node tools/inference-eng/load-prefix-pack.js coding
 *   node tools/inference-eng/load-prefix-pack.js draft --json
 */

const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, 'prefix-packs');
const MAP = {
  coding: 'coding-system.md',
  code: 'coding-system.md',
  plan: 'coding-system.md',
  draft: 'draft-system.md',
  outreach: 'draft-system.md',
};

const name = process.argv[2] || 'coding';
const json = process.argv.includes('--json');
const file = MAP[name];
if (!file) {
  console.error(`Unknown pack: ${name}. Known: ${Object.keys(MAP).join(', ')}`);
  process.exit(2);
}
const text = fs.readFileSync(path.join(DIR, file), 'utf8');
if (json) {
  process.stdout.write(`${JSON.stringify({ pack: name, file, bytes: text.length, text }, null, 2)}\n`);
} else {
  process.stdout.write(text);
}
