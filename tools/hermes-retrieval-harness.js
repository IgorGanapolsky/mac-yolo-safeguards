#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const DEFAULT_REPO = path.resolve(__dirname, '..');
const INDEX_DIR = '.rag-index';
const INDEX_FILE = 'index.jsonl';
const INDEX_VERSION = 1;

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
  'Compiled-Vaults',
  'graphify-out',
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

// ---------------------------------------------------------------------------
// CLI argument parsing
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Path safety and file classification
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Tokenization and normalization
// ---------------------------------------------------------------------------

function tokenize(value) {
  return String(value || '')
    .toLowerCase()
    .split(/[^a-z0-9_.-]+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2 && !STOP_WORDS.has(token));
}

function normalizeForHash(text) {
  return String(text)
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function contentHash(text) {
  return crypto.createHash('sha256').update(normalizeForHash(text)).digest('hex');
}

// ---------------------------------------------------------------------------
// File reading
// ---------------------------------------------------------------------------

function readTextSlice(filePath, maxBytes) {
  const stat = fs.statSync(filePath);
  const bytes = Math.min(stat.size, maxBytes);
  const fd = fs.openSync(filePath, 'r');
  const buffer = Buffer.alloc(bytes);
  fs.readSync(fd, buffer, 0, bytes, 0);
  fs.closeSync(fd);
  return buffer.toString('utf8');
}

function readTextFile(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

// ---------------------------------------------------------------------------
// Inventory (live file walk)
// ---------------------------------------------------------------------------

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
        if (!shouldIgnoreDir(entry.name) && !fs.existsSync(path.join(fullPath, '.git'))) {
          visit(fullPath);
        }
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
      mtime: stat.mtimeMs,
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

// ---------------------------------------------------------------------------
// Metadata extraction
// ---------------------------------------------------------------------------

function classifyKind(relativePath) {
  if (relativePath.includes('test') || relativePath.includes('__tests__') || relativePath.includes('spec')) {
    return 'test';
  }
  if (relativePath.includes('.claude/skills') || relativePath.includes('.cursor/skills') || relativePath.includes('.agents/skills')) {
    return 'skill';
  }
  if (relativePath.startsWith('docs/') || path.extname(relativePath) === '.md') {
    return 'doc';
  }
  if (relativePath.startsWith('config/') || relativePath.startsWith('.github/')) {
    return 'config';
  }
  return 'code';
}

function fileMetadata(relativePath, stat) {
  return {
    path: relativePath,
    extension: path.extname(relativePath) || '[none]',
    bytes: stat.size,
    mtime: stat.mtimeMs,
    kind: classifyKind(relativePath),
  };
}

// ---------------------------------------------------------------------------
// Chunking
// ---------------------------------------------------------------------------

function chunkMarkdown(text, relativePath) {
  const lines = text.split('\n');
  const chunks = [];
  let current = { start: 1, lines: [], header: '' };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
    if (headingMatch) {
      if (current.lines.length > 0) {
        chunks.push(current);
      }
      current = { start: i + 1, lines: [line], header: headingMatch[2] };
    } else {
      current.lines.push(line);
    }
  }
  if (current.lines.length > 0) {
    chunks.push(current);
  }

  return chunks.map((chunk) => ({
    parentPath: relativePath,
    startLine: chunk.start,
    endLine: chunk.start + chunk.lines.length - 1,
    text: chunk.lines.join('\n'),
    chunkType: 'markdown-section',
    header: chunk.header,
  }));
}

function chunkCode(text, relativePath) {
  const lines = text.split('\n');
  const chunks = [];
  const maxLines = 50;
  const overlap = 5;

  // Next.js / App Router convention files often have generic basenames like
  // route.ts, page.tsx, layout.tsx. Inject the parent directory name as the
  // initial header so retrieval can match the semantic surface even when the
  // file itself is named after the framework convention.
  const ext = path.extname(relativePath).toLowerCase();
  const basename = path.basename(relativePath, ext).toLowerCase();
  const genericConventionNames = ['index', 'route', 'page', 'layout', 'actions', 'handler', 'server'];
  const parentDir = path.dirname(relativePath).split('/').filter(Boolean).pop() || '';
  let lastHeader = genericConventionNames.includes(basename) && parentDir ? parentDir : '';

  // Try to split on function/class-like boundaries for supported languages.
  const boundaryRe = /^(\s*)(export\s+|function\s+|class\s+|async\s+function\s+|const\s+\w+\s*=\s*(async\s*)?\(|def\s+|class\s+)/;
  let current = { start: 1, lines: [] };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const isBoundary = boundaryRe.test(line);
    if (isBoundary && current.lines.length > 0) {
      chunks.push({ ...current, header: lastHeader });
      current = { start: i + 1, lines: [] };
    }
    if (isBoundary) {
      lastHeader = line.trim().slice(0, 120);
    }
    current.lines.push(line);
    if (current.lines.length >= maxLines) {
      chunks.push({ ...current, header: lastHeader });
      const overlapLines = current.lines.slice(-overlap);
      current = { start: i + 1 - overlap, lines: overlapLines };
    }
  }
  if (current.lines.length > 0) {
    chunks.push({ ...current, header: lastHeader });
  }

  return chunks.map((chunk) => ({
    parentPath: relativePath,
    startLine: chunk.start,
    endLine: chunk.start + chunk.lines.length - 1,
    text: chunk.lines.join('\n'),
    chunkType: 'code-block',
    header: chunk.header,
  }));
}

function chunkJsonYaml(text, relativePath) {
  const lines = text.split('\n');
  const chunks = [];
  let current = { start: 1, lines: [], header: '' };

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const topLevelMatch = line.match(/^([a-zA-Z0-9_-]+):\s*(.*)$/);
    if (topLevelMatch && current.lines.length > 0) {
      chunks.push(current);
      current = { start: i + 1, lines: [line], header: topLevelMatch[1] };
    } else {
      if (current.lines.length === 0) {
        current.start = i + 1;
      }
      current.lines.push(line);
    }
  }
  if (current.lines.length > 0) {
    chunks.push(current);
  }

  return chunks.map((chunk) => ({
    parentPath: relativePath,
    startLine: chunk.start,
    endLine: chunk.start + chunk.lines.length - 1,
    text: chunk.lines.join('\n'),
    chunkType: 'config-key',
    header: chunk.header,
  }));
}

