#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const lib = require(path.join(ROOT, 'tools', 'lib', 'work-first-yield'));
const cli = path.join(ROOT, 'tools', 'work-first-yield.js');

const HOT = 18 * lib.HEADROOM_RATIO;
const COOL = HOT - 0.01;

function proc(pid, ppid, comm, args) {
  return { pid, ppid, comm, args: args || comm };
}

function runCli(args) {
  return spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
}

function at(hour, minute) {
  return new Date(2026, 10, 3, hour, minute, 0, 0);
}

const fleet = [
  proc(10, 1, 'Ghostty', '/Applications/Ghostty.app/Contents/MacOS/ghostty'),
  proc(11, 1, 'herdr', 'herdr server'),
  proc(12, 1, 'grok.real', '/Users/x/.local/bin/grok.real'),
  proc(13, 12, 'node', 'node vitest run'),
  proc(14, 12, 'cargo', 'cargo test'),
  proc(20, 1, 'Xcode', '/Applications/Xcode.app/Contents/MacOS/Xcode'),
  proc(21, 20, 'swift-frontend', 'swift-frontend -c file.swift'),
  proc(22, 1, 'dayglass', '/Applications/Dayglass.app/Contents/MacOS/dayglass serve'),
  proc(23, 22, 'node', 'node vitest'),
  proc(24, 10, 'cargo', 'cargo build'),
  proc(25, 11, 'pytest', '/usr/bin/pytest -q'),
  proc(26, 1, 'WindowServer', 'WindowServer'),
  proc(27, 12, 'python3', 'python3 -m pytest'),
  proc(30, 12, 'zsh', 'zsh'),
  proc(31, 30, 'cargo', 'cargo test'),
];

function ids(decision) {
  return lib.planTick(decision, fleet, [14], []).wait.concat(lib.planTick(decision, fleet, [14], []).ready);
}

let passed = 0;
function ok(name) {
  passed += 1;
  console.log(`ok ${passed} ${name}`);
}

assert.strictEqual(lib.decide('', HOT, 18), 'clear');
ok('blank foreground stays out of the way');

assert.strictEqual(lib.decide('Herdr', HOT, 18), 'clear');
ok('agent host in front is not a reason to wait');

assert.strictEqual(lib.decide('Google Chrome', COOL, 18), 'clear');
ok('quiet machine stays out of the way');

assert.strictEqual(lib.decide('Google Chrome', HOT, 18), 'yield');
ok('hot machine with a person in front yields');

assert.strictEqual(lib.decide('Ghostty', HOT, 18), 'yield');
ok('a person in the terminal still outranks an agent build');

assert.strictEqual(lib.decide('Google Chrome', NaN, 18), 'clear');
assert.strictEqual(lib.decide('Google Chrome', HOT, 0), 'clear');
assert.strictEqual(lib.decide(null, HOT, 18), 'clear');
assert.strictEqual(lib.decide('Google Chrome', 'hot', 18), 'clear');
ok('unreadable pressure fails closed');

assert.strictEqual(lib.gate('clear', true, false), 'yield');
assert.strictEqual(lib.gate('clear', true, true), 'clear');
assert.strictEqual(lib.gate('yield', false, true), 'yield');
assert.strictEqual(lib.gate('nope', false, false), 'clear');
ok('a focus block defers, and an urgent check still yields only when hot');

const estimateOnly = '## Estimate\nzone: 09:00-12:00\n';
assert.strictEqual(lib.overrideZone(estimateOnly), null);
assert.strictEqual(lib.overrideZone('## Override\nzone:\n'), null);
assert.strictEqual(lib.overrideZone('## Override\nzone: noon\n'), null);
assert.strictEqual(lib.overrideZone('## Override\nzone: 12:00-09:00\n'), null);
const zone = lib.overrideZone('## Override\nzone: 09:00-18:00\n');
assert.deepStrictEqual(zone, { start: { hour: 9, minute: 0 }, end: { hour: 18, minute: 0 } });
assert.strictEqual(lib.inFocusBlock(at(11, 0), zone.start, zone.end, 3), true);
assert.strictEqual(lib.inFocusBlock(at(12, 0), zone.start, zone.end, 3), false);
assert.strictEqual(lib.inFocusBlock(at(8, 0), zone.start, zone.end, 3), false);
ok('a blank override declares no block, and the block ends after three hours');

