#!/usr/bin/env node
'use strict';

/**
 * index-config-stamp — detect a semantic index built with DIFFERENT retrieval
 * settings than the config currently in force.
 *
 * WHY THIS EXISTS
 * ---------------
 * The grepai index for this repo is built from a config that lives OUTSIDE git:
 *   ~/.hermes/semantic-index/mac-yolo-safeguards/.grepai/config.yaml
 *
 * A handful of its keys decide what the stored vectors MEAN:
 *   embedder.provider / embedder.model / embedder.dimensions
 *       vectors from a different embedder are not comparable at all — cosine
 *       similarity between nomic-embed-text and any other model is noise.
 *   chunking.size / chunking.overlap
 *       change the chunk boundaries and every stored chunk answers a different
 *       question than the one the query is asking.
 *   search.hybrid.enabled
 *       flips the retrieval algorithm (dense-only vs RRF fusion with BM25).
 *
 * Change any of those and the EXISTING index becomes semantically invalid — but
 * nothing detects it. grepai keeps answering, with silently mismatched vectors.
 * There is no error, no empty result set, no crash: just quietly worse retrieval,
 * which is the hardest failure mode to notice (see tools/grepai-index-canary.js
 * for the sibling failure — an index that is empty rather than mismatched).
 *
 * This tool records a stamp of exactly those retrieval-relevant fields at index
 * build time, and compares it later. MISMATCH means: rebuild the index.
 *
 * NO-STAMP IS NOT A PASS
 * ----------------------
 * An index with no stamp was built by an unknown config. Unknown is not clean.
 * NO-STAMP therefore exits non-zero, exactly like MISMATCH. "We could not tell"
 * must never be rendered as "it is fine" — that is how silent degradation
 * survives a green check.
 *
 * WHY WE DO NOT ROUND-TRIP THE YAML
 * ---------------------------------
 * This file is READ-ONLY with respect to config.yaml, deliberately and forever.
 * A yaml.safe_load/safe_dump round-trip of this config re-serialises its
 * timestamp fields (watch.last_index_time) into a form grepai's Go parser
 * rejects — `cannot parse ... as "T"` — which takes the whole index down. That
 * happened for real. So this tool parses the few scalars it needs by reading,
 * never loads-and-dumps, and never opens config.yaml for writing.
 *
 * WHY WE HASH SIX FIELDS AND NOT THE FILE
 * ---------------------------------------
 * config.yaml carries watch.last_index_time, which changes on every index pass.
 * Hashing the file would report MISMATCH constantly, and a check that cries wolf
 * every run gets ignored or deleted — worse than no check at all.
 *
 * Usage:
 *   node tools/index-config-stamp.js                       # check (default)
 *   node tools/index-config-stamp.js --write               # record current config
 *   node tools/index-config-stamp.js --config <path> --stamp <path>
 *   node tools/index-config-stamp.js --json
 *
 * Exit: 0 MATCH / 1 MISMATCH or NO-STAMP / 2 config unreadable or usage error.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

/**
 * Bumped whenever the field set or canonicalisation below changes. It is part of
 * the hashed payload so that an old stamp reads as MISMATCH (=> rebuild) instead
 * of silently colliding with a stamp computed under different rules.
 */
const STAMP_VERSION = 1;

/**
 * The retrieval-relevant surface. Order is significant: it fixes the canonical
 * serialisation. Anything NOT in this list (endpoint, parallelism, store.backend,
 * boost weights, trace config, and every timestamp) is deliberately excluded —
 * changing those does not invalidate the stored vectors.
 */
const STAMPED_FIELDS = [
  'embedder.provider',
  'embedder.model',
  'embedder.dimensions',
  'chunking.size',
  'chunking.overlap',
  'search.hybrid.enabled',
];

const DEFAULT_INDEX_DIR = path.join(
  process.env.HOME || '',
  '.hermes',
  'semantic-index',
  'mac-yolo-safeguards',
  '.grepai',
);

function defaultConfigPath() {
  return path.join(DEFAULT_INDEX_DIR, 'config.yaml');
}

