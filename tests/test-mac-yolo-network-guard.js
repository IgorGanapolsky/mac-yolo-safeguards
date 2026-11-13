#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const {
  formatRateMbpsOrKbps,
  parseNettopBothPasses,
  parseNettopDelta,
  classifyNetworkHealth,
  findRemediableNetworkProcesses,
  collectAgentUsageLedger,
} = require('../tools/mac-yolo-network-guard');

function testFormatRate() {
  assert.strictEqual(formatRateMbpsOrKbps(0), '0 KB/s');
  assert.strictEqual(formatRateMbpsOrKbps(25 * 1024), '25 KB/s');
  assert.strictEqual(formatRateMbpsOrKbps(1_500_000), '12.0 Mbps');
}

function testParseNettopDeltaAndSelfPidExclusion() {
  const sampleNettop = [
    ',bytes_in,bytes_out,',
    'Google Chrome H.1290,999999999,888888888,',
    `node.${process.pid},50000000,50000000,`,
    ',bytes_in,bytes_out,',
    'nc.38875,200,500000,',
    'io.tailscale.ip.92725,40000,520000,',
    'Google Chrome H.1290,512,512,',
    `node.${process.pid},900000,900000,`,
  ].join('\n');

  const both = parseNettopBothPasses(sampleNettop, 1);
  assert.strictEqual(
    both.some((c) => c.pids.includes(process.pid)),
    false,
    'Must exclude own probe process.pid from nettop results'
  );

  const culprits = parseNettopDelta(sampleNettop, 1);
  assert.strictEqual(culprits.some((c) => c.app === 'Google Chrome'), false);
  assert.strictEqual(culprits.length, 2);
  assert.strictEqual(culprits[0].app, 'Tailscale VPN');
  assert.strictEqual(culprits[1].app, 'SSH / Tunnel (nc)');
  assert.strictEqual(culprits[1].txMbps, 4.0);
}

function testClassifyNetworkHealth() {
  const bloat = classifyNetworkHealth({
    wanPingMs: 545,
    wanLossPct: 25,
    routerPingMs: 9.4,
    downloadMbps: 2.4,
    uploadMbps: 2.1,
  });
  assert.strictEqual(bloat.grade, 'bufferbloat');
  assert.strictEqual(bloat.badge, 'Lag 545 ms! ›');
  assert.ok(bloat.diagnosis.includes('ISP upload pipe is maxed out'));

  const wifiBad = classifyNetworkHealth({
    wanPingMs: 260,
    wanLossPct: 0,
    routerPingMs: 140,
    downloadMbps: 12,
    uploadMbps: 5,
  });
  assert.strictEqual(wifiBad.grade, 'wifi_degraded');
  assert.strictEqual(wifiBad.badge, 'Wi-Fi 140 ms! ›');

  const healthy = classifyNetworkHealth({
    wanPingMs: 33,
    wanLossPct: 0,
    routerPingMs: 10,
    downloadMbps: 97.3,
    uploadMbps: 7.8,
  });
  assert.strictEqual(healthy.grade, 'healthy');
  assert.strictEqual(healthy.badge, 'Fast · ↓97 Mbps ›');

  // Finding 3 regression: null downloadMbps with non-null modest uploadMbps must never throw TypeError
  const nullDl = classifyNetworkHealth({
    wanPingMs: 28,
    wanLossPct: 0,
    routerPingMs: 9,
    downloadMbps: null,
    uploadMbps: 6.4,
  });
  assert.strictEqual(nullDl.grade, 'healthy');
  assert.ok(nullDl.diagnosis.includes('6.4 Mbps'));
}

function testFindRemediableNetworkProcesses() {
  // Real macOS `/bin/ps -axo pid=,ppid=,etime=,args=` format (no 16-char truncated comm column)
  const psLines = [
    '2698 2677 05:12 /usr/bin/scp -q /tmp/browseros.zip joey-mac-studio:"/Applications/BrowserOS neo.app"',
    '38873 38853 04:01 /opt/homebrew/bin/rsync -az /Applications/BrowserOS neo.app joey-mac-studio:/Applications/BrowserOS neo.app/',
    '38874 38873 04:01 /opt/homebrew/bin/rsync --server -g -l -o -p . /Applications/',
    '46787 1 01:10 /usr/bin/networkQuality -c -s -M 20',
    '46788 1 00:40 /opt/homebrew/bin/iperf3 -c speedtest.example.net',
    '50111 1658 00:30 scp report.pdf prod-box:/srv/reports/report.pdf',
  ];

  const { killTargets, sparedTransfers } = findRemediableNetworkProcesses(psLines);
  assert.strictEqual(sparedTransfers.length, 2, 'Primary transfer per destination must be spared');
  assert.deepStrictEqual(
    killTargets.map((t) => t.pid).sort((a, b) => a - b),
    [38873, 46787, 46788],
    'Must target duplicate concurrent transfer + /usr/bin/networkQuality + /opt/homebrew/bin/iperf3'
  );
}

