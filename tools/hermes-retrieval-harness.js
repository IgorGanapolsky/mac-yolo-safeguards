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
  // Vault dumps are retrieval noise — they rephrase harness docs and steal nDCG.
  'Compiled-Vaults',
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
    maxFiles: 12000,
    maxBytes: 240000,
    json: false,
    help: false,
    rewrite: false,
    pathInclude: [],
    pathExclude: [],
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
    else if (arg === '--rewrite') args.rewrite = true;
    else if (arg === '--path-include') {
      args.pathInclude = String(requireValue(argv, ++index, arg)).split(',').filter(Boolean);
    } else if (arg === '--path-exclude') {
      args.pathExclude = String(requireValue(argv, ++index, arg)).split(',').filter(Boolean);
    } else if (arg === '--help' || arg === '-h') args.help = true;
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

function tokenize(value) {
  return String(value || '')
    .toLowerCase()
    .split(/[^a-z0-9_.-]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !STOP_WORDS.has(token));
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
  const maxFiles = options.maxFiles || 12000;
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

function scoreFile(queryTokens, relativePath, text) {
  const pathTokens = tokenize(relativePath);
  const textTokens = tokenize(text);
  const textSet = new Set(textTokens);
  let score = 0;
  const reasons = [];
  const normPath = String(relativePath || '').replace(/\\/g, '/');

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

  // Prefer product route modules over tooling/docs when scores are dense —
  // but do not let generic /api/ routes outrank path-token hits on the
  // canonical tools/* or docs/HERMES-* files the query literally names.
  if (score > 0) {
    const pathTokenHits = reasons.filter((r) => r.startsWith('path:')).length;
    if (normPath.includes('/app/api/')) {
      // Soft API boost: strong only when path tokens are weak.
      score += pathTokenHits >= 2 ? 4 : 12;
      reasons.push('meta:api-route');
    } else if (normPath.includes('/app/dashboard/')) {
      score += pathTokenHits >= 2 ? 3 : 10;
      reasons.push('meta:dashboard');
    } else if (normPath.includes('/src/') || normPath.includes('/lib/')) {
      score += 4;
      reasons.push('meta:src');
    }
    // Curated ops docs + tools get a small basename agreement boost.
    if (/^docs\/HERMES-/.test(normPath) || /^tools\/hermes-/.test(normPath) || /^tools\/agent-swarm-/.test(normPath)) {
      score += 6;
      reasons.push('meta:canonical-tool-or-doc');
    }
    // Penalize tests/mocks only — curated docs/HERMES-* and docs/RESEARCH-* stay first-class.
    if (/(^|\/)(tests?|__tests__|mocks?|fixtures|testdata)\//.test(normPath) || /\.test\.|\.spec\./.test(normPath)) {
      score = Math.max(1, Math.round(score * 0.55));
      reasons.push('meta:test-penalty');
    }
  }

  return { score, reasons: [...new Set(reasons)].slice(0, 8) };
}

function firstSnippet(text, queryTokens) {
  const lines = String(text || '').split('\n');
  const matchIndex = lines.findIndex((line) => {
    const lower = line.toLowerCase();
    return queryTokens.some((token) => lower.includes(token));
  });
  if (matchIndex < 0) return lines.slice(0, 3).join(' ').replace(/\s+/g, ' ').trim().slice(0, 280);
  return lines
    .slice(Math.max(0, matchIndex - 1), Math.min(lines.length, matchIndex + 2))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 360);
}

/** Parent–child lite: score fixed line windows so large files are not one blob. */
const CHILD_WINDOW_LINES = 80;
const CHILD_WINDOW_STRIDE = 60;
const CHILD_MIN_FILE_LINES = 160;

function scoreParentChildWindows(queryTokens, relativePath, text) {
  const lines = String(text || '').split('\n');
  if (lines.length < CHILD_MIN_FILE_LINES) {
    return null;
  }
  let best = null;
  for (let start = 0; start < lines.length; start += CHILD_WINDOW_STRIDE) {
    const end = Math.min(lines.length, start + CHILD_WINDOW_LINES);
    const chunk = lines.slice(start, end).join('\n');
    const scored = scoreFile(queryTokens, relativePath, chunk);
    if (scored.score <= 0) continue;
    // Prefer denser windows slightly so parent whole-file fluff loses
    const density = scored.score / Math.max(1, end - start);
    const rankKey = scored.score * 10 + density;
    if (!best || rankKey > best.rankKey) {
      best = {
        rankKey,
        score: scored.score + 2, // small boost: precise child beat diffuse parent
        reasons: [...scored.reasons, 'parent-child-window'],
        snippet: firstSnippet(chunk, queryTokens),
        child: { startLine: start + 1, endLine: end },
      };
    }
    if (end >= lines.length) break;
  }
  return best;
}

function pathFilterOk(relativePath, options = {}) {
  const norm = String(relativePath || '').replace(/\\/g, '/');
  const include = options.pathInclude || [];
  const exclude = options.pathExclude || [];
  if (exclude.some((ex) => norm.includes(ex))) return false;
  if (include.length && !include.some((inc) => norm.includes(inc))) return false;
  return true;
}

function retrieve(query, options = {}) {
  const repo = path.resolve(options.repo || DEFAULT_REPO);
  let effectiveQuery = query;
  let rewriteMeta = null;
  if (options.rewrite) {
    try {
      // Optional dependency — dual-path also rewrites; harness can alone.
      const { rewriteQuery } = require('./retrieval-query-rewrite');
      rewriteMeta = rewriteQuery(query);
      effectiveQuery = rewriteMeta.rewritten || query;
    } catch {
      rewriteMeta = null;
    }
  }
  const queryTokens = tokenize(effectiveQuery);
  if (queryTokens.length === 0) throw new Error('retrieve requires a non-empty query');
  const inventory = buildInventory(options);
  const candidates = [];
  for (const file of inventory.files) {
    if (!pathFilterOk(file.path, options)) continue;
    const fullPath = path.join(repo, file.path);
    let text = '';
    try {
      text = readTextSlice(fullPath, options.maxBytes || 240000);
    } catch (error) {
      continue;
    }
    const parentScored = scoreFile(queryTokens, file.path, text);
    const childScored = scoreParentChildWindows(queryTokens, file.path, text);
    let chosen = null;
    if (childScored && (!parentScored.score || childScored.score >= parentScored.score)) {
      chosen = {
        path: file.path,
        score: childScored.score,
        bytes: file.bytes,
        reasons: childScored.reasons,
        snippet: childScored.snippet,
        parentPath: file.path,
        child: childScored.child,
      };
    } else if (parentScored.score > 0) {
      chosen = {
        path: file.path,
        score: parentScored.score,
        bytes: file.bytes,
        reasons: parentScored.reasons,
        snippet: firstSnippet(text, queryTokens),
      };
    }
    if (chosen) candidates.push(chosen);
  }
  candidates.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
  return {
    query,
    effectiveQuery,
    rewrite: rewriteMeta,
    repo,
    fileCount: inventory.fileCount,
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
  pathFilterOk,
  readFileRange,
  retrieve,
  safeRepoPath,
  scoreParentChildWindows,
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
