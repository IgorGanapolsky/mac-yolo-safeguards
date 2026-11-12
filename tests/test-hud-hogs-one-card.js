#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const appPath = path.join(__dirname, '../macos/MacYoloSafeguardsApp.swift');
const twinPath = path.join(__dirname, '../macos/MacYoloTranslucentHud.swift');
const app = fs.readFileSync(appPath, 'utf8');
const twin = fs.readFileSync(twinPath, 'utf8');

assert.strictEqual(app, twin, 'HUD Swift twins must stay byte-identical');
assert.ok(app.includes('let rTitle = "Top Hogs"'), 'optimization card title is Top Hogs');
assert.ok(app.includes('"onScreenLine": onScreenGlance()'), 'protection line names the front app');
assert.ok(app.includes('return "On screen: \\(app)"'), 'protection line starts with On screen');
assert.ok(app.includes('"memPressure": "Pressure \\(memPressurePct)%"'), 'memory tile is pressure only');
assert.ok(app.includes('"cpuLoad": "Load \\(load1Str) on \\(ncpu) cores"'), 'CPU tile is load only');
assert.ok(!app.includes('Top Hogs: \\(culprits.shortLine)'), 'hog list is not repeated on the protection line');
assert.ok(!app.includes('Pressure \\(memPressurePct)% · \\(culprits.shortLine)'), 'hog list is not repeated on memory');
assert.ok(!app.includes('1m: \\(load1Str)/\\(ncpu) · \\(culprits.shortLine)'), 'hog list is not repeated on CPU');
assert.ok(!app.includes('tok (2h)'), 'protection glance does not print a session-size estimate');
assert.ok(app.includes('Top Hogs Right Now|'), 'protection details still list the hogs after a click');
assert.ok(app.includes('func internetHeadline('), 'line-speed headline helper stays');

console.log('hud-hogs-one-card: PASS');
