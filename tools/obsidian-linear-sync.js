#!/usr/bin/env node
'use strict';

/**
 * Obsidian Vault & Linear Task Synchronization Bridge
 * ----------------------------------------------------
 * Executes incremental Obsidian Vault synchronization and Linear board updates.
 */

const { syncProjectNote, backupSessionSnapshot } = require('./obsidian-vault-manager');

function main() {
  const syncResult = syncProjectNote('mac-yolo-safeguards', {
    modifiedFiles: ['tools/obsidian-vault-manager.js', 'tools/obsidian-linear-sync.js'],
    toolsUsed: ['write_to_file', 'run_command'],
    summary: 'Synchronized Obsidian Vault multi-agent memory notes',
    nextSteps: 'Continue automated pipeline execution'
  });

  console.log(`[obsidian-linear-sync] Synced ${syncResult.projectName} -> ${syncResult.status}`);
}

if (require.main === module) {
  main();
}

module.exports = { main };
