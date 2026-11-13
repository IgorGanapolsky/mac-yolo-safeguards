'use strict';
/** Tests for tools/mac-yolo-measure.js, tools/mac-yolo-model-prices.js and the measure_* MCP tools. */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'macyolo-measure-'));
process.env.MAC_YOLO_METRICS_DIR = dir;
const M = require('../tools/mac-yolo-measure');
const P = require('../tools/mac-yolo-model-prices');
const mcp = require('../tools/mac-yolo-mcp-server');

let pass = 0;
function t(name, fn) { fn(); pass += 1; console.log(`ok - ${name}`); }
function reset() { for (const f of fs.readdirSync(dir)) fs.rmSync(path.join(dir, f)); }

const NOW = Date.parse('2026-11-13T22:00:00.000Z');
const iso = (minAgo) => new Date(NOW - minAgo * 60e3).toISOString();

t('cost math: priced model, cache split', () => {
  // opus 5.5: $4 in, $20 out, $5 cache write, $0.20 cache read per MTok
  const c = P.costUSD('claude-opus-5-5', { input: 1e6, output: 1e6, cacheWrite: 1e6, cacheRead: 1e6 });
  assert.strictEqual(Number(c.toFixed(4)), 29.2);
  assert.strictEqual(P.costUSD('claude-opus-5-5-20261101', { input: 1e6 }), 4);
  assert.strictEqual(P.costUSD('claude-opus-5-20261101', { input: 1e6 }), 5, 'opus 5 must not match opus 5.5');
});

t('cost math: unknown model is unpriced, never guessed', () => {
  assert.strictEqual(P.costUSD('some-new-model-9', { input: 1e6 }), null);
  assert.strictEqual(P.priceFor('<synthetic>'), null);
  const a = { calls: 1, new: 5, cached: 0, recordedUSD: 0, models: { 'mystery-1': { input: 1e6, output: 0, cacheWrite: 0, cacheRead: 0 }, 'claude-sonnet-5-5': { input: 1e6, output: 0, cacheWrite: 0, cacheRead: 0 } } };
  const c = M.agentCost(a);
  assert.strictEqual(c.usd, 2);
  assert.deepStrictEqual(c.unpriced, ['mystery-1']);
});

t('token tally: dedupes message ids, skips synthetic and old, windows, OMP recorded cost', () => {
  const line = (o) => JSON.stringify(o);
  const a = (id, model, usage, ts) => line({ timestamp: ts, message: { id, role: 'assistant', model, usage } });
  const u = { input_tokens: 2, cache_creation_input_tokens: 100, cache_read_input_tokens: 800, output_tokens: 98 };
  const lines = [
    a('m1', 'claude-opus-5-5', u, iso(5)), a('m1', 'claude-opus-5-5', u, iso(5)),
    a('m2', 'claude-opus-5-5', u, iso(60)),
    a('syn', '<synthetic>', { input_tokens: 999 }, iso(1)),
    a('old', 'claude-opus-5-5', u, iso(500)),
  ];
  const acc = {};
  M.tallyTokens(lines, 'Claude', [{ name: 'last10m', cutoffMs: NOW - 10 * 60e3 }, { name: 'last2h', cutoffMs: NOW - 120 * 60e3 }], new Set(), acc);
  const s = M.summarizeTokens(acc);
  assert.strictEqual(s.last10m.calls, 1);
  assert.strictEqual(s.last2h.calls, 2);
  assert.strictEqual(s.last10m.byAgent.Claude.new, 200);
  assert.strictEqual(s.last10m.byAgent.Claude.cached, 800);
  const omp = {};
  M.tallyTokens([a('o1', 'x', { totalTokens: 5800, cacheRead: 800, cost: { total: 0.25 } }, iso(1))], 'OMP', [{ name: 'last2h', cutoffMs: NOW - 120 * 60e3 }], new Set(), omp);
  const so = M.summarizeTokens(omp);
  assert.strictEqual(so.last2h.costUSD, 0.25);
  assert.strictEqual(so.last2h.byAgent.OMP.new, 5000);
});

t('parsers: top, gpu, memory, processes, nettop', () => {
  assert.strictEqual(M.parseTopCpu('CPU usage: 44.94% user, 40.89% sys, 14.16% idle'), 85.8);
  assert.strictEqual(M.parseGpu('"Device Utilization %"=55,'), 55);
  assert.strictEqual(M.parseMemFree('System-wide memory free percentage: 71%'), 71);
  assert.strictEqual(M.parseTopCpu('garbage'), null);
  const p = M.countProcesses('node\nnode\nPython\n/usr/bin/python3\nclaude\ngemini\nzsh\n');
  assert.deepStrictEqual(p.helpers, { python: 2, node: 2, total: 4 });
  assert.deepStrictEqual(p.agents, { claude: 1, gemini: 1 });
  const net = M.parseNettop(',bytes_in,bytes_out,\nnc.1,10,0,\n,bytes_in,bytes_out,\nnc.38875,0,8000,\nomp.6894,4000,2000,\n', 2);
  assert.deepStrictEqual(net, { inBps: 2000, outBps: 5000, topUploader: 'nc' });
});

