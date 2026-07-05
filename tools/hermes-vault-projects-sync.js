#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { buildVaultProjectCatalog } = require('../hermes-mobile/scripts/vault-project-catalog.cjs');

const DEFAULT_VAULT = path.join(os.homedir(), 'Documents', 'AI-Agent-Sync');
const DEFAULT_OUT = path.join(
  os.homedir(),
  'Library',
  'Application Support',
  'mac-yolo-safeguards',
  'hermes-mobile-pair',
  'vault-projects.json',
);
const HERMES_OUT = path.join(os.homedir(), '.hermes', 'mobile-vault-projects.json');

function usage() {
  return `Usage:
  node tools/hermes-vault-projects-sync.js [--vault PATH] [--out PATH] [--json] [--stdout]

Reads AI-Agent-Sync Projects/README.md + recent Handoffs/ and writes a mobile catalog JSON
served by the Hermes pair server at :8765/vault-projects.json.`;
}

function parseArgs(argv) {
  const args = { vault: DEFAULT_VAULT, out: DEFAULT_OUT, json: false, stdout: false, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--vault') args.vault = path.resolve(requireValue(argv, ++i, arg));
    else if (arg === '--out') args.out = path.resolve(requireValue(argv, ++i, arg));
    else if (arg === '--json') args.json = true;
    else if (arg === '--stdout') args.stdout = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function requireValue(argv, index, flag) {
  if (!argv[index]) throw new Error(`${flag} requires a value`);
  return argv[index];
}

function readHandoffFiles(vaultPath) {
  const handoffsDir = path.join(vaultPath, 'Handoffs');
  if (!fs.existsSync(handoffsDir)) return [];
  return fs
    .readdirSync(handoffsDir)
    .filter((name) => name.endsWith('.md'))
    .sort()
    .reverse()
    .slice(0, 12)
    .map((name) => {
      const fullPath = path.join(handoffsDir, name);
      return { path: `Handoffs/${name}`, text: fs.readFileSync(fullPath, 'utf8') };
    });
}

function collectCatalog(vaultPath) {
  const readmePath = path.join(vaultPath, 'Projects', 'README.md');
  if (!fs.existsSync(readmePath)) {
    throw new Error(`Missing vault index: ${readmePath}`);
  }
  return buildVaultProjectCatalog({
    vaultPath,
    readmeText: fs.readFileSync(readmePath, 'utf8'),
    handoffFiles: readHandoffFiles(vaultPath),
  });
}

function writeCatalog(outPath, catalog) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(catalog, null, 2)}\n`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    process.exit(0);
  }
  const catalog = collectCatalog(args.vault);
  const payload = `${JSON.stringify(catalog, null, 2)}\n`;
  if (!args.stdout) {
    writeCatalog(args.out, catalog);
    writeCatalog(HERMES_OUT, catalog);
  }
  if (args.json || args.stdout) {
    process.stdout.write(payload);
  } else {
    console.log(
      `vault-projects: ${catalog.projects.length} projects → ${args.out} (+ ${HERMES_OUT})`,
    );
  }
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message || error);
    process.exit(1);
  }
}

module.exports = { collectCatalog, DEFAULT_VAULT, DEFAULT_OUT, HERMES_OUT };
