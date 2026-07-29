#!/usr/bin/env node
/**
 * check-rag-health.js — fails when the semantic index is silently dead.
 *
 * Why this exists
 * ---------------
 * CLAUDE.md instructs every agent in this repo: "You MUST use grepai as your PRIMARY
 * tool for code exploration and search." It also says: "If grepai fails … fall back to
 * standard Grep/Glob."
 *
 * Those two rules combine badly. A dead index and a genuine "no matches" are the same
 * observation — zero results — so the fallback fires, the agent quietly uses grep, and
 * nobody learns the index is broken.
 *
 * Measured 2026-07-29: `.grepai/stats.json` held **100 logged searches spanning four
 * days, every one with result_count=0**, the most recent 90 minutes earlier. `index.gob`
 * was 384 bytes against 1,982 tracked files. The index had been empty the whole time and
 * the primary code-search path for every agent was returning nothing.
 *
 * The telemetry to detect this already existed. Nothing read it. This reads it.
 *
 * Usage:
 *   node tools/check-rag-health.js [--dir .grepai] [--window 25] [--json]
 * Exit: 0 healthy / warn · 1 index is dead
 */

const fs = require("node:fs");
const path = require("node:path");

const DEFAULTS = {
  dir: ".grepai",
  window: 25,        // most recent N searches to judge
  minSearches: 10,   // below this, not enough signal to fail the build
  minIndexBytes: 10_000, // an index for a real repo is never this small
};

function readStats(dir) {
  const p = path.join(dir, "stats.json");
  if (!fs.existsSync(p)) return null;
  return fs
    .readFileSync(p, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      try { return JSON.parse(line); } catch { return null; }
    })
    .filter(Boolean)
    .filter((r) => r.command_type === "search");
}

function check(opts) {
  const findings = [];
  const dir = opts.dir;

  if (!fs.existsSync(dir)) {
    return { ok: true, skipped: true, reason: `${dir} not present — no local index in this checkout`, findings };
  }

  // 1. Index file size. An empty gob is the smoking gun.
  const gob = path.join(dir, "index.gob");
  const bytes = fs.existsSync(gob) ? fs.statSync(gob).size : 0;
  if (bytes < opts.minIndexBytes) {
    findings.push({
      severity: "fail",
      check: "index-size",
      detail: `index.gob is ${bytes} bytes (< ${opts.minIndexBytes}). The index is empty or never built.`,
      fix: "Rebuild: grepai index <repo>  — or point at the canonical index in ~/.hermes/semantic-index/",
    });
  }

  // 2. Recent search outcomes. All-zero over a meaningful window means dead, not "no matches".
  const stats = readStats(dir);
  if (!stats || stats.length === 0) {
    findings.push({
      severity: "warn",
      check: "search-telemetry",
      detail: "no search telemetry — cannot tell whether retrieval works",
    });
  } else {
    const recent = stats.slice(-opts.window);
    const zero = recent.filter((r) => !r.result_count).length;
    const pct = Math.round((zero / recent.length) * 100);
    if (recent.length >= opts.minSearches && zero === recent.length) {
      findings.push({
        severity: "fail",
        check: "zero-recall",
        detail:
          `${recent.length}/${recent.length} of the most recent searches returned 0 results ` +
          `(first ${recent[0].timestamp}, last ${recent[recent.length - 1].timestamp}). ` +
          `Retrieval is not degraded — it is returning nothing.`,
        fix: "Rebuild the index and re-run. Until then agents are silently falling back to grep.",
      });
    } else if (pct >= 80 && recent.length >= opts.minSearches) {
      findings.push({
        severity: "warn",
        check: "low-recall",
        detail: `${pct}% of the last ${recent.length} searches returned nothing.`,
      });
    }
  }

  // 3. Config smells that cost quality even when the index works.
  const cfgPath = path.join(dir, "config.yaml");
  if (fs.existsSync(cfgPath)) {
    const cfg = fs.readFileSync(cfgPath, "utf8");
    if (/hybrid:\s*\n\s*enabled:\s*false/.test(cfg)) {
      findings.push({
        severity: "warn",
        check: "dense-only-retrieval",
        detail:
          "hybrid retrieval is disabled — pure dense search. Code queries lean on exact " +
          "identifiers, where BM25 beats embeddings; fusing the two is materially better.",
      });
    }
  }

  const failed = findings.filter((f) => f.severity === "fail");
  return { ok: failed.length === 0, skipped: false, findings, bytes };
}

function main() {
  const argv = process.argv.slice(2);
  const val = (n, d) => {
    const i = argv.indexOf(`--${n}`);
    return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : d;
  };
  const opts = {
    ...DEFAULTS,
    dir: val("dir", DEFAULTS.dir),
    window: Number(val("window", DEFAULTS.window)),
  };

  const result = check(opts);

  if (argv.includes("--json")) {
    console.log(JSON.stringify(result, null, 2));
  } else if (result.skipped) {
    console.log(`rag-health: SKIP — ${result.reason}`);
  } else {
    console.log(`rag-health: ${result.ok ? "OK" : "FAIL"}`);
    for (const f of result.findings) {
      console.log(`  [${f.severity.toUpperCase()}] ${f.check}: ${f.detail}`);
      if (f.fix) console.log(`          fix: ${f.fix}`);
    }
    if (result.ok && result.findings.length === 0) console.log("  index present, recent searches returning results");
  }
  return result.ok ? 0 : 1;
}

if (require.main === module) process.exit(main());
module.exports = { check };