t('snapshot writer appends one JSON line per call and keeps markers apart', () => {
  reset();
  M.appendSnapshot({ type: 'snapshot', ts: iso(10), machine: { cpuPct: 50 } }, NOW);
  M.appendSnapshot({ type: 'snapshot', ts: iso(0), machine: { cpuPct: 60 } }, NOW);
  const lines = fs.readFileSync(path.join(dir, 'metrics.jsonl'), 'utf8').trim().split('\n');
  assert.strictEqual(lines.length, 2);
  assert.strictEqual(JSON.parse(lines[1]).machine.cpuPct, 60);
  M.addMarker('x', NOW);
  assert.strictEqual(fs.readFileSync(path.join(dir, 'metrics.jsonl'), 'utf8').includes('"marker"'), false);
});

t('retention: lines older than 30 days are dropped, newer kept', () => {
  reset();
  const day = 86400e3;
  fs.writeFileSync(path.join(dir, 'metrics.jsonl'),
    [{ ts: new Date(NOW - 31 * day).toISOString() }, { ts: new Date(NOW - 29 * day).toISOString() }].map((x) => JSON.stringify(x)).join('\n') + '\n');
  const r = M.appendSnapshot({ ts: new Date(NOW).toISOString() }, NOW);
  assert.deepStrictEqual(r, { kept: 1, dropped: 1 });
  assert.strictEqual(M.readJsonl(path.join(dir, 'metrics.jsonl')).length, 2);
});

function seed(afterCpu) {
  reset();
  for (let i = 0; i < 4; i++) M.appendSnapshot({ type: 'snapshot', ts: iso(70 - i * 10), machine: { cpuPct: 80, load1: 10 }, tokens: { last2h: { calls: 100 } } }, NOW);
  M.addMarker('herdr watchdog on', NOW - 30 * 60e3);
  for (let i = 0; i < 3; i++) M.appendSnapshot({ type: 'snapshot', ts: iso(25 - i * 10), machine: { cpuPct: afterCpu, load1: 5 }, tokens: { last2h: { calls: 50 } } }, NOW);
}

t('compare --around: before, after, change %, sample counts', () => {
  seed(40);
  const r = M.compare({ around: 'herdr watchdog on', window: 60, now: NOW });
  assert.strictEqual(r.enough, true);
  assert.strictEqual(r.before.n, 4);
  assert.strictEqual(r.after.n, 3);
  const cpu = r.rows.find((x) => x.metric === 'machine.cpuPct');
  assert.strictEqual(cpu.before, 80);
  assert.strictEqual(cpu.after, 40);
  assert.strictEqual(cpu.changePct, -50);
  assert.ok(r.text.includes('-50.0%'));
  assert.ok(r.text.includes('(4 samples)') && r.text.includes('(3 samples)'));
  assert.ok(/\d{1,2}:\d{2} (AM|PM)/.test(r.text), '12-hour times');
});

t('compare: not enough data when a side has fewer than 3 samples', () => {
  reset();
  M.appendSnapshot({ type: 'snapshot', ts: iso(20), machine: { cpuPct: 1 } }, NOW);
  M.addMarker('m', NOW - 10 * 60e3);
  const r = M.compare({ around: 'm', now: NOW });
  assert.strictEqual(r.enough, false);
  assert.ok(r.text.includes('Not enough data'));
  assert.strictEqual(r.rows.length, 0);
});

t('compare: unknown marker names the known ones; explicit ranges work', () => {
  seed(40);
  assert.throws(() => M.compare({ around: 'nope', now: NOW }), /Known markers: herdr watchdog on/);
  assert.throws(() => M.compare({ now: NOW }), /needs --around/);
  const r = M.compare({ before: `${new Date(NOW - 80 * 60e3).toISOString()}..${new Date(NOW - 30 * 60e3).toISOString()}`, after: `${new Date(NOW - 30 * 60e3).toISOString()}..${new Date(NOW + 1000).toISOString()}`, now: NOW });
  assert.strictEqual(r.enough, true);
});