function chunkTextFallback(text, relativePath) {
  const lines = text.split('\n');
  const maxLines = 50;
  const overlap = 5;
  const chunks = [];
  let current = { start: 1, lines: [] };

  for (let i = 0; i < lines.length; i += 1) {
    current.lines.push(lines[i]);
    if (current.lines.length >= maxLines) {
      chunks.push({ ...current });
      const overlapLines = current.lines.slice(-overlap);
      current = { start: i + 1 - overlap, lines: overlapLines };
    }
  }
  if (current.lines.length > 0) {
    chunks.push({ ...current });
  }

  return chunks.map((chunk) => ({
    parentPath: relativePath,
    startLine: chunk.start,
    endLine: chunk.start + chunk.lines.length - 1,
    text: chunk.lines.join('\n'),
    chunkType: 'text-window',
    header: '',
  }));
}

function chunkFile(text, relativePath) {
  const ext = path.extname(relativePath);
  if (ext === '.md') {
    return chunkMarkdown(text, relativePath);
  }
  if (ext === '.json' || ext === '.yaml' || ext === '.yml') {
    return chunkJsonYaml(text, relativePath);
  }
  if (['.js', '.ts', '.jsx', '.tsx', '.py', '.cjs', '.mjs'].includes(ext)) {
    return chunkCode(text, relativePath);
  }
  return chunkTextFallback(text, relativePath);
}

// ---------------------------------------------------------------------------
// Indexing
// ---------------------------------------------------------------------------

function indexDirectory(repo) {
  return path.join(repo, INDEX_DIR);
}

function indexPath(repo) {
  return path.join(indexDirectory(repo), INDEX_FILE);
}

