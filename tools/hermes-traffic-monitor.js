#!/usr/bin/env node
'use strict';

/**
 * hermes-traffic-monitor
 *
 * Reads the LiteLLM traffic log (~/.hermes/litellm-logs/traffic.jsonl) and reports
 * per-model health for a recent time window, then flags DEGRADED conditions.
 *
 * Why this exists: the traffic log has been silently accumulating thousands of calls
 * at a ~79% failure rate with nobody reading it. A dead route (100% failure) is
 * indistinguishable from a healthy one unless something aggregates the log.
 *
 * Design notes:
 *  - The log is hundreds of MB with individual lines up to ~0.5 MB (each record embeds
 *    the full `messages` payload). It is NEVER loaded into memory as a whole. Records
 *    are streamed by reading fixed-size chunks BACKWARDS from the end of the file, which
 *    is what a "last N minutes" window actually needs, and lets the scan stop as soon as
 *    it walks off the back of the window.
 *  - The file is appended to concurrently. The scan snapshots the file size at open time
 *    and never reads past it, so a record being written mid-scan cannot corrupt the read.
 *    A torn final line (no trailing newline) is reported separately from real corruption.
 *
 * Exit codes:
 *   0  ok (or degraded, but --fail-on-degraded was not passed; or the log is missing)
 *   1  usage / IO error
 *   2  degraded conditions present AND --fail-on-degraded was passed
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const DEFAULT_LOG_PATH = path.join(os.homedir(), '.hermes', 'litellm-logs', 'traffic.jsonl');
const DEFAULT_WINDOW_MINUTES = 60;

// Degraded-rule thresholds. A model needs at least MIN_CALLS in the window before any
// per-model rule can fire, so a single unlucky call never pages anyone.
const MIN_CALLS = 20;
const FAILURE_RATE_THRESHOLD = 0.5;
const EMPTY_RATE_THRESHOLD = 0.1;
const TOKEN_RATIO_THRESHOLD = 100;

const READ_CHUNK_BYTES = 1024 * 1024;
// Records are appended in completion order, which is only *roughly* time-ordered because
// concurrent requests finish out of order. Tolerate this much jitter before concluding we
// have truly walked off the back of the window.
const STALE_RECORD_TOLERANCE = 200;

const NEWLINE = 0x0a;

const USAGE = `hermes-traffic-monitor - per-model failure/health monitor for the LiteLLM traffic log

Usage: node tools/hermes-traffic-monitor.js [options]

Options:
  --window-minutes N    Look back N minutes from now (default: ${DEFAULT_WINDOW_MINUTES})
  --log-path PATH       Traffic log to read (default: ${DEFAULT_LOG_PATH})
  --json                Emit the full report as JSON instead of text
  --fail-on-degraded    Exit 2 if any degraded condition fires (default: always exit 0)
  --help, -h            Show this help

Degraded rules (each is reported independently):
  high_failure_rate   model with >=${MIN_CALLS} calls and failure rate >= ${FAILURE_RATE_THRESHOLD}
  route_dead          model with >=${MIN_CALLS} calls and 100% failure
  high_empty_rate     model with >=${MIN_CALLS} calls and empty-response rate >= ${EMPTY_RATE_THRESHOLD}
  token_burn_ratio    overall input:output token ratio >= ${TOKEN_RATIO_THRESHOLD}:1
`;

// ---------------------------------------------------------------------------
// argument parsing
// ---------------------------------------------------------------------------

function readValue(argv, index, flag) {
  const value = argv[index];
  if (value === undefined || value.startsWith('--')) {
    throw new Error(`Missing value for ${flag}`);
  }
  return value;
}

function parseArgs(argv) {
  const opts = {
    json: false,
    windowMinutes: DEFAULT_WINDOW_MINUTES,
    failOnDegraded: false,
    logPath: DEFAULT_LOG_PATH,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') {
      opts.json = true;
    } else if (arg === '--fail-on-degraded') {
      opts.failOnDegraded = true;
    } else if (arg === '--help' || arg === '-h') {
      opts.help = true;
    } else if (arg === '--window-minutes' || arg.startsWith('--window-minutes=')) {
      const raw = arg.includes('=') ? arg.slice(arg.indexOf('=') + 1) : readValue(argv, ++i, '--window-minutes');
      const value = Number(raw);
      if (!Number.isFinite(value) || value <= 0) {
        throw new Error(`Invalid --window-minutes: ${raw}`);
      }
      opts.windowMinutes = value;
    } else if (arg === '--log-path' || arg.startsWith('--log-path=')) {
      const raw = arg.includes('=') ? arg.slice(arg.indexOf('=') + 1) : readValue(argv, ++i, '--log-path');
      if (!raw) throw new Error('Invalid --log-path: empty');
      opts.logPath = raw;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return opts;
}

// ---------------------------------------------------------------------------
// record interpretation
// ---------------------------------------------------------------------------

const TS_PATTERN = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?\s*(Z|[+-]\d{2}:?\d{2})?$/;

/**
 * The gateway writes `ts_end` as a naive local timestamp with microseconds, e.g.
 * "2026-08-04 03:42:15.763798". That form is not portable through Date.parse, so it is
 * parsed explicitly. Explicit offsets / Z are honoured when present.
 * Returns epoch millis, or null when the value is missing or unparseable.
 */