t('time parsing: 12-hour local', () => {
  const d = M.parseTime('2026-11-13 2:37 PM');
  assert.strictEqual(new Date(d).getHours(), 14);
  assert.strictEqual(new Date(d).getMinutes(), 37);
  assert.strictEqual(new Date(M.parseTime('12:05 AM', NOW)).getHours(), 0);
  assert.strictEqual(new Date(M.parseTime('12:05 PM', NOW)).getHours(), 12);
  assert.ok(/^2026-11-13 2:37 PM$/.test(M.fmt12(d)));
  assert.throws(() => M.parseTime('whenever'), /cannot read time/);
});

t('compare: an agent that goes idle counts as 0, and a vanished agent keeps its row', () => {
  reset();
  for (let i = 0; i < 3; i++) M.appendSnapshot({ type: 'snapshot', ts: iso(70 - i * 10), agents: { claude: 2, omp: 1 }, machine: { cpuPct: 50 } }, NOW);
  M.addMarker('idle test', NOW - 30 * 60e3);
  M.appendSnapshot({ type: 'snapshot', ts: iso(25), agents: { claude: 2 }, machine: { cpuPct: 50 } }, NOW);
  M.appendSnapshot({ type: 'snapshot', ts: iso(15), agents: {}, machine: { cpuPct: 50 } }, NOW);
  M.appendSnapshot({ type: 'snapshot', ts: iso(5), agents: {}, machine: { cpuPct: null } }, NOW);
  const r = M.compare({ around: 'idle test', now: NOW });
  const claude = r.rows.find((x) => x.metric === 'agents.claude');
  assert.ok(Math.abs(claude.after - 2 / 3) < 1e-9, `after ${claude.after}`);
  assert.ok(claude.changePct < -60);
  const omp = r.rows.find((x) => x.metric === 'agents.omp');
  assert.ok(omp && omp.after === 0 && omp.changePct === -100, 'omp row must not disappear');
  const cpu = r.rows.find((x) => x.metric === 'machine.cpuPct');
  assert.strictEqual(cpu.after, 50, 'unavailable machine readings are not zero-filled');
});

t('compare: unpriced models make cost a floor with no percentage', () => {
  reset();
  const tok = (usd, unpriced) => ({ last2h: { costUSD: usd, calls: 1, unpriced } });
  for (let i = 0; i < 3; i++) M.appendSnapshot({ type: 'snapshot', ts: iso(70 - i * 10), tokens: tok(10, []) }, NOW);
  M.addMarker('switch', NOW - 30 * 60e3);
  for (let i = 0; i < 3; i++) M.appendSnapshot({ type: 'snapshot', ts: iso(25 - i * 10), tokens: tok(0, ['mystery-1']) }, NOW);
  const r = M.compare({ around: 'switch', now: NOW });
  const cost = r.rows.find((x) => x.metric === 'tokens.last2h.costUSD');
  assert.strictEqual(cost.floor, true);
  assert.strictEqual(cost.changePct, null);
  assert.ok(!r.text.includes('-100.0%'));
  assert.ok(r.text.includes('Cost is a floor') && r.text.includes('mystery-1'));
  const calls = r.rows.find((x) => x.metric === 'tokens.last2h.calls');
  assert.strictEqual(calls.floor, false);
});

t('markers older than 30 days are pruned on the next mark', () => {
  reset();
  M.addMarker('ancient', Date.now() - 31 * 86400e3);
  M.addMarker('fresh');
  const labels = M.listMarkers().map((m) => m.label);
  assert.deepStrictEqual(labels, ['fresh']);
});

t('LaunchAgent installer refuses a worktree or temp root', () => {
  const { spawnSync } = require('child_process');
  const sh = path.join(__dirname, '..', 'tools', 'install-metrics-launchagent.sh');
  for (const root of ['/tmp/x', '/Users/me/repo/.claude/worktrees/agent-1']) {
    const r = spawnSync('bash', [sh, root], { encoding: 'utf8', env: { ...process.env, HOME: dir } });
    assert.strictEqual(r.status, 1, root);
    assert.ok(r.stderr.includes('Refusing to install'));
  }
});

t('MCP: measure tools are listed and work through callTool and JSON-RPC', () => {
  const names = mcp.getToolDefinitions().map((x) => x.name);
  assert.ok(names.includes('measure_compare') && names.includes('measure_mark'));
  seed(40);
  const mk = mcp.callTool('measure_mark', { label: 'sonnet delegation', at: '2:45 PM' });
  assert.strictEqual(mk.ok, true);
  assert.strictEqual(mk.marker.label, 'sonnet delegation');
  const cmp = mcp.callTool('measure_compare', { around: 'herdr watchdog on', window_minutes: 60 });
  assert.strictEqual(typeof cmp.text, 'string');
  const rpc = mcp.handleRpcRequest({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'measure_compare', arguments: { around: 'missing' } } });
  assert.strictEqual(rpc.result.isError, true);
});

fs.rmSync(dir, { recursive: true, force: true });
console.log(`${pass} passed`);
