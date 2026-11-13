#!/usr/bin/env node
'use strict';
/**
 * tools/mac-yolo-measure.js - local history of the numbers the Mac YOLO HUD shows, plus before/after compare.
 *
 *   mac-yolo-measure snapshot                 append one line to ~/.mac-yolo-safeguards/metrics.jsonl
 *   mac-yolo-measure mark "<label>" [--at T]  record that a change happened
 *   mac-yolo-measure compare --around "<label>" [--window 60]
 *   mac-yolo-measure compare --before "A..B" --after "C..D"
 *
 * Metrics never leave this Mac. The secrets count is a number only. Set MAC_YOLO_METRICS_DIR to relocate the files.
 * Token counting mirrors macos/MacYoloSafeguardsApp.swift tallyAgentTokens (calls counted once per message id,
 * new = input + output + cache writes, cached = cache reads, synthetic messages skipped).
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { costUSD, priceFor, PRICES_SOURCE, PRICES_CHECKED } = require('./mac-yolo-model-prices');

const RETENTION_DAYS = 30;
const MIN_SAMPLES = 3;

function metricsDir() {
  return process.env.MAC_YOLO_METRICS_DIR || path.join(os.homedir(), '.mac-yolo-safeguards');
}
const metricsFile = () => path.join(metricsDir(), 'metrics.jsonl');
const markersFile = () => path.join(metricsDir(), 'markers.jsonl');

function run(cmd, args, timeout) {
  try {
    return execFileSync(cmd, args, { encoding: 'utf8', timeout: timeout || 10000, stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 });
  } catch (e) {
    return (e && e.stdout) ? String(e.stdout) : '';
  }
}

// ---------- tokens ----------

/** Tally assistant usage lines. windows: [{name, cutoffMs}]. Returns {byWindow:{name:{byAgent:{agent:{calls,new,cached,models:{m:{...}}}}}}}. */
function tallyTokens(lines, agent, windows, seen, acc) {
  for (const line of lines) {
    if (!line.includes('"usage"')) continue;
    let obj;
    try { obj = JSON.parse(line); } catch { continue; }
    const msg = obj && obj.message;
    if (!msg || msg.role !== 'assistant' || msg.model === '<synthetic>' || !msg.usage) continue;
    const when = Date.parse(obj.timestamp);
    if (!Number.isFinite(when)) continue;
    const id = msg.id || obj.id || obj.uuid || obj.timestamp;
    const key = agent + id;
    if (seen.has(key)) continue;
    const u = msg.usage;
    const n = (k) => Number(u[k]) || 0;
    let fresh, cached, input, output, cacheWrite;
    if (typeof u.totalTokens === 'number') {
      cached = n('cacheRead'); fresh = u.totalTokens - cached;
      input = n('input'); output = n('output'); cacheWrite = n('cacheWrite');
    } else {
      input = n('input_tokens'); output = n('output_tokens'); cacheWrite = n('cache_creation_input_tokens');
      cached = n('cache_read_input_tokens'); fresh = input + output + cacheWrite;
    }
    const recorded = u.cost && typeof u.cost.total === 'number' ? u.cost.total : null;
    let counted = false;
    for (const w of windows) {
      if (when < w.cutoffMs) continue;
      counted = true;
      const a = ((acc[w.name] = acc[w.name] || {})[agent] = acc[w.name][agent] || { calls: 0, new: 0, cached: 0, recordedUSD: 0, models: {} });
      a.calls += 1; a.new += fresh; a.cached += cached;
      if (recorded !== null) a.recordedUSD += recorded;
      const m = (a.models[msg.model || 'unknown'] = a.models[msg.model || 'unknown'] || { input: 0, output: 0, cacheWrite: 0, cacheRead: 0 });
      m.input += input; m.output += output; m.cacheWrite += cacheWrite; m.cacheRead += cached;
    }
    if (counted) seen.add(key);
  }
}

/**
 * Cost for one agent's window. Claude logs carry no price, so it is computed from the price table;
 * models missing from the table are listed in `unpriced` and add nothing. OMP logs its own cost.
 */
function agentCost(a, table) {
  let usd = a.recordedUSD || 0;
  const unpriced = [];
  const recordedHere = (a.recordedUSD || 0) > 0;
  for (const [model, usage] of Object.entries(a.models || {})) {
    if (recordedHere) continue;
    const c = costUSD(model, usage, table);
    if (c === null) unpriced.push(model); else usd += c;
  }
  return { usd: Number(usd.toFixed(4)), unpriced };
}

