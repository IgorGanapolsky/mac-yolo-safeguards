#!/usr/bin/env node
'use strict';

const assert = require('assert');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { classify, isLiveAgentProcess, reaperHits, parsePs, findStorms, detectIncident, shimScript, status, clean } = require('../tools/mac-yolo-agent-guard');
const { isRunawayCommand } = require('../tools/mac-yolo-system-care-engine');
const { callTool, getToolDefinitions } = require('../tools/mac-yolo-mcp-server');
const { routeRequest } = require('../tools/mac-yolo-service');

const PY = '/opt/homebrew/Cellar/python@3.15/3.15.2/Frameworks/Python.framework/Versions/3.15/Resources/Python.app/Contents/MacOS/Python';
const SESSION = '/Users/u/Library/Application Support/Claude/claude-code/2.1.309/5af865b9901c/claude.app/Contents/MacOS/claude --output-format stream-json';

function ps(rows) {
  return rows.map(([pid, ppid, rss, etime, tty, cmd]) => `${pid} ${ppid} ${rss} ${etime} ${tty} ${cmd}`).join('\n');
}

function main() {
  assert.strictEqual(classify(SESSION), 'claude-session');
  assert.strictEqual(classify('/Users/u/.local/bin/claude mcp serve'), 'claude-mcp-serve');
  assert.strictEqual(classify('/Users/u/.local/bin/claude --resume'), 'claude-cli');
  assert.strictEqual(classify('/usr/bin/skill-runner'), null);

  const procs = parsePs(ps([
    [10, 1, 400000, '01-02:03:04', '??', SESSION],
    [11, 1, 90000, '10:00', '??', '/Users/u/.local/bin/claude mcp serve'],
    [12, 1, 300000, '05:00', 's001', '/Users/u/.local/bin/claude'],
    [13, 1, 900000, '01:00', '??', '/Applications/BrowserOS neo.app/Contents/MacOS/BrowserOS neo'],
  ]));
  assert.strictEqual(procs[0].ageSec, 93784);
  assert.strictEqual(procs[0].rssMB, 391);

  // The 2026-11-01 storm: one wrapper command in hundreds of copies under Homebrew's Python.app.
  const stormRows = [];
  for (let i = 0; i < 120; i += 1) stormRows.push([1000 + i, 999 + i, 16000, '00:12', '??', `${PY} /opt/homebrew/lib/node_modules/x/bin/x.js doctor`]);
  for (let i = 0; i < 60; i += 1) stormRows.push([2000 + i, 1, 50000, '02:00', '??', SESSION]);
  const storms = findStorms(parsePs(ps(stormRows)));
  assert.strictEqual(storms.length, 1, 'only the wrapper loop is a storm; live sessions never are');
  assert.strictEqual(storms[0].copies, 120);
  assert.ok(storms[0].command.includes('x.js doctor'));

  // Tracer: two Claude processes gone in one tick, with a pkill seen just before.
  const before = parsePs(ps([
    [10, 1, 1000, '10:00', '??', SESSION],
    [11, 1, 1000, '10:00', '??', '/Users/u/.local/bin/claude mcp serve'],
    [20, 1, 1000, '10:00', '??', '/bin/zsh -c agent-loop'],
  ]));
  const killerTick = parsePs(ps([
    ...before.map((p) => [p.pid, p.ppid, 1024, '10:00', '??', p.command]),
    [30, 20, 1000, '00:00', '??', '/usr/bin/pkill -f claude'],
  ]));
  const after = parsePs(ps([[20, 1, 1000, '10:01', '??', '/bin/zsh -c agent-loop']]));
  assert.strictEqual(detectIncident([before], killerTick), null, 'nothing vanished yet');
  const incident = detectIncident([before, killerTick], after, { now: Date.parse('2026-11-01T16:03:34Z'), shimCalls: ['x'] });
  assert.ok(incident);
  assert.strictEqual(incident.vanished.length, 2);
  assert.strictEqual(incident.claudeAppAlive, false);
  assert.strictEqual(incident.suspects.length, 1);
  assert.strictEqual(incident.suspects[0].parent, '/bin/zsh -c agent-loop');
  assert.ok(incident.recentlyStarted.some((p) => p.pid === 30));
  assert.deepStrictEqual(incident.shimCalls, ['x']);
  assert.strictEqual(detectIncident([before], parsePs(ps([[11, 1, 1, '10:00', '??', '/Users/u/.local/bin/claude mcp serve']]))), null, 'one exit is not an incident');

  // Cool Down Fans once matched every desktop session by its install path. A live session,
  // or the wrapper that leads its process group, is never a runaway — whatever its args say.
  const DISCLAIMER = `/Applications/Claude.app/Contents/Helpers/disclaimer --pgroup -- ${SESSION} find /Users/ -name x`;
  assert.strictEqual(isLiveAgentProcess(SESSION), true);
  assert.strictEqual(isLiveAgentProcess(DISCLAIMER), true);
  assert.strictEqual(isLiveAgentProcess('/Users/u/.local/bin/claude mcp serve'), false);
  assert.strictEqual(isRunawayCommand(SESSION), false);
  assert.strictEqual(isRunawayCommand(DISCLAIMER), false);
  assert.strictEqual(isRunawayCommand(`${SESSION} find /Users/ -name x`), false);
  assert.strictEqual(isRunawayCommand('find /Users/u -name "*.log"'), true);
  assert.strictEqual(isRunawayCommand('/bin/bash /Users/u/bin/mac-autonomy-self-heal.sh'), true);

  // A reaper that logged a vanished pid is named as the killer.
  const tmpLog = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'agent-guard-')), 'ops.jsonl');
  fs.writeFileSync(tmpLog, [
    JSON.stringify({ timestamp: '2026-11-01T16:03:31.479Z', action: 'cool_down_fans', reapedPids: [64868, 70224, 5] }),
    'not json',
    JSON.stringify({ timestamp: '2026-11-01T16:04:00.000Z', action: 'cool_down_fans', reapedPids: [9] }),
  ].join('\n'));
  assert.deepStrictEqual(reaperHits([64868, 70224, 77], [tmpLog, '/nonexistent']), [
    { log: tmpLog, at: '2026-11-01T16:03:31.479Z', action: 'cool_down_fans', pids: [64868, 70224] },
  ]);

  // The shim must log and then exec the real tool with the same arguments.
  const shim = shimScript('/usr/bin/pkill');
  assert.ok(shim.endsWith('exec /usr/bin/pkill "$@"\n'));
  execFileSync('/bin/bash', ['-n', '-c', shim]);

  // Live: read-only status and dry-run clean on this Mac, through the module, MCP and HTTP.
  const live = status();
  assert.strictEqual(live.ok, true);
  assert.ok(typeof live.agents === 'object');
  assert.strictEqual(clean().dryRun, true);
  const names = getToolDefinitions().map((t) => t.name);
  assert.ok(names.includes('yolo_agent_guard'));
  assert.strictEqual(callTool('yolo_agent_guard', {}).ok, true);
  assert.strictEqual(callTool('yolo_agent_guard', { action: 'clean' }).dryRun, true);
  assert.strictEqual(routeRequest('GET', '/api/agents').status, 200);
  assert.strictEqual(routeRequest('GET', '/api/agents/incidents').body.ok, true);

  console.log('test-mac-yolo-agent-guard: PASS');
}

main();
