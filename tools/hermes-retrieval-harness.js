#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const DEFAULT_REPO = path.resolve(__dirname, '..');
const DEFAULT_ROOTS = [
  'AGENTS.md',
  'CLAUDE.md',
  'GEMINI.md',
  'README.md',
  'plan.md',
  'docs',
  'tools',
  'tests',
  'hermes-mobile/AGENTS.md',
  'hermes-mobile/docs',
  'services/hermes-relay/README.md',
];

const DEFAULT_IGNORE_DIRS = new Set([
  '.git',
  '.graphify-venv',
  'node_modules',
  '.expo',
  '.bundle-export',
  'build',
  'dist',
  'coverage',
  'Pods',
  'android',
  'ios',
  'business_os',
  'Compiled-Vaults',
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
  '.plist',
  '.py',
  '.rb',
  '.sh',
  '.toml',
  '.ts',
  '.tsx',
  '.txt',
  '.yaml',
  '.yml',
]);

const TEXT_BASENAMES = new Set([
  'AGENTS.md',
  'CLAUDE.md',
  'GEMINI.md',
  'README',
  'README.md',
  'Makefile',
]);

const SECRET_PATTERNS = [
  { label: 'github-token', regex: /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g },
  { label: 'api-key', regex: /\b(?:sk|rk|pk|xai|or)-[A-Za-z0-9][A-Za-z0-9_-]{18,}\b/g },
  { label: 'bearer-token', regex: /\bBearer\s+[A-Za-z0-9._~+/=-]{20,}\b/gi },
  { label: 'slack-token', regex: /\bxox[baprs]-[A-Za-z0-9-]{20,}\b/g },
  { label: 'jwt', regex: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g },
];

const STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'be',
  'by',
  'for',
  'from',
  'how',
  'in',
  'into',
  'is',
  'it',
  'of',
  'on',
  'or',
  'our',
  'that',
  'the',
  'this',
  'to',
  'with',
]);

function usage() {
  return `Usage:
  node tools/hermes-retrieval-harness.js inventory [--json] [--repo PATH]
  node tools/hermes-retrieval-harness.js find --contains TEXT [--json]
  node tools/hermes-retrieval-harness.js retrieve --query TEXT [--top-k N] [--json]
  node tools/hermes-retrieval-harness.js read --file PATH [--line N] [--max-lines N] [--json]
  node tools/hermes-retrieval-harness.js grep --file PATH --pattern REGEX [--context-chars N] [--json]

Local legal-kb-style retrieval harness for Hermes:
1. inventory/find files first
2. retrieve likely evidence
3. read or grep exact text before citing

No cloud upload, no external indexing service, and all returned text is redacted.`;
}

function requireValue(argv, index, flag) {
  if (!argv[index]) throw new Error(`${flag} requires a value`);
  return argv[index];
}

function parseArgs(argv) {
  const args = {
    command: '',
    repo: DEFAULT_REPO,
    roots: DEFAULT_ROOTS,
    json: false,
    help: false,
    contains: '',
    name: '',
    file: '',
    query: '',
    pattern: '',
    topK: 8,
    limit: 40,
    line: 1,
    maxLines: 40,
    offset: null,
    maxLength: 4000,
    contextChars: 120,
    chunkLines: 36,
    strideLines: 18,
    maxFileBytes: 700_000,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!args.command && !arg.startsWith('-')) args.command = arg;
    else if (arg === '--repo') args.repo = path.resolve(requireValue(argv, ++i, arg));
    else if (arg === '--root' || arg === '--roots') args.roots = requireValue(argv, ++i, arg).split(',').map((item) => item.trim()).filter(Boolean);
    else if (arg === '--json') args.json = true;
    else if (arg === '--contains') args.contains = requireValue(argv, ++i, arg);
    else if (arg === '--name') args.name = requireValue(argv, ++i, arg);
    else if (arg === '--file') args.file = requireValue(argv, ++i, arg);
    else if (arg === '--query') args.query = requireValue(argv, ++i, arg);
    else if (arg === '--pattern') args.pattern = requireValue(argv, ++i, arg);
    else if (arg === '--top-k') args.topK = Number(requireValue(argv, ++i, arg));
    else if (arg === '--limit') args.limit = Number(requireValue(argv, ++i, arg));
    else if (arg === '--line') args.line = Number(requireValue(argv, ++i, arg));
    else if (arg === '--max-lines') args.maxLines = Number(requireValue(argv, ++i, arg));
    else if (arg === '--offset') args.offset = Number(requireValue(argv, ++i, arg));
    else if (arg === '--max-length') args.maxLength = Number(requireValue(argv, ++i, arg));
    else if (arg === '--context-chars') args.contextChars = Number(requireValue(argv, ++i, arg));
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (!args.command) args.command = 'inventory';
  for (const key of ['topK', 'limit', 'line', 'maxLines', 'maxLength', 'contextChars', 'chunkLines', 'strideLines', 'maxFileBytes']) {
    if (!Number.isFinite(args[key]) || args[key] < 0) throw new Error(`${key} must be a non-negative number`);
  }
  if (args.topK === 0) args.topK = 1;
  if (args.limit === 0) args.limit = 1;
  if (args.maxLines === 0) args.maxLines = 1;
  if (args.maxLength === 0) args.maxLength = 1;
  return args;
}

