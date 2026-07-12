#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const RECEIPT_ROOT = path.join(os.homedir(), '.hermes', 'receipts');
const DEFAULT_ROUTE_HISTORY = path.join(RECEIPT_ROOT, 'hermes-yolo', 'history.jsonl');
const DEFAULT_VERIFIER_HISTORY = path.join(RECEIPT_ROOT, 'grok45', 'history.jsonl');
const DEFAULT_OUT = path.join(RECEIPT_ROOT, 'hermes-yolo', 'eval-latest.json');
const DEFAULT_WIKI_OUT = path.join(RECEIPT_ROOT, 'hermes-yolo', 'HERMES-HARNESS-WIKI.md');

function usage() {
  return `Usage:
  hermes-harness-eval [--route-history PATH] [--verifier-history PATH]
    [--since-hours N] [--write] [--out PATH] [--wiki-out PATH] [--json]

Mines prompt-free Hermes route and verifier traces into deterministic reliability,
latency, fallback, and failure metrics. No model or provider call is made.`;
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    routeHistory: DEFAULT_ROUTE_HISTORY,
    verifierHistory: DEFAULT_VERIFIER_HISTORY,
    sinceHours: 24 * 30,
    write: false,
    out: DEFAULT_OUT,
    wikiOut: DEFAULT_WIKI_OUT,
    json: false,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--route-history') args.routeHistory = path.resolve(requireValue(argv, ++index, arg));
    else if (arg === '--verifier-history') args.verifierHistory = path.resolve(requireValue(argv, ++index, arg));
    else if (arg === '--since-hours') args.sinceHours = parsePositiveNumber(requireValue(argv, ++index, arg), arg);
    else if (arg === '--write') args.write = true;
    else if (arg === '--out') args.out = path.resolve(requireValue(argv, ++index, arg));
    else if (arg === '--wiki-out') args.wikiOut = path.resolve(requireValue(argv, ++index, arg));
    else if (arg === '--json') args.json = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function requireValue(argv, index, flag) {
  if (!argv[index]) throw new Error(`${flag} requires a value`);
  return argv[index];
}

function parsePositiveNumber(value, flag) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) throw new Error(`${flag} must be a positive number`);
  return parsed;
}

function digest(value, length = 20) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex').slice(0, length);
}

function readJsonl(filePath) {
  if (!fs.existsSync(filePath)) return { records: [], invalidLines: 0 };
  const records = [];
  let invalidLines = 0;
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      records.push(JSON.parse(line));
    } catch (error) {
      invalidLines += 1;
    }
  }
  return { records, invalidLines };
}

function normalizeRoute(record) {
  if (record.schema !== 'hermes-yolo/route-receipt-v1') return null;
  return {
    source: 'route',
    generatedAt: record.generatedAt,
    backend: record.route?.selectedBackend || 'unknown',
    model: record.route?.model || 'unknown',
    reason: record.route?.reason || 'unknown',
    status: record.execution?.status || 'unknown',
    exitCode: record.execution?.exitCode,
    durationMs: Number(record.execution?.durationMs || 0),
    blocker: record.execution?.error || null,
    silentFallback: Boolean(record.route?.silentFallback),
    qwenSelected: Boolean(record.route?.qwenSelected),
    qwenExplicit: Boolean(record.route?.qwenExplicit),
  };
}

function normalizeVerifier(record) {
  if (record.schema !== 'hermes-grok45-harness/trace-v1') return null;
  return {
    source: 'verifier',
    generatedAt: record.generatedAt,
    backend: 'grok-4.5-verifier',
    model: record.model || 'grok-4.5',
    reason: 'independent-verifier',
    status: record.overallStatus || record.execution?.status || 'unknown',
    exitCode: record.execution?.exitCode,
    durationMs: Number(record.execution?.durationMs || 0),
    blocker: record.readiness?.blocker || record.execution?.error || null,
    silentFallback: false,
    qwenSelected: false,
    qwenExplicit: false,
  };
}