function testAgentLedgerStrict24hDedupSyntheticAndInputCachePct() {
  const tmpHome = fs.mkdtempSync(path.join(os.tmpdir(), 'yolo-net-guard-test-'));
  try {
    // 1. Empty home -> untracked null (NEVER fabricated 0 or 0%)
    const emptyLedger = collectAgentUsageLedger([], new Map(), tmpHome);
    for (const a of emptyLedger.agents) {
      assert.strictEqual(a.llmCalls, null, `${a.name} llmCalls must be null when no transcripts exist`);
      assert.strictEqual(a.tokens, null, `${a.name} tokens must be null when no transcripts exist`);
      assert.strictEqual(a.cachePct, null, `${a.name} cachePct must be null when no transcripts exist`);
      assert.ok(a.extraNote && !a.extraNote.includes('0 LLM tokens directly'), `${a.name} must have honest untracked extraNote`);
    }
    // 2. Deep depth=5 Claude workflow subagent + duplicate streaming message.id + <synthetic> + 10-day-old line
    const deepDir = path.join(
      tmpHome,
      '.claude',
      'projects',
      'projA',
      'sess1',
      'subagents',
      'workflows',
      'wf1'
    );
    fs.mkdirSync(deepDir, { recursive: true });
    const nowIso = new Date().toISOString();
    const tenDaysAgoIso = new Date(Date.now() - 10 * 86400 * 1000).toISOString();
    const claudeJsonl = [
      // Duplicate streaming chunks for msg_1: input=100, cache_read=800, cache_create=100 (input denom=1000 => 80% cache hit!), output=1000 (excluded from cache denom!)
      JSON.stringify({
        type: 'assistant',
        timestamp: nowIso,
        message: {
          id: 'msg_1',
          model: 'claude-opus-5-5',
          usage: {
            input_tokens: 100,
            cache_read_input_tokens: 800,
            cache_creation_input_tokens: 100,
            output_tokens: 1000,
          },
        },
      }),
      JSON.stringify({
        type: 'assistant',
        timestamp: nowIso,
        message: {
          id: 'msg_1',
          model: 'claude-opus-5-5',
          usage: {
            input_tokens: 100,
            cache_read_input_tokens: 800,
            cache_creation_input_tokens: 100,
            output_tokens: 1000,
          },
        },
      }),
      // <synthetic> local message must be ignored
      JSON.stringify({
        type: 'assistant',
        timestamp: nowIso,
        message: {
          id: 'msg_syn',
          model: '<synthetic>',
          usage: { input_tokens: 500, output_tokens: 500 },
        },
      }),
      // 10-day-old message inside an mtime=now file must be ignored
      JSON.stringify({
        type: 'assistant',
        timestamp: tenDaysAgoIso,
        message: {
          id: 'msg_old',
          model: 'claude-opus-5-5',
          usage: { input_tokens: 99999, output_tokens: 99999 },
        },
      }),
      // Missing-timestamp line must be rejected (never bypass 24h filter)
      JSON.stringify({
        type: 'assistant',
        message: {
          id: 'msg_no_ts',
          model: 'claude-opus-5-5',
          usage: { input_tokens: 77777, output_tokens: 77777 },
        },
      }),
    ].join('\n');
    fs.writeFileSync(path.join(deepDir, 'agent-1.jsonl'), `${claudeJsonl}\n`);

    // 3. Multi-day Grok workspace created 5 days ago, used today with timestamped events.jsonl + tool output containing "model_id"
    const grokDir = path.join(tmpHome, '.grok', 'sessions', 'ws1', 'sess1');
    fs.mkdirSync(grokDir, { recursive: true });
    fs.writeFileSync(
      path.join(grokDir, 'summary.json'),
      JSON.stringify({
        created_at: tenDaysAgoIso,
        updated_at: nowIso,
        current_model_id: 'grok-4.7',
      })
    );
    fs.writeFileSync(
      path.join(grokDir, 'events.jsonl'),
      [
        JSON.stringify({ type: 'first_token', ts: tenDaysAgoIso }),
        JSON.stringify({ type: 'first_token', ts: nowIso }),
        JSON.stringify({ type: 'first_token', ts: nowIso }),
        JSON.stringify({ type: 'tool_output', ts: nowIso, text: 'contains "model_id" literal' }),
      ].join('\n') + '\n'
    );

    const populated = collectAgentUsageLedger([], new Map(), tmpHome);
    const claude = populated.agents.find((a) => a.name === 'Claude Code');
    assert.ok(claude, 'Claude Code entry must exist');
    assert.strictEqual(claude.llmCalls, 1, 'Must count msg_1 once and ignore <synthetic>, >24h, and missing timestamp');
    assert.strictEqual(claude.tokens, 2000, 'Total volume = 100 + 800 + 100 + 1000');
    assert.strictEqual(claude.cachePct, 80, 'Cache hit % = 800 / (100 + 800 + 100) input-only denominator');
    assert.strictEqual(claude.models.includes('<synthetic>'), false, 'Must exclude <synthetic> from models');

    const grok = populated.agents.find((a) => a.name === 'Grok CLI');
    assert.ok(grok, 'Grok CLI entry must exist');
    assert.strictEqual(grok.llmCalls, 2, 'Must count ONLY 24h type=first_token events in multi-day workspace');
    assert.strictEqual(grok.sessions24h, 1, 'Multi-day workspace with 24h events must count as 1 active 24h session');
  } finally {
    fs.rmSync(tmpHome, { recursive: true, force: true });
  }
}

