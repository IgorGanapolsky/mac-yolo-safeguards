#!/usr/bin/env node
'use strict';

/**
 * Copy the Maestro flow tree and rewrite every `appId:` declaration to one target
 * application id.
 *
 * Why this exists: the committed flows under .maestro/ declare the iOS bundle id
 * (com.iganapolsky.hermesmobile), which is also the RETIRED Android free package.
 * Android ships com.iganapolsky.hermesmobile.paid, so any Android run must execute
 * against a rewritten copy — never the source tree — or it tests an app nobody
 * can install.
 *
 * `run-maestro-for-app.sh` does this inline for `maestro test`. This module serves
 * runners that drive a different binary (e.g. Callstack `agent-device test --maestro`)
 * and the parity guard in tests/test-maestro-appid-package-parity.js.
 *
 * usage: node maestro-flow-tree-for-app.cjs <sourceDir> <destDir> <appId>
 *   Prints the destination directory on stdout. Exits non-zero when nothing was
 *   rewritten or when a source appId survived the rewrite.
 */

const fs = require('fs');
const path = require('path');

const APP_ID_LINE = /^appId:[ \t]*(\S+)[ \t]*$/gm;
const VALID_APP_ID = /^[A-Za-z0-9._]+$/;

function rewriteFlowTree(sourceDir, destDir, appId) {
  if (!VALID_APP_ID.test(appId || '')) {
    throw new Error(`Invalid application id: ${appId}`);
  }
  if (!fs.existsSync(sourceDir)) {
    throw new Error(`Maestro flow tree not found: ${sourceDir}`);
  }

  fs.mkdirSync(destDir, { recursive: true });
  fs.cpSync(sourceDir, destDir, { recursive: true });

  let rewritten = 0;
  const files = fs.readdirSync(destDir).filter((name) => name.endsWith('.yaml'));
  for (const name of files) {
    const file = path.join(destDir, name);
    const source = fs.readFileSync(file, 'utf8');
    const updated = source.replace(APP_ID_LINE, (line, declared) => {
      if (declared === appId) return line;
      rewritten += 1;
      return `appId: ${appId}`;
    });
    if (updated !== source) fs.writeFileSync(file, updated);
  }

  const survivors = [];
  for (const name of files) {
    const contents = fs.readFileSync(path.join(destDir, name), 'utf8');
    for (const match of contents.matchAll(APP_ID_LINE)) {
      if (match[1] !== appId) survivors.push(`${name}: ${match[1]}`);
    }
  }
  if (survivors.length) {
    throw new Error(`appId declarations survived the rewrite:\n  ${survivors.join('\n  ')}`);
  }

  return { destDir, rewritten, files: files.length };
}

module.exports = { rewriteFlowTree, APP_ID_LINE };

if (require.main === module) {
  const [sourceDir, destDir, appId] = process.argv.slice(2);
  if (!sourceDir || !destDir || !appId) {
    console.error('usage: maestro-flow-tree-for-app.cjs <sourceDir> <destDir> <appId>');
    process.exit(2);
  }
  try {
    const result = rewriteFlowTree(sourceDir, destDir, appId);
    console.error(`Maestro appId: ${appId} (${result.files} flow files)`);
    console.log(result.destDir);
  } catch (error) {
    console.error(String(error.message || error));
    process.exit(1);
  }
}
