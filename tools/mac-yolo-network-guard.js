#!/usr/bin/env node
'use strict';

/**
 * tools/mac-yolo-network-guard.js
 *
 * Idiot-Proof Internet Health & Unified Per-Agent Cloud / LLM / Token / Bandwidth
 * Inspector for Mac YOLO Safeguards.
 *
 * Combines:
 *   1. Polite Cloudflare WAN Download & Upload Mbps (< 9 MB, single-stream, no bufferbloat flood)
 *   2. Plain-English Wi-Fi Router vs ISP Latency & Video-Call Verdict
 *   3. Single-pass `nettop` Sample #1 (cumulative process RX/TX bytes) + Sample #2 (live B/s delta)
 *   4. Live outbound Cloud HTTPS socket count per agent (`lsof -iTCP -sTCP:ESTABLISHED`)
 *   5. Real 24h LLM API calls, tokens, cache hit %, model & cloud provider from ~/.claude, ~/.omp, ~/.grok
 *   6. Safe 1-click Slow-Internet Remediation (`--fix`) with clickable Level-2 drill-down rows (`~~` format)
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const https = require('https');
const { execFileSync, spawnSync } = require('child_process');

const STATE_PATH =
  process.env.MAC_YOLO_NET_STATE_PATH ||
  path.join(os.homedir(), '.hermes', 'mac-yolo-net-state.json');

function formatRateMbpsOrKbps(bytesPerSec) {
  const bps = Math.max(0, Number(bytesPerSec) || 0);
  const mbps = (bps * 8) / 1_000_000;
  if (mbps >= 1.0) return `${mbps.toFixed(1)} Mbps`;
  const kbps = bps / 1024;
  if (kbps >= 1.0) return `${Math.round(kbps)} KB/s`;
  return '0 KB/s';
}

function formatBytesHuman(bytes) {
  const b = Math.max(0, Number(bytes) || 0);
  if (b >= 1_073_741_824) return `${(b / 1_073_741_824).toFixed(2)} GB`;
  if (b >= 1_048_576) return `${(b / 1_048_576).toFixed(1)} MB`;
  if (b >= 1024) return `${Math.round(b / 1024)} KB`;
  return `${Math.round(b)} B`;
}

function formatTokensCompact(tokens) {
  const t = Math.max(0, Number(tokens) || 0);
  if (t >= 1_000_000) return `${(t / 1_000_000).toFixed(1)}M tok`;
  if (t >= 1_000) return `${Math.round(t / 1_000)}K tok`;
  return `${Math.round(t)} tok`;
}

function sanitizeRowText(str) {
  return String(str || '')
    .replace(/;;/g, ';')
    .replace(/~~/g, ' - ')
    .replace(/\|/g, '/')
    .replace(/::/g, ': ');
}

function encodeDetailRow({ label, badge, bar = 50, subTitle = '', subItems = [] }) {
  const cleanSub = subItems
    .filter(Boolean)
    .map(([k, v]) => `${sanitizeRowText(k)}::${sanitizeRowText(v)}`)
    .join('~~');
  return [
    sanitizeRowText(label),
    sanitizeRowText(badge),
    Math.min(100, Math.max(4, Math.round(Number(bar) || 50))),
    sanitizeRowText(subTitle || label),
    cleanSub,
  ].join('|');
}

function normalizeProcessLabel(rawName) {
  const cleaned = String(rawName || '')
    .replace(/\.\d+$/, '')
    .trim();
  const lower = cleaned.toLowerCase();
  if (!cleaned) return 'System';
  if (lower.includes('browseros') || lower.includes('browseros-claw')) return 'BrowserOS Neo';
  if (lower.includes('google chrome') || lower === 'google') return 'Google Chrome';
  if (lower.includes('tailscale')) return 'Tailscale VPN';
  if (lower.includes('crowdstrike')) return 'CrowdStrike';
  if (lower === 'agy' || lower === 'agy-real' || lower.includes('gemini')) return 'Gemini / Antigravity';
  if (lower.includes('claude')) return 'Claude Code';
  if (lower === 'omp') return 'OMP Agent';
  if (lower.startsWith('grok')) return 'Grok CLI';
  if (lower.includes('cursor')) return 'Cursor IDE';
  if (lower.includes('pool')) return 'Poolside Agent';
  if (lower.includes('ollama') || lower.includes('llama-server')) return 'Ollama (Local)';
  if (lower === 'nc') return 'SSH / Tunnel (nc)';
  if (lower === 'rsync') return 'rsync Transfer';
  if (lower === 'scp' || lower === 'sftp') return 'SCP Transfer';
  if (lower.includes('webkit')) return 'Safari / WebKit';
  if (lower.includes('teams') || lower === 'msteams') return 'Microsoft Teams';
  if (lower === 'mdnsresponder') return 'mDNS / Bonjour';
  return cleaned;
}

/**
 * Parses BOTH Sample #1 (cumulative lifetime bytes per process) AND Sample #2
 * (true interval delta bytes per process) from `nettop -P -L 2 -s <sec> -d -J bytes_in,bytes_out -x`.
 */
function parseNettopBothPasses(rawOutput, sampleSeconds = 1) {
  const sec = Math.max(0.25, Number(sampleSeconds) || 1);
  const lines = String(rawOutput || '').split(/\r?\n/);
  let headerCount = 0;
  const byApp = new Map();

  const ensureApp = (app) => {
    let entry = byApp.get(app);
    if (!entry) {
      entry = {
        app,
        cumRxBytes: 0,
        cumTxBytes: 0,
        rxBytesPerSec: 0,
        txBytesPerSec: 0,
        pids: [],
      };
      byApp.set(app, entry);
    }
    return entry;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith(',bytes_in,bytes_out')) {
      headerCount += 1;
      continue;
    }
    if (headerCount < 1) continue;
    const parts = line.split(',');
    if (parts.length < 3) continue;
    const procToken = parts[0].trim();
    const rxBytes = Number(parts[1]) || 0;
    const txBytes = Number(parts[2]) || 0;
    if (rxBytes <= 0 && txBytes <= 0) continue;

    const pidMatch = procToken.match(/\.(\d+)$/);
    const pid = pidMatch ? Number(pidMatch[1]) : null;
    const rawBase = procToken.replace(/\.\d+$/, '');
    if (rawBase === 'nettop' || rawBase === 'MacYoloSafeguards' || pid === process.pid) continue;
    const app = normalizeProcessLabel(procToken);
    const entry = ensureApp(app);
    if (pid && !entry.pids.includes(pid)) entry.pids.push(pid);

    if (headerCount === 1) {
      entry.cumRxBytes += rxBytes;
      entry.cumTxBytes += txBytes;
    } else if (headerCount >= 2) {
      entry.rxBytesPerSec += rxBytes / sec;
      entry.txBytesPerSec += txBytes / sec;
    }
  }

  return Array.from(byApp.values()).map((entry) => {
    const totalBytesPerSec = entry.rxBytesPerSec + entry.txBytesPerSec;
    const cumTotalBytes = entry.cumRxBytes + entry.cumTxBytes;
    const rxMbps = Number(((entry.rxBytesPerSec * 8) / 1_000_000).toFixed(2));
    const txMbps = Number(((entry.txBytesPerSec * 8) / 1_000_000).toFixed(2));
    const totalMbps = Number(((totalBytesPerSec * 8) / 1_000_000).toFixed(2));
    return {
      app: entry.app,
      pids: entry.pids.slice(0, 6),
      pidCount: entry.pids.length,
      cumRxBytes: Math.round(entry.cumRxBytes),
      cumTxBytes: Math.round(entry.cumTxBytes),
      cumTotalBytes: Math.round(cumTotalBytes),
      rxBytesPerSec: Math.round(entry.rxBytesPerSec),
      txBytesPerSec: Math.round(entry.txBytesPerSec),
      totalBytesPerSec: Math.round(totalBytesPerSec),
      rxMbps,
      txMbps,
      totalMbps,
      summary: `↓ ${formatRateMbpsOrKbps(entry.rxBytesPerSec)} · ↑ ${formatRateMbpsOrKbps(entry.txBytesPerSec)}`,
      cumSummary: `${formatBytesHuman(cumTotalBytes)} (↓ ${formatBytesHuman(entry.cumRxBytes)} / ↑ ${formatBytesHuman(entry.cumTxBytes)})`,
    };
  });
}

