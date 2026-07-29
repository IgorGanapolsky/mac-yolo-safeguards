#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');

const DEFAULT_REPO = path.resolve(__dirname, '..');

const DEFAULT_IGNORE_DIRS = new Set([
  '.git',
  '.expo',
  '.next',
  '.turbo',
  '.worktrees',
  'android',
  'artifacts',
  'build',
  'coverage',
  'dist',
  'node_modules',
  'parallel-research',
  'Pods',
  'vendor',
]);

const TEXT_EXTENSIONS = new Set([
  '.cjs',
  '.css',
  '.html',
  '.js',
  '.json',
  '.jsx',
  '.md',
  '.mjs',
  '.py',
  '.sh',
  '.ts',
  '.tsx',
  '.txt',
  '.yaml',
  '.yml',
]);

const STOP_WORDS = new Set([
  'and',
  'are',
  'for',
  'from',
  'into',
  'not',
  'that',
  'the',
  'this',
  'with',
  'you',
]);

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    command: 'retrieve',
    query: '',
    repo: DEFAULT_REPO,
    path: '',
    pattern: '',
    start: 1,
    end: 80,
    limit: 8,
    maxFiles: 5000,
    maxBytes: 240000,
    json: false,
    help: false,
  };

  if (argv[0] && !argv[0].startsWith('--')) {
    args.command = argv.shift();
  }

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--query') args.query = requireValue(argv, ++index, arg);
    else if (arg === '--repo') args.repo = path.resolve(requireValue(argv, ++index, arg));
    else if (arg === '--path') args.path = requireValue(argv, ++index, arg);
    else if (arg === '--pattern') args.pattern = requireValue(argv, ++index, arg);
    else if (arg === '--start') args.start = Number(requireValue(argv, ++index, arg));
    else if (arg === '--end') args.end = Number(requireValue(argv, ++index, arg));
    else if (arg === '--limit') args.limit = Number(requireValue(argv, ++index, arg));
    else if (arg === '--max-files') args.maxFiles = Number(requireValue(argv, ++index, arg));
    else if (arg === '--max-bytes') args.maxBytes = Number(requireValue(argv, ++index, arg));
    else if (arg === '--json') args.json = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else if (!args.query && args.command === 'retrieve') args.query = arg;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function requireValue(argv, index, flag) {
  if (!argv[index]) throw new Error(`${flag} requires a value`);
  return argv[index];
}

function safeRepoPath(repo, relativePath) {
  const root = path.resolve(repo);
  const target = path.resolve(root, relativePath || '.');
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) {
    throw new Error(`Path escapes repo: ${relativePath}`);
  }
  return target;
}

function isTextFile(filePath) {
  return TEXT_EXTENSIONS.has(path.extname(filePath));
}

function shouldIgnoreDir(name) {
  return DEFAULT_IGNORE_DIRS.has(name);
}

function tokenize(value, options = {}) {
  // Document-side dual tokenization: every word contributes its full lowercase
  // form, and — when splitCamel is set (used for indexed path/text, NOT for
  // queries) — also its camelCase parts. "emptyStream" -> [emptystream, empty,
  // stream], so the query "empty stream" matches the identifier, while the
  // compound token is preserved for exact-match scoring. Queries are NOT
  // expanded: splitting "ThumbGate" into thumb+gate on the query side flooded
  // the ranking with every "*-gate" file in the repo and regressed the eval.
  const splitCamel = Boolean(options.splitCamel);
  const words = String(value || '').split(/[^a-zA-Z0-9_.-]+/);
  const tokens = [];
  for (const word of words) {
    if (!word) continue;
    const full = word.toLowerCase().trim();
    if (full.length >= 2 && !STOP_WORDS.has(full)) tokens.push(full);
    if (splitCamel && /[a-z][A-Z]/.test(word)) {
      for (const part of word.replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase().split(/[^a-z0-9_.-]+/)) {
        const trimmed = part.trim();
        if (trimmed.length >= 2 && trimmed !== full && !STOP_WORDS.has(trimmed)) tokens.push(trimmed);
      }
    }
  }
  return [...new Set(tokens)];
}

function readTextSlice(filePath, maxBytes) {
  const stat = fs.statSync(filePath);
  const bytes = Math.min(stat.size, maxBytes);
  const fd = fs.openSync(filePath, 'r');
  const buffer = Buffer.alloc(bytes);
  fs.readSync(fd, buffer, 0, bytes, 0);
  fs.closeSync(fd);
  return buffer.toString('utf8');
}

