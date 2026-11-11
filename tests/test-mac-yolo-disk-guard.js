#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  adobeVideoAppRunning,
  getRootDiskUsage,
  findStaleClaudeTmpEntries,
  runDiskSmartScan,
} = require('../tools/mac-yolo-disk-guard');
const { callTool } = require('../tools/mac-yolo-mcp-server');
const { routeRequest } = require('../tools/mac-yolo-service');

function main() {
  const disk = getRootDiskUsage();
  assert.ok(disk.totalGiB > 0);
  assert.ok(disk.freeGiB >= 0);
  assert.ok(['HEALTHY', 'WARNING', 'CRITICAL'].includes(disk.status));

  const scan = runDiskSmartScan();
  assert.strictEqual(scan.ok, true);
  assert.ok(Array.isArray(scan.categories));
  assert.ok(scan.categories.some((c) => c.id === 'claude_tmp_runaways'));

  // Adobe media cache is listed, and only auto-cleaned while no Adobe video app is open.
  const adobe = scan.categories.find((c) => c.id === 'adobe_media_cache');
  assert.ok(adobe && adobe.paths.every((p) => p.includes('/Adobe/Common/')));
  assert.strictEqual(adobe.safeAutoClean, !adobeVideoAppRunning());
  assert.strictEqual(
    adobeVideoAppRunning('/Applications/Adobe Premiere Pro 2027/Adobe Premiere Pro 2027.app/Contents/MacOS/Adobe Premiere Pro 2027'),
    'Adobe Premiere Pro',
  );
  assert.strictEqual(adobeVideoAppRunning('/usr/bin/vim notes\n/Applications/Adobe Photoshop 2027/x'), null);
  assert.strictEqual(adobeVideoAppRunning('/bin/zsh -c echo Adobe Premiere Pro'), null);

  // Only idle Claude session folders are stale; the root, live sessions and bundled skills stay.
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'disk-guard-'));
  const root = path.join(base, 'claude-999');
  const old = (Date.now() - 2 * 24 * 3600 * 1000) / 1000;
  const mk = (rel, mtime) => {
    const p = path.join(root, rel);
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, 'x');
    if (mtime) fs.utimesSync(p, mtime, mtime);
    return p;
  };
  mk('-proj/idle-session/scratchpad/a.txt', old);
  mk('-proj/live-session/scratchpad/old.txt', old);
  mk('-proj/live-session/tasks/new.txt');
  mk('bundled-skills/2.1.309/x/SKILL.md', old);
  const looseOld = mk('cache-old.json', old);
  mk('cache-new.json');
  for (const d of ['-proj/idle-session/scratchpad', '-proj/idle-session', '-proj/live-session/scratchpad']) {
    fs.utimesSync(path.join(root, d), old, old);
  }
  const stale = findStaleClaudeTmpEntries(base).sort();
  assert.deepStrictEqual(stale, [path.join(root, '-proj/idle-session'), looseOld].sort());
  assert.ok(!stale.includes(root), 'never the claude-<uid> root');

  const mcpScan = callTool('yolo_disk_smart_scan', { clean: false });
  assert.strictEqual(mcpScan.ok, true);

  const httpScan = routeRequest('GET', '/api/disk');
  assert.strictEqual(httpScan.status, 200);
  assert.strictEqual(httpScan.body.ok, true);

  console.log('test-mac-yolo-disk-guard: PASS');
}

main();
