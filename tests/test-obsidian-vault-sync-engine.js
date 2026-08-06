'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { syncObsidianVaultMemory } = require('../tools/obsidian-vault-sync-engine');

test('syncObsidianVaultMemory incrementally appends session memory without overwriting existing notes', () => {
  const scratchVault = fs.mkdtempSync(path.join(os.tmpdir(), 'obsidian-test-vault-'));
  
  // First sync
  const res1 = syncObsidianVaultMemory({ vault: scratchVault });
  assert.equal(res1.status, 'OBSIDIAN VAULT MEMORY SYNCED (INCREMENTAL APPEND)');
  assert.ok(fs.existsSync(res1.sessionLogFile));
  
  const contentInitial = fs.readFileSync(res1.sessionLogFile, 'utf8');
  assert.ok(contentInitial.includes('Session Snapshot —'));

  // Second sync (should append, not overwrite)
  const res2 = syncObsidianVaultMemory({ vault: scratchVault });
  const contentUpdated = fs.readFileSync(res2.sessionLogFile, 'utf8');

  // Verify that the initial content is preserved and a second snapshot was appended
  assert.ok(contentUpdated.startsWith(contentInitial.slice(0, 100)));
  const occurrences = (contentUpdated.match(/## Session Snapshot —/g) || []).length;
  assert.equal(occurrences, 2);

  // Clean up
  fs.rmSync(scratchVault, { recursive: true, force: true });
});