function walkFiles(repo, options = {}) {
  const root = path.resolve(repo);
  const maxFiles = options.maxFiles || 5000;
  const files = [];

  function visit(dir) {
    if (files.length >= maxFiles) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (error) {
      return;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (files.length >= maxFiles) return;
      if (entry.name.startsWith('.') && entry.name !== '.github') {
        if (entry.isDirectory()) continue;
      }
      const fullPath = path.join(dir, entry.name);
      const relativePath = path.relative(root, fullPath);
      if (entry.isDirectory()) {
        if (!shouldIgnoreDir(entry.name)) visit(fullPath);
      } else if (entry.isFile() && isTextFile(fullPath)) {
        files.push(relativePath);
      }
    }
  }

  visit(root);
  return files;
}

function buildInventory(options = {}) {
  const repo = path.resolve(options.repo || DEFAULT_REPO);
  const files = walkFiles(repo, options);
  const byExtension = {};
  let totalBytes = 0;
  const records = files.map((relativePath) => {
    const fullPath = path.join(repo, relativePath);
    const stat = fs.statSync(fullPath);
    const ext = path.extname(relativePath) || '[none]';
    byExtension[ext] = (byExtension[ext] || 0) + 1;
    totalBytes += stat.size;
    return {
      path: relativePath,
      bytes: stat.size,
      extension: ext,
    };
  });
  return {
    repo,
    fileCount: records.length,
    totalBytes,
    byExtension,
    files: records,
  };
}

function pathQualityMultiplier(relativePath) {
  // Mirror .grepai path boosts/penalties so production routes beat test clones of
  // the same tokens (e.g. ThumbGatePromoCard.test vs app/api/lessons/route).
  // Measured 2026-07-29: lessons-feedback fixture failed because k=10 was filled
  // with __tests__ / PromoCard hits (path:thumbgate + path:thumbs) while the API
  // route ranked #20.
  const p = String(relativePath || '').replace(/\\/g, '/');
  let m = 1;
  if (
    /\/__tests__\/|\/tests\/|\/test\/|\.test\.|\.spec\.|\/mocks?\/|\/fixtures?\/|\/testdata\//i.test(
      p,
    )
  ) {
    m *= 0.45;
  }
  if (/\/generated\/|\.generated\.|\.gen\./i.test(p)) m *= 0.4;
  // Do NOT penalize docs/ — several golden queries require docs/HERMES-*.md
  // (cloud-failover, hardware-leash). Test noise is the real problem.
  if (/\/(src|lib|app)\//i.test(p) || /\/app\/api\//i.test(p)) m *= 1.15;
  return m;
}

function scoreFile(queryTokens, relativePath, text) {
  const pathTokens = tokenize(relativePath, { splitCamel: true });
  const textTokens = tokenize(text, { splitCamel: true });
  const textSet = new Set(textTokens);
  let score = 0;
  const reasons = [];

  for (const token of queryTokens) {
    const pathHits = pathTokens.filter((pathToken) => pathToken.includes(token) || token.includes(pathToken)).length;
    if (pathHits > 0) {
      score += pathHits * 8;
      reasons.push(`path:${token}`);
    }
    if (textSet.has(token)) {
      score += 4;
      reasons.push(`text:${token}`);
    } else {
      const fuzzyHits = textTokens.filter((textToken) => textToken.includes(token) || token.includes(textToken)).length;
      if (fuzzyHits > 0) {
        score += Math.min(3, fuzzyHits);
        reasons.push(`fuzzy:${token}`);
      }
    }
  }

  // Compound path tokens: query bigrams that appear joined in the path
  // (hardware+leash → hardware-leash, cloud+failover → CLOUD-FAILOVER).
  // This lifts canonical docs/tools over adjacent-but-generic hits without
  // special-casing product names. Measured 2026-07-29 on hardware-leash MRR.
  const pathLower = String(relativePath || '').toLowerCase().replace(/\\/g, '/');
  let compounds = 0;
  for (let i = 0; i < queryTokens.length - 1; i += 1) {
    const a = queryTokens[i];
    const b = queryTokens[i + 1];
    if (a.length < 3 || b.length < 3) continue;
    if (
      pathLower.includes(`${a}-${b}`) ||
      pathLower.includes(`${a}_${b}`) ||
      pathLower.includes(`${a}${b}`)
    ) {
      compounds += 1;
      score += 22;
    }
  }
  if (compounds > 0) reasons.push(`compound:${compounds}`);

  // Exact directory/basename segment equality (not substring) for non-test paths.
  const segments = pathLower
    .split('/')
    .flatMap((seg) => tokenize(seg.replace(/\.[^.]+$/, ''), { splitCamel: true }));
  const segmentSet = new Set(segments);
  let segmentHits = 0;
  for (const token of queryTokens) {
    if (segmentSet.has(token)) {
      segmentHits += 1;
      score += 6;
    }
  }
  if (segmentHits > 0) reasons.push(`segment:${segmentHits}`);

  const mult = pathQualityMultiplier(relativePath);
  if (mult !== 1 && score > 0) {
    score = Math.max(1, Math.round(score * mult));
    reasons.push(mult < 1 ? `penalty:path×${mult}` : `boost:path×${mult}`);
  }

  return { score, reasons: [...new Set(reasons)].slice(0, 8) };
}

