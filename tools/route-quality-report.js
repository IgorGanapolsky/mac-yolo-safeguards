#!/usr/bin/env node
'use strict';

// Per-SERVED-MODEL quality from the gateway traffic log.
//
// Why this exists (2026-07-28): the fleet could already answer "did the request
// succeed?" — Snowflake's MODEL_RELIABILITY derives reliability/failure_rate from
// `status`. But transport success is not answer quality, and every real
// degradation this fleet has hit was invisible to it:
//
//   * The gateway silently served a tiny model that emitted JSON-as-TEXT instead
//     of tool calls. Every one of those rows is status=success.
//   * z.ai hit its weekly cap (429 code 1310) and `glm-coding` was quietly served
//     by `nvidia/nemotron-3-ultra-550b-a55b:free`. Also status=success.
//
// The traffic log already carries the signal that separates those: `tools_offered`
// says the request COULD have used tools, `has_tool_calls` says it did. A model
// that is handed tools and never calls them is degraded even while returning 200.
// Nothing aggregated that per model — `tools_offered` was read only by
// agent-spin-detector.js, and only to decide whether an AGENT was tool-capable
// over time, never to score a MODEL.
//
// Rules carried from the eval-suite cleanup: never report a rate whose denominator
// is zero, and always surface the denominator so a confident-looking 100% over 3
// requests cannot be mistaken for a measurement.
//
//   node tools/route-quality-report.js
//   node tools/route-quality-report.js --json
//   node tools/route-quality-report.js --gate      # exit 1 if a route degraded

const fs = require('fs');
const os = require('os');
const path = require('path');

const DEFAULT_LOG = path.join(os.homedir(), '.hermes', 'litellm-logs', 'traffic.jsonl');
// Below this many tool-offered requests, a compliance rate is noise, not a signal.
const MIN_TOOL_OFFERED = 5;
const COMPLIANCE_FLOOR = 0.5;

function pct(n, d) {
  if (!d) return null;
  return Math.round((n / d) * 1000) / 10;
}

function percentile(sorted, p) {
  if (!sorted.length) return null;
  const i = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return Math.round(sorted[i] * 1000) / 1000;
}

function summarizeRouteQuality(records) {
  const byModel = new Map();
  let malformed = 0;

  for (const rec of records) {
    if (!rec || typeof rec !== 'object' || !rec.model) {
      malformed += 1;
      continue;
    }
    const key = String(rec.model);
    if (!byModel.has(key)) {
      byModel.set(key, {
        model: key,
        requests: 0,
        failures: 0,
        empties: 0,
        toolOffered: 0,
        toolAnswered: 0,
        toolCalled: 0,
        latencies: [],
      });
    }
    const m = byModel.get(key);
    m.requests += 1;
    const answered = String(rec.status) === 'success';
    if (!answered) m.failures += 1;
    // `empty_kind` is a CLASSIFICATION, not a boolean: empty | tool_call |
    // truncated | None. Treating any truthy value as "empty" counts successful
    // tool calls as empty responses — the first version of this file did exactly
    // that and reported nemotron at 40% when it is really 94%.
    if (rec.empty_kind === 'empty') m.empties += 1;
    // Only rows that actually offered tools can testify about tool compliance,
    // and only rows that ANSWERED can testify about capability. A model that
    // never responds (quota exhausted, empty body) and a model that responds but
    // ignores its tools both score 0% on a naive ratio, yet they need opposite
    // fixes: refill/reroute vs stop using the model for agentic work.
    if (rec.tools_offered === true) {
      m.toolOffered += 1;
      if (answered) {
        m.toolAnswered += 1;
        if (rec.has_tool_calls === true || Number(rec.tool_call_count) > 0) m.toolCalled += 1;
      }
    }
    const lat = Number(rec.latency_s);
    if (Number.isFinite(lat) && lat >= 0) m.latencies.push(lat);
  }

  const routes = [...byModel.values()]
    .map((m) => {
      const lat = m.latencies.slice().sort((a, b) => a - b);
      // Capability can only be judged on requests the model actually ANSWERED.
      const complianceMeasurable = m.toolAnswered >= MIN_TOOL_OFFERED;
      const answered = m.requests - m.failures;
      return {
        model: m.model,
        requests: m.requests,
        answered,
        answerRatePct: pct(answered, m.requests),
        failureRatePct: pct(m.failures, m.requests),
        emptyRatePct: pct(m.empties, m.requests),
        toolOffered: m.toolOffered,
        toolAnswered: m.toolAnswered,
        toolCalled: m.toolCalled,
        // null (not 0, not 100) when there is not enough evidence to say.
        toolCompliancePct: complianceMeasurable ? pct(m.toolCalled, m.toolAnswered) : null,
        toolComplianceMeasured: complianceMeasurable,
        toolComplianceReason: complianceMeasurable
          ? null
          : `only ${m.toolAnswered} ANSWERED tool-offered request(s); need >= ${MIN_TOOL_OFFERED}`,
        // A route handed tools that has never once answered is dead, not incapable.
        deadRoute: m.toolOffered >= MIN_TOOL_OFFERED && m.toolAnswered === 0,
        latencyP50s: percentile(lat, 50),
        latencyP95s: percentile(lat, 95),
      };
    })
    .sort((a, b) => b.requests - a.requests);

  // A degraded route is one we can MEASURE and that is failing to use tools it was
  // handed. Unmeasurable routes are never reported as degraded — that would be
  // inventing a finding out of absence.
  const degraded = routes.filter(
    (r) => r.toolComplianceMeasured && r.toolCompliancePct < COMPLIANCE_FLOOR * 100,
  );
  // Reported separately: "never answers" and "answers but ignores tools" are
  // different failures needing opposite fixes (refill/reroute vs stop using it).
  const dead = routes.filter((r) => r.deadRoute);

  return {
    totalRecords: records.length,
    malformed,
    routes,
    degraded,
    dead,
    thresholds: { minToolOffered: MIN_TOOL_OFFERED, complianceFloorPct: COMPLIANCE_FLOOR * 100 },
  };
}