function summarizeTokens(acc, table) {
  const out = {};
  for (const [win, agents] of Object.entries(acc)) {
    let calls = 0, nw = 0, cached = 0, usd = 0;
    const unpriced = new Set();
    const byAgent = {};
    for (const [agent, a] of Object.entries(agents)) {
      const c = agentCost(a, table);
      c.unpriced.forEach((m) => unpriced.add(m));
      usd += c.usd; calls += a.calls; nw += a.new; cached += a.cached;
      byAgent[agent] = { calls: a.calls, new: a.new, cached: a.cached, costUSD: c.usd };
    }
    out[win] = { calls, new: nw, cached, costUSD: Number(usd.toFixed(4)), unpriced: [...unpriced].sort(), byAgent };
  }
  return out;
}

function listRecent(roots, ext, mins) {
  const files = [];
  for (const r of roots) {
    if (!fs.existsSync(r)) continue;
    const out = run('/usr/bin/find', [r, '-name', ext, '-mmin', `-${mins}`], 15000);
    for (const f of out.split('\n')) if (f) files.push(f);
  }
  return files;
}

function collectTokens(now, table) {
  const home = os.homedir();
  const windows = [{ name: 'last10m', cutoffMs: now - 10 * 60e3 }, { name: 'last2h', cutoffMs: now - 120 * 60e3 }];
  const acc = {};
  const seen = new Set();
  const files = listRecent([path.join(home, '.claude/projects'), path.join(home, '.omp/agent/sessions')], '*.jsonl', 125).slice(0, 400);
  for (const f of files) {
    let text;
    try {
      const st = fs.statSync(f);
      const max = 32e6;
      const fd = fs.openSync(f, 'r');
      const len = Math.min(st.size, max);
      const buf = Buffer.alloc(len);
      fs.readSync(fd, buf, 0, len, st.size - len);
      fs.closeSync(fd);
      text = buf.toString('utf8');
    } catch { continue; }
    tallyTokens(text.split('\n'), f.includes('/.omp/') ? 'OMP' : 'Claude', windows, seen, acc);
  }
  const t = summarizeTokens(acc, table);
  for (const w of windows) if (!t[w.name]) t[w.name] = { calls: 0, new: 0, cached: 0, costUSD: 0, unpriced: [], byAgent: {} };
  return t;
}

// ---------- machine ----------

function parseTopCpu(text) {
  const m = /CPU usage:\s*([\d.]+)% user,\s*([\d.]+)% sys,\s*([\d.]+)% idle/.exec(text || '');
  return m ? Number((100 - parseFloat(m[3])).toFixed(1)) : null;
}
function parseGpu(text) {
  const m = /"Device Utilization %"\s*=\s*(\d+)/.exec(text || '');
  return m ? Number(m[1]) : null;
}
function parseMemFree(text) {
  const m = /memory free percentage:\s*(\d+)%/.exec(text || '');
  return m ? Number(m[1]) : null;
}

/** Counts from `ps -axo comm=,command=` lines. */
function countProcesses(psText) {
  const helpers = { python: 0, node: 0 };
  const agents = {};
  const bump = (k) => { agents[k] = (agents[k] || 0) + 1; };
  for (const line of String(psText || '').split('\n')) {
    const l = line.trim();
    if (!l) continue;
    const comm = path.basename(l.split(/\s+/)[0]).toLowerCase();
    if (comm.startsWith('python')) helpers.python += 1;
    else if (comm === 'node') helpers.node += 1;
    if (comm === 'claude') bump('claude');
    else if (comm === 'gemini') bump('gemini');
    else if (comm === 'omp') bump('omp');
    else if (comm === 'codex') bump('codex');
    else if (comm === 'grok') bump('grok');
  }
  helpers.total = helpers.python + helpers.node;
  return { helpers, agents };
}