function sha256(text) {
  return crypto.createHash('sha256').update(text).digest('hex');
}

function redact(text) {
  let output = String(text || '');
  for (const pattern of SECRET_PATTERNS) {
    output = output.replace(pattern.regex, `[REDACTED:${pattern.label}]`);
  }
  return output;
}

function toRepoRelative(repo, filePath) {
  const relative = path.relative(repo, filePath).split(path.sep).join('/');
  return relative || '.';
}

function resolveInsideRepo(repo, maybeRelative) {
  const candidate = path.isAbsolute(maybeRelative)
    ? path.resolve(maybeRelative)
    : path.resolve(repo, maybeRelative);
  const root = path.resolve(repo);
  if (candidate !== root && !candidate.startsWith(`${root}${path.sep}`)) {
    throw new Error(`Path escapes repo: ${maybeRelative}`);
  }
  return candidate;
}

function isIgnoredRelative(relativePath) {
  return relativePath.split('/').some((part) => DEFAULT_IGNORE_DIRS.has(part));
}

function looksTextual(buffer) {
  if (!buffer || buffer.length === 0) return true;
  const sample = buffer.subarray(0, Math.min(buffer.length, 2048));
  return !sample.includes(0);
}

function isTextFile(filePath, stat) {
  if (!stat || !stat.isFile()) return false;
  if (stat.size > 10 * 1024 * 1024) return false;
  const ext = path.extname(filePath);
  const base = path.basename(filePath);
  if (TEXT_EXTENSIONS.has(ext) || TEXT_BASENAMES.has(base)) return true;
  try {
    const fd = fs.openSync(filePath, 'r');
    const buffer = Buffer.alloc(Math.min(stat.size, 2048));
    fs.readSync(fd, buffer, 0, buffer.length, 0);
    fs.closeSync(fd);
    return looksTextual(buffer);
  } catch (_) {
    return false;
  }
}

function walk(repo, startPath, out) {
  const relative = toRepoRelative(repo, startPath);
  if (isIgnoredRelative(relative)) return;
  let stat;
  try {
    stat = fs.statSync(startPath);
  } catch (_) {
    return;
  }
  if (stat.isFile()) {
    if (isTextFile(startPath, stat)) out.push(startPath);
    return;
  }
  if (!stat.isDirectory()) return;
  const entries = fs.readdirSync(startPath, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name));
  for (const entry of entries) {
    if (entry.isDirectory() && DEFAULT_IGNORE_DIRS.has(entry.name)) continue;
    walk(repo, path.join(startPath, entry.name), out);
  }
}

function readMaybe(filePath, maxFileBytes) {
  const stat = fs.statSync(filePath);
  if (!stat.isFile() || stat.size > maxFileBytes) return null;
  const buffer = fs.readFileSync(filePath);
  if (!looksTextual(buffer)) return null;
  const rawText = buffer.toString('utf8');
  return {
    rawText,
    text: redact(rawText),
    sizeBytes: stat.size,
    mtime: stat.mtime.toISOString(),
    sha256: sha256(rawText),
  };
}

