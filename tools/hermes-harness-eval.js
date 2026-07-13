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
    [--since-hours N] [--baseline-profile ID --candidate-profile ID]
    [--holdout-case ID ...] [--min-repeats N]
    [--write] [--out PATH] [--wiki-out PATH] [--json]

Mines prompt-free Hermes route and verifier traces into deterministic reliability,
latency, fallback, failure, and profile-comparison metrics. Profile promotion
requires paired stable case IDs, repeated runs, and held-out validation. No model
or provider call is made.`;
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    routeHistory: DEFAULT_ROUTE_HISTORY,
    verifierHistory: DEFAULT_VERIFIER_HISTORY,
    sinceHours: 24 * 30,
    baselineProfile: null,
    candidateProfile: null,
    holdoutCases: [],
    minRepeats: 3,
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
    else if (arg === '--baseline-profile') args.baselineProfile = parseLabel(requireValue(argv, ++index, arg), arg);
    else if (arg === '--candidate-profile') args.candidateProfile = parseLabel(requireValue(argv, ++index, arg), arg);
    else if (arg === '--holdout-case') args.holdoutCases.push(parseLabel(requireValue(argv, ++index, arg), arg));
    else if (arg === '--min-repeats') args.minRepeats = parsePositiveInteger(requireValue(argv, ++index, arg), arg);
    else if (arg === '--write') args.write = true;
    else if (arg === '--out') args.out = path.resolve(requireValue(argv, ++index, arg));
    else if (arg === '--wiki-out') args.wikiOut = path.resolve(requireValue(argv, ++index, arg));
    else if (arg === '--json') args.json = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (Boolean(args.baselineProfile) !== Boolean(args.candidateProfile)) {
    throw new Error('--baseline-profile and --candidate-profile must be provided together');
  }
  if (args.baselineProfile && args.baselineProfile === args.candidateProfile) {
    throw new Error('baseline and candidate profiles must be different');
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

function parsePositiveInteger(value, flag) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 100) {
    throw new Error(`${flag} must be an integer from 1 to 100`);
  }
  return parsed;
}

function parseLabel(value, flag) {
  const label = String(value || '').trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(label)) {
    throw new Error(`${flag} must be 1-80 letters, numbers, dots, underscores, or hyphens`);
  }
  return label;
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
  const status = record.execution?.status || 'unknown';
  const exitCode = record.execution?.exitCode;
  return {
    source: 'route',
    generatedAt: record.generatedAt,
    backend: record.route?.selectedBackend || 'unknown',
    model: record.route?.model || 'unknown',
    reason: record.route?.reason || 'unknown',
    status,
    exitCode,
    durationMs: Number(record.execution?.durationMs || 0),
    blocker: record.execution?.error
      || (['fail', 'blocked', 'timeout'].includes(status) ? `route_${status}_exit_${exitCode ?? 'unknown'}` : null),
    silentFallback: Boolean(record.route?.silentFallback),
    qwenSelected: Boolean(record.route?.qwenSelected),
    qwenExplicit: Boolean(record.route?.qwenExplicit),
  };
}

function normalizeVerifier(record) {
  if (record.schema !== 'hermes-grok45-harness/trace-v1') return null;
  const status = record.overallStatus || record.execution?.status || 'unknown';
  const exitCode = record.execution?.exitCode;
  return {
    source: 'verifier',
    caseId: record.caseId || null,
    profileId: record.profileId || 'legacy-unprofiled',
    generatedAt: record.generatedAt,
    backend: 'grok-4.5-verifier',
    model: record.model || 'grok-4.5',
    reason: 'independent-verifier',
    status,
    exitCode,
    durationMs: Number(record.execution?.durationMs || 0),
    blocker: record.readiness?.blocker
      || record.execution?.error
      || (['fail', 'blocked', 'timeout'].includes(status) ? `verifier_${status}_exit_${exitCode ?? 'unknown'}` : null),
    silentFallback: false,
    qwenSelected: false,
    qwenExplicit: false,
  };
}

function passSummary(records) {
  const passes = records.filter((record) => record.status === 'pass').length;
  return {
    runs: records.length,
    passes,
    passRate: records.length ? Number((passes / records.length).toFixed(4)) : null,
  };
}

function compareProfiles(records, options = {}) {
  const baselineProfile = options.baselineProfile || null;
  const candidateProfile = options.candidateProfile || null;
  const minRepeats = Number(options.minRepeats || 3);
  const holdoutCases = [...new Set(options.holdoutCases || [])].sort();
  if (!baselineProfile && !candidateProfile) {
    return {
      status: 'not-requested',
      baselineProfile: null,
      candidateProfile: null,
      minRepeats,
      holdoutCases,
      gates: {},
      perCase: [],
    };
  }

  const selected = records.filter((record) => record.source === 'verifier'
    && record.caseId
    && [baselineProfile, candidateProfile].includes(record.profileId));
  const caseIds = [...new Set(selected.map((record) => record.caseId))].sort();
  const holdoutSet = new Set(holdoutCases);
  const perCase = caseIds.map((caseId) => {
    const caseRecords = selected.filter((record) => record.caseId === caseId);
    const baseline = passSummary(caseRecords.filter((record) => record.profileId === baselineProfile));
    const candidate = passSummary(caseRecords.filter((record) => record.profileId === candidateProfile));
    return {
      caseId,
      split: holdoutSet.has(caseId) ? 'holdout' : 'development',
      baseline,
      candidate,
      delta: baseline.passRate == null || candidate.passRate == null
        ? null
        : Number((candidate.passRate - baseline.passRate).toFixed(4)),
    };
  });
  const baselineRecords = selected.filter((record) => record.profileId === baselineProfile);
  const candidateRecords = selected.filter((record) => record.profileId === candidateProfile);
  const aggregate = {
    baseline: passSummary(baselineRecords),
    candidate: passSummary(candidateRecords),
  };
  aggregate.delta = aggregate.baseline.passRate == null || aggregate.candidate.passRate == null
    ? null
    : Number((aggregate.candidate.passRate - aggregate.baseline.passRate).toFixed(4));

  const pairedCasesPresent = perCase.length > 0
    && perCase.every((entry) => entry.baseline.runs > 0 && entry.candidate.runs > 0);
  const enoughRepeats = pairedCasesPresent
    && perCase.every((entry) => entry.baseline.runs >= minRepeats && entry.candidate.runs >= minRepeats);
  const holdoutEntries = perCase.filter((entry) => entry.split === 'holdout');
  const holdoutPresent = holdoutCases.length > 0
    && holdoutCases.every((caseId) => holdoutEntries.some((entry) => entry.caseId === caseId
      && entry.baseline.runs > 0 && entry.candidate.runs > 0));
  const holdoutEnoughRepeats = holdoutPresent
    && holdoutEntries.every((entry) => entry.baseline.runs >= minRepeats && entry.candidate.runs >= minRepeats);
  const improvement = aggregate.delta != null && aggregate.delta > 0;
  const noRegressions = pairedCasesPresent
    && perCase.every((entry) => entry.delta != null && entry.delta >= 0);
  const holdoutNoRegression = holdoutPresent
    && holdoutEntries.every((entry) => entry.delta != null && entry.delta >= 0);
  const gates = {
    pairedCasesPresent,
    enoughRepeats,
    holdoutPresent,
    holdoutEnoughRepeats,
    improvement,
    noRegressions,
    holdoutNoRegression,
  };
  const enoughEvidence = pairedCasesPresent && enoughRepeats && holdoutPresent && holdoutEnoughRepeats;
  return {
    status: !enoughEvidence
      ? 'insufficient-data'
      : improvement && noRegressions && holdoutNoRegression
        ? 'adopt'
        : 'reject',
    baselineProfile,
    candidateProfile,
    minRepeats,
    holdoutCases,
    aggregate,
    gates,
    perCase,
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
  const profileComparison = compareProfiles(records, options);
  const enoughSamples = records.length >= 3;
  const gates = {
    receiptsPresent: records.length > 0,
    enoughSamples,
    noSilentFallback: silentFallbackCount === 0,
    qwenOnlyWhenExplicit: unexplainedQwenCount === 0,
    noFailedRuns: failCount === 0,
    parseClean: (routeInput.invalidLines + verifierInput.invalidLines) === 0,
    profilePromotionReady: ['not-requested', 'adopt'].includes(profileComparison.status),
  };
  const criticalPass = gates.receiptsPresent && gates.noSilentFallback && gates.qwenOnlyWhenExplicit && gates.parseClean;
  let overallStatus = !gates.receiptsPresent ? 'insufficient-data' : criticalPass && gates.noFailedRuns ? 'pass' : criticalPass ? 'warn' : 'fail';
  if (profileComparison.status === 'reject') overallStatus = 'fail';
  else if (profileComparison.status === 'insufficient-data') overallStatus = 'insufficient-data';
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
      profileCounts: countBy(records.filter((record) => record.source === 'verifier'), 'profileId'),
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
    profileComparison,
    score,
    overallStatus,
    nextAction: profileComparison.status === 'insufficient-data'
      ? `Collect at least ${profileComparison.minRepeats} paired runs per stable case for both profiles, including every held-out case.`
      : profileComparison.status === 'reject'
        ? 'Reject the candidate profile; inspect per-case deltas and fix every regression before rerunning the full suite.'
        : profileComparison.status === 'adopt'
          ? 'Candidate profile cleared repeated paired and held-out gates; preserve this receipt as the promotion proof.'
          : !gates.receiptsPresent
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
  const comparison = report.profileComparison;
  const comparisonLines = comparison.status === 'not-requested'
    ? ['- Not requested.']
    : [
        `- Decision: ${comparison.status}`,
        `- Baseline: ${comparison.baselineProfile}`,
        `- Candidate: ${comparison.candidateProfile}`,
        `- Minimum repeats per profile/case: ${comparison.minRepeats}`,
        `- Held-out cases: ${comparison.holdoutCases.join(', ') || 'none'}`,
        ...(comparison.perCase || []).map((entry) => `- ${entry.caseId} (${entry.split}): ${entry.baseline.passRate ?? 'n/a'} -> ${entry.candidate.passRate ?? 'n/a'} (${entry.delta ?? 'n/a'})`),
      ];
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

## Harness profile comparison

${comparisonLines.join('\n')}

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
    `Profile comparison: ${report.profileComparison.status}`,
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
  compareProfiles,
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
