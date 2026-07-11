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

function scoreFile(queryTokens, relativePath, text) {
  const pathTokens = tokenize(relativePath);
  const textTokens = tokenize(text);
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

  return { score, reasons: [...new Set(reasons)].slice(0, 6) };
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
  return {
    query,
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

function grep(options = {}) {
  const repo = path.resolve(options.repo || DEFAULT_REPO);
  if (!options.pattern) throw new Error('grep requires --pattern');
  const pattern = new RegExp(options.pattern, 'i');
  const inventory = buildInventory(options);
  const matches = [];
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
