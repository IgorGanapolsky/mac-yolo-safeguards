'use strict';

/**
 * Unit Tests for Obsidian Vault Manager (`tools/obsidian-vault-manager.js`)
 * Compatible with node tests/test-*.js harness (uses node:assert).
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { syncProjectNote, backupSessionSnapshot } = require('../tools/obsidian-vault-manager');

console.log('Running test-obsidian-vault-manager.js...');

// Test 1: Incremental Project Sync without overwriting
{
  const res1 = syncProjectNote('test-project-obsidian', {
    modifiedFiles: ['file1.js'],
    toolsUsed: ['write_to_file'],
    summary: 'Turn 1 progress',
    nextSteps: 'Turn 2'
  });

  assert.ok(fs.existsSync(res1.projectFile), 'Expected project file to exist');

  const res2 = syncProjectNote('test-project-obsidian', {
    modifiedFiles: ['file2.js'],
    toolsUsed: ['replace_file_content'],
    summary: 'Turn 2 progress',
    nextSteps: 'Turn 3'
  });

  assert.strictEqual(res2.status, 'INCREMENTAL_MERGED_NO_OVERWRITE', 'Expected INCREMENTAL_MERGED_NO_OVERWRITE');

  const content = fs.readFileSync(res2.projectFile, 'utf8');
  assert.ok(content.includes('Turn 1 progress'), 'Expected Turn 1 progress preserved');
  assert.ok(content.includes('Turn 2 progress'), 'Expected Turn 2 progress appended');
}

// Test 2: Session Backup Snapshot
{
  const sessionRes = backupSessionSnapshot('test-session-123', {
    projectName: 'test-project-obsidian',
    agent: 'Antigravity',
    progressText: 'Session backup verified'
  });

  assert.ok(fs.existsSync(sessionRes.sessionFile), 'Expected session backup file to exist');
}

console.log('ok tests/test-obsidian-vault-manager.js');
