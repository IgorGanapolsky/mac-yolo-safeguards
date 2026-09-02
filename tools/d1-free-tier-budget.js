#!/usr/bin/env node
'use strict';

/**
 * Compare wrangler `d1 info --json` 24h counters to the D1 Workers Free
 * daily caps (5e6 rows read / 1e5 rows written), enforced 2026-09-01.
 *
 * Does not query D1. Pipe or pass a saved info JSON so this never burns quota.
 *
 *   npx wrangler d1 info hermes-control-plane --json > /tmp/d1-info.json
 *   node tools/d1-free-tier-budget.js /tmp/d1-info.json
 *   node tools/d1-free-tier-budget.js --json < /tmp/d1-info.json
 */

const fs = require('node:fs');
const path = require('node:path');

const FREE_READS = 5_000_000;
const FREE_WRITES = 100_000;
const WARN_RATIO = 0.8;

/**
 * A counter must be a real, finite, non-negative measurement. `Number(x) || 0`
 * silently turned a missing, null or non-numeric field into 0, so an input such
 * as {"name":"hermes-control-plane"} certified the database as under budget
 * (status 'ok', exit 0) having measured nothing. A wrangler output-shape change
 * or a truncated export would read as healthy. Absent measurement fails closed.
 */
function readCounter(value, field, problems) {
  if (value === undefined || value === null || value === '') {
    problems.push(`missing ${field}`);
    return null;
  }
  const n = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(n)) {
    problems.push(`${field} is not a finite number (${JSON.stringify(value)})`);
    return null;
  }
  if (n < 0) {
    problems.push(`${field} is negative (${n})`);
    return null;
  }
  return n;
}

function evaluateD1FreeTier(usage) {
  const source = usage && typeof usage === 'object' ? usage : {};
  const problems = [];
  const read = readCounter(source.rows_read_24h, 'rows_read_24h', problems);
  const written = readCounter(source.rows_written_24h, 'rows_written_24h', problems);
  if (problems.length) {
    return {
      status: 'unknown',
      problems,
      rows_read_24h: read,
      rows_written_24h: written,
      free_reads: FREE_READS,
      free_writes: FREE_WRITES,
      read_ratio: null,
      write_ratio: null,
    };
  }
  const rows_read_24h = read;
  const rows_written_24h = written;
  const read_ratio = rows_read_24h / FREE_READS;
  const write_ratio = rows_written_24h / FREE_WRITES;
  let status = 'ok';
  if (read_ratio >= 1 || write_ratio >= 1) status = 'exceeded';
  else if (read_ratio >= WARN_RATIO || write_ratio >= WARN_RATIO) status = 'warn';
  return {
    status,
    rows_read_24h,
    rows_written_24h,
    free_reads: FREE_READS,
    free_writes: FREE_WRITES,
    read_ratio,
    write_ratio,
  };
}

function parseInfo(raw) {
  const data = JSON.parse(raw);
  if (data && typeof data === 'object' && !Array.isArray(data)) return data;
  throw new Error('expected wrangler d1 info JSON object');
}

function main(argv) {
  const jsonOut = argv.includes('--json');
  const args = argv.filter((a) => a !== '--json');
  let raw;
  if (args[0] === '-' || !args[0]) {
    raw = fs.readFileSync(0, 'utf8');
  } else {
    raw = fs.readFileSync(path.resolve(args[0]), 'utf8');
  }
  const info = parseInfo(raw);
  const verdict = evaluateD1FreeTier(info);
  if (jsonOut) {
    process.stdout.write(`${JSON.stringify({
      uuid: info.uuid || null,
      name: info.name || null,
      ...verdict,
    })}\n`);
  } else {
    const pct = (n) => `${(n * 100).toFixed(1)}%`;
    if (verdict.status === 'unknown') {
      process.stdout.write(
        `D1 free-tier 24h unknown: ${verdict.problems.join('; ')} - refusing to certify under budget\n`,
      );
      process.exitCode = 2;
      return verdict;
    }
    process.stdout.write(
      `D1 free-tier 24h ${verdict.status}: reads ${verdict.rows_read_24h}/${FREE_READS} (${pct(verdict.read_ratio)}) writes ${verdict.rows_written_24h}/${FREE_WRITES} (${pct(verdict.write_ratio)})\n`,
    );
  }
  // 'unknown' exits 2 like 'exceeded': an unmeasured database must never be
  // reported as under budget by a check that gates on this exit code.
  if (verdict.status === 'exceeded' || verdict.status === 'unknown') process.exitCode = 2;
  else if (verdict.status === 'warn') process.exitCode = 1;
  return verdict;
}

module.exports = {
  FREE_READS,
  FREE_WRITES,
  WARN_RATIO,
  readCounter,
  evaluateD1FreeTier,
  parseInfo,
  main,
};

if (require.main === module) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 2;
  }
}