const waiting = lib.planTick('yield', fleet, [14], []);
assert.deepStrictEqual(waiting.wait, [13, 27, 31]);
assert.deepStrictEqual(waiting.ready, []);
const ready = lib.planTick('clear', fleet, [14, 10, 21, 26], []);
assert.deepStrictEqual(ready.wait, []);
assert.deepStrictEqual(ready.ready, [14]);
for (const pid of [10, 11, 12, 21, 23, 24, 25, 26]) {
  assert.ok(!waiting.wait.includes(pid), `pid ${pid} must not wait`);
  assert.ok(!ready.ready.includes(pid), `pid ${pid} must not be resumed`);
}
assert.deepStrictEqual(Object.keys(waiting).sort(), ['ready', 'wait']);
ok('only agent-owned builds wait; the terminal, the agent, Xcode, and Dayglass do not');

assert.strictEqual(lib.classify(proc(12, 1, 'grok.real', '/Users/x/.local/bin/grok.real'), new Map()), 'ignore');
assert.strictEqual(lib.classify(proc(0, 0, 'cargo', 'cargo'), new Map()), 'ignore');
assert.deepStrictEqual(lib.planTick('yield', null, null, null), { wait: [], ready: [] });
ok('the agent process itself is not a build, and a bad table does nothing');

const hotCargo = lib.verdict({ front: 'Google Chrome', load1: HOT, ncpu: 18, cmd: 'cargo test' });
assert.strictEqual(hotCargo.action, 'defer');
assert.match(hotCargo.reason, /Google Chrome has the machine/);

const ghosttySelf = lib.verdict({ front: 'Google Chrome', load1: HOT, ncpu: 18, cmd: 'ghostty' });
assert.strictEqual(ghosttySelf.action, 'admit');
const herdrSelf = lib.verdict({ front: 'Google Chrome', load1: HOT, ncpu: 18, cmd: 'herdr server' });
assert.strictEqual(herdrSelf.action, 'admit');
const compiler = lib.verdict({ front: 'Xcode', load1: HOT, ncpu: 18, cmd: 'swift-frontend -c file.swift' });
assert.strictEqual(compiler.action, 'admit');
const swiftBuild = lib.verdict({ front: 'Xcode', load1: HOT, ncpu: 18, cmd: 'swift build' });
assert.strictEqual(swiftBuild.action, 'defer');
const unknown = lib.verdict({ front: '', load1: HOT, ncpu: 18, cmd: 'pytest' });
assert.strictEqual(unknown.action, 'admit');
assert.match(unknown.reason, /foreground unknown/);
const blocked = lib.verdict({ front: 'Notes', load1: COOL, ncpu: 18, cmd: 'pytest -q', block: true });
assert.strictEqual(blocked.action, 'defer');
const urgent = lib.verdict({ front: 'Notes', load1: COOL, ncpu: 18, cmd: 'pytest -q', block: true, urgent: true });
assert.strictEqual(urgent.action, 'admit');
ok('a pre-start check defers cargo and swift build, and leaves the terminal and compiler alone');

const banned = ['SIGKILL', 'SIGSTOP', 'SIGTERM', 'renice', 'taskpolicy', 'child_process', 'Yare', 'CleanMyMac', 'MacPaw'];
for (const file of ['tools/lib/work-first-yield.js', 'tools/work-first-yield.js']) {
  const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
  for (const word of banned) {
    assert.ok(!source.includes(word), `${file} contains ${word}`);
  }
}
ok('the check has no signal path and no other product name');

const deferred = runCli(['check', '--cmd', 'pytest', '--front', 'Google Chrome', '--load', String(HOT), '--ncpu', '18']);
assert.strictEqual(deferred.status, 75);
assert.match(deferred.stdout, /^Deferred pytest\. Google Chrome has the machine/);
assert.ok(!deferred.stdout.includes('Yare'));

const admitted = runCli(['check', '--cmd', 'pytest', '--load', String(HOT), '--ncpu', '18']);
assert.strictEqual(admitted.status, 0);
assert.match(admitted.stdout, /foreground unknown, staying out of the way/);

const terminal = runCli(['check', '--cmd', 'ghostty', '--front', 'Google Chrome', '--load', String(HOT), '--ncpu', '18']);
assert.strictEqual(terminal.status, 0);
assert.match(terminal.stdout, /not an agent build/);

const quiet = runCli(['check', '--cmd', 'cargo', '--front', 'Safari', '--load', '1', '--ncpu', '18']);
assert.strictEqual(quiet.status, 0);
assert.match(quiet.stdout, /headroom available/);

const decision = runCli(['decide', '--front', 'Ghostty', '--load', String(HOT), '--ncpu', '18']);
assert.strictEqual(decision.status, 75);
assert.strictEqual(decision.stdout.trim(), 'yield');

const usage = runCli([]);
assert.strictEqual(usage.status, 2);
ok('the command exits 75 to wait and 0 to start');

assert.ok(ids('yield').every((pid) => pid !== 10));
console.log(`passed ${passed}`);