function ensureIndexDir(repo) {
  const dir = indexDirectory(repo);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return dir;
}

function buildChunkIndex(repo, options = {}) {
  const inventory = buildInventory({ repo, maxFiles: options.maxFiles });
  const seenHashes = new Set();
  const fileEntries = [];

  for (const file of inventory.files) {
    const fullPath = path.join(repo, file.path);
    let text;
    try {
      text = readTextFile(fullPath);
    } catch (error) {
      continue;
    }
    const hash = contentHash(text);
    const chunks = chunkFile(text, file.path).map((chunk) => ({
      ...chunk,
      hash: contentHash(chunk.text),
      metadata: fileMetadata(file.path, fs.statSync(fullPath)),
    }));

    const dedupedChunks = [];
    for (const chunk of chunks) {
      if (seenHashes.has(chunk.hash)) {
        continue;
      }
      seenHashes.add(chunk.hash);
      dedupedChunks.push(chunk);
    }

    fileEntries.push({
      path: file.path,
      mtime: file.mtime,
      contentHash: hash,
      chunks: dedupedChunks,
    });
  }

  return {
    version: INDEX_VERSION,
    createdAt: new Date().toISOString(),
    repo,
    fileCount: fileEntries.length,
    chunkCount: fileEntries.reduce((sum, entry) => sum + entry.chunks.length, 0),
    files: fileEntries,
  };
}

function writeIndex(repo, index) {
  ensureIndexDir(repo);
  const filePath = indexPath(repo);
  const lines = [JSON.stringify({ type: 'indexHeader', version: index.version, createdAt: index.createdAt, repo: index.repo })];
  for (const entry of index.files) {
    lines.push(JSON.stringify({ type: 'file', ...entry }));
  }
  fs.writeFileSync(filePath, lines.join('\n') + '\n');
  return filePath;
}

function readIndex(repo) {
  const filePath = indexPath(repo);
  if (!fs.existsSync(filePath)) {
    return null;
  }
  const text = fs.readFileSync(filePath, 'utf8');
  const lines = text.split('\n').filter(Boolean);
  if (lines.length === 0) return null;
  const header = JSON.parse(lines[0]);
  if (header.type !== 'indexHeader' || header.version !== INDEX_VERSION) {
    return null;
  }
  const files = [];
  for (let i = 1; i < lines.length; i += 1) {
    const entry = JSON.parse(lines[i]);
    if (entry.type === 'file') {
      files.push(entry);
    }
  }
  return {
    version: header.version,
    createdAt: header.createdAt,
    repo: header.repo,
    files,
  };
}

function updateIndex(repo, options = {}) {
  const existing = readIndex(repo);
  const fresh = buildChunkIndex(repo, options);
  if (!existing) {
    return fresh;
  }

  // Incremental update: reuse existing entries whose mtime/contentHash match.
  const existingByPath = new Map(existing.files.map((entry) => [entry.path, entry]));
  const mergedFiles = [];
  for (const file of fresh.files) {
    const existingEntry = existingByPath.get(file.path);
    if (existingEntry && existingEntry.mtime === file.mtime && existingEntry.contentHash === file.contentHash) {
      mergedFiles.push(existingEntry);
    } else {
      mergedFiles.push(file);
    }
  }

  // Remove deleted files: any path in existing but not in fresh is dropped.
  const freshPaths = new Set(fresh.files.map((file) => file.path));
  for (const existingEntry of existing.files) {
    if (!freshPaths.has(existingEntry.path)) {
      // intentionally not included
    }
  }

  return {
    ...fresh,
    files: mergedFiles,
    chunkCount: mergedFiles.reduce((sum, entry) => sum + entry.chunks.length, 0),
  };
}

function indexCommand(repo, options = {}) {
  const index = updateIndex(repo, options);
  const writtenPath = writeIndex(repo, index);
  return { indexPath: writtenPath, ...indexStats(index) };
}

function reindexCommand(repo, options = {}) {
  const index = buildChunkIndex(repo, options);
  const writtenPath = writeIndex(repo, index);
  return { indexPath: writtenPath, ...indexStats(index) };
}

