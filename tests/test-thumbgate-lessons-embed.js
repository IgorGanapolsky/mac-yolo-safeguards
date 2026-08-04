'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tool = path.join('tools', 'thumbgate-lessons-embed.js');

test('embed tool dry-run exits 0 (empty store is ok on CI)', () => {
  const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-embed-empty-'));
  try {
    const r = spawnSync(
      process.execPath,
      [tool, '--dir', emptyDir, '--limit', '1', '--json'],
      { encoding: 'utf8', timeout: 30000 },
    );
    assert.equal(r.status, 0, r.stderr || r.stdout);
    const j = JSON.parse(r.stdout);
    assert.equal(j.apply, false);
    assert.equal(j.lessonCount, 0);
    assert.equal(j.ok, true);
  } finally {
    fs.rmSync(emptyDir, { recursive: true, force: true });
  }
});

test('embed tool dry-run exits 0 against HOME thumbgate when present', () => {
  const r = spawnSync(
    process.execPath,
    [tool, '--dir', path.join(process.env.HOME, '.thumbgate'), '--limit', '1', '--json'],
    { encoding: 'utf8', timeout: 30000 },
  );
  assert.equal(r.status, 0, r.stderr || r.stdout);
  const j = JSON.parse(r.stdout);
  assert.equal(j.apply, false);
  assert.ok(j.lessonCount >= 0);
});

test('embed tool --apply with empty store exits 1', () => {
  const emptyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-embed-apply-empty-'));
  try {
    const r = spawnSync(
      process.execPath,
      [tool, '--dir', emptyDir, '--apply', '--json'],
      { encoding: 'utf8', timeout: 30000 },
    );
    assert.equal(r.status, 1, r.stderr || r.stdout);
    const j = JSON.parse(r.stdout);
    assert.equal(j.ok, false);
  } finally {
    fs.rmSync(emptyDir, { recursive: true, force: true });
  }
});