function parseNettopDelta(rawOutput, sampleSeconds = 1) {
  return parseNettopBothPasses(rawOutput, sampleSeconds)
    .filter((e) => e.totalBytesPerSec >= 2048)
    .sort((a, b) => b.totalBytesPerSec - a.totalBytesPerSec);
}

function classifyNetworkHealth({ wanPingMs, wanLossPct, routerPingMs, downloadMbps, uploadMbps }) {
  if (wanPingMs === null || wanLossPct >= 100) {
    return {
      grade: 'offline',
      badge: 'Offline ! ›',
      color: '#fb7185',
      verdictShort: 'Offline — No Internet Connection',
      diagnosis: 'Cannot reach Internet (100% dropped packets to Cloudflare 1.1.1.1)',
      callQuality: 'Offline — Calls & cloud AI agents will fail until Wi-Fi/ISP reconnects',
    };
  }
  if (routerPingMs !== null && routerPingMs >= 85) {
    return {
      grade: 'wifi_degraded',
      badge: `Wi-Fi ${Math.round(routerPingMs)} ms! ›`,
      color: '#fb7185',
      verdictShort: `Weak Wi-Fi (${Math.round(routerPingMs)} ms to router)`,
      diagnosis: `Your Mac-to-Router Wi-Fi signal is lagging (${Math.round(routerPingMs)} ms before even reaching your ISP)`,
      callQuality: 'Choppy — Wi-Fi interference between your Mac and home router',
    };
  }
  if (wanPingMs >= 200 || wanLossPct >= 15) {
    const isBloat = routerPingMs !== null && routerPingMs < 35;
    return {
      grade: 'bufferbloat',
      badge: `Lag ${Math.round(wanPingMs)} ms! ›`,
      color: '#fb7185',
      verdictShort: isBloat
        ? `Slow! ISP Upload Jammed (${Math.round(wanPingMs)} ms lag)`
        : `Severe Internet Lag (${Math.round(wanPingMs)} ms)`,
      diagnosis: isBloat
        ? `Your Wi-Fi is fine (${Math.round(routerPingMs)} ms), but your ISP upload pipe is maxed out (${Math.round(wanPingMs)} ms lag, ${Math.round(wanLossPct)}% packet drops)`
        : `High ISP delay (${Math.round(wanPingMs)} ms, ${Math.round(wanLossPct)}% packet drops)`,
      callQuality: 'Poor — Video calls & web pages will freeze until heavy uploads stop (Click Fix Slow Net)',
    };
  }
  if (wanPingMs >= 100 || wanLossPct > 0 || (downloadMbps !== null && downloadMbps > 0 && downloadMbps < 10)) {
    const dlTag = downloadMbps ? ` · ↓${Math.round(downloadMbps)}M` : '';
    return {
      grade: 'elevated',
      badge: `Fair · ${Math.round(wanPingMs)} ms${dlTag} ›`,
      color: '#fbbf24',
      verdictShort: `Fair — Busy Pipe (${Math.round(wanPingMs)} ms lag)`,
      diagnosis: `Usable, but latency is slightly elevated (${Math.round(wanPingMs)} ms ISP${routerPingMs !== null ? `, ${Math.round(routerPingMs)} ms Wi-Fi` : ''})`,
      callQuality: 'Okay for browsing & coding; minor jitter possible if large uploads start',
    };
  }
  const dlTag = downloadMbps ? `↓${Math.round(downloadMbps)} Mbps` : 'Smooth';
  const ulNote =
    uploadMbps !== null && uploadMbps < 12
      ? downloadMbps !== null
        ? `Download is fast (${downloadMbps.toFixed(0)} Mbps), upload is modest (${uploadMbps.toFixed(1)} Mbps — avoid huge parallel uploads)`
        : `Upload is modest (${uploadMbps.toFixed(1)} Mbps — avoid huge parallel uploads)`
      : `Fast download & responsive ping (${Math.round(wanPingMs)} ms ISP, 0% drops)`;
  return {
    grade: 'healthy',
    badge: `Fast · ${dlTag} ›`,
    color: '#34d399',
    verdictShort: `Fast for 4K & Calls (${Math.round(wanPingMs)} ms)`,
    diagnosis: ulNote,
    callQuality: `Crystal-clear for Zoom/Teams calls, 4K video & cloud AI agents (${Math.round(wanPingMs)} ms ISP · ${routerPingMs ?? '--'} ms Wi-Fi)`,
  };
}

function extractExecBasenameFromArgs(argsStr) {
  const s = String(argsStr || '').trim();
  if (!s) return '';
  let firstToken = '';
  if (s.startsWith('"') || s.startsWith("'")) {
    const q = s[0];
    const end = s.indexOf(q, 1);
    firstToken = end > 1 ? s.slice(1, end) : s.slice(1);
  } else {
    const appMacosMatch = s.match(/^(.+?\.app\/Contents\/MacOS\/[^\s]+)/);
    firstToken = appMacosMatch ? appMacosMatch[1] : s.split(/\s+/)[0];
  }
  return path.basename(firstToken);
}

