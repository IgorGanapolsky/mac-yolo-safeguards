#!/usr/bin/env node
'use strict';

/**
 * Token Economics Rollup — real-data teach/produce/spin classification
 * --------------------------------------------------------------------
 * Reads the LiteLLM gateway traffic logs (~/.hermes/litellm-logs/) and
 * classifies every recorded completion into the Teach / Produce / Spin
 * taxonomy using ONLY per-record metadata:
 *   prompt_tokens, completion_tokens, status, finish_reason, empty_kind,
 *   has_tool_calls, model, latency_s.
 *
 * Privacy: message bodies are probed in memory for canary detection
 * (first 48 chars of the first message) and are NEVER written to the
 * report or logged.
 *
 * Spin subclasses detected from metadata:
 *   health    — gateway canary / health-check probes
 *   failed    — non-success status, empty responses, error finishes
 *   retryDup  — 3rd+ occurrence of an identical (model,prompt) fingerprint
 *   capped    — finish_reason=length (truncated output, likely retried)
 *
 * Teach attribution is reported honestly as unavailable until callers tag
 * purpose (see notes in the report) — it is NOT guessed.
 *
 * Usage:
 *   node tools/token-economics-rollup.js                 # last 3 days, table
 *   node tools/token-economics-rollup.js --days 7 --json
 *   node tools/token-economics-rollup.js --out ~/.hermes/telemetry/rollup.json
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const readline = require('readline');

const LOG_DIR = path.join(os.homedir(), '.hermes', 'litellm-logs');
const TELEMETRY_DIR = path.join(os.homedir(), '.hermes', 'telemetry');
const CANARY_PREFIXES = ['the quick brown fox'];
const OK_STATUSES = new Set(['ok', 'success', '200', 200]);

function parseArgs(argv) {
  const args = { days: 3, json: false, out: null };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--days') args.days = Math.max(1, parseInt(argv[++i], 10) || 3);
    else if (argv[i] === '--json') args.json = true;
    else if (argv[i] === '--out') args.out = argv[++i];
  }
  return args;
}

function logFilesForWindow(days) {
  if (!fs.existsSync(LOG_DIR)) return [];
  const cutoff = Date.now() - days * 24 * 3600 * 1000;
  return fs.readdirSync(LOG_DIR)
    .filter((f) => f.startsWith('traffic.jsonl'))
    .map((f) => path.join(LOG_DIR, f))
    .filter((f) => {
      try { return fs.statSync(f).mtimeMs >= cutoff; } catch { return false; }
    })
    .sort();
}

function lineStream(file) {
  const raw = fs.createReadStream(file);
  const input = file.endsWith('.gz') ? raw.pipe(zlib.createGunzip()) : raw;
  return readline.createInterface({ input, crlfDelay: Infinity });
}

function firstMessageProbe(record) {
  const msgs = record.messages;
  if (!Array.isArray(msgs) || msgs.length === 0) return '';
  const c = msgs[0] && msgs[0].content;
  if (typeof c === 'string') return c.slice(0, 48).toLowerCase();
  if (Array.isArray(c) && c[0] && typeof c[0].text === 'string') return c[0].text.slice(0, 48).toLowerCase();
  return '';
}

function classify(record, probe, dupCount) {
  const pt = record.prompt_tokens || 0;
  const ct = record.completion_tokens || 0;
  if (CANARY_PREFIXES.some((p) => probe.startsWith(p)) || (pt <= 30 && ct <= 12)) return 'health';
  const emptyKind = record.empty_kind;
  const failed =
    (record.status !== undefined && !OK_STATUSES.has(record.status)) ||
    (emptyKind && emptyKind !== 'none' && emptyKind !== null && emptyKind !== '') ||
    record.finish_reason === 'error' || record.finish_reason === 'content_filter';
  if (failed) return 'failed';
  if (dupCount > 2) return 'retryDup';
  if (record.finish_reason === 'length') return 'capped';
  return 'produce';
}

async function rollup(days) {
  const files = logFilesForWindow(days);
  const byModel = {};
  const buckets = { produce: 0, teach: 0, spin: { health: 0, failed: 0, retryDup: 0, capped: 0 } };
  const tokens = { produce: 0, teach: 0, spin: 0 };
  const fingerprints = new Map();
  let records = 0;
  let badLines = 0;

  for (const file of files) {
    const rl = lineStream(file);
    for await (const line of rl) {
      if (!line || line[0] !== '{') continue;
      let r;
      try { r = JSON.parse(line); } catch { badLines++; continue; }
      records++;
      const probe = firstMessageProbe(r);
      const fp = crypto.createHash('sha256')
        .update(`${r.model}|${r.prompt_tokens}|${probe}`)
        .digest('hex');
      const dupCount = (fingerprints.get(fp) || 0) + 1;
      fingerprints.set(fp, dupCount);

      const cls = classify(r, probe, dupCount);
      const total = (r.prompt_tokens || 0) + (r.completion_tokens || 0);

      const m = (byModel[r.model] ||= { calls: 0, promptTokens: 0, completionTokens: 0, spinCalls: 0 });
      m.calls++;
      m.promptTokens += r.prompt_tokens || 0;
      m.completionTokens += r.completion_tokens || 0;

      if (cls === 'produce') {
        buckets.produce++;
        tokens.produce += total;
      } else {
        buckets.spin[cls]++;
        tokens.spin += total;
        m.spinCalls++;
      }
    }
  }

  const spinCalls = Object.values(buckets.spin).reduce((a, b) => a + b, 0);
  const totalTokens = tokens.produce + tokens.teach + tokens.spin || 1;
  const promptTotal = Object.values(byModel).reduce((a, m) => a + m.promptTokens, 0);
  const completionTotal = Object.values(byModel).reduce((a, m) => a + m.completionTokens, 0);

  return {
    generatedAt: new Date().toISOString(),
    windowDays: days,
    files: files.map((f) => path.basename(f)),
    records,
    badLines,
    byModel,
    buckets: { ...buckets, spinCalls },
    tokens: {
      ...tokens,
      total: totalTokens,
      promptTotal,
      completionTotal,
      inputOutputRatio: completionTotal ? Number((promptTotal / completionTotal).toFixed(1)) : null,
    },
    ratios: {
      spinCallPercent: records ? Math.round((spinCalls / records) * 100) : 0,
      spinTokenPercent: Math.round((tokens.spin / totalTokens) * 100),
      produceTokenPercent: Math.round((tokens.produce / totalTokens) * 100),
    },
    notes: [
      'teach=0 means teach attribution is UNAVAILABLE, not that no teaching happened: gateway callers do not yet tag request purpose. Add an x-purpose header (teach|produce) at call sites to unlock it.',
      'costUsd omitted: primary lanes are flat-rate subscriptions or local models; token counts are the honest unit.',
      'Message bodies are never written to this report.',
    ],
  };
}

function printTable(r) {
  console.log('=== Token Economics Rollup (real gateway traffic) ===');
  console.log(`window: last ${r.windowDays}d | files: ${r.files.length} | records: ${r.records} (bad lines: ${r.badLines})`);
  console.log(`tokens: total=${r.tokens.total.toLocaleString()} prompt=${r.tokens.promptTotal.toLocaleString()} completion=${r.tokens.completionTotal.toLocaleString()} input:output=${r.tokens.inputOutputRatio}:1`);
  console.log(`PRODUCE: ${r.buckets.produce} calls, ${r.tokens.produce.toLocaleString()} tokens (${r.ratios.produceTokenPercent}%)`);
  console.log(`SPIN:    ${r.buckets.spinCalls} calls, ${r.tokens.spin.toLocaleString()} tokens (${r.ratios.spinTokenPercent}%)`);
  console.log(`  health=${r.buckets.spin.health} failed=${r.buckets.spin.failed} retryDup=${r.buckets.spin.retryDup} capped=${r.buckets.spin.capped}`);
  console.log('TEACH:   attribution unavailable (see notes)');
  console.log('--- by model ---');
  for (const [model, m] of Object.entries(r.byModel).sort((a, b) => b[1].calls - a[1].calls)) {
    console.log(`  ${model}: ${m.calls} calls (${m.spinCalls} spin), in=${m.promptTokens.toLocaleString()} out=${m.completionTokens.toLocaleString()}`);
  }
  for (const n of r.notes) console.log(`note: ${n}`);
}

async function main() {
  const args = parseArgs(process.argv);
  const report = await rollup(args.days);
  const outPath = args.out ||
    path.join(TELEMETRY_DIR, `token-economics-${report.generatedAt.slice(0, 10)}.json`);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2));
  if (args.json) console.log(JSON.stringify(report, null, 2));
  else printTable(report);
  console.log(`report written: ${outPath}`);
}

if (require.main === module) {
  main().catch((err) => { console.error('rollup failed:', err.message); process.exit(1); });
}

module.exports = { rollup, classify };
