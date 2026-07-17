#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  writeSessionHandoff,
  normalizeHandoff,
  formatMarkdown,
} = require('../tools/hermes-mobile-session-handoff.js');

function test(name, fn) {
  try {
    fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    console.error(error);
    process.exitCode = 1;
  }
}

const tmpVault = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-handoff-vault-'));
const handoffsDir = path.join(tmpVault, 'Handoffs');
fs.mkdirSync(handoffsDir, { recursive: true });

test('normalize redacts secrets', () => {
  const h = normalizeHandoff({
    lastGoal: 'use sk-abcdefghijklmnop',
    lastAssistantSummary: 'Bearer supersecrettokenvalue99',
    openTodos: ['a', 'b'],
  });
  assert.ok(!h.lastGoal.includes('sk-abc'));
  assert.ok(!h.lastAssistantSummary.includes('Bearer super'));
  assert.strictEqual(h.vaultRelativePath, 'Handoffs/hermes-mobile-last.md');
});

test('writeSessionHandoff writes vault markdown', () => {
  const result = writeSessionHandoff(
    {
      lastGoal: 'Pick up continuity work',
      lastAssistantSummary: 'Drafted handoff util.',
      openTodos: ['Ship PR'],
      macName: 'test-mac',
      previousSessionId: 's1',
    },
    { vaultPath: tmpVault },
  );
  assert.strictEqual(result.ok, true);
  assert.ok(fs.existsSync(result.vaultFile));
  const md = fs.readFileSync(result.vaultFile, 'utf8');
  assert.ok(md.includes('hermes-mobile-session-continuity'));
  assert.ok(md.includes('Pick up continuity work'));
  assert.ok(md.includes('Do not let MEMORY.md'));
  assert.ok(formatMarkdown(result.handoff).includes('Ship PR'));
});

if (process.exitCode) {
  process.exit(process.exitCode);
}
console.log('All hermes-mobile-session-handoff tests passed');