function findRemediableNetworkProcesses(psLines) {
  const killTargets = [];
  const sparedTransfers = [];
  const transferByDest = new Map();

  for (const rawLine of psLines) {
    const m = String(rawLine || '')
      .trim()
      .match(/^(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/);
    if (!m) continue;
    const pid = Number(m[1]);
    const ppid = Number(m[2]);
    const etime = m[3];
    const args = m[4].trim();
    const comm = extractExecBasenameFromArgs(args);
    if (!pid || pid === process.pid || !comm) continue;
    if (comm === 'networkQuality' || comm === 'iperf' || comm === 'iperf3') {
      killTargets.push({
        pid,
        reason: `Saturation benchmark (${comm} PID ${pid}) flooding uplink`,
        kind: 'benchmark_flood',
      });
      continue;
    }

    if ((comm === 'rsync' || comm === 'scp') && !args.includes('--server')) {
      const remoteMatch = args.match(/\s([A-Za-z0-9._@-]+:[^\r\n]+)$/);
      const rawDest = remoteMatch ? remoteMatch[1].replace(/['"]/g, '').trim() : '';
      if (rawDest.includes(':')) {
        const normDest = rawDest.replace(/\/+$/, '');
        const existing = transferByDest.get(normDest);
        if (!existing) {
          transferByDest.set(normDest, { pid, ppid, etime, comm, dest: normDest });
          sparedTransfers.push({ pid, comm, dest: normDest });
        } else {
          killTargets.push({
            pid,
            reason: `Duplicate concurrent ${comm} to ${normDest} (PID ${pid}, racing PID ${existing.pid})`,
            kind: 'duplicate_transfer',
          });
        }
      }
    }
  }

  return { killTargets, sparedTransfers };
}

function listRecentFiles(rootDir, maxAgeMs = 24 * 3600 * 1000, matchFn = () => true) {
  const out = [];
  const cutoff = Date.now() - maxAgeMs;
  const walk = (dir, depth) => {
    if (depth > 8) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        walk(full, depth + 1);
      } else if (ent.isFile() && matchFn(ent.name, full)) {
        try {
          const st = fs.statSync(full);
          if (st.mtimeMs >= cutoff) {
            out.push({ path: full, size: st.size, mtimeMs: st.mtimeMs });
          }
        } catch {
          /* ignore */
        }
      }
    }
  };
  walk(rootDir, 0);
  return out.sort((a, b) => b.mtimeMs - a.mtimeMs);
}

function readTailUtf8(filePath, maxBytes = 2 * 1024 * 1024) {
  try {
    const st = fs.statSync(filePath);
    if (st.size <= maxBytes) return fs.readFileSync(filePath, 'utf8');
    const fd = fs.openSync(filePath, 'r');
    try {
      const buf = Buffer.alloc(maxBytes);
      fs.readSync(fd, buf, 0, maxBytes, st.size - maxBytes);
      const str = buf.toString('utf8');
      const nl = str.indexOf('\n');
      return nl >= 0 ? str.slice(nl + 1) : str;
    } finally {
      fs.closeSync(fd);
    }
  } catch {
    return '';
  }
}

function sampleCloudSocketsByApp() {
  const map = new Map();
  try {
    const res = spawnSync('/usr/sbin/lsof', ['-iTCP', '-sTCP:ESTABLISHED', '-n', '-P'], {
      encoding: 'utf8',
      timeout: 2500,
    });
    const lines = String(res.stdout || '').split(/\r?\n/).slice(1);
    for (const line of lines) {
      if (!line) continue;
      const cols = line.trim().split(/\s+/);
      if (cols.length < 9) continue;
      const cmd = cols[0];
      const nameCol = cols[8] || '';
      const arrowIdx = nameCol.indexOf('->');
      if (arrowIdx < 0) continue;
      const remote = nameCol.slice(arrowIdx + 2);
      const isLocal =
        remote.startsWith('127.') ||
        remote.startsWith('[::1]') ||
        remote.startsWith('[fe80:') ||
        remote.startsWith('192.168.') ||
        remote.startsWith('10.');
      const app = normalizeProcessLabel(cmd);
      const cur = map.get(app) || { cloudConns: 0, localConns: 0, remoteEndpoints: new Set() };
      if (isLocal) {
        cur.localConns += 1;
      } else {
        cur.cloudConns += 1;
        cur.remoteEndpoints.add(remote.replace(/:\d+$/, ''));
      }
      map.set(app, cur);
    }
  } catch {
    /* ignore */
  }
  return map;
}

/**
 * Collects real 24h LLM calls, tokens, cache hit %, cost, cloud provider,
 * live cloud connections, and internet bandwidth per AI agent on this Mac.
 */
function collectAgentUsageLedger(netApps, socketMap, homeDir = os.homedir()) {
  const netByApp = new Map(netApps.map((n) => [n.app, n]));
  const getNet = (app) =>
    netByApp.get(app) || {
      cumRxBytes: 0,
      cumTxBytes: 0,
      cumTotalBytes: 0,
      rxBytesPerSec: 0,
      txBytesPerSec: 0,
      totalBytesPerSec: 0,
      pidCount: 0,
      summary: '↓ 0 KB/s · ↑ 0 KB/s',
      cumSummary: '0 MB',
    };
  const getSock = (app) => socketMap.get(app) || { cloudConns: 0, localConns: 0, remoteEndpoints: new Set() };

  const cutoff24h = Date.now() - 24 * 3600 * 1000;

  // 1. Claude Code (~/.claude/projects/**/*.jsonl, strict 24h timestamp + message.id dedup)
  const claudeFiles = listRecentFiles(
    path.join(homeDir, '.claude', 'projects'),
    24 * 3600 * 1000,
    (n) => n.endsWith('.jsonl')
  );
  let claudeCalls = 0;
  let claudeTokens = 0;
  let claudeInputDenom = 0;
  let claudeCacheRead = 0;
  let claudeSawCacheMetric = false;
  const claudeModels = new Set();
  const seenClaudeIds = new Set();
  for (const f of claudeFiles) {
    const text = readTailUtf8(f.path, 80_000_000);
    let lineIdx = 0;
    for (const line of text.split('\n')) {
      lineIdx += 1;
      if (!line.includes('"usage"')) continue;
      try {
        const o = JSON.parse(line);
        const u = o.usage || (o.message && o.message.usage);
        if (!u) continue;
        const mdl = String(o.model || (o.message && o.message.model) || '').trim();
        if (mdl === '<synthetic>') continue;
        const ts = Date.parse(o.timestamp || (o.message && o.message.timestamp) || '');
        if (!Number.isFinite(ts) || ts < cutoff24h) continue;
        const msgId = (o.message && o.message.id) || o.id || o.uuid || `${f.path}:${lineIdx}`;
        if (seenClaudeIds.has(msgId)) continue;
        seenClaudeIds.add(msgId);
        claudeCalls += 1;
        const inp = Number(u.input_tokens) || 0;
        const out = Number(u.output_tokens) || 0;
        const cr = Number(u.cache_read_input_tokens) || 0;
        const cw = Number(u.cache_creation_input_tokens) || 0;
        if ('cache_read_input_tokens' in u || 'cache_creation_input_tokens' in u) {
          claudeSawCacheMetric = true;
        }
        claudeInputDenom += inp + cr + cw;
        claudeTokens += inp + out + cr + cw;
        claudeCacheRead += cr;
        if (mdl) claudeModels.add(mdl);
      } catch {
        /* ignore partial line */
      }
    }
  }

  // 2. OMP Agent (~/.omp/agent/sessions/**/*.jsonl, strict 24h timestamp + id dedup)
  const ompFiles = listRecentFiles(
    path.join(homeDir, '.omp', 'agent', 'sessions'),
    24 * 3600 * 1000,
    (n) => n.endsWith('.jsonl')
  );
  let ompCalls = 0;
  let ompTokens = 0;
  let ompInputDenom = 0;
  let ompCacheRead = 0;
  let ompSawCacheMetric = false;
  let ompCostUsd = 0;
  const ompProviders = new Set();
  const ompModels = new Set();
  const seenOmpIds = new Set();
  for (const f of ompFiles) {
    const text = readTailUtf8(f.path, 80_000_000);
    let lineIdx = 0;
    for (const line of text.split('\n')) {
      lineIdx += 1;
      if (!line.includes('"usage"')) continue;
      try {
        const o = JSON.parse(line);
        const m = o.message || o;
        if (!m || !m.usage) continue;
        const mdl = String(m.model || '').trim();
        if (mdl === '<synthetic>') continue;
        const rawTs = o.timestamp || m.timestamp;
        const ts = typeof rawTs === 'number' ? rawTs : Date.parse(String(rawTs || ''));
        if (!Number.isFinite(ts) || ts < cutoff24h) continue;
        const msgId = o.id || m.id || `${f.path}:${lineIdx}`;
        if (seenOmpIds.has(msgId)) continue;
        seenOmpIds.add(msgId);
        ompCalls += 1;
        const u = m.usage;
        const inp = Number(u.input) || 0;
        const out = Number(u.output) || 0;
        const cr = Number(u.cacheRead) || 0;
        const cw = Number(u.cacheWrite) || 0;
        if ('cacheRead' in u || 'cacheWrite' in u) {
          ompSawCacheMetric = true;
        }
        ompInputDenom += inp + cr + cw;
        const tot = Number(u.totalTokens) || inp + out + cr + cw;
        ompTokens += tot;
        ompCacheRead += cr;
        if (u.cost && Number.isFinite(Number(u.cost.total))) {
          ompCostUsd += Number(u.cost.total);
        }
        if (m.provider) ompProviders.add(String(m.provider));
        if (mdl) ompModels.add(mdl);
      } catch {
        /* ignore */
      }
    }
  }
  // 3. Grok CLI (~/.grok/sessions/**/events.jsonl, counting timestamped type="first_token" calls in last 24h)
  const grokSummaries = listRecentFiles(
    path.join(homeDir, '.grok', 'sessions'),
    24 * 3600 * 1000,
    (n) => n === 'summary.json'
  );
  let grokCalls = 0;
  let grokSessions24h = 0;
  let grokSawEventLog = false;
  const grokModels = new Set();
  for (const f of grokSummaries) {
    try {
      const s = JSON.parse(fs.readFileSync(f.path, 'utf8'));
      if (s.current_model_id) grokModels.add(String(s.current_model_id));
      const evPath = path.join(path.dirname(f.path), 'events.jsonl');
      if (fs.existsSync(evPath)) {
        grokSawEventLog = true;
        let sessCalls24h = 0;
        const eText = readTailUtf8(evPath, 80_000_000);
        for (const line of eText.split('\n')) {
          if (!line.includes('"first_token"')) continue;
          try {
            const ev = JSON.parse(line);
            if (ev && ev.type === 'first_token') {
              const evTs = Date.parse(ev.ts || ev.timestamp || '');
              if (Number.isFinite(evTs) && evTs >= cutoff24h) {
                sessCalls24h += 1;
              }
            }
          } catch {
            /* ignore partial line */
          }
        }
        if (sessCalls24h > 0) {
          grokSessions24h += 1;
          grokCalls += sessCalls24h;
        }
      }
    } catch {
      /* ignore */
    }
  }
  const grokTurns = grokCalls;
  const grokChatMsgs = grokCalls;
  const grokEstTokens = null;
  const claudeNet = getNet('Claude Code');
  const claudeSock = getSock('Claude Code');
  const ompNet = getNet('OMP Agent');
  const ompSock = getSock('OMP Agent');
  const grokNet = getNet('Grok CLI');
  const grokSock = getSock('Grok CLI');
  const gemNet = getNet('Gemini / Antigravity');
  const gemSock = getSock('Gemini / Antigravity');
  const bosNet = getNet('BrowserOS Neo');
  const bosSock = getSock('BrowserOS Neo');
  const curNet = getNet('Cursor IDE');
  const curSock = getSock('Cursor IDE');

  const agents = [
    {
      name: 'Claude Code',
      cloud: 'Anthropic Cloud',
      models: Array.from(claudeModels).slice(0, 2).join(', ') || 'claude-sonnet / opus',
      llmCalls: claudeFiles.length > 0 ? claudeCalls : null,
      tokens: claudeFiles.length > 0 ? claudeTokens : null,
      cachePct:
        claudeSawCacheMetric && claudeInputDenom > 0
          ? Math.round((claudeCacheRead / claudeInputDenom) * 100)
          : null,
      costUsd: null,
      sessions24h: claudeFiles.length,
      net: claudeNet,
      cloudConns: claudeSock.cloudConns,
      localConns: claudeSock.localConns,
      extraNote:
        claudeFiles.length === 0 ? 'No local ~/.claude transcripts modified in last 24h' : null,
    },
    {
      name: 'OMP Agent',
      cloud: Array.from(ompProviders).slice(0, 2).join(', ') || 'Google Antigravity Cloud',
      models: Array.from(ompModels).slice(0, 2).join(', ') || 'gemini-4-carbon',
      llmCalls: ompFiles.length > 0 ? ompCalls : null,
      tokens: ompFiles.length > 0 ? ompTokens : null,
      cachePct:
        ompSawCacheMetric && ompInputDenom > 0
          ? Math.round((ompCacheRead / ompInputDenom) * 100)
          : null,
      costUsd: ompCostUsd > 0 ? Number(ompCostUsd.toFixed(2)) : null,
      sessions24h: ompFiles.length,
      net: ompNet,
      cloudConns: ompSock.cloudConns,
      localConns: ompSock.localConns,
      extraNote:
        ompFiles.length === 0 ? 'No local ~/.omp transcripts modified in last 24h' : null,
    },
    {
      name: 'Grok CLI',
      cloud: 'xAI Cloud',
      models: Array.from(grokModels).slice(0, 2).join(', ') || 'grok-4.7',
      llmCalls: grokSawEventLog ? grokTurns : null,
      tokens: grokEstTokens,
      cachePct: null,
      costUsd: null,
      sessions24h: grokSessions24h,
      net: grokNet,
      cloudConns: grokSock.cloudConns,
      localConns: grokSock.localConns,
      extraNote: grokSawEventLog
        ? `${grokChatMsgs} timestamped model completions across ${grokSessions24h} active 24h session(s); token volume not logged locally`
        : 'No local ~/.grok event logs in last 24h',
    },
    {
      name: 'Gemini / Antigravity',
      cloud: 'Google Cloud',
      models: 'Gemini Desktop + agy Hub',
      llmCalls: null,
      tokens: null,
      cachePct: null,
      costUsd: null,
      sessions24h: gemNet.pidCount > 0 || gemSock.cloudConns > 0 ? 1 : 0,
      net: gemNet,
      cloudConns: gemSock.cloudConns,
      localConns: gemSock.localConns,
      extraNote: 'Model calls not logged locally by Gemini Desktop',
    },
    {
      name: 'BrowserOS Neo (Agent Web)',
      cloud: 'Direct Web / Chromium CDP',
      models: 'Headless Web & Claw Server',
      llmCalls: null,
      tokens: null,
      cachePct: null,
      costUsd: null,
      sessions24h: bosNet.pidCount > 0 ? 1 : 0,
      net: bosNet,
      cloudConns: bosSock.cloudConns,
      localConns: bosSock.localConns,
      extraNote: 'Web browser engine (fetches live pages; no direct LLM billing)',
    },
  ];

  if (curNet.cumTotalBytes > 0 || curSock.cloudConns > 0) {
    agents.push({
      name: 'Cursor IDE',
      cloud: 'Cursor Cloud',
      models: 'Cursor Agent',
      llmCalls: null,
      tokens: null,
      cachePct: null,
      costUsd: null,
      sessions24h: 1,
      net: curNet,
      cloudConns: curSock.cloudConns,
      localConns: curSock.localConns,
      extraNote: 'Model calls billed inside Cursor Cloud (not local JSONL)',
    });
  }

  // Sort by combined activity (LLM calls + tokens + internet MB)
  agents.sort((a, b) => {
    const scoreA = (a.llmCalls || 0) * 1000 + (a.tokens || 0) / 1000 + a.net.cumTotalBytes / 10_000 + a.net.totalBytesPerSec * 10;
    const scoreB = (b.llmCalls || 0) * 1000 + (b.tokens || 0) / 1000 + b.net.cumTotalBytes / 10_000 + b.net.totalBytesPerSec * 10;
    return scoreB - scoreA;
  });

  const totals = {
    llmCalls: agents.reduce((s, a) => s + (a.llmCalls || 0), 0),
    tokens: agents.reduce((s, a) => s + (a.tokens || 0), 0),
    netBytes: agents.reduce((s, a) => s + a.net.cumTotalBytes, 0),
    liveBytesPerSec: agents.reduce((s, a) => s + a.net.totalBytesPerSec, 0),
    cloudConns: agents.reduce((s, a) => s + a.cloudConns, 0),
    costUsd: Number(agents.reduce((s, a) => s + (a.costUsd || 0), 0).toFixed(2)),
  };

  return { agents, totals };
}

function buildAgentSubItems(a) {
  const items = [
    ['Cloud Provider & Model', `${a.cloud} (${a.models})`],
    [
      'External Internet (Live PIDs)',
      a.net.totalBytesPerSec >= 1024
        ? `Live ${a.net.summary} · Running PIDs Since Launch: ${a.net.cumSummary}`
        : `Idle right now · Running PIDs Since Launch: ${a.net.cumSummary}`,
    ],
    [
      'Open Cloud Connections',
      `${a.cloudConns} live HTTPS cloud socket(s) · ${a.localConns} local loopback (127.0.0.1)`,
    ],
  ];
  if (a.llmCalls !== null) {
    items.push([
      'LLM API Calls (Last 24h)',
      `${a.llmCalls} LLM calls across ${a.sessions24h} active session transcript(s)`,
    ]);
  }
  if (a.tokens !== null) {
    const cacheStr = a.cachePct !== null ? ` (${a.cachePct}% prompt-cache hit)` : '';
    const costStr = a.costUsd !== null ? ` · $${a.costUsd.toFixed(2)} metered` : '';
    items.push(['Tokens Processed (24h)', `${formatTokensCompact(a.tokens)}${cacheStr}${costStr}`]);
  } else if (a.extraNote) {
    items.push(['Session Activity', a.extraNote]);
  } else {
    items.push(['Session Activity', 'Token volume not logged locally']);
  }
  return items;
}

function buildNetworkAndAgentRows({
  downloadMbps,
  uploadMbps,
  wanPing,
  routerPing,
  health,
  allNetApps,
  agentLedger,
  gatewayIp,
  measuredAtIso,
}) {
  const netRows = [];

  // Row 1: Plain-English Overall Internet Speed & Verdict
  const speedBadge =
    downloadMbps !== null
      ? `${health.grade === 'healthy' ? 'Fast' : health.grade === 'elevated' ? 'Fair' : 'Slow'} · ↓${downloadMbps.toFixed(0)} / ↑${uploadMbps !== null ? uploadMbps.toFixed(1) : '--'} Mbps ›`
      : 'Measuring Speed… ›';
  const dlMinutesFor1GB = downloadMbps && downloadMbps > 0 ? ((8000 / downloadMbps) / 60).toFixed(1) : '--';
  const ageMin = measuredAtIso ? Math.max(0, Math.round((Date.now() - Date.parse(measuredAtIso)) / 60000)) : null;
  netRows.push(
    encodeDetailRow({
      label: '1. Internet Speed & What Works',
      badge: speedBadge,
      bar: downloadMbps !== null ? Math.min(100, Math.max(10, downloadMbps)) : 35,
      subTitle: 'Internet Speed — Plain-English Breakdown',
      subItems: [
        ['What Works Right Now', health.callQuality],
        [
          'Download Speed',
          downloadMbps !== null
            ? `${downloadMbps.toFixed(1)} Mbps (Downloads a 1 GB Xcode/model file in ~${dlMinutesFor1GB} min)`
            : 'Not measured yet — click "Run Speed Test" below',
        ],
        [
          'Upload Speed',
          uploadMbps !== null
            ? `${uploadMbps.toFixed(1)} Mbps ${uploadMbps < 12 ? '(Modest upload — large agent file copies will slow down Zoom/browsing!)' : '(Fast enough for HD screen sharing & cloud sync)'}`
            : 'Click "Run Speed Test" below to measure upload speed',
        ],
        [
          'Last Checked',
          ageMin !== null
            ? `${ageMin === 0 ? 'Just now' : `${ageMin}m ago`} via polite single-stream Cloudflare test (< 9 MB)`
            : 'Pending initial measurement',
        ],
      ],
    })
  );

  // Row 2: Wi-Fi vs ISP Lag Check (Idiot-proof blame isolator!)
  const wanStr = wanPing.avgMs !== null ? `${Math.round(wanPing.avgMs)} ms` : 'Timeout';
  const rtrStr = routerPing.avgMs !== null ? `${Math.round(routerPing.avgMs)} ms` : '--';
  const lagVerdict =
    health.grade === 'healthy'
      ? `Smooth · ${wanStr} (0% drops) ›`
      : health.grade === 'wifi_degraded'
        ? `Weak Wi-Fi · ${rtrStr}! ›`
        : health.grade === 'bufferbloat'
          ? `ISP Jammed · ${wanStr}! ›`
          : `Fair · ${wanStr} ›`;
  netRows.push(
    encodeDetailRow({
      label: '2. Video Call & Browsing Lag (Wi-Fi vs ISP)',
      badge: lagVerdict,
      bar: wanPing.avgMs !== null ? Math.min(100, Math.max(10, 100 - Math.round(wanPing.avgMs / 3))) : 10,
      subTitle: 'Is Slow Internet Your Wi-Fi or Your ISP?',
      subItems: [
        ['Plain-English Diagnosis', health.diagnosis],
        [
          `Step 1: Mac → Home Wi-Fi Router (${gatewayIp || 'Router'})`,
          routerPing.avgMs !== null
            ? `${rtrStr} ${routerPing.avgMs < 25 ? '(Great Wi-Fi signal — your router is NOT the problem)' : '(Slow Wi-Fi — move closer to router or switch to 5 GHz)'}`
            : 'No local gateway detected',
        ],
        [
          'Step 2: Router → Internet (Cloudflare 1.1.1.1)',
          wanPing.avgMs !== null
            ? `${wanStr} (${wanPing.avgMs < 80 ? 'Fast ISP response' : wanPing.avgMs < 180 ? 'Moderate ISP delay' : 'ISP pipe saturated — click Fix Slow Internet!'})`
            : 'Timed out reaching 1.1.1.1',
        ],
        ['Dropped Packets', `${Math.round(wanPing.lossPct)}% packet loss (0% is ideal for voice/video calls)`],
      ],
    })
  );

  // Row 3: All AI Agents Combined Internet + Cloud + LLM Summary
  const tot = agentLedger.totals;
  netRows.push(
    encodeDetailRow({
      label: '3. All AI Agents Combined (Internet + Cloud)',
      badge: `${formatBytesHuman(tot.netBytes)} Net · ${tot.llmCalls} Calls ›`,
      bar: 80,
      subTitle: 'All AI Agents — Combined Internet, Cloud & Token Usage',
      subItems: [
        [
          'Live Agent Internet Speed Now',
          tot.liveBytesPerSec >= 1024 ? `${formatRateMbpsOrKbps(tot.liveBytesPerSec)} active right now` : '0 KB/s (Agents idle on network right now)',
        ],
        ['External Internet (Running Agent PIDs)', `${formatBytesHuman(tot.netBytes)} across currently running AI agent PIDs (since launch, loopback excluded)`],
        ['Total Cloud LLM Calls (24h)', `${tot.llmCalls} cloud model calls · ${tot.cloudConns} open HTTPS cloud sockets`],
        [
          'Total AI Tokens (24h)',
          `${formatTokensCompact(tot.tokens)}${tot.costUsd > 0 ? ` · $${tot.costUsd.toFixed(2)} tracked OMP cloud spend` : ''}`,
        ],
      ],
    })
  );

  // Rows 4..6: Per-Agent / Top Non-Agent Bandwidth Culprits (clickable!)
  // If a non-agent transfer (e.g. rsync, scp, Tailscale, Chrome) is actively hogging > 100 KB/s, put it right at #4!
  const activeNonAgentHogs = allNetApps
    .filter(
      (n) =>
        n.totalBytesPerSec >= 100 * 1024 &&
        !['Claude Code', 'OMP Agent', 'Grok CLI', 'Gemini / Antigravity', 'BrowserOS Neo'].includes(n.app)
    )
    .sort((a, b) => b.totalBytesPerSec - a.totalBytesPerSec);

  if (activeNonAgentHogs.length > 0) {
    const h = activeNonAgentHogs[0];
    const canAutoStopHog =
      h.app === 'rsync Transfer' || h.app === 'SCP Transfer' || h.app.includes('networkQuality');
    netRows.push(
      encodeDetailRow({
        label: `⚡ Active Upload/Download Hog: ${h.app}`,
        badge: `${h.summary} ›`,
        bar: Math.min(100, Math.max(25, Math.round(h.totalMbps * 8))),
        subTitle: `${h.app} — Live Bandwidth Breakdown`,
        subItems: [
          ['Live Internet Speed Used', `${h.summary} (${h.totalMbps} Mbps)`],
          ['External Data Since Launch', h.cumSummary],
          ['Active Process IDs', `${h.pidCount} process(es): PID ${h.pids.join(', ')}`],
          [
            'What You Can Do',
            canAutoStopHog
              ? 'Click "Fix Slow Internet" to stop duplicate concurrent transfers / benchmark floods'
              : `${h.app} is a protected user/system app (Mac YOLO will not kill it automatically — pause its upload/tab if calls lag)`,
          ],
        ],
      })
    );
  }

  for (const a of agentLedger.agents) {
    if (netRows.length >= 7) break;
    const liveOrCum =
      a.net.totalBytesPerSec >= 5 * 1024
        ? `${formatRateMbpsOrKbps(a.net.totalBytesPerSec)} now`
        : `${formatBytesHuman(a.net.cumTotalBytes)} net`;
    const callsPart = a.llmCalls !== null ? `${a.llmCalls} calls · ` : '';
    const tokPart = a.tokens > 0 ? `${formatTokensCompact(a.tokens)} · ` : '';
    netRows.push(
      encodeDetailRow({
        label: `${a.name} (${a.cloud.replace(' Cloud', '')})`,
        badge: `${callsPart}${tokPart}${liveOrCum} ›`,
        bar: Math.min(100, Math.max(12, Math.round((a.llmCalls || 5) / 2))),
        subTitle: `${a.name} — Internet, Cloud, LLM Calls & Tokens`,
        subItems: buildAgentSubItems(a),
      })
    );
  }

  // Also build rich clickable `agentTokenRows` for the `AI Tokens & Sessions` and `AI Fleet` cards!
  const agentTokenRows = [
    encodeDetailRow({
      label: 'All AI Agents (24h Calls/Tokens · Live PID Net)',
      badge: `${tot.llmCalls} LLM Calls · ${formatTokensCompact(tot.tokens)} ›`,
      bar: 88,
      subTitle: 'AI Fleet Summary — 24h LLM Calls/Tokens & Running-PID External Internet',
      subItems: [
        ['Total LLM API Calls (24h)', `${tot.llmCalls} deduplicated model calls across Claude, OMP & Grok`],
        ['Total Context + Output Volume (24h)', `${formatTokensCompact(tot.tokens)} (prompt-cache accelerated)`],
        ['Running-PID External Internet', `${formatBytesHuman(tot.netBytes)} since PID launch (127.0.0.1 loopback excluded) · ${tot.cloudConns} live cloud sockets`],
        ['Tracked Direct Cloud Spend (24h)', tot.costUsd > 0 ? `$${tot.costUsd.toFixed(2)} metered in OMP transcripts` : '$0 metered overage'],
      ],
    }),
    ...agentLedger.agents.slice(0, 6).map((a) => {
      const callsBadge = a.llmCalls !== null ? `${a.llmCalls} calls` : `${a.cloudConns} cloud conns`;
      const tokBadge = a.tokens > 0 ? ` · ${formatTokensCompact(a.tokens)}` : '';
      const costBadge = a.costUsd !== null ? ` · $${a.costUsd.toFixed(2)}` : '';
      const netBadge = ` · ${formatBytesHuman(a.net.cumTotalBytes)}`;
      return encodeDetailRow({
        label: `${a.name} · ${a.cloud}`,
        badge: `${callsBadge}${tokBadge}${costBadge}${netBadge} ›`,
        bar: Math.min(100, Math.max(12, a.tokens > 0 ? Math.round(Math.log10(a.tokens + 10) * 12) : 25)),
        subTitle: `${a.name} — Cloud, LLM Calls, Tokens & Internet`,
        subItems: buildAgentSubItems(a),
      });
    }),
  ];

  return {
    detailRows: netRows.join(';;'),
    agentTokenRows: agentTokenRows.join(';;'),
  };
}

function getDefaultGatewayIp() {
  try {
    const out = execFileSync('/sbin/route', ['-n', 'get', 'default'], {
      encoding: 'utf8',
      timeout: 1500,
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const m = out.match(/gateway:\s*([0-9a-fA-F.:]+)/);
    return m ? m[1].trim() : null;
  } catch {
    return null;
  }
}

function runPingProbe(host, count = 3) {
  if (!host) return { avgMs: null, maxMs: null, lossPct: 100 };
  const res = spawnSync('/sbin/ping', ['-c', String(count), '-i', '0.15', '-W', '800', host], {
    encoding: 'utf8',
    timeout: 3500,
  });
  const text = `${res.stdout || ''}\n${res.stderr || ''}`;
  const lossMatch = text.match(/([0-9.]+)%\s+packet loss/);
  const rttMatch = text.match(/=\s*([0-9.]+)\/([0-9.]+)\/([0-9.]+)\//);
  const lossPct = lossMatch ? Number(lossMatch[1]) : 100;
  const avgMs = rttMatch ? Number(rttMatch[2]) : null;
  const maxMs = rttMatch ? Number(rttMatch[3]) : null;
  return { avgMs, maxMs, lossPct };
}

function sampleNettopApps(sampleSeconds = 1) {
  const sec = Math.max(1, Math.round(Number(sampleSeconds) || 1));
  const args = ['-t', 'external', '-P', '-L', '2', '-d', '-J', 'bytes_in,bytes_out', '-x'];
  if (sec !== 1) args.splice(5, 0, '-s', String(sec));
  const res = spawnSync('/usr/bin/nettop', args, {
    encoding: 'utf8',
    timeout: (sec + 8) * 1000,
    maxBuffer: 8 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'ignore'],
  });
  return parseNettopBothPasses(res.stdout || '', sec);
}

function measureDownloadMbps(bytes = 3_000_000, timeoutMs = 4500) {
  return new Promise((resolve) => {
    const start = process.hrtime.bigint();
    let firstByteAt = null;
    let received = 0;
    let settled = false;
    let req = null;
    const wallTimer = setTimeout(() => {
      if (req) req.destroy();
      const end = process.hrtime.bigint();
      const activeNs = Number(end - (firstByteAt || start));
      const sec = Math.max(0.1, activeNs / 1e9);
      const mbps = received > 131072 ? Number(((received * 8) / sec / 1_000_000).toFixed(1)) : null;
      finish(mbps);
    }, timeoutMs);
    const finish = (val) => {
      if (!settled) {
        settled = true;
        clearTimeout(wallTimer);
        resolve(val);
      }
    };

    req = https.get(
      `https://speed.cloudflare.com/__down?bytes=${bytes}`,
      { timeout: timeoutMs, headers: { 'User-Agent': 'MacYoloSafeguards/1.2' } },
      (res) => {
        if (res.statusCode !== 200) {
          res.resume();
          finish(null);
          return;
        }
        res.on('data', (chunk) => {
          if (!firstByteAt) firstByteAt = process.hrtime.bigint();
          received += chunk.length;
        });
        res.on('end', () => {
          const end = process.hrtime.bigint();
          const activeNs = Number(end - (firstByteAt || start));
          const sec = Math.max(0.05, activeNs / 1e9);
          const mbps = received > 65536 ? Number(((received * 8) / sec / 1_000_000).toFixed(1)) : null;
          finish(mbps);
        });
        res.on('error', () => finish(null));
      }
    );
    req.on('timeout', () => {
      req.destroy();
      const end = process.hrtime.bigint();
      const activeNs = Number(end - (firstByteAt || start));
      const sec = Math.max(0.1, activeNs / 1e9);
      const mbps = received > 131072 ? Number(((received * 8) / sec / 1_000_000).toFixed(1)) : null;
      finish(mbps);
    });
    req.on('error', () => finish(null));
  });
}

function measureUploadMbps(bytes = 1_000_000, timeoutMs = 4500) {
  return new Promise((resolve) => {
    const payload = Buffer.alloc(bytes, 0x61);
    const start = process.hrtime.bigint();
    let settled = false;
    let req = null;
    const wallTimer = setTimeout(() => {
      if (req) req.destroy();
      finish(null);
    }, timeoutMs);
    const finish = (val) => {
      if (!settled) {
        settled = true;
        clearTimeout(wallTimer);
        resolve(val);
      }
    };

    req = https.request(
      'https://speed.cloudflare.com/__up',
      {
        method: 'POST',
        timeout: timeoutMs,
        headers: {
          'Content-Type': 'application/octet-stream',
          'Content-Length': String(payload.length),
          'User-Agent': 'MacYoloSafeguards/1.2',
        },
      },
      (res) => {
        res.resume();
        if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300) {
          finish(null);
          return;
        }
        res.on('end', () => {
          const end = process.hrtime.bigint();
          const sec = Math.max(0.05, Number(end - start) / 1e9);
          const mbps = Number(((payload.length * 8) / sec / 1_000_000).toFixed(1));
          finish(mbps);
        });
        res.on('error', () => finish(null));
      }
    );
    req.on('timeout', () => {
      req.destroy();
      finish(null);
    });
    req.on('error', () => finish(null));
    req.end(payload);
  });
}

function readCachedState() {
  try {
    if (!fs.existsSync(STATE_PATH)) return {};
    return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8'));
  } catch {
    return {};
  }
}

function writeCachedState(patch) {
  try {
    const dir = path.dirname(STATE_PATH);
    fs.mkdirSync(dir, { recursive: true });
    const next = { ...readCachedState(), ...patch, updatedAt: new Date().toISOString() };
    fs.writeFileSync(STATE_PATH, JSON.stringify(next, null, 2));
    return next;
  } catch {
    return patch;
  }
}

async function collectNetworkReport({ runSpeedTest = false } = {}) {
  const cached = readCachedState();
  const cacheAgeMs = cached.speedMeasuredAt ? Date.now() - Date.parse(cached.speedMeasuredAt) : Infinity;

  const gatewayIp = getDefaultGatewayIp();
  const routerPing = gatewayIp ? runPingProbe(gatewayIp, 2) : { avgMs: null, maxMs: null, lossPct: 0 };
  const wanPing = runPingProbe('1.1.1.1', 3);
  const allNetApps = sampleNettopApps(1);
  const culprits = allNetApps
    .filter((e) => e.totalBytesPerSec >= 2048)
    .sort((a, b) => b.totalBytesPerSec - a.totalBytesPerSec);
  const socketMap = sampleCloudSocketsByApp();
  const agentLedger = collectAgentUsageLedger(allNetApps, socketMap);
  const liveTotalMbps = culprits.reduce((s, c) => s + c.totalMbps, 0);

  const shouldMeasureSpeed =
    runSpeedTest ||
    (!Number.isFinite(cached.downloadMbps) && liveTotalMbps < 4.0) ||
    (cacheAgeMs > 15 * 60 * 1000 && liveTotalMbps < 2.5);

  let downloadMbps = Number.isFinite(cached.downloadMbps) ? Number(cached.downloadMbps) : null;
  let uploadMbps = Number.isFinite(cached.uploadMbps) ? Number(cached.uploadMbps) : null;
  let measuredAtIso = cached.speedMeasuredAt || null;

  if (shouldMeasureSpeed) {
    const dl = await measureDownloadMbps(runSpeedTest ? 8_000_000 : 5_000_000);
    const ul = await measureUploadMbps(runSpeedTest ? 1_500_000 : 1_000_000);
    if (dl !== null) downloadMbps = dl;
    if (ul !== null) uploadMbps = ul;
    if (dl !== null || ul !== null) {
      measuredAtIso = new Date().toISOString();
    }
  }

  const health = classifyNetworkHealth({
    wanPingMs: wanPing.avgMs,
    wanLossPct: wanPing.lossPct,
    routerPingMs: routerPing.avgMs,
    downloadMbps,
    uploadMbps,
  });

  const topHog = culprits[0] || null;
  const speedHeadline =
    downloadMbps !== null
      ? `↓ ${downloadMbps.toFixed(0)} Mbps · ↑ ${uploadMbps !== null ? uploadMbps.toFixed(1) : '--'} Mbps (${health.grade === 'healthy' ? '4K Ready' : health.grade === 'elevated' ? 'Fair' : 'Slow!'})`
      : 'Measuring Internet Speed…';
  const topHogSuffix =
    topHog && topHog.totalBytesPerSec >= 80 * 1024
      ? ` · ${topHog.app} ${formatRateMbpsOrKbps(topHog.totalBytesPerSec)}`
      : ` · Agents ${formatBytesHuman(agentLedger.totals.netBytes)}`;

  const { detailRows, agentTokenRows } = buildNetworkAndAgentRows({
    downloadMbps,
    uploadMbps,
    wanPing,
    routerPing,
    health,
    allNetApps,
    agentLedger,
    gatewayIp,
    measuredAtIso,
  });

  const summary = {
    ok: true,
    gatewayIp,
    downloadMbps,
    uploadMbps,
    wanPingMs: wanPing.avgMs !== null ? Math.round(wanPing.avgMs) : null,
    wanLossPct: Math.round(wanPing.lossPct || 0),
    routerPingMs: routerPing.avgMs !== null ? Math.round(routerPing.avgMs) : null,
    grade: health.grade,
    badge: health.badge,
    badgeColor: health.color,
    verdictShort: health.verdictShort,
    diagnosis: health.diagnosis,
    speedHeadline,
    topHog: topHog ? `${topHog.app} (${topHog.summary})` : null,
    topHogSuffix,
    agentTotals: {
      llmCalls: agentLedger.totals.llmCalls,
      tokens: agentLedger.totals.tokens,
      tokensLabel: formatTokensCompact(agentLedger.totals.tokens),
      netBytes: agentLedger.totals.netBytes,
      netLabel: formatBytesHuman(agentLedger.totals.netBytes),
      cloudConns: agentLedger.totals.cloudConns,
      costUsd: agentLedger.totals.costUsd,
    },
    agents: agentLedger.agents,
    culprits: culprits.slice(0, 5),
    detailRows,
    agentTokenRows,
  };

  writeCachedState({
    downloadMbps,
    uploadMbps,
    wanPingMs: summary.wanPingMs,
    routerPingMs: summary.routerPingMs,
    speedMeasuredAt: measuredAtIso,
    speedHeadline,
    badge: summary.badge,
    badgeColor: summary.badgeColor,
    topHogSuffix,
    detailRows,
    agentTokenRows,
    agentTotals: summary.agentTotals,
  });

  return summary;
}

async function runFixSlowNetwork({ execute = false } = {}) {
  const beforeWan = runPingProbe('1.1.1.1', 2);
  const psRes = spawnSync('/bin/ps', ['-axo', 'pid=,ppid=,etime=,args='], {
    encoding: 'utf8',
    timeout: 3000,
  });
  const psLines = String(psRes.stdout || '').split(/\r?\n/).filter(Boolean);
  const { killTargets, sparedTransfers } = findRemediableNetworkProcesses(psLines);

  const items = [];
  if (execute) {
    for (const t of killTargets) {
      try {
        process.kill(t.pid, 'SIGTERM');
        items.push(`Stopped ${t.reason}`);
      } catch {
        /* already exited */
      }
    }
    try {
      spawnSync('/usr/bin/dscacheutil', ['-flushcache'], { timeout: 2000 });
      items.push('Flushed macOS DNS cache (dscacheutil)');
    } catch {
      /* ignore */
    }
  } else if (killTargets.length > 0) {
    for (const t of killTargets) {
      items.push(`Dry-run candidate: ${t.reason} (pass execute=true / --execute to stop)`);
    }
  }

  const after = await collectNetworkReport({ runSpeedTest: execute });
  if (after.topHog && after.culprits[0] && after.culprits[0].totalBytesPerSec >= 150 * 1024) {
    items.unshift(`Active Bandwidth Consumer: ${after.topHog}`);
  }
  const beforeStr = beforeWan.avgMs !== null ? `${Math.round(beforeWan.avgMs)} ms` : 'timeout';
  const afterStr = after.wanPingMs !== null ? `${after.wanPingMs} ms` : 'timeout';
  items.unshift(
    `Result: ${after.speedHeadline} · Lag ${beforeStr} → ${afterStr} (Wi-Fi ${after.routerPingMs ?? '--'} ms)`
  );

  const sparedLabel =
    sparedTransfers.length > 0
      ? `🛡 Spared ${sparedTransfers.length} active transfer(s) + Claude, OMP, Grok, Chrome & Tailscale`
      : '🛡 Active Claude, OMP, Grok, Chrome & Tailscale sessions untouched';

  return {
    ...after,
    executed: Boolean(execute),
    wouldStop: killTargets,
    action: 'fixNetwork',
    title: execute
      ? killTargets.length > 0
        ? `✓ Stopped ${killTargets.length} Bandwidth Hog(s) · ${after.speedHeadline}`
        : `✓ Internet Verified · ${after.speedHeadline}`
      : `Dry-Run Preview: ${killTargets.length} remediable bandwidth flood(s) found`,
    items: items.slice(0, 3),
    spared: sparedLabel,
  };
}

async function main() {
  const args = new Set(process.argv.slice(2));
  if (args.has('--fix')) {
    const res = await runFixSlowNetwork({ execute: args.has('--execute') });
    process.stdout.write(`${JSON.stringify(res)}\n`);
    return;
  }
  const runSpeed = args.has('--speed-test');
  const report = await collectNetworkReport({ runSpeedTest: runSpeed });
  if (runSpeed) {
    const items = [
      `${report.verdictShort}: ↓ ${report.downloadMbps?.toFixed(1) ?? '--'} Mbps Down · ↑ ${report.uploadMbps?.toFixed(1) ?? '--'} Mbps Up`,
      `Lag Check: Wi-Fi Router ${report.routerPingMs ?? '--'} ms · ISP ${report.wanPingMs ?? '--'} ms (${report.wanLossPct}% packet loss)`,
      report.topHog
        ? `Top Bandwidth User Now: ${report.topHog}`
        : `AI Agents Total: ${report.agentTotals.netLabel} internet · ${report.agentTotals.llmCalls} LLM calls (24h)`,
    ];
    process.stdout.write(
      `${JSON.stringify({
        ...report,
        action: 'testSpeed',
        title: `✓ ${report.verdictShort} · ↓ ${report.downloadMbps?.toFixed(0) ?? '--'} / ↑ ${report.uploadMbps?.toFixed(1) ?? '--'} Mbps`,
        items,
        spared: `🛡 ${report.diagnosis}`,
      })}\n`
    );
    return;
  }
  process.stdout.write(`${JSON.stringify(report)}\n`);
}

if (require.main === module) {
  main().catch((err) => {
    process.stdout.write(
      `${JSON.stringify({ ok: false, error: String((err && err.message) || err) })}\n`
    );
    process.exitCode = 1;
  });
}

module.exports = {
  formatRateMbpsOrKbps,
  formatBytesHuman,
  formatTokensCompact,
  normalizeProcessLabel,
  parseNettopBothPasses,
  parseNettopDelta,
  classifyNetworkHealth,
  findRemediableNetworkProcesses,
  collectAgentUsageLedger,
  collectNetworkReport,
  runFixSlowNetwork,
};
