#!/usr/bin/env node
'use strict';

const assert = require('assert');
const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const ROOT = path.join(__dirname, '..');
const TOOL = path.join(ROOT, 'tools/garryslist-continuous-ops.js');
const mod = require(TOOL);

function main() {
  const html = `
    <h3><a href="/posts/the-campaign-to-kill-american-ai-runs-through-san-francisco">The Campaign to Kill American AI</a></h3>
    <h3><a href="/posts/red-robin-died-by-spreadsheet-don-t-make-the-same-mistake">Red Robin Died by Spreadsheet</a></h3>
    <h2><a href="/posts/the-new-octopus">The New Octopus</a></h2>
    <h3><a href="/posts/feed">Feed</a></h3>
    <a href="/posts?channel=techno_optimism">Techno</a>
  `;
  const { posts, channels } = mod.extractPosts(html);
  assert.strictEqual(posts.length, 3);
  assert.ok(channels.includes('techno_optimism'));

  const scored = posts.map(mod.scorePost);
  const ai = scored.find((p) => p.slug.includes('american-ai'));
  assert.ok(ai.score >= 25);
  assert.strictEqual(ai.engage_priority, 'high');
  assert.ok(ai.money_angle === 'builder_ai_ops');

  const c = mod.draftComment(ai);
  assert.ok(c.body.includes('Igor'));
  assert.ok(c.mode.includes('DRAFT'));

  // live cycle in temp state
  const state = fs.mkdtempSync(path.join(os.tmpdir(), 'gl-ops-'));
  const r = spawnSync(process.execPath, [TOOL, 'cycle', '--json'], {
    encoding: 'utf8',
    cwd: ROOT,
    env: { ...process.env, GARRYSLIST_STATE_DIR: state, GARRYSLIST_VAULT_NOTE: path.join(state, 'vault.md') },
    timeout: 60000,
  });
  assert.strictEqual(r.status, 0, r.stderr || r.stdout);
  const j = JSON.parse(r.stdout);
  assert.strictEqual(j.ok, true);
  assert.ok(j.scraped_posts >= 5);
  assert.ok(fs.existsSync(path.join(state, 'drafts', 'latest.json')));
  assert.ok(fs.existsSync(path.join(state, 'feed-latest.json')));
  const drafts = JSON.parse(fs.readFileSync(path.join(state, 'drafts', 'latest.json'), 'utf8'));
  assert.ok(Array.isArray(drafts.comments));
  assert.ok(drafts.engage_policy.auto_comment === false);

  console.log('test-garryslist-continuous-ops: PASS');
}

main();
