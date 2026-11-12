#!/usr/bin/env node
'use strict';
/**
 * Finds API keys, tokens and passwords that leaked into the session transcripts coding agents
 * keep on disk (Claude Code, OMP, Grok), and blanks them out on request.
 *
 *   node tools/mac-yolo-secret-scan.js scan   [--since-days N]            (default 30)
 *   node tools/mac-yolo-secret-scan.js redact <file> | --all [--since-days N]
 *
 * Every command prints one JSON object. A finding is reported as kind + line number + a
 * fingerprint (first 4 characters, an ellipsis, first 8 hex of the sha256); never the value.
 * Files are read and rewritten as latin1 so every byte outside a secret is preserved exactly.
 * Redaction skips files touched in the last 2 minutes (a live session may be appending),
 * writes a temp file next to the original, fsyncs it, then renames it over the original.
 * Symlinks are never followed out of the scanned roots.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');

const MAX_FILE_BYTES = 200 * 1024 * 1024;
const MIN_AGE_MS = 2 * 60 * 1000;
const MAX_LISTED_PER_FILE = 100;
const CHUNK = 1024 * 1024;
const DEFAULT_DAYS = 30;

function homeDir() { return process.env.MAC_YOLO_HOME || os.homedir(); }

function roots(home) {
  return [
    { dir: path.join(home, '.claude', 'projects'), exts: ['.jsonl'] },
    { dir: path.join(home, '.omp', 'agent', 'sessions'), exts: ['.jsonl'] },
    { dir: path.join(home, '.grok'), exts: ['.jsonl', '.json', '.log', '.ndjson'] },
  ];
}

// Every pattern is linear-time: single bounded character classes, no nested or overlapping
// quantifiers. `group` (when set) is the capture that holds the secret; otherwise the whole match.
const PATTERNS = [
  { kind: 'anthropic-key', re: /(?<![A-Za-z0-9])sk-ant-[A-Za-z0-9_-]{20,}/g },
  { kind: 'openai-key', re: /(?<![A-Za-z0-9])sk-(?!ant-)(?:proj-)?[A-Za-z0-9_-]{32,}/g },
  { kind: 'github-token', re: /(?<![A-Za-z0-9])(?:gh[pos]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{22,})/g },
  { kind: 'stripe-key', re: /(?<![A-Za-z0-9])(?:[sr]k_live_[A-Za-z0-9]{16,}|whsec_[A-Za-z0-9]{16,})/g },
  { kind: 'aws-access-key', re: /(?<![A-Z0-9])AKIA[0-9A-Z]{16}(?![A-Z0-9])/g },
  { kind: 'google-api-key', re: /(?<![A-Za-z0-9])AIza[0-9A-Za-z_-]{35}/g },
  { kind: 'slack-token', re: /(?<![A-Za-z0-9])xox[baprs]-[A-Za-z0-9-]{10,}/g },
  { kind: 'private-key', re: /-----BEGIN [A-Z ]{0,30}PRIVATE KEY-----(?:[^-]{0,8000}-----END [A-Z ]{0,30}PRIVATE KEY-----)?/g },
  // The key is literally password/passwd/secret/api_key/token; the value is one unbroken run of
  // 8-300 characters. JSONL stores quotes escaped (\"), so up to two backslashes are tolerated.
  { kind: 'password-assignment', group: 1, re: /(?<![A-Za-z0-9_])(?:password|passwd|secret|api_key|token)\\{0,2}"?[ \t]{0,20}[:=][ \t]{0,20}\\{0,2}"([^"\\\s]{8,300})(?=\\{0,2}")/gd },
];

const SPECIFICITY = new Map(PATTERNS.map((p, i) => [p.kind, i]));

function fingerprint(value) {
  return value.slice(0, 4) + '\u2026' + crypto.createHash('sha256').update(value, 'latin1').digest('hex').slice(0, 8);
}

/** Non-overlapping secrets in one line: [{kind, start, end}] sorted by start. */
function findInLine(line) {
  if (line.length < 8) return [];
  const all = [];
  for (const p of PATTERNS) {
    p.re.lastIndex = 0;
    let m;
    while ((m = p.re.exec(line)) !== null) {
      let start = m.index;
      let end = m.index + m[0].length;
      if (p.group) {
        const span = m.indices && m.indices[p.group];
        if (!span) continue;
        [start, end] = span;
        if (line.startsWith('[REDACTED:', start)) continue;
      }
      all.push({ kind: p.kind, start, end });
      if (m[0].length === 0) p.re.lastIndex++;
    }
  }
  all.sort((a, b) => a.start - b.start || SPECIFICITY.get(a.kind) - SPECIFICITY.get(b.kind) || b.end - a.end);
  const out = [];
  let last = -1;
  for (const f of all) {
    if (f.start >= last) { out.push(f); last = f.end; }
  }
  return out;
}

