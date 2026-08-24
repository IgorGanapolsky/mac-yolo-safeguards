#!/usr/bin/env node
'use strict';

const fs = require('fs');
const crypto = require('crypto');
const os = require('os');
const path = require('path');

const DEFAULT_MIN_PAIRS = 10;

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function normalizePair(item) {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return null;

  const prompt = nonEmptyString(item.prompt);
  const chosen = nonEmptyString(item.chosen) || nonEmptyString(item.solution);
  const rejected = nonEmptyString(item.rejected);
  const source = nonEmptyString(item.source);
  const timestamp = nonEmptyString(item.timestamp);

  if (!prompt || !chosen || !rejected || !source || !timestamp) return null;
  if (chosen === rejected || Number.isNaN(Date.parse(timestamp))) return null;

  const fingerprint = crypto
    .createHash('sha256')
    .update(JSON.stringify({ prompt, chosen, rejected, source, timestamp }))
    .digest('hex');

  return {
    prompt,
    chosen,
    rejected,
    source,
    timestamp,
    provenance: {
      recordId: nonEmptyString(item.id) || fingerprint.slice(0, 16),
      sha256: fingerprint,
    },
  };
}

function loadRecords(inputPath) {
  if (!fs.existsSync(inputPath)) {
    return { ok: true, records: [], sourceStatus: 'missing' };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
    const records = Array.isArray(parsed) ? parsed : parsed?.records;
    if (!Array.isArray(records)) {
      return { ok: false, status: 'invalid_input', reason: 'input must be a JSON array or an object with a records array' };
    }
    return { ok: true, records, sourceStatus: 'present' };
  } catch (error) {
    return { ok: false, status: 'invalid_input', reason: `input is not valid JSON: ${error.message}` };
  }
}

function exportDpoPairs(options = {}) {
  const root = options.cwd || process.cwd();
  const inputPath = options.inputPath || options.memoriesPath || path.join(os.homedir(), '.thumbgate', 'memories.json');
  const outputPath = options.outputPath || path.join(root, '.thumbgate', 'dpo_pairs.jsonl');
  const minPairs = options.minPairs ?? DEFAULT_MIN_PAIRS;

  if (!Number.isInteger(minPairs) || minPairs < 1) {
    return {
      ok: false,
      status: 'invalid_options',
      reason: 'minPairs must be a positive integer',
      inputPath,
      outputPath,
      outputCreated: false,
    };
  }

  const loaded = loadRecords(inputPath);
  if (!loaded.ok) {
    return {
      ok: false,
      status: loaded.status,
      reason: loaded.reason,
      inputPath,
      outputPath,
      outputCreated: false,
    };
  }

  const pairs = [];
  const seen = new Set();
  let rejectedRecords = 0;
  let duplicateRecords = 0;

  for (const item of loaded.records) {
    const pair = normalizePair(item);
    if (!pair) {
      rejectedRecords += 1;
      continue;
    }
    if (seen.has(pair.provenance.sha256)) {
      duplicateRecords += 1;
      continue;
    }
    seen.add(pair.provenance.sha256);
    pairs.push(pair);
  }

  if (pairs.length < minPairs) {
    return {
      ok: false,
      status: 'insufficient_pairs',
      reason: `found ${pairs.length} eligible preference pairs; ${minPairs} required`,
      inputPath,
      outputPath,
      outputCreated: false,
      sourceStatus: loaded.sourceStatus,
      totalRecords: loaded.records.length,
      totalEligible: pairs.length,
      rejectedRecords,
      duplicateRecords,
      minPairs,
    };
  }

  const outputDir = path.dirname(outputPath);
  fs.mkdirSync(outputDir, { recursive: true });

  const lines = `${pairs.map((pair) => JSON.stringify(pair)).join('\n')}\n`;
  const tempPath = `${outputPath}.tmp-${process.pid}`;
  fs.writeFileSync(tempPath, lines, { encoding: 'utf8', mode: 0o600 });
  fs.renameSync(tempPath, outputPath);

  return {
    ok: true,
    status: 'ready',
    inputPath,
    outputPath,
    outputCreated: true,
    totalRecords: loaded.records.length,
    totalEligible: pairs.length,
    totalExported: pairs.length,
    rejectedRecords,
    duplicateRecords,
    minPairs,
  };
}

function usage() {
  return [
    'Usage: node tools/export-dpo-benchmark-pairs.js [options]',
    '',
    'Options:',
    '  --input PATH       JSON array (or {records: []}) with observed preference pairs',
    '  --output PATH      Destination JSONL path',
    `  --min-pairs N      Minimum eligible pairs required before writing (default: ${DEFAULT_MIN_PAIRS})`,
    '  --json             Print a machine-readable disposition',
    '  --help             Show this help without reading or writing data',
  ].join('\n');
}

function parseCliArgs(argv) {
  const options = {};
  let json = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help') return { help: true };
    if (arg === '--json') {
      json = true;
      continue;
    }
    if (arg === '--input' || arg === '--output' || arg === '--min-pairs') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) return { error: `${arg} requires a value` };
      index += 1;
      if (arg === '--input') options.inputPath = path.resolve(value);
      if (arg === '--output') options.outputPath = path.resolve(value);
      if (arg === '--min-pairs') options.minPairs = Number(value);
      continue;
    }
    return { error: `unknown option: ${arg}` };
  }

  return { options, json };
}

function main(argv = process.argv.slice(2), streams = { stdout: process.stdout, stderr: process.stderr }) {
  const parsed = parseCliArgs(argv);
  if (parsed.help) {
    streams.stdout.write(`${usage()}\n`);
    return 0;
  }
  if (parsed.error) {
    streams.stderr.write(`${parsed.error}\n${usage()}\n`);
    return 2;
  }

  const result = exportDpoPairs(parsed.options);
  if (parsed.json) {
    streams.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else if (result.ok) {
    streams.stdout.write(`Exported ${result.totalExported} observed DPO pair(s) to ${result.outputPath}\n`);
  } else {
    streams.stderr.write(`DPO export withheld: ${result.status} — ${result.reason}\n`);
  }
  return result.ok ? 0 : 2;
}

if (require.main === module) process.exitCode = main();

module.exports = {
  DEFAULT_MIN_PAIRS,
  exportDpoPairs,
  loadRecords,
  main,
  normalizePair,
  parseCliArgs,
  usage,
};