function parseTimestamp(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    // Accept epoch seconds or millis.
    return value > 1e12 ? value : value * 1000;
  }
  if (typeof value !== 'string') return null;
  const match = TS_PATTERN.exec(value.trim());
  if (!match) return null;

  const [, y, mo, d, h, mi, s, frac, tz] = match;
  const ms = frac ? Number(frac.slice(0, 3).padEnd(3, '0')) : 0;

  if (tz) {
    const normalized = `${y}-${mo}-${d}T${h}:${mi}:${s}.${String(ms).padStart(3, '0')}${tz === 'Z' ? 'Z' : tz}`;
    const parsed = Date.parse(normalized);
    return Number.isNaN(parsed) ? null : parsed;
  }

  // No offset: the producer wrote local time, so interpret it as local time.
  const local = new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s), ms);
  const stamp = local.getTime();
  return Number.isNaN(stamp) ? null : stamp;
}

function hasToolCalls(record) {
  if (record.has_tool_calls === true) return true;
  return Array.isArray(record.tool_calls) && record.tool_calls.length > 0;
}

/**
 * "Empty response" means the call produced no usable assistant text.
 *
 * The gateway sets `empty_kind` only when the response TEXT was blank, and uses it to
 * classify why. Verified values in the live log:
 *   'empty'     -> response null, no tool calls        => empty (a real dud)
 *   'truncated' -> finish_reason 'length', no text     => empty (nothing usable came back)
 *   'tool_call' -> text blank BUT tool calls present   => NOT empty, this is a normal
 *                  tool-calling turn and counting it would swamp the signal
 *   null        -> response carried text               => not empty
 *
 * So a blanket "empty_kind is set => empty" would misclassify every healthy tool call.
 * The rule below is: blank-and-unexplained is empty; blank-because-tool-calls is not.
 */
function isEmptyResponse(record) {
  const kind = typeof record.empty_kind === 'string' ? record.empty_kind.trim() : '';
  if (kind === 'tool_call') {
    // Defensive: if it claims tool_call but carries no tool calls, nothing usable came back.
    return !hasToolCalls(record);
  }
  if (kind !== '') return true;

  const response = record.response;
  const textEmpty = response === null
    || response === undefined
    || (typeof response === 'string' && response.trim() === '');
  return textEmpty && !hasToolCalls(record);
}

function finiteOrNull(value) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function slimRecord(record, tsMs) {
  const model = typeof record.model === 'string' && record.model.trim()
    ? record.model.trim()
    : '<unknown>';
  const status = typeof record.status === 'string' ? record.status.trim() : '';
  return {
    model,
    tsMs,
    isFailure: status === 'failure',
    isSuccess: status === 'success',
    hasKnownStatus: status === 'failure' || status === 'success',
    isEmpty: isEmptyResponse(record),
    latency: finiteOrNull(record.latency_s),
    promptTokens: finiteOrNull(record.prompt_tokens),
    completionTokens: finiteOrNull(record.completion_tokens),
  };
}

// ---------------------------------------------------------------------------
// streaming reader (backwards, chunked, never loads the whole file)
// ---------------------------------------------------------------------------

function splitOnNewlines(buf) {
  const parts = [];
  let start = 0;
  let idx = buf.indexOf(NEWLINE, start);
  while (idx !== -1) {
    parts.push(buf.subarray(start, idx));
    start = idx + 1;
    idx = buf.indexOf(NEWLINE, start);
  }
  parts.push(buf.subarray(start));
  return parts;
}

/**
 * Walk the file from the end to the beginning, handing each line to `handleLine`
 * newest-first. `handleLine(line, isTornTail)` may return 'stop' to end the scan.
 * Only `chunkBytes` are held at a time (plus one straddling line).
 */