/** Last block of `nettop -P -d -x -J bytes_in,bytes_out`: totals and the biggest uploader (name only). */
function parseNettop(text, seconds) {
  const rows = String(text || '').split('\n').map((l) => l.split(','));
  let h = -1;
  rows.forEach((r, i) => { if (r[0] === '' && r.includes('bytes_out')) h = i; });
  if (h < 0) return { inBps: 0, outBps: 0, topUploader: null };
  const inCol = rows[h].indexOf('bytes_in'), outCol = rows[h].indexOf('bytes_out');
  let tin = 0, tout = 0, top = null, topOut = 0;
  for (const r of rows.slice(h + 1)) {
    if (!r[0] || r.length <= outCol) continue;
    const bo = Number(r[outCol]) || 0, bi = inCol >= 0 ? Number(r[inCol]) || 0 : 0;
    tin += bi; tout += bo;
    if (bo > topOut) { topOut = bo; top = r[0].replace(/\.\d+$/, ''); }
  }
  return { inBps: Math.round(tin / seconds), outBps: Math.round(tout / seconds), topUploader: top };
}

function collectSecrets() {
  const out = run(process.execPath, [path.join(__dirname, 'mac-yolo-secret-scan.js'), 'scan', '--since-days', '30'], 60000);
  try {
    const t = JSON.parse(out).totals;
    return { count: t.secrets || 0, files: t.filesWithSecrets || 0 };
  } catch { return { count: null, files: null }; }
}

function collectSnapshot(opts) {
  const now = (opts && opts.now) || Date.now();
  const load = os.loadavg();
  const net = parseNettop(run('/usr/bin/nettop', ['-P', '-d', '-t', 'external', '-L', '2', '-s', '2', '-J', 'bytes_in,bytes_out', '-x'], 12000), 2);
  const procs = countProcesses(run('/bin/ps', ['-axo', 'comm=']));
  return {
    type: 'snapshot',
    ts: new Date(now).toISOString(),
    tokens: collectTokens(now),
    machine: {
      cpuPct: parseTopCpu(run('/usr/bin/top', ['-l', '1', '-n', '0'])),
      gpuPct: parseGpu(run('/usr/sbin/ioreg', ['-r', '-d', '1', '-c', 'IOAccelerator'])),
      load1: Number(load[0].toFixed(2)),
      cores: os.cpus().length,
      ramFreePct: parseMemFree(run('/usr/bin/memory_pressure')),
    },
    helpers: procs.helpers,
    agents: procs.agents,
    network: net,
    secrets: collectSecrets(),
  };
}

// ---------- storage ----------

function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  const out = [];
  for (const l of fs.readFileSync(file, 'utf8').split('\n')) {
    if (!l.trim()) continue;
    try { out.push(JSON.parse(l)); } catch { /* skip a torn line */ }
  }
  return out;
}

/** Appends one line, dropping lines older than 30 days. Atomic rewrite only when something expired. */
function appendSnapshot(snap, nowMs) {
  fs.mkdirSync(metricsDir(), { recursive: true });
  const file = metricsFile();
  const cutoff = (nowMs || Date.now()) - RETENTION_DAYS * 86400e3;
  const old = readJsonl(file);
  const kept = old.filter((s) => Date.parse(s.ts) >= cutoff);
  if (kept.length !== old.length) {
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, kept.map((s) => JSON.stringify(s)).join('\n') + (kept.length ? '\n' : ''));
    fs.renameSync(tmp, file);
  }
  fs.appendFileSync(file, JSON.stringify(snap) + '\n');
  return { kept: kept.length, dropped: old.length - kept.length };
}

function addMarker(label, atMs) {
  if (!label || !String(label).trim()) throw new Error('marker label required');
  fs.mkdirSync(metricsDir(), { recursive: true });
  const m = { type: 'marker', ts: new Date(atMs || Date.now()).toISOString(), label: String(label).trim() };
  const file = markersFile();
  const cutoff = Date.now() - RETENTION_DAYS * 86400e3;
  const old = readJsonl(file);
  const kept = old.filter((x) => Date.parse(x.ts) >= cutoff);
  if (kept.length !== old.length) {
    const tmp = file + '.tmp';
    fs.writeFileSync(tmp, kept.map((x) => JSON.stringify(x)).join('\n') + (kept.length ? '\n' : ''));
    fs.renameSync(tmp, file);
  }
  fs.appendFileSync(file, JSON.stringify(m) + '\n');
  return m;
}

// ---------- time ----------

function fmt12(ms) {
  const d = new Date(ms);
  let h = d.getHours();
  const ap = h >= 12 ? 'PM' : 'AM';
  h = h % 12 || 12;
  const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return `${day} ${h}:${String(d.getMinutes()).padStart(2, '0')} ${ap}`;
}

