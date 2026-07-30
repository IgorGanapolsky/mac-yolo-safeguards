'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('child_process');
const path = require('path');
test('embed tool dry-run exits 0', () => {
  const r = spawnSync(process.execPath, [path.join('tools', 'thumbgate-lessons-embed.js'), '--dir', path.join(process.env.HOME, '.thumbgate'), '--limit', '1', '--json'], { encoding: 'utf8', timeout: 30000 });
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const j = JSON.parse(r.stdout);
  assert.equal(j.apply, false);
  assert.ok(j.lessonCount >= 0);
});