function scanBackwards(logPath, handleLine, chunkBytes) {
  const size = chunkBytes || READ_CHUNK_BYTES;
  const fd = fs.openSync(logPath, 'r');
  try {
    // Snapshot the size: anything appended after this point is simply not our problem,
    // and refusing to read past it is what makes a concurrent append safe.
    const fileSize = fs.fstatSync(fd).size;
    if (fileSize === 0) return { bytesRead: 0, fileSize: 0, stoppedEarly: false };

    const lastByte = Buffer.alloc(1);
    fs.readSync(fd, lastByte, 0, 1, fileSize - 1);
    const endsWithNewline = lastByte[0] === NEWLINE;

    let pos = fileSize;
    let remainder = null;
    let emittedAny = false;
    let bytesRead = 0;

    while (pos > 0) {
      const start = Math.max(0, pos - size);
      const len = pos - start;
      const buf = Buffer.alloc(len);
      fs.readSync(fd, buf, 0, len, start);
      bytesRead += len;
      pos = start;

      const combined = remainder ? Buffer.concat([buf, remainder]) : buf;
      const parts = splitOnNewlines(combined);
      // parts[0] straddles the chunk boundary unless we reached the head of the file.
      const firstIdx = pos === 0 ? 0 : 1;
      remainder = pos === 0 ? null : Buffer.from(parts[0]);

      for (let i = parts.length - 1; i >= firstIdx; i -= 1) {
        const line = parts[i].toString('utf8').trim();
        if (!line) continue;
        // The very first line we emit is the file's last line. If the file does not end
        // in a newline, a writer may be mid-append and that line is torn, not corrupt.
        const isTornTail = !emittedAny && !endsWithNewline;
        emittedAny = true;
        if (handleLine(line, isTornTail) === 'stop') {
          return { bytesRead, fileSize, stoppedEarly: true };
        }
      }
    }
    return { bytesRead, fileSize, stoppedEarly: false };
  } finally {
    fs.closeSync(fd);
  }
}

// ---------------------------------------------------------------------------
// aggregation
// ---------------------------------------------------------------------------

/** Nearest-rank percentile: index = ceil(q * n) - 1 over the sorted sample. */
function percentile(values, q) {
  if (!values || values.length === 0) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  let idx = Math.ceil(q * sorted.length) - 1;
  if (idx < 0) idx = 0;
  if (idx >= sorted.length) idx = sorted.length - 1;
  return sorted[idx];
}

function mean(values) {
  if (!values || values.length === 0) return null;
  let total = 0;
  for (const v of values) total += v;
  return total / values.length;
}