/** Sidecar lives next to the index it describes, not in git. */
function defaultStampPath(configPath) {
  const dir = configPath ? path.dirname(configPath) : DEFAULT_INDEX_DIR;
  return path.join(dir, 'index-config-stamp.json');
}

// ---------------------------------------------------------------------------
// Minimal READ-ONLY YAML scalar reader.
//
// Not a general YAML implementation and not trying to be: it walks the document
// collecting `a.b.c -> scalar` for plain block mappings, and skips sequences
// wholesale (none of the stamped fields live inside one). It exists so this tool
// has zero dependencies AND structurally cannot write the config back.
// ---------------------------------------------------------------------------

function stripInlineComment(value) {
  // A quoted scalar owns everything up to its closing quote.
  const quoted = value.match(/^(['"])(.*?)\1/);
  if (quoted) return quoted[0];
  const hash = value.search(/\s+#/);
  return hash === -1 ? value : value.slice(0, hash);
}

function unquote(value) {
  const m = value.match(/^(['"])([\s\S]*)\1$/);
  return m ? m[2] : value;
}

/**
 * Coerce a raw YAML scalar the way grepai's Go parser (yaml.v3, YAML 1.2) would:
 * plain `true`/`false` are booleans, plain numbers are numbers, everything else
 * — including YAML-1.1-isms like `yes`/`on` — stays a string. Quoting a value
 * must not change its meaning, so `768` and `"768"` coerce identically.
 */
function coerceScalar(raw) {
  const trimmed = raw.trim();
  const wasQuoted = /^(['"])[\s\S]*\1$/.test(trimmed);
  const bare = unquote(trimmed);
  if (wasQuoted) {
    // Quoted numbers/booleans still normalise, so quoting is not a stamp change.
    if (/^-?\d+$/.test(bare)) return Number(bare);
    if (/^-?\d*\.\d+$/.test(bare)) return Number(bare);
    if (/^(true|false)$/i.test(bare)) return bare.toLowerCase() === 'true';
    return bare;
  }
  if (bare === '' || bare === '~' || bare === 'null') return null;
  if (/^(true|false)$/i.test(bare)) return bare.toLowerCase() === 'true';
  if (/^-?\d+$/.test(bare)) return Number(bare);
  if (/^-?\d*\.\d+$/.test(bare)) return Number(bare);
  return bare;
}

function extractScalars(text) {
  const out = new Map();
  const stack = []; // [{ indent, key }]
  let skipIndent = null; // inside a sequence: skip until we dedent past it

  for (const line of String(text).split(/\r?\n/)) {
    if (!line.trim()) continue;
    const lead = line.match(/^[ \t]*/)[0];
    const indent = lead.replace(/\t/g, '    ').length;
    const body = line.slice(lead.length);
    if (body.startsWith('#')) continue;

    if (skipIndent !== null) {
      if (indent >= skipIndent) continue;
      skipIndent = null;
    }
    if (body === '-' || body.startsWith('- ')) {
      skipIndent = indent;
      continue;
    }

    const m = body.match(/^("[^"]*"|'[^']*'|[^:#]+?)\s*:(?:\s+([\s\S]*))?$/);
    if (!m) continue;
    const key = unquote(m[1].trim());
    const rawValue = m[2] === undefined ? undefined : stripInlineComment(m[2]).trim();

    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
    const dotted = [...stack.map((s) => s.key), key].join('.');

    if (rawValue === undefined || rawValue === '') {
      // A bare `key:` opens a nested mapping (or an empty value — harmless).
      stack.push({ indent, key });
    } else {
      out.set(dotted, rawValue);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Stamp computation
// ---------------------------------------------------------------------------

/**
 * Read the retrieval-relevant fields out of a config file. Read-only: this opens
 * the path for reading and nothing else.
 */
function readConfigFields(configPath) {
  const text = fs.readFileSync(configPath, 'utf8');
  const scalars = extractScalars(text);
  const fields = {};
  const missing = [];
  for (const key of STAMPED_FIELDS) {
    if (scalars.has(key)) fields[key] = coerceScalar(scalars.get(key));
    else {
      fields[key] = null;
      missing.push(key);
    }
  }
  return { fields, missing };
}

/** Canonical, order-fixed serialisation of the stamped surface. */
function canonicalize(fields) {
  return JSON.stringify({
    v: STAMP_VERSION,
    fields: STAMPED_FIELDS.map((k) => [k, Object.prototype.hasOwnProperty.call(fields, k) ? fields[k] : null]),
  });
}

function computeStamp(fields) {
  return crypto.createHash('sha256').update(canonicalize(fields)).digest('hex');
}

/** Compute the stamp for a config file without touching any sidecar. */
function stampConfig(configPath) {
  const { fields, missing } = readConfigFields(configPath);
  return { stamp: computeStamp(fields), fields, missing };
}

function readStampFile(stampPath) {
  if (!fs.existsSync(stampPath)) return { present: false, reason: 'no stamp file' };
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(stampPath, 'utf8'));
  } catch (err) {
    return { present: false, reason: `stamp file is not valid JSON: ${err.message}` };
  }
  if (!parsed || typeof parsed !== 'object' || typeof parsed.stamp !== 'string') {
    return { present: false, reason: 'stamp file has no "stamp" string' };
  }
  if (!/^[0-9a-f]{64}$/.test(parsed.stamp)) {
    return { present: false, reason: 'stamp value is not a sha256 hex digest' };
  }
  return { present: true, record: parsed };
}

/**
 * Write the sidecar. Writes ONLY the sidecar — never config.yaml.
 * Call this immediately after a real index build; stamping without rebuilding
 * manufactures a false MATCH.
 */
function writeStamp(opts = {}) {
  const configPath = opts.configPath || defaultConfigPath();
  const stampPath = opts.stampPath || defaultStampPath(configPath);
  const { stamp, fields, missing } = stampConfig(configPath);
  const record = {
    version: STAMP_VERSION,
    stamp,
    fields,
    configPath,
    stampedAt: new Date().toISOString(),
  };
  fs.mkdirSync(path.dirname(stampPath), { recursive: true });
  fs.writeFileSync(stampPath, `${JSON.stringify(record, null, 2)}\n`);
  return { stampPath, stamp, fields, missing };
}

/**
 * Compare the stamp recorded beside the index against the config in force.
 * Returns { status, ok, ... }; ok is true ONLY for MATCH.
 */
function check(opts = {}) {
  const configPath = opts.configPath || defaultConfigPath();
  const stampPath = opts.stampPath || defaultStampPath(configPath);

  let current;
  try {
    current = stampConfig(configPath);
  } catch (err) {
    return {
      status: 'NO-CONFIG',
      ok: false,
      configPath,
      stampPath,
      detail: `cannot read config: ${err.message}`,
      fix: 'Point --config at the live .grepai/config.yaml for this index.',
    };
  }

  const stored = readStampFile(stampPath);
  if (!stored.present) {
    return {
      status: 'NO-STAMP',
      ok: false,
      configPath,
      stampPath,
      expected: current.stamp,
      actual: null,
      fields: current.fields,
      missingFields: current.missing,
      detail:
        `${stored.reason} — the index was built by an UNKNOWN config. ` +
        'Unknown is not clean: the vectors may or may not match the settings in force.',
      fix: 'Rebuild the index, then record the stamp: node tools/index-config-stamp.js --write',
    };
  }

  if (stored.record.stamp !== current.stamp) {
    const changed = STAMPED_FIELDS.filter((k) => {
      const was = stored.record.fields ? stored.record.fields[k] : undefined;
      return JSON.stringify(was) !== JSON.stringify(current.fields[k]);
    });
    return {
      status: 'MISMATCH',
      ok: false,
      configPath,
      stampPath,
      expected: current.stamp,
      actual: stored.record.stamp,
      fields: current.fields,
      storedFields: stored.record.fields || null,
      changedFields: changed,
      missingFields: current.missing,
      detail:
        'The index was built with DIFFERENT retrieval settings than the config in force. ' +
        'Stored vectors are not comparable to what queries now produce.',
      fix: 'Rebuild the index, then: node tools/index-config-stamp.js --write',
    };
  }

  return {
    status: 'MATCH',
    ok: true,
    configPath,
    stampPath,
    expected: current.stamp,
    actual: stored.record.stamp,
    fields: current.fields,
    missingFields: current.missing,
    detail: 'Index config stamp matches the retrieval settings in force.',
  };
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

const USAGE = `index-config-stamp — detect a semantic index built with different retrieval settings

  node tools/index-config-stamp.js [--check] [--config <path>] [--stamp <path>] [--json]
  node tools/index-config-stamp.js --write [--config <path>] [--stamp <path>] [--json]

  --check    compare the recorded stamp against the config in force (default)
  --write    record the current config's stamp beside the index (do this ONLY
             right after a real rebuild — stamping alone fakes a MATCH)
  --config   path to .grepai/config.yaml   (default: ${defaultConfigPath()})
  --stamp    path to the sidecar stamp     (default: alongside the config)
  --json     machine-readable output

Exit: 0 MATCH / 1 MISMATCH or NO-STAMP / 2 config unreadable or bad usage.
NO-STAMP is a FAILURE: an unknown build config is not a verified one.`;

function parseArgs(argv) {
  const args = { mode: 'check', configPath: null, stampPath: null, json: false, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--check') args.mode = 'check';
    else if (a === '--write') args.mode = 'write';
    else if (a === '--config') args.configPath = path.resolve(argv[++i] || '');
    else if (a === '--stamp') args.stampPath = path.resolve(argv[++i] || '');
    else if (a === '--json') args.json = true;
    else if (a === '--help' || a === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${a}`);
  }
  return args;
}

function main(argv) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (err) {
    console.error(`index-config-stamp: ${err.message}`);
    console.error(USAGE);
    return 2;
  }
  if (args.help) {
    console.log(USAGE);
    return 0;
  }

  if (args.mode === 'write') {
    let result;
    try {
      result = writeStamp(args);
    } catch (err) {
      console.error(`index-config-stamp: cannot write stamp: ${err.message}`);
      return 2;
    }
    if (args.json) console.log(JSON.stringify({ status: 'WROTE', ok: true, ...result }, null, 2));
    else {
      console.log(`index-config-stamp: WROTE ${result.stampPath}`);
      console.log(`  stamp: ${result.stamp}`);
      for (const k of STAMPED_FIELDS) console.log(`  ${k} = ${JSON.stringify(result.fields[k])}`);
      if (result.missing.length) {
        console.log(`  WARNING: absent from config: ${result.missing.join(', ')}`);
      }
    }
    return 0;
  }

  const result = check(args);
  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(`index-config-stamp: ${result.status}`);
    console.log(`  config: ${result.configPath}`);
    console.log(`  stamp file: ${result.stampPath}`);
    console.log(`  ${result.detail}`);
    if (result.changedFields && result.changedFields.length) {
      for (const k of result.changedFields) {
        const was = result.storedFields ? result.storedFields[k] : undefined;
        console.log(`  changed: ${k}: ${JSON.stringify(was)} -> ${JSON.stringify(result.fields[k])}`);
      }
    }
    if (result.missingFields && result.missingFields.length) {
      console.log(`  WARNING: absent from config: ${result.missingFields.join(', ')}`);
    }
    if (result.fix) console.log(`  fix: ${result.fix}`);
  }

  if (result.status === 'MATCH') return 0;
  if (result.status === 'NO-CONFIG') return 2;
  return 1; // MISMATCH and NO-STAMP alike: rebuild + restamp required
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = {
  STAMP_VERSION,
  STAMPED_FIELDS,
  canonicalize,
  check,
  coerceScalar,
  computeStamp,
  defaultConfigPath,
  defaultStampPath,
  extractScalars,
  main,
  readConfigFields,
  readStampFile,
  stampConfig,
  writeStamp,
};