function countBy(records, field) {
  return Object.fromEntries([...records.reduce((map, record) => {
    const key = String(record[field] ?? 'unknown');
    map.set(key, (map.get(key) || 0) + 1);
    return map;
  }, new Map())].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
}

function percentile(values, quantile) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(quantile * sorted.length) - 1));
  return sorted[index];
}

function buildReport(options = {}) {
  const nowMs = options.nowMs ?? Date.now();
  const routeInput = options.routeInput || readJsonl(options.routeHistory || DEFAULT_ROUTE_HISTORY);
  const verifierInput = options.verifierInput || readJsonl(options.verifierHistory || DEFAULT_VERIFIER_HISTORY);
  const cutoffMs = nowMs - Number(options.sinceHours || 24 * 30) * 60 * 60 * 1000;
  const records = [
    ...routeInput.records.map(normalizeRoute),
    ...verifierInput.records.map(normalizeVerifier),
  ].filter(Boolean).filter((record) => {
    const timestamp = Date.parse(record.generatedAt || '');
    return Number.isFinite(timestamp) && timestamp >= cutoffMs && timestamp <= nowMs + 60 * 1000;
  });
  const passCount = records.filter((record) => record.status === 'pass').length;
  const failCount = records.filter((record) => ['fail', 'blocked', 'timeout'].includes(record.status)).length;
  const silentFallbackCount = records.filter((record) => record.silentFallback).length;
  const qwenRuns = records.filter((record) => record.qwenSelected);
  const unexplainedQwenCount = qwenRuns.filter((record) => !record.qwenExplicit).length;
  const durations = records.map((record) => record.durationMs).filter((value) => Number.isFinite(value) && value >= 0);
  const failureClusters = countBy(records.filter((record) => record.blocker), 'blocker');
  const enoughSamples = records.length >= 3;
  const gates = {
    receiptsPresent: records.length > 0,
    enoughSamples,
    noSilentFallback: silentFallbackCount === 0,
    qwenOnlyWhenExplicit: unexplainedQwenCount === 0,
    noFailedRuns: failCount === 0,
    parseClean: (routeInput.invalidLines + verifierInput.invalidLines) === 0,
  };
  const criticalPass = gates.receiptsPresent && gates.noSilentFallback && gates.qwenOnlyWhenExplicit && gates.parseClean;
  const overallStatus = !gates.receiptsPresent ? 'insufficient-data' : criticalPass && gates.noFailedRuns ? 'pass' : criticalPass ? 'warn' : 'fail';
  const score = !gates.receiptsPresent ? 0 : Math.max(0, Math.round(
    100
    - silentFallbackCount * 50
    - unexplainedQwenCount * 40
    - failCount * 10
    - (routeInput.invalidLines + verifierInput.invalidLines) * 10
    - (enoughSamples ? 0 : 5)
  ));
  return {
    schema: 'hermes-harness-eval/v1',
    generatedAt: new Date(nowMs).toISOString(),
    windowHours: Number(options.sinceHours || 24 * 30),
    inputDigests: {
      routeHistory: digest(JSON.stringify(routeInput.records)),
      verifierHistory: digest(JSON.stringify(verifierInput.records)),
    },
    metrics: {
      totalRuns: records.length,
      routeRuns: records.filter((record) => record.source === 'route').length,
      verifierRuns: records.filter((record) => record.source === 'verifier').length,
      passCount,
      failCount,
      passRate: records.length ? Number((passCount / records.length).toFixed(4)) : null,
      silentFallbackCount,
      qwenRunCount: qwenRuns.length,
      unexplainedQwenCount,
      backendCounts: countBy(records, 'backend'),
      modelCounts: countBy(records, 'model'),
      routeReasonCounts: countBy(records, 'reason'),
      failureClusters,
      durationMs: {
        p50: percentile(durations, 0.5),
        p95: percentile(durations, 0.95),
        max: durations.length ? Math.max(...durations) : null,
      },
      invalidLines: routeInput.invalidLines + verifierInput.invalidLines,
    },
    gates,
    score,
    overallStatus,
    nextAction: !gates.receiptsPresent
      ? 'Run hermes-yolo and hermes-grok45 with receipts enabled before tuning the harness.'
      : silentFallbackCount > 0 || unexplainedQwenCount > 0
        ? 'Block release and inspect route receipts for backend drift.'
        : failCount > 0
          ? 'Mine the largest failure cluster into a permanent regression test.'
          : enoughSamples
            ? 'Keep collecting traces; change routing only when an offline eval beats this baseline.'
            : 'Collect at least three prompt-free traces before making another routing change.',
  };
}