function firstSnippet(text, queryTokens) {
  // Best-window snippet: instead of the FIRST line containing any query token
  // (which favors imports/headers), slide a 3-line window and return the one
  // covering the most DISTINCT query tokens. Ties resolve to the earliest
  // window, preserving the old behavior when all windows are equal.
  const lines = String(text || '').split('\n');
  const lowered = lines.map((line) => line.toLowerCase());
  let bestIndex = -1;
  let bestCoverage = 0;
  for (let index = 0; index < lowered.length; index += 1) {
    const windowText = lowered.slice(Math.max(0, index - 1), Math.min(lowered.length, index + 2)).join('\n');
    let coverage = 0;
    for (const token of queryTokens) {
      if (windowText.includes(token)) coverage += 1;
    }
    if (coverage > bestCoverage) {
      bestCoverage = coverage;
      bestIndex = index;
      if (coverage === queryTokens.length) break;
    }
  }
  if (bestIndex < 0) return lines.slice(0, 3).join(' ').replace(/\s+/g, ' ').trim().slice(0, 280);
  return lines
    .slice(Math.max(0, bestIndex - 1), Math.min(lines.length, bestIndex + 2))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 360);
}

function retrieve(query, options = {}) {
  const repo = path.resolve(options.repo || DEFAULT_REPO);
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) throw new Error('retrieve requires a non-empty query');
  const inventory = buildInventory(options);
  const candidates = [];
  for (const file of inventory.files) {
    const fullPath = path.join(repo, file.path);
    let text = '';
    try {
      text = readTextSlice(fullPath, options.maxBytes || 240000);
    } catch (error) {
      continue;
    }
    const scored = scoreFile(queryTokens, file.path, text);
    if (scored.score <= 0) continue;
    candidates.push({
      path: file.path,
      score: scored.score,
      bytes: file.bytes,
      reasons: scored.reasons,
      snippet: firstSnippet(text, queryTokens),
    });
  }
  candidates.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
  const maxFiles = options.maxFiles || 5000;
  const capReached = inventory.fileCount >= maxFiles;
  const capNear = !capReached && inventory.fileCount >= Math.floor(maxFiles * 0.9);
  if (capReached || capNear) {
    // Silent truncation is how retrieval quality degrades without anyone
    // noticing; surface it on stderr so logs catch it before users do.
    process.stderr.write(
      `[hermes-retrieval-harness] WARNING: corpus ${inventory.fileCount} files is ${
        capReached ? 'AT' : 'within 10% of'
      } the maxFiles cap (${maxFiles}); files beyond the cap are invisible to retrieval. Raise --max-files.\n`,
    );
  }
  return {
    query,
    repo,
    fileCount: inventory.fileCount,
    maxFiles,
    capReached,
    capNear,
    matches: candidates.slice(0, options.limit || 8),
  };
}

function readFileRange(options = {}) {
  const repo = path.resolve(options.repo || DEFAULT_REPO);
  if (!options.path) throw new Error('read requires --path');
  const fullPath = safeRepoPath(repo, options.path);
  if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
    throw new Error(`File not found: ${options.path}`);
  }
  if (!isTextFile(fullPath)) throw new Error(`Refusing non-text file: ${options.path}`);
  const lines = fs.readFileSync(fullPath, 'utf8').split('\n');
  const start = Math.max(1, Number(options.start) || 1);
  const end = Math.min(lines.length, Math.max(start, Number(options.end) || start + 79));
  return {
    path: path.relative(repo, fullPath),
    start,
    end,
    totalLines: lines.length,
    text: lines.slice(start - 1, end).map((line, index) => `${start + index}: ${line}`).join('\n'),
  };
}

