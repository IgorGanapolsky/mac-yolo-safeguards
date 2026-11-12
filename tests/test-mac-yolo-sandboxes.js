#!/usr/bin/env node
'use strict';

const assert = require('assert');
const sb = require('../tools/mac-yolo-sandboxes');
const { callTool, getToolDefinitions } = require('../tools/mac-yolo-mcp-server');
const guard = require('../tools/mac-yolo-agent-guard');

const VM = '/System/Library/Frameworks/Virtualization.framework/Versions/A/XPCServices/com.apple.Virtualization.VirtualMachine.xpc/Contents/MacOS/com.apple.Virtualization.VirtualMachine';
const ps = [
  `68417 463344 ${VM}`,
  '500 30000 /Applications/Docker.app/Contents/MacOS/com.docker.virtualization --kernel x',
  '600 20000 /usr/local/bin/openshell-gateway --listen 127.0.0.1:8080',
  '700 1000 /usr/bin/vim notes',
].join('\n');
const docker = [
  '{"Name":"openshell-demo","MemUsage":"300MiB / 7.746GiB","CPUPerc":"0.00%"}',
  '{"Name":"postgres","MemUsage":"112.5MiB / 7.746GiB","CPUPerc":"3.10%"}',
].join('\n');

// A 4.5 GB VM whose containers use about 0.4 GB: named, measured by footprint, warned about.
const r = sb.scan({ psText: ps, topText: '68417  4557M\n700  2M', dockerText: docker });
assert.deepStrictEqual(r.engines, ['OpenShell', 'Docker']);
assert.strictEqual(r.vms.length, 1);
assert.strictEqual(r.vms[0].footprintMB, 4557, 'uses the footprint, not the small resident number');
assert.strictEqual(r.vms[0].residentMB, 452);
assert.strictEqual(r.containerMemoryMB, 413);
assert.ok(r.advice.some((a) => a.level === 'warn' && /OpenShell \+ Docker's VM holds 4\.5 GB/.test(a.text)), JSON.stringify(r.advice));
const idle = r.advice.find((a) => /Idle agent sandboxes/.test(a.text));
assert.ok(idle && /openshell-demo/.test(idle.text) && !/postgres/.test(idle.text), 'only idle agent containers are named');

// No VM running: nothing to say.
const none = sb.scan({ psText: '700 1000 /usr/bin/vim notes', dockerText: '' });
assert.deepStrictEqual([none.vms.length, none.advice.length], [0, 0]);

assert.strictEqual(sb.toMB('7.746GiB'), 7932);
assert.strictEqual(sb.toMB('512KiB'), 1);

// The memory breakdown names the VM instead of its XPC service name.
const blamed = guard.blame([{ pid: 68417, ppid: 1, command: VM, rssMB: 452 }], new Map([[68417, 4557]]));
assert.strictEqual(blamed.owners[0].owner, 'Sandbox VM');

// MCP tool is wired and read-only.
const def = getToolDefinitions().find((t) => t.name === 'yolo_sandboxes');
assert.ok(def && def.annotations.readOnlyHint === true);
assert.strictEqual(callTool('yolo_sandboxes', {}).ok, true);

console.log('test-mac-yolo-sandboxes: PASS');