function buildInventory(options = {}) {
  const repo = path.resolve(options.repo || DEFAULT_REPO);
  const roots = options.roots || DEFAULT_ROOTS;
  const maxFileBytes = options.maxFileBytes || 700_000;
  const files = [];
  for (const root of roots) {
    const fullPath = resolveInsideRepo(repo, root);
    walk(repo, fullPath, files);
  }
  const seen = new Set();
  const records = [];
  for (const filePath of files) {
    const relativePath = toRepoRelative(repo, filePath);
    if (seen.has(relativePath) || isIgnoredRelative(relativePath)) continue;
    seen.add(relativePath);
    let read;
    try {
      read = readMaybe(filePath, maxFileBytes);
    } catch (_) {
      read = null;
    }
    if (!read) continue;
    records.push({
      path: relativePath,
      fileName: path.basename(relativePath),
      extension: path.extname(relativePath),
      bytes: read.sizeBytes,
      mtime: read.mtime,
      sha256: read.sha256,
      lineCount: read.text.split(/\r?\n/).length,
    });
  }
  records.sort((a, b) => a.path.localeCompare(b.path));
  return {
    schema: 'hermes-retrieval-inventory/v1',
    checkedAt: new Date().toISOString(),
    repo,
    roots,
    fileCount: records.length,
    files: records,
  };
}

function findFiles(options = {}) {
  const inventory = options.inventory || buildInventory(options);
  const contains = String(options.contains || '').toLowerCase();
  const name = String(options.name || '').toLowerCase();
  const limit = options.limit || 40;
  let files = inventory.files;
  if (name) {
    files = files.filter((file) => file.fileName.toLowerCase() === name || file.path.toLowerCase() === name);
  }
  if (contains) {
    files = files.filter((file) => file.path.toLowerCase().includes(contains));
  }
  return {
    schema: 'hermes-retrieval-find-files/v1',
    repo: inventory.repo,
    query: { name: options.name || '', contains: options.contains || '' },
    totalMatches: files.length,
    files: files.slice(0, limit),
    toolOrder: ['findFiles', 'retrieve', 'readFile or grepFile before citing'],
  };
}

function tokenize(value) {
  return [...String(value || '').toLowerCase().matchAll(/[a-z0-9][a-z0-9._/-]{1,}/g)]
    .map((match) => match[0])
    .filter((term) => !STOPWORDS.has(term))
    .slice(0, 40);
}

function makeCitationId(filePath, lineStart, lineEnd, sha) {
  return crypto
    .createHash('sha1')
    .update(`${filePath}:${lineStart}:${lineEnd}:${sha}`)
    .digest('hex')
    .slice(0, 10);
}

function readRecordText(repo, record, maxFileBytes) {
  const filePath = resolveInsideRepo(repo, record.path);
  const read = readMaybe(filePath, maxFileBytes);
  if (!read) return null;
  return read;
}

function chunkRecord(repo, record, options) {
  const read = readRecordText(repo, record, options.maxFileBytes || 700_000);
  if (!read) return [];
  const lines = read.text.split(/\r?\n/);
  const chunkLines = options.chunkLines || 36;
  const strideLines = options.strideLines || 18;
  const chunks = [];
  for (let start = 0; start < lines.length; start += strideLines) {
    const end = Math.min(lines.length, start + chunkLines);
    const content = lines.slice(start, end).join('\n').trim();
    if (content) {
      chunks.push({
        path: record.path,
        fileName: record.fileName,
        sha256: record.sha256,
        lineStart: start + 1,
        lineEnd: end,
        content,
      });
    }
    if (end >= lines.length) break;
  }
  return chunks;
}

function scoreChunk(chunk, query, terms) {
  const text = chunk.content.toLowerCase();
  const pathText = chunk.path.toLowerCase();
  const normalizedQuery = String(query || '').trim().toLowerCase();
  let score = 0;
  if (normalizedQuery && text.includes(normalizedQuery)) score += 20;
  if (normalizedQuery && pathText.includes(normalizedQuery)) score += 8;
  for (const term of terms) {
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const matches = text.match(new RegExp(escaped, 'g'));
    if (matches) score += Math.min(8, matches.length * 2);
    if (pathText.includes(term)) score += 4;
  }
  const titleHit = terms.some((term) => path.basename(chunk.path).toLowerCase().includes(term));
  if (titleHit) score += 3;
  if (pathText.startsWith('docs/') || pathText.includes('/docs/')) score += 12;
  if (pathText.startsWith('hermes-mobile/docs/')) score += 12;
  if (pathText === 'plan.md' && !terms.some((term) => ['plan', 'task', 'owner', 'ownership', 'claim'].includes(term))) {
    score -= 18;
  }
  if (pathText.startsWith('tests/')) score -= 4;
  return score;
}

