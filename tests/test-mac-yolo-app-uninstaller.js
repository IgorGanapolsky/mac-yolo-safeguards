#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { listUninstallApps, uninstallNamed } = require('../tools/mac-yolo-app-uninstaller');

function writeApp(root, name, bundleId, payload) {
  const dir = path.join(root, `${name}.app`, 'Contents');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'Info.plist'), '');
  fs.writeFileSync(
    path.join(dir, 'Info.plist'),
    `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict><key>CFBundleIdentifier</key><string>${bundleId}</string></dict></plist>`
  );
  fs.writeFileSync(path.join(dir, 'payload.bin'), payload);
}

function main() {
  const home = fs.mkdtempSync(path.join(os.tmpdir(), 'mac-yolo-uninstall-'));
  const apps = path.join(home, 'Applications');
  fs.mkdirSync(apps);
  writeApp(apps, 'JunkDrawer', 'com.example.junk', Buffer.alloc(4096, 1));
  writeApp(apps, 'MacYoloSafeguards', 'com.iganapolsky.macyolosafeguards', Buffer.alloc(100));
  writeApp(apps, 'Wallpaper', 'com.example.wallpaper', Buffer.alloc(50));
  writeApp(apps, 'Paperclip', 'com.example.paperclip', Buffer.alloc(50));
  fs.mkdirSync(path.join(home, '.local', 'bin'), { recursive: true });
  fs.writeFileSync(path.join(home, '.local', 'bin', 'tapes'), Buffer.alloc(2048, 2));
  fs.mkdirSync(path.join(home, '.tapes'), { recursive: true });
  fs.writeFileSync(path.join(home, '.tapes', 'config.toml'), 'api-url = "http://127.0.0.1:8081"\n');
  fs.mkdirSync(path.join(home, 'Library', 'Application Support', 'JunkDrawer'), { recursive: true });
  fs.writeFileSync(path.join(home, 'Library', 'Application Support', 'JunkDrawer', 'leftover'), 'x');
  fs.mkdirSync(path.join(home, 'Library', 'Application Support', 'wallpaper-agent'), { recursive: true });

  const listed = listUninstallApps({ home, appDirs: [apps] });
  const names = listed.apps.map((app) => app.name).sort();
  assert.deepStrictEqual(names, ['JunkDrawer', 'Paper']);
  const junk = listed.apps.find((app) => app.name === 'JunkDrawer');
  assert.ok(junk.bytes >= 4096);

  const paperDry = uninstallNamed('Paper', { home, appDirs: [apps], dryRun: true });
  assert.strictEqual(paperDry.ok, true);
  assert.strictEqual(paperDry.dryRun, true);
  assert.ok(fs.existsSync(path.join(home, '.local', 'bin', 'tapes')));
  assert.ok(paperDry.beforeBytes >= 2048);

  const paperGone = uninstallNamed('papercomputeco', { home, appDirs: [apps], dryRun: false });
  assert.strictEqual(paperGone.ok, true);
  assert.strictEqual(paperGone.movedCount, 2);
  assert.ok(!fs.existsSync(path.join(home, '.local', 'bin', 'tapes')));
  assert.ok(!fs.existsSync(path.join(home, '.tapes')));
  assert.ok(fs.existsSync(path.join(paperGone.trashDir, 'tapes')));
  assert.ok(fs.existsSync(path.join(home, 'Library', 'Application Support', 'wallpaper-agent')));

  const refused = uninstallNamed('Wallpaper', { home, appDirs: [apps], dryRun: false });
  assert.strictEqual(refused.ok, false);
  assert.ok(fs.existsSync(path.join(apps, 'Wallpaper.app')));

  const clip = uninstallNamed('Paperclip', { home, appDirs: [apps], dryRun: false });
  assert.strictEqual(clip.ok, false);

  const removed = uninstallNamed('JunkDrawer', { home, appDirs: [apps], dryRun: false });
  assert.strictEqual(removed.ok, true);
  assert.ok(!fs.existsSync(path.join(apps, 'JunkDrawer.app')));
  assert.ok(!fs.existsSync(path.join(home, 'Library', 'Application Support', 'JunkDrawer')));
  assert.ok(fs.existsSync(path.join(removed.trashDir, 'JunkDrawer.app')));

  console.log('test-mac-yolo-app-uninstaller: PASS');
}

main();
