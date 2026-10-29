#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const tool = path.join(root, 'tools/shared-vault-memory.js');
const {
  PACKET_CHAR_CAP,
  appendDailyLog,
  contentBrief,
  resolveSharedVault,
  writeVaultNote,
} = require(tool);

let passed = 0;
function check(name, fn) {
  fn();
  passed += 1;
}

function tempVault() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'shared-vault-'));
  fs.mkdirSync(path.join(dir, 'Projects'), { recursive: true });
  fs.writeFileSync(
    path.join(dir, 'Projects', 'thumbgate.md'),
    '# ThumbGate\n\nHero page is https://thumbgate.app/.\n',
  );
  fs.writeFileSync(
    path.join(dir, 'Projects', 'railway.md'),
    '# Railway\n\nDeploy notes for another product.\n',
  );
  return dir;
}

check('typo home is refused and the shared vault is the default', () => {
  const typo = resolveSharedVault({ vault: '/Users/igorganapolsky/Documents/Obsidian Vault/Agent-Memories' });
  assert.equal(typo.ok, false);
  assert.equal(typo.reason, 'typo vault path');
  const fromEnv = resolveSharedVault({
    env: { HERMES_AGENT_SYNC_VAULT: '/tmp/explicit-vault' },
    home: '/Users/iganapolsky',
  });
  assert.equal(fromEnv.ok, true);
  assert.equal(fromEnv.vault, '/tmp/explicit-vault');
  const fallback = resolveSharedVault({ env: {}, home: '/Users/iganapolsky' });
  assert.equal(fallback.vault, '/Users/iganapolsky/Documents/AI-Agent-Sync');
});

check('a missing vault blocks the content brief', () => {
  const missing = contentBrief(path.join(os.tmpdir(), 'no-such-vault-shared'), 'thumbgate');
  assert.equal(missing.ok, false);
  assert.equal(missing.status, 'BLOCKED');
  assert.equal(missing.reason, 'vault missing');
  assert.deepEqual(missing.sources, []);
});

check('a matching note is the only context and nothing is invented', () => {
  const vault = tempVault();
  const brief = contentBrief(vault, 'thumbgate');
  assert.equal(brief.ok, true);
  assert.equal(brief.status, 'STAGED_FOR_APPROVAL');
  assert.deepEqual(brief.sources.map((source) => source.path), ['Projects/thumbgate.md']);
  assert.equal(brief.packet.includes('https://thumbgate.app/'), true);
  assert.equal(brief.packet.includes('Railway'), false);
  assert.equal(brief.packet.includes('$'), false);
  assert.equal(brief.packet.length <= PACKET_CHAR_CAP, true);
  assert.match(brief.rule, /Do not add prices/);
  const missed = contentBrief(vault, 'obsidian-jarvis');
  assert.equal(missed.ok, false);
  assert.equal(missed.reason, 'no matching note');
});

check('oversized notes are ignored', () => {
  const vault = tempVault();
  fs.writeFileSync(path.join(vault, 'Projects', 'huge.md'), `thumbgate ${'x'.repeat(300 * 1024)}`);
  const brief = contentBrief(vault, 'thumbgate');
  assert.equal(brief.sources.some((source) => source.path.endsWith('huge.md')), false);
  assert.equal(brief.sources.some((source) => source.path.endsWith('thumbgate.md')), true);
});

check('daily log keeps one section per agent and refuses secrets', () => {
  const vault = tempVault();
  const now = new Date('2026-10-29T13:30:17Z');
  const first = appendDailyLog(vault, {
    agent: 'hermes',
    finished: 'Read the ThumbGate note',
    learned: 'Hero is thumbgate.app',
    open: 'Content still staged',
  }, now);
  assert.equal(first.ok, true);
  const file = path.join(vault, 'Agent-State', 'daily', '2026-10-29.md');
  appendDailyLog(vault, {
    agent: 'grok',
    finished: 'Classified review depth',
    learned: 'Comment carries the depth',
    open: 'PR still open',
  }, now);
  const replaced = appendDailyLog(vault, {
    agent: 'hermes',
    finished: 'Replaced the Hermes section',
    learned: 'One section per agent',
    open: 'None',
  }, now);
  assert.equal(replaced.ok, true);
  const text = fs.readFileSync(file, 'utf8');
  assert.equal(text.includes('Replaced the Hermes section'), true);
  assert.equal(text.includes('Read the ThumbGate note'), false);
  assert.equal(text.includes('## grok'), true);
  assert.equal((text.match(/^## hermes$/gm) || []).length, 1);
  const secret = appendDailyLog(vault, {
    agent: 'hermes',
    finished: 'github_pat_should_not_land',
  }, now);
  assert.equal(secret.ok, false);
  assert.equal(fs.readFileSync(file, 'utf8').includes('github_pat_'), false);
  const empty = appendDailyLog(vault, { agent: 'hermes' }, now);
  assert.equal(empty.ok, false);
});

check('notes cannot escape the vault', () => {
  const vault = tempVault();
  const escaped = writeVaultNote(vault, '../outside.md', 'nope');
  assert.equal(escaped.ok, false);
  assert.equal(fs.existsSync(path.join(path.dirname(vault), 'outside.md')), false);
  const secret = writeVaultNote(vault, 'Agent-State/snapshots/x.md', 'sk_live_secret');
  assert.equal(secret.ok, false);
});

check('herdr snapshot writes into the shared vault', () => {
  const vault = tempVault();
  const { saveObsidianSnapshot } = require(path.join(root, 'tools/herdr-high-roi-engine.js'));
  const saved = saveObsidianSnapshot(vault, 'hermes', 'Recorded the vault note for thumbgate.app', 'fea45e8c');
  assert.equal(saved.ok, true);
  const written = fs.readFileSync(path.join(vault, saved.path), 'utf8');
  assert.equal(written.includes('thumbgate.app'), true);
  assert.equal(written.includes('VERIFIED_DONE'), false);
  const source = fs.readFileSync(path.join(root, 'tools/herdr-high-roi-engine.js'), 'utf8');
  assert.equal(source.includes('Documents/Obsidian Vault'), false);
});

check('cli blocks a query with no note', () => {
  const vault = tempVault();
  const run = spawnSync(process.execPath, [
    tool, 'context', '--vault', vault, '--query', 'jarvis-voice',
  ], { encoding: 'utf8' });
  assert.equal(run.status, 1);
  const body = JSON.parse(run.stdout);
  assert.equal(body.ok, false);
  assert.equal(body.status, 'BLOCKED');
});

console.log(`shared-vault-memory: ${passed} checks passed`);