function summarizePreview(content, maxLength = 520) {
  const value = String(content || '').replace(/\s+/g, ' ').trim();
  if (value.length <= maxLength) return value;
  return `${value.slice(0, maxLength).trim()}...`;
}

function retrieve(options = {}) {
  if (!options.query) throw new Error('retrieve requires --query');
  const inventory = options.inventory || buildInventory(options);
  const terms = tokenize(options.query);
  const scored = [];
  for (const record of inventory.files) {
    for (const chunk of chunkRecord(inventory.repo, record, options)) {
      const score = scoreChunk(chunk, options.query, terms);
      if (score <= 0) continue;
      scored.push({ ...chunk, score });
    }
  }
  scored.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path) || a.lineStart - b.lineStart);
  const results = scored.slice(0, options.topK || 8).map((chunk) => {
    const citationId = makeCitationId(chunk.path, chunk.lineStart, chunk.lineEnd, chunk.sha256);
    return {
      citationId,
      citation: `cite:${citationId}`,
      path: chunk.path,
      lineStart: chunk.lineStart,
      lineEnd: chunk.lineEnd,
      score: chunk.score,
      sha256: chunk.sha256,
      preview: summarizePreview(chunk.content),
    };
  });
  return {
    schema: 'hermes-retrieval-retrieve/v1',
    repo: inventory.repo,
    query: options.query,
    terms,
    searchedFiles: inventory.fileCount,
    resultCount: results.length,
    results,
    toolOrder: ['findFiles', 'retrieve', 'readFile or grepFile before citing'],
  };
}

function readFile(options = {}) {
  if (!options.file) throw new Error('read requires --file');
  const repo = path.resolve(options.repo || DEFAULT_REPO);
  const filePath = resolveInsideRepo(repo, options.file);
  const relativePath = toRepoRelative(repo, filePath);
  const read = readMaybe(filePath, options.maxFileBytes || 700_000);
  if (!read) throw new Error(`Not a readable text file: ${options.file}`);

  let content;
  let lineStart;
  let lineEnd;
  if (Number.isFinite(options.offset) && options.offset != null) {
    const start = Math.max(0, options.offset);
    content = read.text.slice(start, start + (options.maxLength || 4000));
    const prefixLines = read.text.slice(0, start).split(/\r?\n/).length;
    lineStart = prefixLines;
    lineEnd = prefixLines + content.split(/\r?\n/).length - 1;
  } else {
    const lines = read.text.split(/\r?\n/);
    lineStart = Math.max(1, options.line || 1);
    lineEnd = Math.min(lines.length, lineStart + (options.maxLines || 40) - 1);
    content = lines.slice(lineStart - 1, lineEnd).join('\n');
  }
  const citationId = makeCitationId(relativePath, lineStart, lineEnd, read.sha256);
  return {
    schema: 'hermes-retrieval-read-file/v1',
    repo,
    path: relativePath,
    lineStart,
    lineEnd,
    citationId,
    citation: `cite:${citationId}`,
    sha256: read.sha256,
    content,
  };
}

function grepFile(options = {}) {
  if (!options.file) throw new Error('grep requires --file');
  if (!options.pattern) throw new Error('grep requires --pattern');
  const repo = path.resolve(options.repo || DEFAULT_REPO);
  const filePath = resolveInsideRepo(repo, options.file);
  const relativePath = toRepoRelative(repo, filePath);
  const read = readMaybe(filePath, options.maxFileBytes || 700_000);
  if (!read) throw new Error(`Not a readable text file: ${options.file}`);

  let regex;
  try {
    regex = new RegExp(options.pattern, 'gim');
  } catch (error) {
    throw new Error(`Invalid regex: ${error.message}`);
  }

  const matches = [];
  const contextChars = options.contextChars || 120;
  let match;
  while ((match = regex.exec(read.rawText)) && matches.length < (options.limit || 40)) {
    const index = match.index || 0;
    const before = read.rawText.slice(0, index);
    const lineStart = before.split(/\r?\n/).length;
    const matchedText = match[0] || '';
    const lineEnd = lineStart + matchedText.split(/\r?\n/).length - 1;
    const contextStart = Math.max(0, index - contextChars);
    const contextEnd = Math.min(read.rawText.length, index + matchedText.length + contextChars);
    const context = redact(read.rawText.slice(contextStart, contextEnd).replace(/\s+/g, ' ').trim());
    const citationId = makeCitationId(relativePath, lineStart, lineEnd, read.sha256);
    matches.push({
      citationId,
      citation: `cite:${citationId}`,
      path: relativePath,
      lineStart,
      lineEnd,
      index,
      match: redact(matchedText),
      context,
    });
    if (matchedText.length === 0) regex.lastIndex += 1;
  }
  return {
    schema: 'hermes-retrieval-grep-file/v1',
    repo,
    path: relativePath,
    pattern: options.pattern,
    matchCount: matches.length,
    matches,
  };
}