/** Accepts ISO, "2026-11-13 2:37 PM", or "2:37 PM" (today, local). Returns ms. */
function parseTime(s, nowMs) {
  const t = String(s).trim();
  const m = /^(?:(\d{4})-(\d{2})-(\d{2})\s+)?(\d{1,2}):(\d{2})\s*(AM|PM)$/i.exec(t);
  if (m) {
    const base = new Date(nowMs || Date.now());
    let h = Number(m[4]) % 12;
    if (m[6].toUpperCase() === 'PM') h += 12;
    const d = m[1] ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), h, Number(m[5])) : new Date(base.getFullYear(), base.getMonth(), base.getDate(), h, Number(m[5]));
    return d.getTime();
  }
  const ms = Date.parse(t);
  if (!Number.isFinite(ms)) throw new Error(`cannot read time "${s}" (use "2:37 PM", "2026-11-13 2:37 PM" or ISO)`);
  return ms;
}

function parseRange(s, nowMs) {
  const parts = String(s).split('..');
  if (parts.length !== 2) throw new Error(`range must look like "2:00 PM..2:30 PM", got "${s}"`);
  return [parseTime(parts[0], nowMs), parseTime(parts[1], nowMs)];
}

// ---------- compare ----------

function flatten(obj, prefix, out) {
  for (const [k, v] of Object.entries(obj || {})) {
    if (k === 'type' || k === 'ts') continue;
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === 'number' && Number.isFinite(v)) out[key] = v;
    else if (v && typeof v === 'object' && !Array.isArray(v)) flatten(v, key, out);
  }
  return out;
}

/** Keys for agents: absent in a sample means the agent was idle or gone, so it counts as 0, not as missing. */
const ZERO_FILL = /^agents\.|\.byAgent\./;

function averages(samples, zeroKeys) {
  const sums = {}, counts = {};
  for (const s of samples) {
    const flat = flatten(s, '', {});
    for (const k of zeroKeys || []) if (!(k in flat)) flat[k] = 0;
    for (const [k, v] of Object.entries(flat)) {
      sums[k] = (sums[k] || 0) + v; counts[k] = (counts[k] || 0) + 1;
    }
  }
  const out = {};
  for (const k of Object.keys(sums)) out[k] = sums[k] / counts[k];
  return out;
}

function unpricedModels(samples) {
  const set = new Set();
  for (const s of samples) {
    for (const w of Object.values((s && s.tokens) || {})) for (const m of (w && w.unpriced) || []) set.add(m);
  }
  return [...set].sort();
}

function inRange(snaps, [a, b]) {
  return snaps.filter((s) => { const t = Date.parse(s.ts); return t >= a && t < b; });
}

/** Pure compare. Returns {enough, before:{n,from,to}, after:{...}, rows:[{metric,before,after,changePct}]}. */
function compareSamples(snaps, beforeRange, afterRange) {
  const b = inRange(snaps, beforeRange), a = inRange(snaps, afterRange);
  const res = {
    enough: b.length >= MIN_SAMPLES && a.length >= MIN_SAMPLES,
    before: { n: b.length, from: beforeRange[0], to: beforeRange[1] },
    after: { n: a.length, from: afterRange[0], to: afterRange[1] },
    rows: [],
  };
  if (!res.enough) return res;
  const zeroKeys = new Set();
  for (const s of b.concat(a)) for (const k of Object.keys(flatten(s, '', {}))) if (ZERO_FILL.test(k)) zeroKeys.add(k);
  const ab = averages(b, zeroKeys), aa = averages(a, zeroKeys);
  res.unpriced = { before: unpricedModels(b), after: unpricedModels(a) };
  const incomplete = res.unpriced.before.length > 0 || res.unpriced.after.length > 0;
  for (const k of Object.keys(ab).filter((x) => x in aa).sort()) {
    const before = ab[k], after = aa[k];
    const floor = incomplete && /costUSD$/.test(k);
    res.rows.push({
      metric: k, before, after, floor,
      changePct: floor ? null : (before === 0 ? (after === 0 ? 0 : null) : ((after - before) / before) * 100),
    });
  }
  return res;
}

function num(v) {
  if (Math.abs(v) >= 1000) return Math.round(v).toLocaleString('en-US');
  return String(Number(v.toFixed(2)));
}

