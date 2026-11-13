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
assert.ok(app.includes("sendAction('openGearMenu')"), 'Jobs button opens the job menu');
assert.ok(app.includes('>Jobs</span>'), 'panel header has a Jobs button');
assert.ok(app.includes('NSMenuItem(title: "Background Jobs"'), 'menu item is named Background Jobs');
assert.ok(app.includes('button.sendAction(on: [.leftMouseUp, .rightMouseUp])'), 'a right-click on the menu bar icon opens the same menu');
assert.ok(app.includes('Top Hogs Right Now|'), 'protection details still list the hogs after a click');
assert.ok(app.includes('func internetHeadline('), 'line-speed headline helper stays');

console.log('jobs-menu-reachable: PASS');