function renderWiki(report) {
  const backendLines = Object.entries(report.metrics.backendCounts).map(([name, count]) => `- ${name}: ${count}`);
  const failureLines = Object.entries(report.metrics.failureClusters).map(([name, count]) => `- ${name}: ${count}`);
  return `# Hermes Harness Wiki

Generated: ${report.generatedAt}
Window: ${report.windowHours} hours
Status: ${report.overallStatus}
Score: ${report.score}/100

## Stable routing contract

- Ordinary \`hermes-yolo\` prompts route to Grok 4.5.
- Qwen is allowed only on an explicit legacy/admin route.
- Silent fallback is forbidden and measured from every route receipt.
- Paid retrieval remains gated by credentials, approval, and a cost cap.

## Trace metrics

- Total runs: ${report.metrics.totalRuns}
- Pass rate: ${report.metrics.passRate ?? 'n/a'}
- Silent fallbacks: ${report.metrics.silentFallbackCount}
- Unexplained Qwen runs: ${report.metrics.unexplainedQwenCount}
- Latency p50/p95: ${report.metrics.durationMs.p50 ?? 'n/a'}/${report.metrics.durationMs.p95 ?? 'n/a'} ms

## Backends

${backendLines.length ? backendLines.join('\n') : '- No trace data yet.'}

## Failure clusters

${failureLines.length ? failureLines.join('\n') : '- None.'}

## Next action

${report.nextAction}
`;
}

function writeArtifacts(report, options = {}) {
  const out = options.out || DEFAULT_OUT;
  const wikiOut = options.wikiOut || DEFAULT_WIKI_OUT;
  fs.mkdirSync(path.dirname(out), { recursive: true, mode: 0o700 });
  fs.mkdirSync(path.dirname(wikiOut), { recursive: true, mode: 0o700 });
  fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`, { mode: 0o600 });
  fs.writeFileSync(wikiOut, renderWiki(report), { mode: 0o600 });
  return { out, wikiOut };
}

function render(report) {
  return [
    '# Hermes Harness Eval',
    '',
    `Status: ${report.overallStatus}`,
    `Score: ${report.score}/100`,
    `Runs: ${report.metrics.totalRuns}`,
    `Pass rate: ${report.metrics.passRate ?? 'n/a'}`,
    `Silent fallbacks: ${report.metrics.silentFallbackCount}`,
    `Unexplained Qwen runs: ${report.metrics.unexplainedQwenCount}`,
    `Next: ${report.nextAction}`,
    '',
  ].join('\n');
}

function main(argv = process.argv.slice(2)) {
  try {
    const options = parseArgs(argv);
    if (options.help) {
      console.log(usage());
      return;
    }
    const report = buildReport(options);
    if (options.write) report.artifacts = writeArtifacts(report, options);
    console.log(options.json ? JSON.stringify(report, null, 2) : render(report));
    if (report.overallStatus === 'fail') process.exitCode = 2;
  } catch (error) {
    console.error(`hermes-harness-eval: ${error.message}`);
    process.exitCode = 1;
  }
}

module.exports = {
  DEFAULT_OUT,
  DEFAULT_ROUTE_HISTORY,
  DEFAULT_VERIFIER_HISTORY,
  DEFAULT_WIKI_OUT,
  buildReport,
  countBy,
  normalizeRoute,
  normalizeVerifier,
  parseArgs,
  percentile,
  readJsonl,
  render,
  renderWiki,
  writeArtifacts,
};

if (require.main === module) main();