function round(value, digits) {
  if (value === null || value === undefined || !Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function collectWindow(logPath, cutoffMs, chunkBytes, staleTolerance) {
  const parse = {
    linesScanned: 0,
    malformed: 0,
    undated: 0,
    partialTailSkipped: 0,
    olderThanWindow: 0,
    unknownStatus: 0,
  };
  const records = [];
  let consecutiveStale = 0;
  let newestTsMs = null;
  const tolerance = staleTolerance || STALE_RECORD_TOLERANCE;

  const scan = scanBackwards(logPath, (line, isTornTail) => {
    parse.linesScanned += 1;

    let record;
    try {
      record = JSON.parse(line);
    } catch (err) {
      // A torn last line is an artefact of reading a file mid-append, not corruption.
      if (isTornTail) parse.partialTailSkipped += 1;
      else parse.malformed += 1;
      return undefined;
    }
    if (!record || typeof record !== 'object' || Array.isArray(record)) {
      parse.malformed += 1;
      return undefined;
    }

    const tsMs = parseTimestamp(record.ts_end !== undefined ? record.ts_end : record.timestamp);
    if (tsMs === null) {
      // Undated records cannot be placed in the window, so they are excluded from the
      // aggregate rather than silently inflating it. The count is surfaced in the report.
      parse.undated += 1;
      return undefined;
    }
    if (newestTsMs === null || tsMs > newestTsMs) newestTsMs = tsMs;

    if (tsMs < cutoffMs) {
      parse.olderThanWindow += 1;
      consecutiveStale += 1;
      return consecutiveStale >= tolerance ? 'stop' : undefined;
    }

    consecutiveStale = 0;
    const slim = slimRecord(record, tsMs);
    if (!slim.hasKnownStatus) parse.unknownStatus += 1;
    records.push(slim);
    return undefined;
  }, chunkBytes);

  return { records, parse, scan, newestTsMs };
}

function aggregate(records) {
  const byModel = new Map();

  for (const rec of records) {
    let entry = byModel.get(rec.model);
    if (!entry) {
      entry = {
        model: rec.model,
        calls: 0,
        failures: 0,
        successes: 0,
        emptyResponses: 0,
        latencies: [],
        promptTokens: [],
        completionTokens: [],
      };
      byModel.set(rec.model, entry);
    }
    entry.calls += 1;
    if (rec.isFailure) entry.failures += 1;
    if (rec.isSuccess) entry.successes += 1;
    // Only SUCCEEDED calls can be "empty" in the sense that matters. A failed call has
    // no response body, so counting it here made emptyResponses a duplicate of failures
    // (verified 2026-08-05 on the live log: every row read 337/337, 233/233, 154/154 —
    // identical columns, zero added signal). The metric worth alerting on is the silent
    // one: the call reported success and still returned nothing usable. That is the
    // GLM_MIN_MAX_TOKENS class of bug — reasoning tokens consume the whole budget and
    // the response comes back 200 OK with empty content, invisible to failure monitoring.
    if (rec.isEmpty && !rec.isFailure) entry.emptyResponses += 1;
    if (rec.latency !== null) entry.latencies.push(rec.latency);
    if (rec.promptTokens !== null) entry.promptTokens.push(rec.promptTokens);
    if (rec.completionTokens !== null) entry.completionTokens.push(rec.completionTokens);
  }

  let totalInputTokens = 0;
  let totalOutputTokens = 0;

  const models = [...byModel.values()].map((entry) => {
    const inputTokens = entry.promptTokens.reduce((a, b) => a + b, 0);
    const outputTokens = entry.completionTokens.reduce((a, b) => a + b, 0);
    totalInputTokens += inputTokens;
    totalOutputTokens += outputTokens;
    return {
      model: entry.model,
      calls: entry.calls,
      failures: entry.failures,
      successes: entry.successes,
      failureRate: entry.calls ? entry.failures / entry.calls : 0,
      emptyResponses: entry.emptyResponses,
      emptyRate: entry.calls ? entry.emptyResponses / entry.calls : 0,
      latencyP50: round(percentile(entry.latencies, 0.5), 3),
      latencyP95: round(percentile(entry.latencies, 0.95), 3),
      meanPromptTokens: round(mean(entry.promptTokens), 1),
      meanCompletionTokens: round(mean(entry.completionTokens), 1),
      inputTokens,
      outputTokens,
    };
  });

  models.sort((a, b) => b.calls - a.calls || a.model.localeCompare(b.model));

  let inputOutputRatio = null;
  if (totalOutputTokens > 0) inputOutputRatio = totalInputTokens / totalOutputTokens;
  else if (totalInputTokens > 0) inputOutputRatio = Infinity;

  const totals = {
    calls: records.length,
    failures: models.reduce((acc, m) => acc + m.failures, 0),
    emptyResponses: models.reduce((acc, m) => acc + m.emptyResponses, 0),
    totalInputTokens,
    totalOutputTokens,
    inputOutputRatio: inputOutputRatio === Infinity ? Infinity : round(inputOutputRatio, 2),
  };
  totals.failureRate = totals.calls ? totals.failures / totals.calls : 0;

  return { models, totals };
}

// ---------------------------------------------------------------------------
// degraded detection
// ---------------------------------------------------------------------------

function pct(value) {
  return `${(value * 100).toFixed(1)}%`;
}

/**
 * Each rule is evaluated and reported independently, so a 100%-failure model raises BOTH
 * high_failure_rate and route_dead. That is deliberate: "over half the calls fail" and
 * "this route is dead" are different operational statements and both belong in the alert.
 */
function detectDegraded(summary) {
  const degraded = [];

  for (const m of summary.models) {
    if (m.calls < MIN_CALLS) continue;

    if (m.failureRate >= FAILURE_RATE_THRESHOLD) {
      degraded.push({
        rule: 'high_failure_rate',
        severity: 'warn',
        model: m.model,
        calls: m.calls,
        value: m.failureRate,
        threshold: FAILURE_RATE_THRESHOLD,
        detail: `${m.model}: ${m.failures}/${m.calls} calls failed (${pct(m.failureRate)}) >= ${pct(FAILURE_RATE_THRESHOLD)}`,
      });
    }

    if (m.failures === m.calls) {
      degraded.push({
        rule: 'route_dead',
        severity: 'critical',
        model: m.model,
        calls: m.calls,
        value: 1,
        threshold: 1,
        detail: `${m.model}: ALL ${m.calls} calls failed - route is dead`,
      });
    }

    if (m.emptyRate >= EMPTY_RATE_THRESHOLD) {
      degraded.push({
        rule: 'high_empty_rate',
        severity: 'warn',
        model: m.model,
        calls: m.calls,
        value: m.emptyRate,
        threshold: EMPTY_RATE_THRESHOLD,
        detail: `${m.model}: ${m.emptyResponses}/${m.calls} responses empty (${pct(m.emptyRate)}) >= ${pct(EMPTY_RATE_THRESHOLD)}`,
      });
    }
  }

  const ratio = summary.totals.inputOutputRatio;
  if (ratio !== null && (ratio === Infinity || ratio >= TOKEN_RATIO_THRESHOLD)) {
    const shown = ratio === Infinity ? 'infinite (zero output tokens)' : `${ratio.toFixed(1)}:1`;
    degraded.push({
      rule: 'token_burn_ratio',
      severity: 'warn',
      model: null,
      calls: summary.totals.calls,
      value: ratio === Infinity ? null : ratio,
      threshold: TOKEN_RATIO_THRESHOLD,
      detail: `overall input:output token ratio is ${shown} >= ${TOKEN_RATIO_THRESHOLD}:1 (${summary.totals.totalInputTokens} in / ${summary.totals.totalOutputTokens} out)`,
    });
  }

  return degraded;
}

// ---------------------------------------------------------------------------
// report
// ---------------------------------------------------------------------------

function buildReport(options) {
  const opts = options || {};
  const logPath = opts.logPath || DEFAULT_LOG_PATH;
  const windowMinutes = opts.windowMinutes || DEFAULT_WINDOW_MINUTES;
  const nowMs = opts.nowMs || Date.now();
  const cutoffMs = nowMs - windowMinutes * 60 * 1000;

  if (!fs.existsSync(logPath)) {
    return {
      logPath,
      logPresent: false,
      windowMinutes,
      generatedAt: new Date(nowMs).toISOString(),
      message: `no log at ${logPath} - nothing to monitor`,
      parse: {
        linesScanned: 0, malformed: 0, undated: 0, partialTailSkipped: 0, olderThanWindow: 0, unknownStatus: 0,
      },
      models: [],
      totals: {
        calls: 0,
        failures: 0,
        failureRate: 0,
        emptyResponses: 0,
        totalInputTokens: 0,
        totalOutputTokens: 0,
        inputOutputRatio: null,
      },
      degraded: [],
    };
  }

  const { records, parse, scan, newestTsMs } = collectWindow(
    logPath, cutoffMs, opts.chunkBytes, opts.staleTolerance,
  );
  const summary = aggregate(records);
  const degraded = detectDegraded(summary);

  return {
    logPath,
    logPresent: true,
    windowMinutes,
    generatedAt: new Date(nowMs).toISOString(),
    windowStart: new Date(cutoffMs).toISOString(),
    newestRecordAt: newestTsMs === null ? null : new Date(newestTsMs).toISOString(),
    newestRecordAgeMinutes: newestTsMs === null ? null : round((nowMs - newestTsMs) / 60000, 2),
    scan: {
      fileSizeBytes: scan.fileSize,
      bytesRead: scan.bytesRead,
      stoppedEarly: scan.stoppedEarly,
    },
    parse,
    models: summary.models,
    totals: summary.totals,
    degraded,
    thresholds: {
      minCalls: MIN_CALLS,
      failureRate: FAILURE_RATE_THRESHOLD,
      emptyRate: EMPTY_RATE_THRESHOLD,
      inputOutputRatio: TOKEN_RATIO_THRESHOLD,
    },
  };
}

function fmtNum(value) {
  if (value === null || value === undefined) return '-';
  if (value === Infinity) return 'inf';
  return String(value);
}

function fmtInt(value) {
  if (value === null || value === undefined) return '-';
  return Math.round(value).toLocaleString('en-US');
}

function renderText(report) {
  const lines = [];
  lines.push('Hermes LiteLLM traffic monitor');
  lines.push(`log      : ${report.logPath}`);

  if (!report.logPresent) {
    lines.push('');
    lines.push(`NO LOG   : ${report.message}`);
    lines.push('Nothing to monitor. This is not an error.');
    return lines.join('\n');
  }

  lines.push(`window   : last ${report.windowMinutes} min (since ${report.windowStart})`);
  lines.push(`newest   : ${report.newestRecordAt || 'n/a'}${report.newestRecordAgeMinutes === null ? '' : ` (${report.newestRecordAgeMinutes} min ago)`}`);
  lines.push(`scan     : ${report.parse.linesScanned} lines read, ${(report.scan.bytesRead / 1048576).toFixed(1)} MB of ${(report.scan.fileSizeBytes / 1048576).toFixed(1)} MB${report.scan.stoppedEarly ? ' (stopped at window edge)' : ''}`);
  lines.push(`records  : ${report.totals.calls} in window | malformed ${report.parse.malformed} | undated ${report.parse.undated} | torn tail ${report.parse.partialTailSkipped} | unknown status ${report.parse.unknownStatus}`);
  lines.push('');

  if (report.models.length === 0) {
    lines.push('No calls in the window.');
  } else {
    const header = [
      'MODEL'.padEnd(34),
      'CALLS'.padStart(6),
      'FAILURES'.padStart(16),
      'EMPTY'.padStart(16),
      'p50 s'.padStart(10),
      'p95 s'.padStart(10),
      'mean in'.padStart(11),
      'mean out'.padStart(10),
    ].join(' ');
    lines.push(header);
    lines.push('-'.repeat(header.length));
    for (const m of report.models) {
      lines.push([
        m.model.slice(0, 34).padEnd(34),
        String(m.calls).padStart(6),
        `${m.failures} (${pct(m.failureRate)})`.padStart(16),
        `${m.emptyResponses} (${pct(m.emptyRate)})`.padStart(16),
        fmtNum(m.latencyP50).padStart(10),
        fmtNum(m.latencyP95).padStart(10),
        fmtNum(m.meanPromptTokens).padStart(11),
        fmtNum(m.meanCompletionTokens).padStart(10),
      ].join(' '));
    }
    lines.push('');
    lines.push(`total calls        : ${fmtInt(report.totals.calls)} (${report.totals.failures} failed, ${pct(report.totals.failureRate)})`);
    lines.push(`total input tokens : ${fmtInt(report.totals.totalInputTokens)}`);
    lines.push(`total output tokens: ${fmtInt(report.totals.totalOutputTokens)}`);
    const ratio = report.totals.inputOutputRatio;
    lines.push(`input:output ratio : ${ratio === null ? 'n/a' : (ratio === Infinity ? 'infinite (zero output)' : `${ratio.toFixed(1)}:1`)}`);
  }

  lines.push('');
  if (report.degraded.length === 0) {
    lines.push('DEGRADED: none');
  } else {
    lines.push(`DEGRADED (${report.degraded.length}):`);
    for (const d of report.degraded) {
      lines.push(`  [${d.severity.toUpperCase()}] ${d.rule.padEnd(18)} ${d.detail}`);
    }
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// entrypoint
// ---------------------------------------------------------------------------

function main(argv, io) {
  const out = (io && io.stdout) || process.stdout;
  const err = (io && io.stderr) || process.stderr;

  let opts;
  try {
    opts = parseArgs(argv);
  } catch (e) {
    err.write(`${e.message}\n\n${USAGE}`);
    return 1;
  }

  if (opts.help) {
    out.write(USAGE);
    return 0;
  }

  let report;
  try {
    report = buildReport(opts);
  } catch (e) {
    // Never crash with a raw stack: a monitor that explodes is worse than one that says why.
    err.write(`hermes-traffic-monitor: failed to read ${opts.logPath}: ${e.message}\n`);
    return 1;
  }

  out.write(opts.json ? `${JSON.stringify(report, null, 2)}\n` : `${renderText(report)}\n`);

  if (!report.logPresent) return 0;
  if (opts.failOnDegraded && report.degraded.length > 0) return 2;
  return 0;
}

if (require.main === module) {
  process.exitCode = main(process.argv.slice(2));
}

module.exports = {
  DEFAULT_LOG_PATH,
  DEFAULT_WINDOW_MINUTES,
  MIN_CALLS,
  FAILURE_RATE_THRESHOLD,
  EMPTY_RATE_THRESHOLD,
  TOKEN_RATIO_THRESHOLD,
  aggregate,
  buildReport,
  collectWindow,
  detectDegraded,
  isEmptyResponse,
  main,
  parseArgs,
  parseTimestamp,
  percentile,
  renderText,
  scanBackwards,
};
