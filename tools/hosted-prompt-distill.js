#!/usr/bin/env node
'use strict';

const { spawnSync } = require('node:child_process');
const path = require('node:path');

const LIB = path.join(__dirname, '..', 'apps', 'hermes-control-plane', 'lib', 'hosted-prompt-distill.mjs');

function main(argv = process.argv.slice(2)) {
  const result = spawnSync(process.execPath, [LIB, ...argv], { stdio: 'inherit' });
  const code = result.status == null ? 1 : result.status;
  if (require.main === module) process.exit(code);
  return code;
}

module.exports = { main };

if (require.main === module) main();
