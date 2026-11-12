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

const impactAt = app.indexOf('id="netImpact"');
const linkAt = app.indexOf('id="netLink"');
const causeAt = app.indexOf('id="netCause"');
const speedAt = app.indexOf('id="netUp"');
assert.ok(impactAt > 0 && linkAt > impactAt && causeAt > linkAt && speedAt > causeAt, 'network name sits under the plain sentence and above the line speed');
assert.ok(app.includes("setTextIfChanged('netLink', state.netLink)"), 'the glance updates the network line');
assert.ok(app.includes('"netLink": linkLine'), 'the panel state carries the network line');
assert.ok(app.includes('func networkLinkLine('), 'duration wording is a pure function');
assert.ok(app.includes('func parseNetworkLink('), 'the address summary is parsed without a live call');
assert.ok(app.includes('["getsummary", iface]'), 'the live read is ipconfig getsummary of the default interface');
assert.ok(app.includes('key == "SSID"'), 'only the network name is read');
assert.ok(app.includes('On \\(trimmed) for \\(mins) min'), 'a short stay is counted in minutes');
assert.ok(app.includes('On CafeGuest for 20 min'), 'the self-test checks a 20 minute stay');
assert.ok(app.includes('bssid ignored'), 'the hardware address is not the network name');
assert.ok(app.includes('Line ↓ \\(formatMbps(lineDownMbps)) · ↑ \\(formatMbps(lineUpMbps))'), 'the line-speed headline stays');
assert.ok(app.includes('Browsing and calls are fine'), 'the plain sentence stays');
assert.ok(app.includes('Top Hogs Right Now|'), 'Top Hogs stays on the protection details');
assert.ok(app.includes(">Jobs</span>"), 'the Jobs button stays');
assert.ok(!app.includes('system_profiler'), 'the panel does not call the slow network profile');
assert.ok(!app.includes('networkQuality'), 'the panel does not run a speed flood');

console.log('hud-network-link: PASS');