function buildEvidenceBrief(options = {}) {
  const found = findFiles({ ...options, contains: options.contains || '' });
  const retrieved = retrieve(options);
  return {
    schema: 'hermes-retrieval-brief/v1',
    repo: retrieved.repo,
    query: options.query,
    inventory: {
      searchedFiles: retrieved.searchedFiles,
      matchingFiles: found.totalMatches,
      sampleFiles: found.files.slice(0, 10),
    },
    retrieved,
    instruction: 'Confirm any final claim with readFile or grepFile over cited paths.',
  };
}

function renderInventory(report) {
  return [
    '# Hermes Retrieval Inventory',
    '',
    `Repo: ${report.repo}`,
    `Files: ${report.fileCount}`,
    '',
    ...report.files.slice(0, 40).map((file) => `- ${file.path} (${file.lineCount} lines, sha256=${file.sha256.slice(0, 12)})`),
    report.files.length > 40 ? `- ... ${report.files.length - 40} more` : '',
  ].filter(Boolean).join('\n') + '\n';
}

function renderFind(report) {
  return [
    '# Hermes findFiles',
    '',
    `Matches: ${report.totalMatches}`,
    '',
    ...report.files.map((file) => `- ${file.path} (${file.lineCount} lines)`),
  ].join('\n') + '\n';
}

function renderRetrieve(report) {
  return [
    '# Hermes retrieve',
    '',
    `Query: ${report.query}`,
    `Searched files: ${report.searchedFiles}`,
    `Results: ${report.resultCount}`,
    '',
    ...report.results.map((item) => [
      `- ${item.citation} ${item.path}:${item.lineStart}-${item.lineEnd} score=${item.score}`,
      `  ${item.preview}`,
    ].join('\n')),
  ].join('\n') + '\n';
}

function renderRead(report) {
  return [
    `# Hermes readFile ${report.citation}`,
    '',
    `${report.path}:${report.lineStart}-${report.lineEnd}`,
    '',
    '```',
    report.content,
    '```',
  ].join('\n') + '\n';
}

function renderGrep(report) {
  return [
    '# Hermes grepFile',
    '',
    `${report.path} pattern=${report.pattern}`,
    `Matches: ${report.matchCount}`,
    '',
    ...report.matches.map((item) => `- ${item.citation} ${item.path}:${item.lineStart}-${item.lineEnd} ${item.context}`),
  ].join('\n') + '\n';
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(usage());
    return;
  }

  const aliases = {
    index: 'inventory',
    findFiles: 'find',
    'find-files': 'find',
    readFile: 'read',
    'read-file': 'read',
    grepFile: 'grep',
    'grep-file': 'grep',
    brief: 'brief',
  };
  const command = aliases[args.command] || args.command;
  let report;
  let text;
  if (command === 'inventory') {
    report = buildInventory(args);
    text = renderInventory(report);
  } else if (command === 'find') {
    report = findFiles(args);
    text = renderFind(report);
  } else if (command === 'retrieve') {
    report = retrieve(args);
    text = renderRetrieve(report);
  } else if (command === 'read') {
    report = readFile(args);
    text = renderRead(report);
  } else if (command === 'grep') {
    report = grepFile(args);
    text = renderGrep(report);
  } else if (command === 'brief') {
    report = buildEvidenceBrief(args);
    text = renderRetrieve(report.retrieved);
  } else {
    throw new Error(`Unknown command: ${args.command}`);
  }

  if (args.json) console.log(JSON.stringify(report, null, 2));
  else process.stdout.write(text);
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

module.exports = {
  DEFAULT_ROOTS,
  buildEvidenceBrief,
  buildInventory,
  findFiles,
  grepFile,
  parseArgs,
  readFile,
  redact,
  retrieve,
};
