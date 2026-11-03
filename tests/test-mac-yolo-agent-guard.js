#!/usr/bin/env node
'use strict';

const assert = require('assert');
const { execFileSync, spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { classify, isLiveAgentProcess, isAgentDependency, indexByPid, findOrphanMcpServers, assessPressure, parseVmStat, pagingRates, parseTopFootprints, blame, trackIdle, findStrandedAgents, findIdleSessions, relieve, signalIfSame, decideKill, killTargets, findMcpFanOut, reaperHits, parsePs, findStorms, detectIncident, shimScript, status, clean } = require('../tools/mac-yolo-agent-guard');
const { isRunawayCommand, runawayPids } = require('../tools/mac-yolo-system-care-engine');
const { callTool, getToolDefinitions } = require('../tools/mac-yolo-mcp-server');
const { routeRequest, startSelfHeal } = require('../tools/mac-yolo-service');

const PY = '/opt/homebrew/Cellar/python@3.15/3.15.2/Frameworks/Python.framework/Versions/3.15/Resources/Python.app/Contents/MacOS/Python';
const APP_PATH = '/Applications/Claude.app/Contents/MacOS/Claude';
const SESSION = '/Users/u/Library/Application Support/Claude/claude-code/2.1.309/5af865b9901c/claude.app/Contents/MacOS/claude --output-format stream-json';

function ps(rows) {
  return rows.map(([pid, ppid, rss, etime, tty, cmd]) => `${pid} ${ppid} ${rss} ${etime} ${tty} ${cmd}`).join('\n');
}

function main() {
  assert.strictEqual(classify(SESSION), 'claude-session');
  assert.strictEqual(classify('/Users/u/.local/bin/claude mcp serve'), 'claude-mcp-serve');
  assert.strictEqual(classify('/Users/u/.local/bin/claude --resume'), 'claude-cli');
  assert.strictEqual(classify('/usr/bin/skill-runner'), null);
  // Grok, Poolside and Gemini's agent are live sessions too; their MCP servers are theirs.
  assert.strictEqual(classify('/Users/u/.local/bin/grok.real --resume 01a18'), 'grok');
  assert.strictEqual(classify('/Users/u/.local/bin/pool.real acp --sandbox disabled'), 'poolside');
  assert.strictEqual(classify('/Applications/Gemini.app/Contents/Helpers/agy --hub --hub-port=51013'), 'gemini-agent');
  assert.strictEqual(classify('/Users/u/.local/bin/grokker --resume'), null);
  assert.strictEqual(classify('omp --resume=/Users/u/.omp/agent/sessions/x.jsonl'), 'omp');
  assert.strictEqual(isLiveAgentProcess('/Applications/Claude.app/Contents/MacOS/Claude'), true, 'the desktop app owns its MCP servers');
  const otherAgents = parsePs(ps([
    [20, 1, 300000, '01:00:00', '??', '/Users/u/.local/bin/grok.real --resume 01a18'],
    [21, 20, 40000, '01:00:00', '??', `${PY} /Users/u/.local/bin/dayglass-mcp-supervisor.py`],
    [22, 1, 300000, '01:00:00', '??', '/Users/u/.local/bin/pool.real acp'],
    [23, 22, 40000, '01:00:00', '??', '/Users/u/.local/bin/agent-mesh-mcp'],
    [24, 1, 40000, '00:01', '??', '/bin/zsh -c pkill -f dayglass-mcp'],
  ]));
  const otherById = indexByPid(otherAgents);
  assert.strictEqual(isAgentDependency(otherById.get(21), otherById), true, 'a Grok session\'s MCP server');
  assert.strictEqual(isAgentDependency(otherById.get(23), otherById), true, 'a Poolside session\'s MCP server');
  assert.strictEqual(decideKill([21], 24, otherById).refuse, true, 'a stray pkill may not kill Grok\'s server');

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
  const XPC = '/System/Library/PrivateFrameworks/CascadeSets.framework/Versions/A/XPCServices/SetStoreUpdateService.xpc/Contents/MacOS/SetStoreUpdateService';
  const osRows = [];
  for (let i = 0; i < 47; i += 1) osRows.push([5000 + i, 1, 4500, '01:00', '??', XPC]);
  assert.strictEqual(findStorms(parsePs(ps(osRows))).length, 0, 'macOS services run many copies by design');
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
  // One session finishing takes its process-group wrapper with it: that is one exit, not a kill.
  const DISC = `/Applications/Claude.app/Contents/Helpers/disclaimer --pgroup -- ${SESSION}`;
  const oneSession = parsePs(ps([[90, 1, 1, '17:00', '??', DISC], [91, 90, 1, '17:00', '??', SESSION]]));
  assert.strictEqual(detectIncident([oneSession], []), null, 'a session and its wrapper ending together is a normal exit');
  const twoSessions = parsePs(ps([[90, 1, 1, '17:00', '??', DISC], [91, 90, 1, '17:00', '??', SESSION], [92, 1, 1, '17:00', '??', DISC], [93, 92, 1, '17:00', '??', SESSION]]));
  assert.strictEqual(detectIncident([twoSessions], []).vanished.length, 4, 'two sessions gone at once is an incident');
  assert.ok(detectIncident([oneSession], [], { shimCalls: ['pkill -f claude'] }), 'one session gone right after a pkill is an incident');

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

  // A live session's MCP servers and hooks are its tools: never reaped, never a storm.
  // The same server orphaned to launchd is a leak, and its extra copies go.
  const MCP = '/opt/homebrew/bin/node /Users/u/.npm/_npx/abc/node_modules/.bin/some-mcp-server';
  const tree = parsePs(ps([
    [10, 1, 400000, '01:00:00', '??', SESSION],
    [40, 10, 30000, '50:00', '??', 'npm exec some-mcp-server'],
    [41, 40, 60000, '50:00', '??', MCP],
    [42, 10, 9000, '00:20', '??', '/bin/zsh -c node ~/.claude/hooks/telemetry_hook_bundle.js'],
    [43, 42, 9000, '00:20', '??', 'node /Users/u/.claude/hooks/telemetry_hook_bundle.js'],
    [50, 1, 60000, '15:00', '??', MCP],
    [51, 1, 60000, '30:00', '??', MCP],
    [52, 1, 60000, '45:00', '??', MCP],
    [53, 1, 60000, '05:00', '??', `${MCP} --fresh`],
    [54, 1, 60000, '05:00', '??', `${MCP} --fresh`],
    [60, 1, 60000, '40:00', '??', '/opt/homebrew/bin/python3 -m dayglass mcp'],
    [61, 1, 60000, '40:00', '??', '/opt/homebrew/bin/python3 -m dayglass mcp'],
  ]));
  const byPid = indexByPid(tree);
  const pid = (n) => tree.find((p) => p.pid === n);
  assert.strictEqual(isAgentDependency(pid(41), byPid), true, 'MCP server launched through npx by a live session');
  assert.strictEqual(isAgentDependency(pid(43), byPid), true, 'hook launched through a shell by a live session');
  assert.strictEqual(isAgentDependency(pid(50), byPid), false, 'orphaned to launchd');
  const orphans = findOrphanMcpServers(tree, { launchdPids: new Set([60, 61]) }).map((p) => p.pid).sort();
  assert.deepStrictEqual(orphans, [51, 52], 'keep the newest orphan copy, skip young copies and LaunchAgent jobs');
  const sessionsMcp = [[10, 1, 400000, '01:00:00', '??', SESSION]];
  for (let i = 0; i < 50; i += 1) sessionsMcp.push([3000 + i, 10, 50000, '10:00', '??', MCP]);
  assert.strictEqual(findStorms(parsePs(ps(sessionsMcp))).length, 0, 'fifty sessions sharing one MCP server is not a storm');
  const CODEX = '/Applications/ChatGPT.app/Contents/Resources/codex-cli/CodexCLI.app/Contents/MacOS/codex app-server';
  const POSTMAN = 'npm exec @postman/postman-mcp-server@2.13.0 --full';
  const fanOut = findMcpFanOut(parsePs(ps([
    [700, 1, 1400000, '08:00:00', '??', CODEX],
    [701, 700, 170000, '08:00:00', '??', POSTMAN],
    [702, 700, 170000, '06:00:00', '??', POSTMAN],
    [703, 700, 170000, '01:00:00', '??', POSTMAN],
    [704, 700, 20000, '08:00:00', '??', '/Users/u/.local/bin/github-mcp-server stdio'],
    [800, 1, 400000, '01:00:00', '??', SESSION],
    [801, 800, 90000, '01:00:00', '??', '/Users/u/.local/bin/claude mcp serve'],
    [802, 800, 90000, '01:00:00', '??', '/Users/u/.local/bin/claude mcp serve'],
    [900, 1, 170000, '08:00:00', '??', POSTMAN],
    [901, 1, 170000, '08:00:00', '??', POSTMAN],
    [902, 1, 170000, '08:00:00', '??', POSTMAN],
  ])));
  assert.deepStrictEqual(fanOut.map((g) => [g.agentPid, g.copies]), [[700, 3]], 'three copies of one server under one agent; two copies, or orphans, are not fan-out');
  assert.strictEqual(fanOut[0].rssMB, Math.round(170000 / 1024) * 3);
  const finds = parsePs(ps([
    [10, 1, 400000, '01:00:00', '??', SESSION],
    [70, 10, 4000, '00:05', '??', '/bin/zsh -c find /Users/u -name "*.md"'],
    [71, 70, 4000, '00:05', '??', 'find /Users/u -name *.md'],
    [72, 1, 4000, '09:00', '??', 'find /Users/u -name *.log'],
  ]));
  assert.deepStrictEqual(runawayPids(finds), [72], 'a session\'s own find is its task; an orphaned find is a runaway');

  // Memory pressure: the kernel's level leads; swap alone is named but is not pressure.
  assert.deepStrictEqual(assessPressure({ pressureLevel: 1, freeMemoryPct: 71, swapUsedMB: 2000, ramMB: 16384 }), { level: 'normal', reasons: [] });
  const swapOnly = assessPressure({ pressureLevel: 1, freeMemoryPct: 71, swapUsedMB: 14739, ramMB: 16384 });
  assert.strictEqual(swapOnly.level, 'normal');
  assert.strictEqual(swapOnly.reasons.length, 1);
  assert.strictEqual(assessPressure({ pressureLevel: 4, freeMemoryPct: 30, swapUsedMB: 0, ramMB: 16384 }).level, 'critical');
  assert.strictEqual(assessPressure({ pressureLevel: 2, freeMemoryPct: 8, swapUsedMB: 0, ramMB: 16384 }).level, 'critical');
  assert.strictEqual(relieve({ memory: { pressureLevel: 1, freeMemoryPct: 71, swapUsedMB: 0, ramMB: 16384 }, procs: [] }).acted, false);
  const relief = relieve({ memory: { pressureLevel: 4, freeMemoryPct: 5, swapUsedMB: 0, ramMB: 16384 }, procs: parsePs(ps(stormRows)) });
  assert.strictEqual(relief.dryRun, true);
  assert.strictEqual(relief.wouldStop[0].copies, 120);

  // 2026-11-03 freeze: kernel level normal, 71% free, yet 155-400 pages/s read back from swap.
  const vmA = parseVmStat('Mach Virtual Memory Statistics: (page size of 16384 bytes)\nDecompressions:  1363243131.\nSwapins:  22351773.\nSwapouts:  27503745.\n', 0);
  const vmB = parseVmStat('Mach Virtual Memory Statistics: (page size of 16384 bytes)\nDecompressions:  1363255704.\nSwapins:  22355843.\nSwapouts:  27503745.\n', 10000);
  const rates = pagingRates(vmA, vmB);
  assert.deepStrictEqual(rates, { seconds: 10, swapInsPerSec: 407, swapInMBps: 6.4, swapOutsPerSec: 0, decompressionsPerSec: 1257 });
  assert.strictEqual(pagingRates(null, vmB), null);
  const thrash = assessPressure({ pressureLevel: 1, freeMemoryPct: 71, swapUsedMB: 13358, ramMB: 49152, paging: rates });
  assert.strictEqual(thrash.level, 'warn', 'swap read-back freezes apps while the kernel still says normal');
  assert.match(thrash.reasons[0], /6\.4 MB\/s back from swap/);
  assert.strictEqual(assessPressure({ pressureLevel: 1, freeMemoryPct: 71, swapUsedMB: 0, ramMB: 49152, paging: { ...rates, swapInsPerSec: 1500 } }).level, 'critical');
  assert.strictEqual(assessPressure({ pressureLevel: 1, freeMemoryPct: 71, swapUsedMB: 13358, ramMB: 49152, paging: { ...rates, swapInsPerSec: 20 } }).level, 'normal', 'a full swap that is not being read back is not pressure');

  // Blame by owner and footprint: MCP servers count toward their agent, renderers toward
  // their browser, terminal-agent panes toward the agent, bare panes toward the multiplexer.
  assert.deepStrictEqual([...parseTopFootprints('PID    MEM\n430    1836M+\n75229  994M-\n12     512K\n9  1G\n').entries()], [[430, 1836], [75229, 994], [12, 0.5], [9, 1024]]);
  const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
  const owned = parsePs(ps([
    [500, 1, 10000, '01:00:00', '??', APP_PATH],
    [501, 500, 10000, '01:00:00', '??', `/Applications/Claude.app/Contents/Helpers/disclaimer --pgroup -- ${SESSION}`],
    [502, 501, 10000, '01:00:00', '??', SESSION],
    [503, 502, 10000, '01:00:00', '??', 'node /Users/u/mcp/server.js'],
    [600, 1, 10000, '01:00:00', '??', CHROME],
    [601, 600, 10000, '01:00:00', '??', '/Applications/Google Chrome.app/Contents/Frameworks/Google Chrome Framework.framework/Helpers/Google Chrome Helper (Renderer).app/Contents/MacOS/Google Chrome Helper (Renderer) --type=renderer'],
    [700, 1, 10000, '01:00:00', '??', '/Users/u/.local/bin/herdr server'],
    [701, 700, 10000, '01:00:00', 'ttys034', '-zsh'],
    [702, 701, 10000, '01:00:00', 'ttys034', 'omp --resume=/Users/u/.omp/agent/sessions/x.jsonl'],
    [703, 702, 10000, '01:00:00', 'ttys034', 'node /Users/u/.omp/mcp/dayglass-mcp.js'],
  ]));
  const fp = new Map([[500, 800], [501, 1], [502, 300], [503, 100], [600, 400], [601, 1600], [700, 30], [701, 5], [702, 900], [703, 100]]);
  const b = blame(owned, fp);
  assert.strictEqual(b.measuredBy, 'footprint');
  assert.deepStrictEqual(b.owners.map((o) => [o.owner, o.processes, o.memoryMB]), [['Google Chrome', 2, 2000], ['Claude', 4, 1201], ['omp', 2, 1000], ['herdr', 2, 35]]);
  assert.strictEqual(b.owners[0].sharePct, 47);
  assert.strictEqual(blame(owned).measuredBy, 'rss', 'without footprints it says it fell back to RSS');

  // Stranded agents: no terminal, adopted by launchd, idle 30 minutes. Never a desktop session,
  // never one in a terminal pane, never one a LaunchAgent runs, never one that used CPU recently.
  const t0 = 1_000_000_000;
  const strandProcs = parsePs(ps([
    [800, 1, 300000, '20:00:00', '??', 'omp --resume=/Users/u/.omp/agent/sessions/old.jsonl'],
    [801, 1, 300000, '20:00:00', 'ttys034', 'omp --resume=/Users/u/.omp/agent/sessions/pane.jsonl'],
    [802, 1, 300000, '20:00:00', '??', SESSION],
    [803, 1, 300000, '20:00:00', '??', '/Users/u/.local/bin/grok.real --resume 01a1'],
    [804, 1, 300000, '20:00:00', '??', '/Users/u/.local/bin/claude -p nightly'],
    [805, 1, 300000, '20:00:00', '??', '/Users/u/.local/bin/pool.real acp'],
  ]));
  let idle = trackIdle(new Map(), new Map([[800, 10], [801, 10], [802, 240], [803, 5], [804, 3], [805, 7]]), t0);
  idle = trackIdle(idle, new Map([[800, 10], [801, 10], [802, 240], [803, 5.5], [804, 3], [805, 7]]), t0 + 31 * 60000);
  assert.strictEqual(idle.get(800).since, t0, 'unchanged CPU keeps the first idle time');
  assert.strictEqual(idle.get(803).since, t0 + 31 * 60000, 'CPU use resets it');
  const stranded = findStrandedAgents(strandProcs, idle, { now: t0 + 31 * 60000, launchdPids: new Set([804]) });
  assert.deepStrictEqual(stranded.map((p) => p.pid), [800, 805]);
  assert.deepStrictEqual(findStrandedAgents(strandProcs, idle, { now: t0 + 20 * 60000 }), [], 'twenty idle minutes is not stranded');
  const strandedDry = clean({ procs: [], launchdPids: new Set(), stranded });
  assert.deepStrictEqual(strandedDry.wouldStopStranded.map((p) => p.pid), [800, 805]);
  const idleSessions = findIdleSessions(strandProcs, idle, { now: t0 + 3 * 3600000, footprints: new Map([[802, 412]]) });
  assert.deepStrictEqual(idleSessions, [{ pid: 802, idleMin: 180, memoryMB: 412, session: null }]);

  // The login service runs no kill loop unless asked, and a request without "execute" is a dry run.
  assert.strictEqual(startSelfHeal({ env: {} }), null);
  assert.strictEqual(startSelfHeal({ env: { MAC_YOLO_SELF_HEAL: 'off' } }), null);
  const dry = startSelfHeal({ env: { MAC_YOLO_SELF_HEAL: '1' } });
  assert.strictEqual(dry.mode, 'dry-run');
  dry.stop();
  const exec = startSelfHeal({ env: { MAC_YOLO_SELF_HEAL: 'execute' } });
  assert.strictEqual(exec.mode, 'execute');
  exec.stop();

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
  const shimFile = path.join(os.tmpdir(), `guard-shim-${process.pid}.sh`);
  fs.writeFileSync(shimFile, shim);
  execFileSync('/bin/bash', ['-n', shimFile]);
  fs.unlinkSync(shimFile);

  // A kill from outside an agent's tree may not reach the agent or what it launched.
  // 2026-11-01: another agent's `pkill -f "python.*dayglass-mcp"` killed the Claude app's server.
  const APP = '/Applications/Claude.app/Contents/MacOS/Claude';
  const killTree = indexByPid(parsePs(ps([
    [100, 1, 1, '01:00:00', '??', APP],
    [101, 100, 1, '01:00:00', '??', '/opt/homebrew/bin/python3 /Users/u/dayglass/dayglass-mcp.py'],
    [102, 100, 1, '01:00:00', '??', `/Applications/Claude.app/Contents/Helpers/disclaimer --pgroup -- ${SESSION}`],
    [103, 102, 1, '01:00:00', '??', SESSION],
    [104, 103, 1, '00:01', '??', '/bin/zsh -c pkill -f dayglass-mcp'],
    [200, 1, 1, '01:00:00', '??', '/Users/u/.local/bin/pool.real acp'],
    [201, 200, 1, '00:01', '??', '/bin/bash /Users/u/.local/bin/pkill -f python.*dayglass-mcp'],
    [300, 1, 1, '01:00:00', '??', '/opt/homebrew/bin/python3 /Users/u/stray-server.py'],
    [400, 1, 1, '01:00:00', '??', '/Users/u/.local/bin/codex app-server'],
    [401, 400, 1, '01:00:00', '??', '/Users/u/.local/bin/claude mcp serve'],
  ])));
  const outsider = decideKill([101], 201, killTree);
  assert.strictEqual(outsider.refuse, true, 'another agent may not kill the Claude app\'s MCP server');
  assert.strictEqual(outsider.blocked[0].owner, APP);
  assert.strictEqual(decideKill([101], 104, killTree).refuse, false, 'a session inside the Claude app may restart its own server');
  assert.strictEqual(decideKill([300], 201, killTree).refuse, false, 'a process no agent owns is fair game');
  assert.strictEqual(decideKill([103], 201, killTree).refuse, true, 'a live session is never killed from outside');
  assert.strictEqual(decideKill([401], 201, killTree).refuse, true, 'Codex\'s MCP server belongs to Codex');
  const fakePs = [...killTree.values()];
  assert.deepStrictEqual(killTargets('pkill', ['-9', '-f', 'x'], fakePs, (args) => args), ['-f', 'x'], 'pgrep gets pkill\'s args without the signal');
  assert.deepStrictEqual(killTargets('killall', ['-9', 'Claude'], fakePs, null), [100]);
  const fakePgrep = (args) => ({ 'pool\\.': [200], 'Cl.*': [100, 200] }[args[1]] || []);
  assert.deepStrictEqual(killTargets('killall', ['-m', 'pool\\.', 'Cl.*'], fakePs, fakePgrep), [200, 100]);

  // Live: read-only status and dry-run clean on this Mac, through the module, MCP and HTTP.
  const now = status();
  assert.strictEqual(now.ok, true);
  assert.ok(typeof now.agents === 'object');
  assert.ok(['normal', 'warn', 'critical'].includes(now.pressure.level));
  assert.strictEqual(clean().dryRun, true);
  const names = getToolDefinitions().map((t) => t.name);
  assert.ok(names.includes('yolo_agent_guard'));
  assert.strictEqual(callTool('yolo_agent_guard', {}).ok, true);
  assert.strictEqual(callTool('yolo_agent_guard', { action: 'clean' }).dryRun, true);
  assert.strictEqual(routeRequest('GET', '/api/agents').status, 200);
  assert.strictEqual(routeRequest('GET', '/api/agents/incidents').body.ok, true);
  assert.strictEqual(routeRequest('GET', '/api/agents/pressure').body.ok, true);
  assert.strictEqual(callTool('yolo_agent_guard', { action: 'pressure' }).ok, true);

  console.log('test-mac-yolo-agent-guard: PASS');
}

function pidReuseCheck() {
  // A pid that now runs something else is left alone; the same command is stopped.
  const child = spawn('sleep', ['30'], { stdio: 'ignore' });
  return new Promise((resolve) => setTimeout(resolve, 300)).then(() => {
    assert.strictEqual(signalIfSame(child.pid, 'something-else 30'), false);
    assert.strictEqual(signalIfSame(child.pid, 'sleep 30'), true);
    return new Promise((resolve) => child.on('exit', (code, sig) => resolve(sig)));
  }).then((sig) => assert.strictEqual(sig, 'SIGTERM'));
}

// End to end through a real shim: a fake agent's child is refused, a plain process is not,
// and MAC_YOLO_ALLOW_AGENT_KILL=1 lets a deliberate restart through.
function shimEndToEnd() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'agent-guard-shim-'));
  const ran = path.join(dir, 'ran.txt');
  const real = path.join(dir, 'real-pkill');
  fs.writeFileSync(real, `#!/bin/bash\necho "$*" >> "${ran}"\n`, { mode: 0o755 });
  const agent = path.join(dir, 'claude');
  fs.writeFileSync(agent, '#!/bin/bash\nsleep 601 &\nwait\n', { mode: 0o755 });
  const shimPath = path.join(dir, 'pkill');
  fs.writeFileSync(shimPath, shimScript(real, { logDir: dir, guardScript: path.join(__dirname, '..', 'tools', 'mac-yolo-agent-guard.js') }), { mode: 0o755 });
  const agentProc = spawn('/bin/bash', [agent], { stdio: 'ignore', detached: true });
  const plain = spawn('sleep', ['602'], { stdio: 'ignore' });
  const runShim = (args, env = {}) => {
    try {
      execFileSync('/bin/bash', [shimPath, ...args], { env: { ...process.env, ...env }, stdio: 'pipe' });
      return 0;
    } catch (err) {
      return err.status;
    }
  };
  return new Promise((resolve) => setTimeout(resolve, 500)).then(() => {
    const ranLines = () => (fs.existsSync(ran) ? fs.readFileSync(ran, 'utf8').trim().split('\n') : []);
    assert.strictEqual(runShim(['-f', 'sleep 601']), 1, 'refused: the sleep belongs to a live agent');
    assert.deepStrictEqual(ranLines(), [], 'the real pkill never ran');
    assert.ok(fs.readFileSync(path.join(dir, 'kill-calls.log'), 'utf8').includes('REFUSED pkill'));
    assert.strictEqual(runShim(['-f', 'sleep 602']), 0);
    assert.deepStrictEqual(ranLines(), ['-f sleep 602']);
    assert.strictEqual(runShim(['-f', 'sleep 601'], { MAC_YOLO_ALLOW_AGENT_KILL: '1' }), 0);
    assert.deepStrictEqual(ranLines(), ['-f sleep 602', '-f sleep 601']);
  }).finally(() => {
    process.kill(-agentProc.pid, 'SIGTERM');
    plain.kill('SIGTERM');
  });
}

main();
pidReuseCheck()
  .then(() => console.log('test-mac-yolo-agent-guard pid reuse: PASS'))
  .then(shimEndToEnd)
  .then(() => console.log('test-mac-yolo-agent-guard shim refusal: PASS'));