// `--pattern` is command-line-argument-controlled (untrusted per CodeQL
// js/regex-injection, CWE-400/730). A prior fix (PR #880) tried to keep
// `--pattern` as a live, unescaped regex and only bound the blast radius
// (length cap + a catastrophic-backtracking-shape heuristic). CodeQL still
// flagged it, correctly: those are runtime guards, not a taint-clearing
// sanitizer, and the heuristic can't catch every ReDoS shape anyway.
// The actual fix: escape regex metacharacters before the string ever reaches
// `new RegExp(...)`, so `grep --pattern` is a safe, case-insensitive literal
// substring search. No metacharacters survive escaping, so no pattern —
// however long or adversarial — can trigger catastrophic backtracking.
// (No repo caller currently passes real regex syntax to this command; the
// documented example in docs/HERMES-RETRIEVAL-HARNESS.md is a literal phrase.)
const MAX_GREP_PATTERN_LENGTH = 500;

function escapeRegExp(rawString) {
  return String(rawString).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function assertSafeGrepPattern(rawPattern) {
  if (rawPattern.length > MAX_GREP_PATTERN_LENGTH) {
    throw new Error(
      `Pattern too long (${rawPattern.length} chars, max ${MAX_GREP_PATTERN_LENGTH}) — refusing to construct RegExp.`,
    );
  }
}

function grep(options = {}) {
  const repo = path.resolve(options.repo || DEFAULT_REPO);
  if (!options.pattern) throw new Error('grep requires --pattern');
  assertSafeGrepPattern(options.pattern);
  let pattern;
  try {
    pattern = new RegExp(escapeRegExp(options.pattern), 'i');
  } catch (error) {
    throw new Error(`Invalid --pattern: ${error.message}`);
  }
  const inventory = buildInventory(options);
  const matches = [];
  try {
    for (const file of inventory.files) {
      const fullPath = path.join(repo, file.path);
      let lines;
      try {
        lines = fs.readFileSync(fullPath, 'utf8').split('\n');
      } catch (error) {
        continue;
      }
      for (let index = 0; index < lines.length; index += 1) {
        if (!pattern.test(lines[index])) continue;
        matches.push({
          path: file.path,
          line: index + 1,
          text: lines[index].trim().slice(0, 360),
        });
        if (matches.length >= (options.limit || 20)) {
          return { pattern: options.pattern, repo, matches };
        }
      }
    }
  } catch (error) {
    throw new Error(`grep failed while applying --pattern: ${error.message}`);
  }
  return { pattern: options.pattern, repo, matches };
}

function render(result) {
  if (result.matches) {
    const lines = [`# Hermes Retrieval`, '', `Query: ${result.query || result.pattern || ''}`, `Matches: ${result.matches.length}`, ''];
    for (const match of result.matches) {
      lines.push(`- ${match.path}${match.line ? `:${match.line}` : ''} score=${match.score || 'match'}`);
      if (match.snippet || match.text) lines.push(`  ${match.snippet || match.text}`);
    }
    return `${lines.join('\n')}\n`;
  }
  if (result.files) {
    return `# Hermes Retrieval Inventory\n\nFiles: ${result.fileCount}\nBytes: ${result.totalBytes}\n`;
  }
  return result.text || JSON.stringify(result, null, 2);
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (args.help) {
    console.log('Usage: node tools/hermes-retrieval-harness.js [inventory|retrieve|read|grep] [options]');
    return null;
  }

  let result;
  if (args.command === 'inventory') result = buildInventory(args);
  else if (args.command === 'retrieve') result = retrieve(args.query, args);
  else if (args.command === 'read') result = readFileRange(args);
  else if (args.command === 'grep') result = grep(args);
  else throw new Error(`Unknown command: ${args.command}`);

  if (args.json) console.log(JSON.stringify(result, null, 2));
  else process.stdout.write(render(result));
  return result;
}

module.exports = {
  TEXT_EXTENSIONS,
  buildInventory,
  escapeRegExp,
  grep,
  main,
  parseArgs,
  readFileRange,
  retrieve,
  safeRepoPath,
  tokenize,
  walkFiles,
};

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message || error);
    process.exit(1);
  }
}