// Only these fields are ever used. Projecting each row discards the stored prompt
// and response bodies, which are the bulk of the log — without this, parsing the
// mini's 1.98 GB log would hold every message in memory at once.
function project(d) {
  return {
    model: d.model,
    status: d.status,
    empty_kind: d.empty_kind,
    tools_offered: d.tools_offered,
    has_tool_calls: d.has_tool_calls,
    tool_call_count: d.tool_call_count,
    latency_s: d.latency_s,
  };
}

function readLog(logPath) {
  if (!fs.existsSync(logPath)) return { ok: false, error: `no traffic log at ${logPath}` };
  const records = [];
  let malformed = 0;
  // The mini's traffic log measured 1,983,905,169 bytes on 2026-07-28. That is well
  // past Node's 0x1fffffe8 max string length, so readFileSync(path, 'utf8') throws
  // ERR_STRING_TOO_LONG — the Pro's smaller log passed while the mini crashed, which
  // is exactly why this had to be run on both machines. Stream it in chunks, and use
  // StringDecoder so a multi-byte character split across a chunk boundary is not
  // corrupted into a parse failure.
  const { StringDecoder } = require('string_decoder');
  const decoder = new StringDecoder('utf8');
  const fd = fs.openSync(logPath, 'r');
  const CHUNK = 1 << 20;
  const buf = Buffer.allocUnsafe(CHUNK);
  let carry = '';
  const take = (line) => {
    const t = line.trim();
    if (!t) return;
    try {
      records.push(project(JSON.parse(t)));
    } catch {
      malformed += 1;
    }
  };
  try {
    let bytes;
    while ((bytes = fs.readSync(fd, buf, 0, CHUNK, null)) > 0) {
      carry += decoder.write(buf.subarray(0, bytes));
      let nl;
      while ((nl = carry.indexOf('\n')) >= 0) {
        take(carry.slice(0, nl));
        carry = carry.slice(nl + 1);
      }
    }
    carry += decoder.end();
    take(carry);
  } finally {
    fs.closeSync(fd);
  }
  return { ok: true, records, malformed };
}

function runReport(options = {}) {
  const logPath = options.logPath || DEFAULT_LOG;
  const read = readLog(logPath);
  if (!read.ok) return { ok: false, error: read.error, logPath };
  const summary = summarizeRouteQuality(read.records);
  summary.malformed += read.malformed;
  return { ok: true, logPath, host: os.hostname(), ...summary };
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  const res = runReport({});
  if (!res.ok) {
    console.error(`route-quality-report: ${res.error}`);
    process.exit(2);
  }
  if (argv.includes('--json')) {
    console.log(JSON.stringify(res, null, 2));
  } else {
    console.log(`\n=== ROUTE QUALITY (${res.host}) ===`);
    console.log(`log: ${res.logPath}  records: ${res.totalRecords}\n`);
    const pad = (s, n) => String(s).padEnd(n);
    console.log(
      `${pad('served model', 42)}${pad('reqs', 7)}${pad('answer%', 9)}${pad('empty%', 8)}${pad('tool-use of answered', 22)}${pad('p50s', 8)}p95s`,
    );
    for (const r of res.routes) {
      const comp = r.toolComplianceMeasured
        ? `${r.toolCompliancePct}% (${r.toolCalled}/${r.toolAnswered})`
        : r.deadRoute
          ? `DEAD 0/${r.toolOffered}`
          : `n/a (${r.toolAnswered})`;
      console.log(
        `${pad(r.model.slice(0, 41), 42)}${pad(r.requests, 7)}${pad(r.answerRatePct ?? '-', 9)}${pad(r.emptyRatePct ?? '-', 8)}${pad(comp, 22)}${pad(r.latencyP50s ?? '-', 8)}${r.latencyP95s ?? '-'}`,
      );
    }
    if (res.dead.length) {
      console.log('\nDEAD ROUTES — handed tools and NEVER once answered (refill/reroute, not a capability problem):');
      for (const d of res.dead) console.log(`  ${d.model}: 0 answered of ${d.toolOffered} tool-offered`);
    }
    if (res.degraded.length) {
      console.log('\nDEGRADED — handed tools and did not use them:');
      for (const d of res.degraded) {
        console.log(`  ${d.model}: ${d.toolCompliancePct}% of ${d.toolOffered} tool-offered requests`);
      }
    } else {
      console.log('\nno measurable route below the tool-compliance floor');
    }
    console.log('');
  }
  if (argv.includes('--gate') && res.degraded.length) process.exit(1);
}

module.exports = { summarizeRouteQuality, runReport };