function redactLine(line) {
  const found = findInLine(line);
  if (!found.length) return { text: line, found };
  let text = '';
  let pos = 0;
  for (const f of found) {
    text += line.slice(pos, f.start) + `[REDACTED:${f.kind}]`;
    pos = f.end;
  }
  return { text: text + line.slice(pos), found };
}

/** Calls onLine(latin1String, lineNumber, hasNewline) for each line of a file, streaming. */
function forEachLine(file, onLine) {
  const fd = fs.openSync(file, 'r');
  try {
    const buf = Buffer.allocUnsafe(CHUNK);
    let carry = '';
    let n = 0;
    let read;
    while ((read = fs.readSync(fd, buf, 0, CHUNK, null)) > 0) {
      const parts = (carry + buf.latin1Slice(0, read)).split('\n');
      carry = parts.pop();
      for (const part of parts) onLine(part, ++n, true);
    }
    if (carry.length) onLine(carry, ++n, false);
  } finally {
    fs.closeSync(fd);
  }
}

function tilde(p, home) {
  try { const real = fs.realpathSync(home); if (p.startsWith(real + path.sep)) home = real; } catch { /* keep home */ }
  return p === home ? '~' : p.startsWith(home + path.sep) ? '~' + p.slice(home.length) : p;
}

function realRoots(home) {
  const out = [];
  for (const r of roots(home)) {
    try { out.push({ dir: fs.realpathSync(r.dir), exts: r.exts }); } catch { /* root absent */ }
  }
  return out;
}

/** Regular files under the roots modified within the window. Symlinks are skipped, never followed. */
function collectFiles(home, sinceDays, now = Date.now()) {
  const cutoff = now - sinceDays * 86400000;
  const files = [];
  const skippedLarge = [];
  for (const root of realRoots(home)) {
    const stack = [root.dir];
    while (stack.length) {
      const dir = stack.pop();
      let entries;
      try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
      for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isSymbolicLink()) continue;
        if (e.isDirectory()) { stack.push(full); continue; }
        if (!e.isFile() || !root.exts.includes(path.extname(e.name))) continue;
        let st;
        try { st = fs.lstatSync(full); } catch { continue; }
        if (st.mtimeMs < cutoff) continue;
        if (st.size > MAX_FILE_BYTES) { skippedLarge.push(full); continue; }
        files.push(full);
      }
    }
  }
  files.sort();
  return { files, skippedLarge };
}

function scanFile(file) {
  const counts = {};
  const findings = [];
  let total = 0;
  forEachLine(file, (line, n) => {
    for (const f of findInLine(line)) {
      counts[f.kind] = (counts[f.kind] || 0) + 1;
      total++;
      if (findings.length < MAX_LISTED_PER_FILE) {
        findings.push({ kind: f.kind, line: n, fingerprint: fingerprint(line.slice(f.start, f.end)) });
      }
    }
  });
  return { counts, total, findings };
}

function parseDays(argv) {
  const i = argv.indexOf('--since-days');
  if (i === -1) return DEFAULT_DAYS;
  const n = Number(argv[i + 1]);
  if (!Number.isFinite(n) || n <= 0) throw new Error('--since-days needs a positive number');
  return n;
}

function scan(home, sinceDays) {
  const started = Date.now();
  const { files, skippedLarge } = collectFiles(home, sinceDays);
  const result = [];
  const byKind = {};
  let secrets = 0;
  for (const file of files) {
    let r;
    try { r = scanFile(file); } catch (err) { result.push({ file: tilde(file, home), error: err.code || 'read-failed' }); continue; }
    if (!r.total) continue;
    secrets += r.total;
    for (const [k, v] of Object.entries(r.counts)) byKind[k] = (byKind[k] || 0) + v;
    result.push({
      file: tilde(file, home), counts: r.counts, total: r.total, findings: r.findings,
      truncated: r.total > r.findings.length,
    });
  }
  return {
    ok: true,
    sinceDays,
    totals: {
      filesScanned: files.length,
      filesWithSecrets: result.filter((f) => f.total).length,
      secrets,
      byKind,
      skippedTooLarge: skippedLarge.map((f) => tilde(f, home)),
    },
    files: result,
    elapsedMs: Date.now() - started,
  };
}