function withSeededStatePath(fn) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yolo-net-state-'));
  const statePath = path.join(tmpDir, 'mac-yolo-net-state.json');
  fs.writeFileSync(
    statePath,
    JSON.stringify({
      downloadMbps: 92.4,
      uploadMbps: 7.9,
      speedMeasuredAt: new Date().toISOString(),
    })
  );
  const prev = process.env.MAC_YOLO_NET_STATE_PATH;
  process.env.MAC_YOLO_NET_STATE_PATH = statePath;
  try {
    return fn(statePath);
  } finally {
    if (prev === undefined) delete process.env.MAC_YOLO_NET_STATE_PATH;
    else process.env.MAC_YOLO_NET_STATE_PATH = prev;
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function testLiveStatusCli() {
  withSeededStatePath((statePath) => {
    const cli = path.join(__dirname, '..', 'tools', 'mac-yolo-network-guard.js');
    const res = spawnSync(process.execPath, [cli, '--status'], {
      encoding: 'utf8',
      timeout: 20000,
      env: { ...process.env, MAC_YOLO_NET_STATE_PATH: statePath },
    });
    assert.strictEqual(res.status, 0, `CLI exited ${res.status}: ${res.stderr}`);
    const parsed = JSON.parse(res.stdout.trim());
    assert.strictEqual(parsed.ok, true);
    assert.ok(typeof parsed.badge === 'string' && parsed.badge.length > 0);
    assert.ok(typeof parsed.detailRows === 'string' && parsed.detailRows.includes('Internet Speed & What Works'));
    assert.ok(typeof parsed.agentTokenRows === 'string' && parsed.agentTokenRows.includes('All AI Agents'));
  });
}

function testMcpServerYoloNetworkGuardTool() {
  withSeededStatePath(() => {
    const { handleRpcRequest } = require('../tools/mac-yolo-mcp-server');
    const listResp = handleRpcRequest({ id: 1, method: 'tools/list' });
    assert.ok(
      listResp.result.tools.some((t) => t.name === 'yolo_network_guard'),
      'yolo_network_guard must be advertised in MCP tools/list'
    );
    const callResp = handleRpcRequest({
      id: 2,
      method: 'tools/call',
      params: { name: 'yolo_network_guard', arguments: { mode: 'status' } },
    });
    assert.strictEqual(callResp.result.isError, false, 'MCP yolo_network_guard status call must succeed');
    const payload = JSON.parse(callResp.result.content[0].text);
    assert.strictEqual(payload.ok, true);
    assert.ok(Array.isArray(payload.agents) && payload.agents.length >= 5);

    // Finding 2 regression: mode="fix" with execute=false must be non-destructive dry-run
    const dryFixResp = handleRpcRequest({
      id: 3,
      method: 'tools/call',
      params: { name: 'yolo_network_guard', arguments: { mode: 'fix', execute: false } },
    });
    assert.strictEqual(dryFixResp.result.isError, false);
    const dryPayload = JSON.parse(dryFixResp.result.content[0].text);
    assert.strictEqual(dryPayload.executed, false, 'mode=fix with execute=false must not execute kills');
    assert.ok(Array.isArray(dryPayload.wouldStop));
  });
}
function main() {
  testFormatRate();
  testParseNettopDeltaAndSelfPidExclusion();
  testClassifyNetworkHealth();
  testFindRemediableNetworkProcesses();
  testAgentLedgerStrict24hDedupSyntheticAndInputCachePct();
  testLiveStatusCli();
  testMcpServerYoloNetworkGuardTool();
  console.log('test-mac-yolo-network-guard: PASS (7/7)');
}

main();