function indexStats(index) {
  return {
    version: index.version,
    createdAt: index.createdAt,
    repo: index.repo,
    fileCount: index.files.length,
    chunkCount: index.files.reduce((sum, entry) => sum + entry.chunks.length, 0),
  };
}

// ---------------------------------------------------------------------------
// Retrieval
// ---------------------------------------------------------------------------

function scoreChunk(queryTokens, chunk, fileKind = 'code') {
  const pathTokens = tokenize(chunk.parentPath);
  const headerTokens = tokenize(chunk.header);
  const textTokens = tokenize(chunk.text);
  const textSet = new Set(textTokens);
  let score = 0;
  const reasons = [];

  for (const token of queryTokens) {
    const pathHits = pathTokens.filter((pathToken) => pathToken.includes(token) || token.includes(pathToken)).length;
    if (pathHits > 0) {
      score += pathHits * 25;
      reasons.push(`path:${token}`);
    }
    const headerHits = headerTokens.filter((headerToken) => headerToken.includes(token) || token.includes(headerToken)).length;
    if (headerHits > 0) {
      score += headerHits * 8;
      reasons.push(`header:${token}`);
    }
    if (textSet.has(token)) {
      score += 4;
      reasons.push(`text:${token}`);
    } else {
      const fuzzyHits = textTokens.filter((textToken) => textToken.includes(token) || token.includes(textToken)).length;
      if (fuzzyHits > 0) {
        score += Math.min(2, fuzzyHits);
        reasons.push(`fuzzy:${token}`);
      }
    }
  }

  // Co-occurrence bonus: chunks that cover multiple query aspects are more
  // likely to be the relevant implementation surface than long documents that
  // mention each term in unrelated sections.
  const matchedTokens = queryTokens.filter(
    (token) =>
      pathTokens.some((pathToken) => pathToken.includes(token) || token.includes(pathToken)) ||
      headerTokens.some((headerToken) => headerToken.includes(token) || token.includes(headerToken)) ||
      textSet.has(token) ||
      textTokens.some((textToken) => textToken.includes(token) || token.includes(textToken)),
  );
  if (matchedTokens.length > 1) {
    score += (matchedTokens.length - 1) * 8;
  }

  // Compound-token bonus: a single run-on token like `response_feedback` or
  // `cleanFeedbackSignal` covers multiple query aspects at once, which is a
  // strong signal that the chunk is the implementation surface the query is
  // targeting.
  const textTokenSet = new Set(textTokens);
  for (const textToken of textTokenSet) {
    const matchedInToken = queryTokens.filter(
      (token) => textToken.includes(token) || token.includes(textToken),
    );
    if (matchedInToken.length >= 2) {
      score += (matchedInToken.length - 1) * 6;
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

function allChunks(repo, options = {}) {
  const index = readIndex(repo);
  if (index) {
    return index.files.flatMap((entry) => entry.chunks);
  }
  // Fallback: build an in-memory chunked index if no persisted index exists.
  return buildChunkIndex(repo, options).files.flatMap((entry) => entry.chunks);
}

function retrieve(query, options = {}) {
  const repo = path.resolve(options.repo || DEFAULT_REPO);
  const queryTokens = tokenize(query);
  if (queryTokens.length === 0) throw new Error('retrieve requires a non-empty query');
  const inventory = buildInventory(options);
  const chunks = allChunks(repo, options);
  const scoredChunks = [];

  for (const chunk of chunks) {
    const scored = scoreChunk(queryTokens, chunk, chunk.metadata ? chunk.metadata.kind : 'code');
    if (scored.score <= 0) continue;
    scoredChunks.push({
      path: chunk.parentPath,
      score: scored.score,
      reasons: scored.reasons,
      snippet: firstSnippet(chunk.text, queryTokens),
      chunk: {
        startLine: chunk.startLine,
        endLine: chunk.endLine,
        chunkType: chunk.chunkType,
        header: chunk.header,
      },
    });
  }

  // Collapse by parent path: keep only the best-scoring chunk per file so a
  // single large document cannot spam the top-k with many similar chunks.
  const bestByPath = new Map();
  for (const candidate of scoredChunks) {
    const existing = bestByPath.get(candidate.path);
    if (!existing || candidate.score > existing.score) {
      bestByPath.set(candidate.path, candidate);
    }
  }

  const matches = [...bestByPath.values()].sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));

  return {
    query,
    repo,
    fileCount: inventory.fileCount,
    chunkCount: chunks.length,
    matches: matches.slice(0, options.limit || 8),
  };
}

// ---------------------------------------------------------------------------
// Grep (literal substring, no live regex)
// ---------------------------------------------------------------------------

function escapeRegExp(string) {
  return String(string).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function grep(options = {}) {
  const repo = path.resolve(options.repo || DEFAULT_REPO);
  const pattern = String(options.pattern || '');
  if (!pattern) throw new Error('grep requires --pattern');
  const escaped = escapeRegExp(pattern);
  const re = new RegExp(escaped, 'i');
  const files = walkFiles(repo, options);
  const matches = [];
  const limit = options.limit || 50;

  for (const relativePath of files) {
    if (matches.length >= limit) break;
    const fullPath = path.join(repo, relativePath);
    let text;
    try {
      text = readTextFile(fullPath);
    } catch (error) {
      continue;
    }
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i += 1) {
      if (re.test(lines[i])) {
        matches.push({ path: relativePath, line: i + 1, text: lines[i].trim() });
        if (matches.length >= limit) break;
      }
    }
  }

  return { pattern, matches };
}

// ---------------------------------------------------------------------------
// Read file range
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// CLI entrypoint
// ---------------------------------------------------------------------------

function main() {
  const args = parseArgs();
  if (args.help) {
    console.log(`Usage: node hermes-retrieval-harness.js [command] [options]
Commands:
  inventory                 list indexed text files
  index                     build or update the .rag-index/index.jsonl
  reindex                   force a full rebuild of the index
  retrieve [query]          retrieve relevant chunks
  grep --pattern <pattern>  literal substring grep
  read --path <path>        read a file range
Options:
  --repo <path>             repository root (default: parent of this file)
  --query <query>           query for retrieve
  --pattern <pattern>       pattern for grep (literal, escaped)
  --path <path>             file path for read
  --start <n>               start line for read (default: 1)
  --end <n>                 end line for read (default: start+79)
  --limit <n>               max results for retrieve/grep (default: 8/50)
  --max-files <n>           max files to index (default: 5000)
  --json                    output JSON`);
    process.exit(0);
  }

  let output;
  switch (args.command) {
    case 'inventory': {
      output = buildInventory({ repo: args.repo, maxFiles: args.maxFiles });
      break;
    }
    case 'index': {
      output = indexCommand(args.repo, { maxFiles: args.maxFiles });
      break;
    }
    case 'reindex': {
      output = reindexCommand(args.repo, { maxFiles: args.maxFiles });
      break;
    }
    case 'retrieve': {
      if (!args.query) throw new Error('retrieve requires a query');
      output = retrieve(args.query, { repo: args.repo, limit: args.limit, maxFiles: args.maxFiles });
      break;
    }
    case 'grep': {
      output = grep({ repo: args.repo, pattern: args.pattern, limit: args.limit, maxFiles: args.maxFiles });
      break;
    }
    case 'read': {
      output = readFileRange({ repo: args.repo, path: args.path, start: args.start, end: args.end });
      break;
    }
    default:
      throw new Error(`Unknown command: ${args.command}`);
  }

  if (args.json) {
    console.log(JSON.stringify(output, null, 2));
  } else {
    console.log(JSON.stringify(output, null, 2));
  }
}

if (require.main === module) {
  main();
}

module.exports = {
  buildInventory,
  buildChunkIndex,
  chunkFile,
  contentHash,
  escapeRegExp,
  grep,
  indexCommand,
  indexStats,
  parseArgs,
  readFileRange,
  readIndex,
  reindexCommand,
  retrieve,
  safeRepoPath,
  tokenize,
  updateIndex,
  writeIndex,
};
