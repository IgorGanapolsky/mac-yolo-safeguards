#!/usr/bin/env node
'use strict';

// The shipped app must work on a stranger's Mac: no paths into a developer checkout
// except the one fallback, no canned success messages, no figures from one person's Mac.
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const hud = fs.readFileSync(path.join(root, 'macos/MacYoloTranslucentHud.swift'), 'utf8');
const app = fs.readFileSync(path.join(root, 'macos/MacYoloSafeguardsApp.swift'), 'utf8');
assert.strictEqual(app, hud, 'MacYoloSafeguardsApp.swift must mirror MacYoloTranslucentHud.swift');

const devPathUses = hud.match(/workspace\/mac-yolo-safeguards\/tools/g) || [];
assert.strictEqual(devPathUses.length, 1, 'only findToolScript may fall back to the source checkout');
assert.ok(!hud.includes('"/opt/homebrew/bin/node"]') && !/launchPath = "\/opt\/homebrew\/bin\/node"/.test(hud),
  'node must be located with findNodeBinary, not hard-coded');
for (const canned of ['Agent RAM & Idle Simulators Reaped', 'Fans Cooled & Background Indexers', '49.04 GB', '47.24 GB', 'papercompute', 'KV-Cache Hit', '84% Local', 'gurobi', '127.0.0.1:8766', '0 crash loops', 'iganapolsky%2F']) {
  assert.ok(!hud.includes(canned), `canned or machine-specific text is back: ${canned}`);
}

const build = fs.readFileSync(path.join(root, 'tools/release-build-app.sh'), 'utf8');
const toolsLine = build.match(/TOOLS=\(([^)]*)\)/);
assert.ok(toolsLine, 'release build must list the bundled tools');
const bundled = toolsLine[1].trim().split(/\s+/);
for (const name of hud.match(/runTool\("([^"]+)"/g).map((m) => m.slice(9, -1))) {
  if (name === 'mac-yolo-app-uninstaller.js') continue; // not shipped; the app says so
  assert.ok(bundled.includes(name), `${name} is called by the app but not bundled`);
  assert.ok(fs.existsSync(path.join(root, 'tools', name)), `${name} is missing from tools/`);
}
for (const name of bundled) {
  const src = fs.readFileSync(path.join(root, 'tools', name), 'utf8');
  for (const dep of src.match(/require\('\.\/([^']+)'\)/g) || []) {
    const file = dep.match(/'\.\/([^']+)'/)[1].replace(/(\.js)?$/, '.js');
    assert.ok(bundled.includes(file), `${name} requires ${file}, which is not bundled`);
  }
}
for (const f of ['bundle/Info.plist', 'bundle/en.lproj/InfoPlist.strings', 'AppIcon.icns']) {
  assert.ok(fs.existsSync(path.join(root, 'macos', f)), `macos/${f} is missing`);
}
console.log('test-mac-yolo-app-portable: PASS');
