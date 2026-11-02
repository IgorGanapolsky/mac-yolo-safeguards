#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  measureStaleTemp,
  measureNamedLeftovers,
  countPrunableWorktrees,
  buildDiskRecommendations,
  sampleDiskRecommendations,
} = require('../tools/hud-live-recommendations');

const swiftPath = path.join(__dirname, '..', 'macos', 'MacYoloTranslucentHud.swift');

function clearSnapshot(over) {
  return Object.assign({
    staleClaudeBytes: 0,
    swiftCacheBytes: 0,
    nodeCacheBytes: 0,
    simCacheBytes: 0,
    orphanedWorktrees: 0,
    wasteSizeKnown: true,
    cleanMyMac: { pathCount: 0, bytes: 0, sizeKnown: true, primaryPath: '' },
    paper: { pathCount: 0, bytes: 0, sizeKnown: true },
  }, over);
}

function main() {
  const clear = buildDiskRecommendations(clearSnapshot());
  assert.strictEqual(clear.waste.done, true);
  assert.strictEqual(clear.cleanMyMac.done, true);
  assert.strictEqual(clear.paper.done, true);
  assert.ok(!/454/.test(clear.cleanMyMac.text));
  assert.ok(!/47\.24/.test(clear.waste.text));
  assert.ok(/already clear/i.test(clear.waste.text));
  assert.ok(/already gone/i.test(clear.cleanMyMac.text));
  assert.strictEqual(clear.waste.short, 'Clear');
  assert.strictEqual(clear.cleanMyMac.short, 'Already gone');

  const dirty = buildDiskRecommendations(clearSnapshot({
    staleClaudeBytes: 80 * 1024 * 1024,
    simCacheBytes: 12 * 1024 * 1024,
    orphanedWorktrees: 2,
    cleanMyMac: { pathCount: 3, bytes: 454 * 1024 * 1024, sizeKnown: true, primaryPath: '/Applications/CleanMyMac_5.app' },
    paper: { pathCount: 1, bytes: 20 * 1024 * 1024, sizeKnown: true },
  }));
  assert.strictEqual(dirty.waste.done, false);
  assert.strictEqual(dirty.cleanMyMac.done, false);
  assert.strictEqual(dirty.paper.done, false);
  assert.ok(/80 MB/.test(dirty.waste.text));
  assert.ok(/simulator cache/.test(dirty.waste.text));
  assert.ok(/2 orphaned worktrees/.test(dirty.waste.text));
  assert.ok(/454 MB/.test(dirty.cleanMyMac.text));
  assert.ok(/3 paths/.test(dirty.cleanMyMac.text));
  assert.strictEqual(dirty.cleanMyMac.primaryPath, '/Applications/CleanMyMac_5.app');

  const onlyApp = buildDiskRecommendations(clearSnapshot({
    cleanMyMac: { pathCount: 1, bytes: 0, sizeKnown: false },
  }));
  assert.strictEqual(onlyApp.waste.done, true);
  assert.strictEqual(onlyApp.cleanMyMac.done, false);
  assert.ok(!/454/.test(onlyApp.cleanMyMac.text));
  assert.ok(/1 path/.test(onlyApp.cleanMyMac.text));

  const unknown = buildDiskRecommendations(clearSnapshot({ wasteSizeKnown: false }));
  assert.strictEqual(unknown.waste.done, false);
  assert.ok(/being measured/i.test(unknown.waste.text));

  const noise = buildDiskRecommendations(clearSnapshot({
    staleClaudeBytes: 200 * 1024,
    swiftCacheBytes: 100 * 1024,
  }));
  assert.strictEqual(noise.waste.done, true);

  assert.strictEqual(countPrunableWorktrees([
    'worktree /tmp/live',
    'HEAD abc',
    'branch refs/heads/main',
    '',
    'worktree /tmp/gone',
    'HEAD def',
    'prunable gitdir file points to non-existent location',
  ].join('\n')), 1);

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hud-rec-'));
  const home = path.join(tmp, 'home');
  fs.mkdirSync(path.join(tmp, 'claude-502', 'live-session'), { recursive: true });
  fs.mkdirSync(path.join(tmp, 'claude-502', 'old-session'), { recursive: true });
  fs.writeFileSync(path.join(tmp, 'claude-502', 'old-session', 'junk'), 'x');
  const now = Date.now();
  const old = new Date(now - 48 * 60 * 60 * 1000);
  fs.utimesSync(path.join(tmp, 'claude-502', 'old-session'), old, old);
  fs.utimesSync(path.join(tmp, 'claude-502', 'old-session', 'junk'), old, old);
  const fresh = measureStaleTemp(tmp, now, 24 * 60 * 60 * 1000);
  assert.deepStrictEqual(fresh.paths, [path.join(tmp, 'claude-502', 'old-session')]);

  const apps = path.join(tmp, 'Applications');
  const caches = path.join(home, 'Library/Caches');
  fs.mkdirSync(apps, { recursive: true });
  fs.mkdirSync(caches, { recursive: true });
  fs.mkdirSync(path.join(home, 'Library/LaunchAgents'), { recursive: true });
  fs.mkdirSync(path.join(apps, 'CleanMyMac_5.app'), { recursive: true });
  fs.writeFileSync(path.join(caches, 'com.cleanmymac.plist'), 'x');
  const present = measureNamedLeftovers(/cleanmymac/i, home, [], [apps, caches]);
  assert.strictEqual(present.length, 2);
  const absent = measureNamedLeftovers(/cleanmymac/i, home, [], [path.join(tmp, 'unused')]);
  assert.deepStrictEqual(absent, []);

  fs.mkdirSync(path.join(tmp, 'empty-tmp'), { recursive: true });
  const sampledAfter = sampleDiskRecommendations({
    now,
    tmpBase: path.join(tmp, 'empty-tmp'),
    home,
    simCache: path.join(tmp, 'no-sim-cache'),
    orphanedWorktrees: 0,
    worktreesKnown: true,
    cleanMyMacPaths: [],
    paperPaths: [],
  });
  assert.strictEqual(sampledAfter.waste.done, true);
  assert.strictEqual(sampledAfter.cleanMyMac.done, true);
  assert.strictEqual(sampledAfter.paper.done, true);

  const swift = fs.readFileSync(swiftPath, 'utf8');
  assert.ok(swift.includes('hud-live-recommendations.js'));
  assert.ok(swift.includes('recIsDone'));
  assert.ok(!swift.includes('Use Uninstall Apps to remove CleanMyMac 5 (454 MB)'));
  assert.ok(!swift.includes('47.24 GB reclaimed'));
  assert.strictEqual(
    fs.readFileSync(path.join(__dirname, '..', 'macos', 'MacYoloSafeguardsApp.swift'), 'utf8'),
    swift,
  );

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('test-hud-live-recommendations: PASS');
}

main();