function formatCompare(res, title) {
  const L = [];
  if (title) L.push(title);
  L.push(`Before: ${fmt12(res.before.from)} to ${fmt12(res.before.to)} (${res.before.n} samples)`);
  L.push(`After:  ${fmt12(res.after.from)} to ${fmt12(res.after.to)} (${res.after.n} samples)`);
  if (!res.enough) {
    L.push(`Not enough data: each side needs at least ${MIN_SAMPLES} samples (before ${res.before.n}, after ${res.after.n}). Snapshots arrive every 10 minutes.`);
    return L.join('\n');
  }
  L.push('Averages per side. Spend and token numbers are totals over the trailing window of each snapshot.');
  for (const r of res.rows) {
    const ch = r.floor ? 'floor, not comparable' : r.changePct === null ? 'new' : `${r.changePct >= 0 ? '+' : ''}${r.changePct.toFixed(1)}%`;
    L.push(`${r.metric.padEnd(34)} ${num(r.before).padStart(12)} -> ${num(r.after).padStart(12)}  ${ch}`);
  }
  const up = res.unpriced || { before: [], after: [] };
  if (up.before.length || up.after.length) {
    L.push(`Cost is a floor: unpriced models add nothing (before: ${up.before.join(', ') || 'none'}; after: ${up.after.join(', ') || 'none'}). Dollar changes are not shown as percentages.`);
  }
  return L.join('\n');
}

/** opts: {around, window (minutes), before, after, now}. */
function compare(opts) {
  const now = opts.now || Date.now();
  const snaps = readJsonl(metricsFile());
  let br, ar, title = null;
  if (opts.around) {
    const markers = readJsonl(markersFile()).filter((m) => m.label.toLowerCase() === String(opts.around).toLowerCase());
    if (!markers.length) {
      const all = readJsonl(markersFile()).map((m) => m.label);
      throw new Error(`no marker "${opts.around}". Known markers: ${all.join('; ') || 'none'}`);
    }
    const mk = markers[markers.length - 1];
    const at = Date.parse(mk.ts);
    const w = (Number(opts.window) || 60) * 60e3;
    br = [at - w, at]; ar = [at, Math.min(at + w, now)];
    title = `Around "${mk.label}" at ${fmt12(at)}`;
  } else if (opts.before && opts.after) {
    br = parseRange(opts.before, now); ar = parseRange(opts.after, now);
  } else {
    throw new Error('compare needs --around "<marker>" or both --before and --after');
  }
  const res = compareSamples(snaps, br, ar);
  res.text = formatCompare(res, title);
  return res;
}

function listMarkers() { return readJsonl(markersFile()); }

// ---------- CLI ----------

function parseArgs(argv) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) o[argv[i].slice(2)] = argv[++i];
    else o._.push(argv[i]);
  }
  return o;
}

function main(argv) {
  const o = parseArgs(argv);
  const cmd = o._[0];
  if (cmd === 'snapshot') {
    const snap = collectSnapshot();
    appendSnapshot(snap);
    console.log(JSON.stringify(snap));
  } else if (cmd === 'mark') {
    const m = addMarker(o._.slice(1).join(' '), o.at ? parseTime(o.at) : undefined);
    console.log(`Marked "${m.label}" at ${fmt12(Date.parse(m.ts))}`);
  } else if (cmd === 'markers') {
    for (const m of listMarkers()) console.log(`${fmt12(Date.parse(m.ts))}  ${m.label}`);
  } else if (cmd === 'compare') {
    console.log(compare(o).text);
  } else if (cmd === 'prices') {
    console.log(`Price table: ${PRICES_SOURCE} (checked ${PRICES_CHECKED}). Unlisted models are unpriced.`);
  } else {
    console.error('usage: mac-yolo-measure snapshot | mark "<label>" [--at "2:37 PM"] | markers | compare --around "<label>" [--window 60] | compare --before "A..B" --after "C..D"');
    process.exit(2);
  }
}

if (require.main === module) {
  try { main(process.argv.slice(2)); } catch (e) { console.error(`mac-yolo-measure: ${e.message}`); process.exit(1); }
}

module.exports = {
  RETENTION_DAYS, MIN_SAMPLES, tallyTokens, summarizeTokens, agentCost, parseTopCpu, parseGpu, parseMemFree,
  countProcesses, parseNettop, appendSnapshot, addMarker, parseTime, parseRange, fmt12, compareSamples,
  formatCompare, compare, listMarkers, collectSnapshot, readJsonl, priceFor,
};