/** Rewrites one file with every secret blanked. Returns {status, redacted?}. */
function redactFile(file, now = Date.now()) {
  const st = fs.lstatSync(file);
  if (!st.isFile()) return { status: 'skipped', reason: 'not-a-regular-file' };
  if (st.size > MAX_FILE_BYTES) return { status: 'skipped', reason: 'too-large' };
  if (now - st.mtimeMs < MIN_AGE_MS) return { status: 'skipped', reason: 'modified-in-last-2-minutes' };
  if (!scanFile(file).total) return { status: 'clean', redacted: 0 };

  const tmp = path.join(path.dirname(file), `.${path.basename(file)}.redact-${process.pid}-${crypto.randomBytes(4).toString('hex')}`);
  const out = fs.openSync(tmp, 'wx', st.mode & 0o7777);
  let redacted = 0;
  const counts = {};
  try {
    let pending = [];
    let size = 0;
    const flush = () => {
      if (pending.length) fs.writeSync(out, Buffer.from(pending.join(''), 'latin1'));
      pending = [];
      size = 0;
    };
    forEachLine(file, (line, n, nl) => {
      const r = redactLine(line);
      for (const f of r.found) { redacted++; counts[f.kind] = (counts[f.kind] || 0) + 1; }
      const piece = nl ? r.text + '\n' : r.text;
      pending.push(piece);
      size += piece.length;
      if (size > CHUNK) flush();
    });
    flush();
    fs.fchmodSync(out, st.mode & 0o7777);
    fs.fsyncSync(out);
    fs.closeSync(out);
    // A session may have started appending while we worked: leave the original alone then.
    const after = fs.lstatSync(file);
    if (after.size !== st.size || after.mtimeMs !== st.mtimeMs || after.ino !== st.ino) {
      fs.unlinkSync(tmp);
      return { status: 'skipped', reason: 'changed-while-redacting' };
    }
    fs.utimesSync(tmp, st.atime, st.mtime);
    fs.renameSync(tmp, file);
  } catch (err) {
    try { fs.closeSync(out); } catch { /* already closed */ }
    try { fs.unlinkSync(tmp); } catch { /* already gone */ }
    throw err;
  }
  return { status: 'redacted', redacted, counts };
}

function insideRoots(file, home) {
  let real;
  try { real = fs.realpathSync(file); } catch { return false; }
  return realRoots(home).some((r) => real === r.dir || real.startsWith(r.dir + path.sep));
}

function redact(home, argv) {
  const started = Date.now();
  const sinceDays = parseDays(argv);
  const target = argv.find((a, i) => !a.startsWith('--') && argv[i - 1] !== '--since-days');
  let files;
  if (argv.includes('--all')) files = collectFiles(home, sinceDays).files;
  else if (target) {
    const abs = path.resolve(target.replace(/^~(?=\/|$)/, home));
    if (!insideRoots(abs, home) || fs.lstatSync(abs).isSymbolicLink()) {
      return { ok: false, error: 'file is not a transcript under the scanned folders' };
    }
    files = [abs];
  } else return { ok: false, error: 'usage: redact <file> | --all [--since-days N]' };

  const changed = [];
  const skipped = [];
  const errors = [];
  let total = 0;
  for (const file of files) {
    try {
      const r = redactFile(file);
      if (r.status === 'redacted') { changed.push({ file: tilde(file, home), redacted: r.redacted, counts: r.counts }); total += r.redacted; }
      else if (r.status === 'skipped') skipped.push({ file: tilde(file, home), reason: r.reason });
    } catch (err) { errors.push({ file: tilde(file, home), error: err.code || 'redact-failed' }); }
  }
  return { ok: errors.length === 0, redacted: total, filesChanged: changed.length, changed, skipped, errors, elapsedMs: Date.now() - started };
}

function main(argv) {
  const [cmd, ...rest] = argv;
  const home = homeDir();
  try {
    if (cmd === 'scan') console.log(JSON.stringify(scan(home, parseDays(rest))));
    else if (cmd === 'redact') {
      const r = redact(home, rest);
      console.log(JSON.stringify(r));
      if (!r.ok) process.exitCode = 1;
    } else {
      console.log(JSON.stringify({ ok: false, error: 'usage: scan [--since-days N] | redact <file>|--all [--since-days N]' }));
      process.exitCode = 2;
    }
  } catch (err) {
    console.log(JSON.stringify({ ok: false, error: String(err.message || err) }));
    process.exitCode = 1;
  }
}

if (require.main === module) main(process.argv.slice(2));

module.exports = { PATTERNS, fingerprint, findInLine, redactLine, collectFiles, scanFile, scan, redactFile, redact, MIN_AGE_MS };
