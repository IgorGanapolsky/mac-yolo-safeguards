#!/usr/bin/env node
'use strict';

/**
 * Tests for tools/local-document-index.js
 * Covers: text chunking, cosine similarity, text extraction, JSONL store,
 * and search logic. Ollama I/O is mocked via injectable functions.
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SCRIPT = path.join(ROOT, 'tools', 'local-document-index.js');
const mod = require(SCRIPT);

let pass = 0;
let fail = 0;
let pending = 0;

function check(name, fn) {
  if (fn.constructor.name === 'AsyncFunction') {
    pending++;
    fn().then(() => {
      pass++;
      pending--;
    }).catch((e) => {
      fail++;
      pending--;
      console.error(`  FAIL: ${name}`);
      console.error(`    ${e.message}`);
    });
    return;
  }
  try {
    fn();
    pass++;
  } catch (e) {
    fail++;
    console.error(`  FAIL: ${name}`);
    console.error(`    ${e.message}`);
  }
}

// --- Text Chunker -----------------------------------------------------------

check('chunkText: short text → single chunk', () => {
  const chunks = mod.chunkText('Hello world', { chunkSize: 500, chunkOverlap: 0 });
  assert.strictEqual(chunks.length, 1);
  assert.strictEqual(chunks[0], 'Hello world');
});

check('chunkText: empty text → empty array', () => {
  const chunks = mod.chunkText('', { chunkSize: 500, chunkOverlap: 0 });
  assert.strictEqual(chunks.length, 0);
});

check('chunkText: 600 chars at 500 chunk → hard split into 2', () => {
  const text = 'A'.repeat(600);
  const chunks = mod.chunkText(text, { chunkSize: 500, chunkOverlap: 0 });
  assert.strictEqual(chunks.length, 2);
  assert.strictEqual(chunks[0].length, 500);
  assert.strictEqual(chunks[1].length, 100);
});

check('chunkText: paragraphs combined when under limit', () => {
  const text = 'First paragraph.\n\nSecond paragraph.';
  const chunks = mod.chunkText(text, { chunkSize: 500, chunkOverlap: 0 });
  assert.strictEqual(chunks.length, 1);
  assert.ok(chunks[0].includes('First paragraph'));
  assert.ok(chunks[0].includes('Second paragraph'));
});

check('chunkText: overlap adds suffix from previous chunk', () => {
  const text = 'AAAAABBBBBCCCCCDDDDD';
  // 5 chars per chunk, 2 overlap → 4 chunks (20/5), each subsequent gets 2-char suffix
  const chunks = mod.chunkText(text, { chunkSize: 5, chunkOverlap: 2 });
  assert.strictEqual(chunks.length, 4);
  assert.strictEqual(chunks[0], 'AAAAA');
  // chunk 1: last 2 of 'AAAAA' + ' ' + 'BBBBB'
  assert.ok(chunks[1].startsWith('AA '));
  assert.ok(chunks[1].endsWith('BBBBB'));
});

check('chunkText: multi-paragraph with overflow', () => {
  const text = 'Short first.\n\n' + 'B'.repeat(700) + '\n\nShort third.';
  const chunks = mod.chunkText(text, { chunkSize: 500, chunkOverlap: 0 });
  // 'Short first.' is 12 chars, 'B'.repeat(700) is 700 chars (hard-split into 2), 'Short third.' is 12 chars
  // chunks[0] = 'Short first.\n\nB...' (12+700=712 > 500, so current='Short first.', push, current='B'*700)
  // Since B*700 > 500: push 500 B's, push 200 B's
  // Then 'Short third.' doesn't fit with current='B'*200: push 'B'*200, current='Short third.'
  // Actually let me think more carefully...
  // para1 = 'Short first.' (12 chars), para2 = 'B'.repeat(700), para3 = 'Short third.' (12 chars)
  // para1: current.length(0) + 12 + 1 = 13 <= 500, current = 'Short first.'
  // para2: 700 > 500, push current='Short first.', current=''
  //        hard split: push B*500, push B*200
  // para3: current.length(0) + 12 + 1 = 13 <= 500, current = 'Short third.'
  // After loop: push 'Short third.'
  // Total: ['Short first.', 'B'*500, 'B'*200, 'Short third.'] = 4 chunks
  assert.strictEqual(chunks.length, 4);
  assert.strictEqual(chunks[0], 'Short first.');
  assert.strictEqual(chunks[1].length, 500);
  assert.strictEqual(chunks[2].length, 200);
  assert.strictEqual(chunks[3], 'Short third.');
});

check('chunkText: whitespace trimming', () => {
  const chunks = mod.chunkText('  hello  ', { chunkSize: 500, chunkOverlap: 0 });
  assert.strictEqual(chunks.length, 1);
  assert.strictEqual(chunks[0], 'hello');
});

// --- Cosine Similarity ------------------------------------------------------

check('cosineSimilarity: identical vectors = 1.0', () => {
  const sim = mod.cosineSimilarity([1, 2, 3], [1, 2, 3]);
  assert.ok(Math.abs(sim - 1.0) < 0.001);
});

check('cosineSimilarity: orthogonal vectors = 0', () => {
  const sim = mod.cosineSimilarity([1, 0, 0], [0, 1, 0]);
  assert.ok(Math.abs(sim - 0) < 0.001);
});

check('cosineSimilarity: opposite vectors = -1', () => {
  const sim = mod.cosineSimilarity([1, 2, 3], [-1, -2, -3]);
  assert.ok(Math.abs(sim - (-1)) < 0.001);
});

check('cosineSimilarity: zero vector = 0', () => {
  const sim = mod.cosineSimilarity([0, 0, 0], [1, 2, 3]);
  assert.strictEqual(sim, 0);
});

check('cosineSimilarity: dimension mismatch throws', () => {
  assert.throws(() => mod.cosineSimilarity([1, 2], [1, 2, 3]), /Dimension mismatch/);
});

check('cosineSimilarity: scales with magnitude difference', () => {
  const sim = mod.cosineSimilarity([2, 0], [1, 0]);
  assert.ok(Math.abs(sim - 1.0) < 0.001);
});

// --- Text Extraction --------------------------------------------------------

check('extractMarkdown: reads .md file content', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ldi-test-'));
  const mdPath = path.join(tmpDir, 'test.md');
  fs.writeFileSync(mdPath, '# Hello\n\nThis is content.', 'utf8');
  const text = mod.extractMarkdown(mdPath);
  assert.strictEqual(text, '# Hello\n\nThis is content.');
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

check('extractText: .md extension routes to Markdown extractor', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ldi-test-'));
  const mdPath = path.join(tmpDir, 'test.markdown');
  fs.writeFileSync(mdPath, 'Content here', 'utf8');
  const text = mod.extractText(mdPath);
  assert.strictEqual(text, 'Content here');
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

check('findDocuments: discovers .md and .pdf files', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ldi-test-'));
  fs.writeFileSync(path.join(tmpDir, 'a.md'), '# A', 'utf8');
  fs.writeFileSync(path.join(tmpDir, 'b.pdf'), 'fake pdf', 'utf8');
  fs.writeFileSync(path.join(tmpDir, 'c.txt'), 'ignore me', 'utf8');
  fs.mkdirSync(path.join(tmpDir, 'sub'));
  fs.writeFileSync(path.join(tmpDir, 'sub', 'd.md'), '# D', 'utf8');
  const docs = mod.findDocuments(tmpDir);
  assert.strictEqual(docs.length, 3);
  const basenames = docs.map((d) => path.basename(d)).sort();
  assert.deepStrictEqual(basenames, ['a.md', 'b.pdf', 'd.md']);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

check('findDocuments: non-existent directory returns empty', () => {
  const docs = mod.findDocuments('/nonexistent/path/that/does/not/exist');
  assert.strictEqual(docs.length, 0);
});

// --- JSONL Vector Store -----------------------------------------------------

check('appendRecord + loadStore: round-trip', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ldi-test-'));
  const storePath = path.join(tmpDir, 'store.jsonl');

  const record1 = { id: 'doc1#0', source: 'doc1.md', chunk_index: 0, chunk: 'text1', embedding: [0.1, 0.2], dimensions: 2 };
  const record2 = { id: 'doc2#0', source: 'doc2.md', chunk_index: 0, chunk: 'text2', embedding: [0.3, 0.4], dimensions: 2 };

  mod.appendRecord(storePath, record1);
  mod.appendRecord(storePath, record2);

  const loaded = mod.loadStore(storePath);
  assert.strictEqual(loaded.length, 2);
  assert.strictEqual(loaded[0].id, 'doc1#0');
  assert.strictEqual(loaded[1].id, 'doc2#0');

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

check('loadStore: non-existent file returns empty array', () => {
  const loaded = mod.loadStore('/nonexistent/store.jsonl');
  assert.strictEqual(loaded.length, 0);
});

check('saveStore: replaces entire store', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ldi-test-'));
  const storePath = path.join(tmpDir, 'store.jsonl');

  mod.appendRecord(storePath, { id: 'old', chunk: 'old' });
  mod.saveStore(storePath, [{ id: 'new', chunk: 'new' }]);

  const loaded = mod.loadStore(storePath);
  assert.strictEqual(loaded.length, 1);
  assert.strictEqual(loaded[0].id, 'new');

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// --- Search (with mock embed function) --------------------------------------

check('search: empty store returns error', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ldi-test-'));
  const storePath = path.join(tmpDir, 'empty.jsonl');
  const result = await mod.search('query', storePath, { k: 5, model: 'test', url: 'http://localhost:11434' });
  assert.ok(result.error, 'should return error for empty store');
  assert.strictEqual(result.results.length, 0);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

check('search: mock embed returns sorted results', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ldi-test-'));
  const storePath = path.join(tmpDir, 'store.jsonl');

  // Create a store with 3 documents
  const records = [
    { id: 'a', source: 'doc1.md', chunk_index: 0, chunk: 'about cats', embedding: [1, 0], dimensions: 2 },
    { id: 'b', source: 'doc2.md', chunk_index: 0, chunk: 'about dogs', embedding: [0, 1], dimensions: 2 },
    { id: 'c', source: 'doc3.md', chunk_index: 0, chunk: 'about birds', embedding: [0.5, 0.5], dimensions: 2 },
  ];
  mod.saveStore(storePath, records);

  // Use a mock embed function that returns [1, 0] for the query (matches 'a')
  const mockEmbed = async () => [1, 0];

  const result = await mod.search('cats', storePath, { k: 2, model: 'test', url: 'http://localhost:11434', embedFn: mockEmbed });
  assert.strictEqual(result.results.length, 2);
  // 'a' has similarity 1.0, 'c' has 0.707, 'b' has 0.0
  // Top 2 should be 'a' then 'c'
  assert.strictEqual(result.results[0].source, 'doc1.md');
  assert.ok(parseFloat(result.results[0].score) > parseFloat(result.results[1].score));
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

check('search: respects k limit', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ldi-test-'));
  const storePath = path.join(tmpDir, 'store.jsonl');

  const records = [
    { id: 'a', source: 'a.md', chunk_index: 0, chunk: 'a', embedding: [1, 0], dimensions: 2 },
    { id: 'b', source: 'b.md', chunk_index: 0, chunk: 'b', embedding: [0, 1], dimensions: 2 },
    { id: 'c', source: 'c.md', chunk_index: 0, chunk: 'c', embedding: [0.5, 0.5], dimensions: 2 },
  ];
  mod.saveStore(storePath, records);

  const mockEmbed = async () => [1, 0];

  const result = await mod.search('q', storePath, { k: 1, model: 'test', url: 'http://localhost:11434', embedFn: mockEmbed });
  assert.strictEqual(result.results.length, 1);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

// --- Model Registry ---------------------------------------------------------

check('DEFAULT_EMBEDDING_MODEL is mxbai-embed-large', () => {
  assert.strictEqual(mod.DEFAULT_EMBEDDING_MODEL, 'mxbai-embed-large');
});

check('DEFAULT_CHUNK_SIZE is 500', () => {
  assert.strictEqual(mod.DEFAULT_CHUNK_SIZE, 500);
});

check('DEFAULT_CHUNK_OVERLAP is 100', () => {
  assert.strictEqual(mod.DEFAULT_CHUNK_OVERLAP, 100);
});

// --- CLI Interface ----------------------------------------------------------

check('CLI: help works', () => {
  const r = spawnSync(process.execPath, [SCRIPT, 'help'], {
    encoding: 'utf8',
    timeout: 10000,
  });
  assert.strictEqual(r.status, 0, r.stderr);
  assert.ok(r.stdout.includes('Usage:'));
  assert.ok(r.stdout.includes('index'));
  assert.ok(r.stdout.includes('search'));
  assert.ok(r.stdout.includes('stats'));
  assert.ok(r.stdout.includes('health'));
  assert.ok(r.stdout.includes('chunk'));
});

check('CLI: stats on empty store', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ldi-test-'));
  const storePath = path.join(tmpDir, 'empty.jsonl');
  const r = spawnSync(process.execPath, [SCRIPT, 'stats', '--store', storePath, '--json'], {
    encoding: 'utf8',
    timeout: 10000,
  });
  assert.strictEqual(r.status, 0, r.stderr);
  const d = JSON.parse(r.stdout);
  assert.strictEqual(d.records, 0);
  assert.strictEqual(d.chunks, 0);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

check('CLI: stats on populated store', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ldi-test-'));
  const storePath = path.join(tmpDir, 'store.jsonl');
  mod.appendRecord(storePath, { id: 'a', source: 'doc1.md', chunk_index: 0, chunk: 'hello', embedding: [0.1, 0.2], dimensions: 2 });
  mod.appendRecord(storePath, { id: 'b', source: 'doc2.md', chunk_index: 0, chunk: 'world', embedding: [0.3, 0.4], dimensions: 2 });

  const r = spawnSync(process.execPath, [SCRIPT, 'stats', '--store', storePath, '--json'], {
    encoding: 'utf8',
    timeout: 10000,
  });
  assert.strictEqual(r.status, 0, r.stderr);
  const d = JSON.parse(r.stdout);
  assert.strictEqual(d.records, 2);
  assert.strictEqual(d.sources, 2);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

check('CLI: chunk command reads stdin', () => {
  const r = spawnSync(process.execPath, [SCRIPT, 'chunk', '--json'], {
    input: 'Hello world test',
    encoding: 'utf8',
    timeout: 10000,
  });
  assert.strictEqual(r.status, 0, r.stderr);
  const d = JSON.parse(r.stdout);
  assert.ok(d.chunks >= 1);
  assert.ok(Array.isArray(d.chunk_sizes));
});

check('CLI: unknown command returns exit 1', () => {
  const r = spawnSync(process.execPath, [SCRIPT, 'bogus'], {
    encoding: 'utf8',
    timeout: 10000,
  });
  assert.strictEqual(r.status, 1);
});

check('CLI: index without dir returns error', () => {
  const r = spawnSync(process.execPath, [SCRIPT, 'index'], {
    encoding: 'utf8',
    timeout: 10000,
  });
  assert.strictEqual(r.status, 1);
});

// --- Summary ----------------------------------------------------------------

async function finish() {
  // Wait for all async tests to complete
  let attempts = 0;
  while (pending > 0 && attempts < 50) {
    await new Promise((r) => setTimeout(r, 100));
    attempts++;
  }
  console.log(`test-local-document-index: ${pass + fail} tests, ${pass} passed, ${fail} failed`);
  if (fail > 0) {
    process.exit(1);
  }
}

finish();
