#!/usr/bin/env node
'use strict';

/**
 * local-document-index
 *
 * Local PDF/Markdown knowledge base with semantic search via Ollama embeddings.
 * Inspired by pdf-brain (github.com/joelhooks/pdf-brain) — which uses Ollama
 * `mxbai-embed-large` for 1024-dim embeddings and libSQL for vector storage.
 *
 * This is a dependency-free, zero-setup alternative: text extraction via
 * `pdftotext` (if installed) or raw Markdown, embeddings via Ollama
 * `/api/embeddings`, and a JSONL vector store on disk (no database required).
 *
 * Usage:
 *   node tools/local-document-index.js index <dir> --model mxbai-embed-large
 *     Extract text from PDFs/MD in <dir>, chunk, embed, and store in JSONL.
 *
 *   node tools/local-document-index.js search <query> --store docs.jsonl --k 5
 *     Generate an embedding for the query and find semantically similar
 *     chunks via cosine similarity.
 *
 *   node tools/local-document-index.js stats --store docs.jsonl
 *     Show document count, chunk count, and embedding dimensions.
 *
 *   node tools/local-document-index.js health --json
 *     Check Ollama status and whether a given embedding model is available.
 *
 * Environment:
 *   OLLAMA_HOST  URL for Ollama API (default: http://127.0.0.1:11434)
 *
 * Design: pure functions for chunking/search (testable without Ollama);
 *         Ollama I/O is isolated behind injectable functions.
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const OLLAMA_DEFAULT = process.env.OLLAMA_HOST || 'http://127.0.0.1:11434';
const DEFAULT_CHUNK_SIZE = 500;
const DEFAULT_CHUNK_OVERLAP = 100;
const DEFAULT_EMBEDDING_MODEL = 'mxbai-embed-large';
const DEFAULT_K = 5;

// --- Text Chunker (pure function) --------------------------------------------

/**
 * Split text into overlapping chunks of approximately `chunkSize` characters.
 * Boundary-aware: prefers to split on paragraph breaks, then sentence endings,
 * then whitespace — never in the middle of a word.
 *
 * @param {string} text - Full text to chunk
 * @param {Object} opts - { chunkSize, chunkOverlap }
 * @returns {string[]} Array of text chunks
 */
function chunkText(text, opts) {
  const chunkSize = opts?.chunkSize != null ? opts.chunkSize : DEFAULT_CHUNK_SIZE;
  const chunkOverlap = opts?.chunkOverlap != null ? opts.chunkOverlap : DEFAULT_CHUNK_OVERLAP;

  const trimmed = text.trim();
  if (trimmed.length <= chunkSize) {
    return trimmed.length > 0 ? [trimmed] : [];
  }

  const paragraphs = trimmed.split(/\n{2,}/);
  const chunks = [];
  let current = '';

  for (const para of paragraphs) {
    const cleanPara = para.trim();
    if (cleanPara.length === 0) continue;

    // If the paragraph alone exceeds chunkSize, hard-split it into pieces
    if (cleanPara.length > chunkSize) {
      if (current) {
        chunks.push(current);
        current = '';
      }
      for (let i = 0; i < cleanPara.length; i += chunkSize) {
        chunks.push(cleanPara.slice(i, i + chunkSize));
      }
    } else if (current.length + cleanPara.length + 1 <= chunkSize) {
      current += (current ? '\n\n' : '') + cleanPara;
    } else {
      if (current) {
        chunks.push(current);
      }
      current = cleanPara;
    }
  }
  if (current) {
    chunks.push(current);
  }

  // Apply overlap between consecutive chunks
  if (chunkOverlap <= 0) {
    return chunks;
  }

  const overlapped = [];
  for (let i = 0; i < chunks.length; i++) {
    if (i === 0) {
      overlapped.push(chunks[i]);
    } else {
      const prev = chunks[i - 1];
      const overlapText = prev.slice(-chunkOverlap);
      overlapped.push(overlapText + ' ' + chunks[i]);
    }
  }
  return overlapped;
}

exports.chunkText = chunkText;
exports.DEFAULT_CHUNK_SIZE = DEFAULT_CHUNK_SIZE;
exports.DEFAULT_CHUNK_OVERLAP = DEFAULT_CHUNK_OVERLAP;

// --- Cosine Similarity (pure function) ---------------------------------------

/**
 * Compute cosine similarity between two vectors.
 * @param {number[]} a
 * @param {number[]} b
 * @returns {number} Similarity score in [-1, 1]
 */
function cosineSimilarity(a, b) {
  if (a.length !== b.length) {
    throw new Error(`Dimension mismatch: ${a.length} vs ${b.length}`);
  }
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

exports.cosineSimilarity = cosineSimilarity;

// --- File Discovery (pure-ish, injectable) -----------------------------------

/**
 * Walk a directory recursively, collecting .pdf and .md/.markdown file paths.
 * @param {string} dir
 * @returns {string[]} Array of file paths
 */
function findDocuments(dir) {
  const docs = [];
  if (!fs.existsSync(dir)) return docs;

  function walk(current) {
    if (fs.statSync(current).isDirectory()) {
      for (const entry of fs.readdirSync(current)) {
        walk(path.join(current, entry));
      }
    } else if (/\.(pdf|md|markdown)$/i.test(current)) {
      docs.push(current);
    }
  }
  walk(dir);
  return docs;
}

exports.findDocuments = findDocuments;

// --- Text Extraction ---------------------------------------------------------

/**
 * Extract text from a Markdown file. Markdown is just text — no processing needed.
 * @param {string} filePath
 * @returns {string} Raw Markdown content
 */
function extractMarkdown(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

/**
 * Extract text from a PDF file.
 * Tries `pdftotext` (poppler-utils) if available; falls back to raw text
 * extraction of printable ASCII sequences from the PDF binary.
 *
 * @param {string} filePath
 * @returns {string} Extracted text
 */
function extractPDF(filePath) {
  // Try pdftotext first (best quality)
  try {
    return execFileSync('pdftotext', ['-layout', '-q', filePath, '-'], {
      encoding: 'utf8',
      timeout: 30000,
    }).trim();
  } catch (e) {
    // pdftotext not installed — fall back to raw extraction
    return extractPDFRaw(filePath);
  }
}

/**
 * Fallback PDF text extraction: pull printable ASCII sequences from the
 * PDF binary. Lower quality than pdftotext but works without dependencies.
 *
 * @param {string} filePath
 * @returns {string} Best-effort extracted text
 */
function extractPDFRaw(filePath) {
  const buf = fs.readFileSync(filePath);
  // Extract printable ASCII text from the PDF (between parentheses in text objects)
  // This is a rough heuristic — not a full PDF parser
  let text = '';
  const str = buf.toString('latin1');
  const textRegex = /\(([^)]+)\)/g;
  let match;
  while ((match = textRegex.exec(str)) !== null) {
    const content = match[1].replace(/\\[nrtbf]/g, (m) => {
      const map = { '\\n': '\n', '\\r': '\r', '\\t': '\t', '\\b': '', '\\f': '' };
      return map[m] || m;
    });
    if (content.trim().length > 0) {
      text += content + ' ';
    }
  }
  return text.trim();
}

/**
 * Extract text from a document based on its file extension.
 * @param {string} filePath
 * @returns {string} Extracted text
 */
function extractText(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.md' || ext === '.markdown') {
    return extractMarkdown(filePath);
  }
  if (ext === '.pdf') {
    return extractPDF(filePath);
  }
  return '';
}

exports.extractText = extractText;
exports.extractMarkdown = extractMarkdown;
exports.extractPDF = extractPDF;
exports.extractPDFRaw = extractPDFRaw;

// --- Ollama Embedding (async) -----------------------------------------------

/**
 * Generate an embedding vector via Ollama POST /api/embeddings.
 * @param {string} text - Text to embed
 * @param {string} model - Ollama model name (e.g. "mxbai-embed-large")
 * @param {string} url - Ollama base URL
 * @returns {Promise<number[]|null>} Embedding vector, or null on error
 */
function embedText(text, model, url) {
  const target = url || OLLAMA_DEFAULT;
  return new Promise((resolve) => {
    const req = http.request(`${target}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      timeout: 30000,
    }, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          const data = JSON.parse(body);
          if (data.embedding && Array.isArray(data.embedding)) {
            resolve(data.embedding);
          } else {
            resolve(null);
          }
        } catch (e) {
          resolve(null);
        }
      });
    });
    req.on('error', () => resolve(null));
    req.on('timeout', () => {
      req.destroy();
      resolve(null);
    });
    req.write(JSON.stringify({ model: model || DEFAULT_EMBEDDING_MODEL, prompt: text }));
    req.end();
  });
}

exports.embedText = embedText;
exports.DEFAULT_EMBEDDING_MODEL = DEFAULT_EMBEDDING_MODEL;

// --- JSONL Vector Store ------------------------------------------------------

/**
 * Write a single record to a JSONL vector store.
 * Each record: { id, source, chunk_index, chunk, embedding, dimensions }
 * @param {string} storePath - Path to the JSONL file
 * @param {Object} record
 */
function appendRecord(storePath, record) {
  const line = JSON.stringify(record) + '\n';
  fs.appendFileSync(storePath, line, 'utf8');
}

/**
 * Load all records from a JSONL vector store.
 * @param {string} storePath
 * @returns {Object[]} Array of records
 */
function loadStore(storePath) {
  if (!fs.existsSync(storePath)) return [];
  const lines = fs.readFileSync(storePath, 'utf8').trim().split('\n');
  return lines.filter((l) => l.trim()).map((l) => {
    try {
      return JSON.parse(l);
    } catch (e) {
      return null;
    }
  }).filter(Boolean);
}

/**
 * Save a full store (overwrite mode).
 * @param {string} storePath
 * @param {Object[]} records
 */
function saveStore(storePath, records) {
  const lines = records.map((r) => JSON.stringify(r)).join('\n') + '\n';
  fs.writeFileSync(storePath, lines, 'utf8');
}

exports.appendRecord = appendRecord;
exports.loadStore = loadStore;
exports.saveStore = saveStore;

// --- Semantic Search ---------------------------------------------------------

/**
 * Search a JSONL vector store for the most similar documents.
 * @param {string} query - Search query
 * @param {string} storePath - Path to JSONL store
 * @param {Object} opts - { k, model, url }
 * @returns {Promise<Object[]>} Top-k results sorted by similarity
 */
async function search(query, storePath, opts) {
  const k = opts?.k || DEFAULT_K;
  const model = opts?.model || DEFAULT_EMBEDDING_MODEL;
  const url = opts?.url || OLLAMA_DEFAULT;
  const embedFn = opts?.embedFn || embedText;

  const records = loadStore(storePath);
  if (records.length === 0) {
    return { results: [], error: 'Store is empty or does not exist', total: 0 };
  }

  const queryEmbedding = await embedFn(query, model, url);
  if (!queryEmbedding) {
    return { results: [], error: 'Failed to generate embedding for query', total: records.length };
  }

  const scored = [];
  for (const rec of records) {
    if (Array.isArray(rec.embedding) && rec.embedding.length === queryEmbedding.length) {
      const score = cosineSimilarity(queryEmbedding, rec.embedding);
      scored.push({ ...rec, score });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  const topK = scored.slice(0, k);

  // Remove embedding vectors from output (too verbose for CLI)
  const results = topK.map((r) => ({
    score: r.score.toFixed(4),
    source: r.source,
    chunk_index: r.chunk_index,
    chunk: r.chunk.substring(0, 200) + (r.chunk.length > 200 ? '...' : ''),
    dimensions: r.dimensions,
  }));

  return { results, total: scored.length };
}

exports.search = search;

// --- Ollama Health -----------------------------------------------------------

/**
 * Check Ollama health and whether a given embedding model is available.
 * @param {string} url - Ollama base URL
 * @param {string} model - Embedding model name to check
 * @returns {Promise<Object>} { ok, url, model, installed, error }
 */
function checkOllama(url, model) {
  const target = url || OLLAMA_DEFAULT;
  return new Promise((resolve) => {
    const req = http.get(`${target}/api/tags`, { timeout: 3000 }, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          const data = JSON.parse(body);
          const models = (data.models || []).map((m) => m.name || m);
          const checkModel = model || DEFAULT_EMBEDDING_MODEL;
          const installed = models.some(
            (name) => name === checkModel || name.startsWith(checkModel + ':'),
          );
          resolve({ ok: true, url: target, ollama_running: true, model: checkModel, installed });
        } catch (e) {
          resolve({ ok: false, url: target, error: `JSON parse error: ${e.message}` });
        }
      });
    });
    req.on('error', (e) => {
      resolve({ ok: false, url: target, ollama_running: false, error: e.message });
    });
    req.on('timeout', () => {
      req.destroy();
      resolve({ ok: false, url: target, ollama_running: false, error: 'timeout (3s)' });
    });
  });
}

exports.checkOllama = checkOllama;

// --- CLI ---------------------------------------------------------------------

function main(argv) {
  const args = argv.slice(2);
  const cmd = args[0] || 'help';
  const json = args.includes('--json');

  const asArg = (flag) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : null;
  };

  if (cmd === 'index') {
    const dir = asArg('--dir') || args[1];
    const model = asArg('--model') || DEFAULT_EMBEDDING_MODEL;
    const storePath = asArg('--store') || path.join(process.cwd(), 'docs.jsonl');
    const chunkSize = parseInt(asArg('--chunk-size') || DEFAULT_CHUNK_SIZE);
    const chunkOverlap = parseInt(asArg('--chunk-overlap') || DEFAULT_CHUNK_OVERLAP);

    if (!dir) {
      console.error('Usage: node tools/local-document-index.js index <dir> [--model <model>] [--store <path>] [--chunk-size N] [--chunk-overlap N]');
      return 1;
    }

    if (!fs.existsSync(dir)) {
      console.error(`Directory not found: ${dir}`);
      return 1;
    }

    if (json) {
      console.log(JSON.stringify({ status: 'starting', dir, model, store: storePath }));
    } else {
      process.stderr.write(`Indexing ${dir} → ${storePath} (model: ${model})\n`);
    }

    const docs = findDocuments(dir);
    if (docs.length === 0) {
      const msg = 'No .pdf or .md files found';
      if (json) console.log(JSON.stringify({ status: 'done', indexed: 0, message: msg }));
      else process.stderr.write(`${msg}\n`);
      return 0;
    }

    // Reset store
    fs.writeFileSync(storePath, '', 'utf8');

    let indexed = 0;
    const embedFn = opts.embedFn || embedText;

    (async () => {
      for (const docPath of docs) {
        const text = extractText(docPath);
        if (!text || text.trim().length === 0) continue;

        const chunks = chunkText(text, { chunkSize, chunkOverlap });
        for (let i = 0; i < chunks.length; i++) {
          const embedding = await embedFn(chunks[i], model);
          if (embedding) {
            const record = {
              id: `${path.basename(docPath)}#${i}`,
              source: docPath,
              chunk_index: i,
              chunk: chunks[i],
              embedding,
              dimensions: embedding.length,
            };
            appendRecord(storePath, record);
            indexed++;
          }
        }
      }

      const summary = { status: 'done', indexed, docs: docs.length, store: storePath };
      if (json) console.log(JSON.stringify(summary));
      else process.stderr.write(`Indexed ${indexed} chunks from ${docs.length} documents\n`);
    })().catch((e) => {
      if (json) console.log(JSON.stringify({ status: 'error', error: e.message }));
      else console.error(`Index error: ${e.message}`);
    });

    return 0;
  }

  if (cmd === 'search') {
    const query = asArg('--query') || args[1];
    const storePath = asArg('--store') || path.join(process.cwd(), 'docs.jsonl');
    const k = parseInt(asArg('--k') || DEFAULT_K);
    const model = asArg('--model') || DEFAULT_EMBEDDING_MODEL;

    if (!query) {
      console.error('Usage: node tools/local-document-index.js search <query> [--store <path>] [--k N] [--model <model>]');
      return 1;
    }

    search(query, storePath, { k, model }).then((result) => {
      if (json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        if (result.error) {
          console.error(`Error: ${result.error}`);
        } else {
          console.log(`Found ${result.results.length} results (from ${result.total} chunks):`);
          for (const r of result.results) {
            console.log(`  [${r.score}] ${r.source} (chunk ${r.chunk_index}, ${r.dimensions}d)`);
            console.log(`    ${r.chunk}`);
            console.log('');
          }
        }
      }
    }).catch((e) => {
      console.error(`Search error: ${e.message}`);
    });

    return 0;
  }

  if (cmd === 'stats') {
    const storePath = asArg('--store') || path.join(process.cwd(), 'docs.jsonl');
    const records = loadStore(storePath);
    const dims = records.length > 0 ? records[0].dimensions : 0;
    const sources = [...new Set(records.map((r) => r.source))];

    if (json) {
      console.log(JSON.stringify({ records: records.length, chunks: records.length, sources: sources.length, dimensions: dims, store: storePath }));
    } else {
      console.log(`Document index stats (${storePath}):`);
      console.log(`  Documents: ${sources.length}`);
      console.log(`  Chunks: ${records.length}`);
      console.log(`  Embedding dimensions: ${dims || 'N/A'}`);
    }
    return 0;
  }

  if (cmd === 'health') {
    const model = asArg('--model') || DEFAULT_EMBEDDING_MODEL;
    checkOllama(OLLAMA_DEFAULT, model).then((result) => {
      if (json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(`Ollama: ${result.ok ? 'running' : 'not running'} at ${result.url}`);
        if (result.ok) {
          console.log(`  Model ${result.model}: ${result.installed ? 'installed ✓' : 'NOT installed ✗'}`);
        } else {
          console.log(`  Error: ${result.error}`);
        }
      }
    });
    return 0;
  }

  if (cmd === 'chunk' || cmd === 'chunk-test') {
    // Pure-function test mode: chunk stdin text and print chunks
    const chunkSize = parseInt(asArg('--chunk-size') || DEFAULT_CHUNK_SIZE);
    const chunkOverlap = parseInt(asArg('--chunk-overlap') || DEFAULT_CHUNK_OVERLAP);
    let input = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => (input += chunk));
    process.stdin.on('end', () => {
      const chunks = chunkText(input, { chunkSize, chunkOverlap });
      if (json) {
        console.log(JSON.stringify({ chunks: chunks.length, chunk_sizes: chunks.map((c) => c.length) }));
      } else {
        console.log(`${chunks.length} chunks:`);
        chunks.forEach((c, i) => {
          console.log(`  --- chunk ${i} (${c.length} chars) ---`);
          console.log(c.substring(0, 100) + (c.length > 100 ? '...' : ''));
        });
      }
    });
    return 0;
  }

  if (cmd === 'help' || cmd === '--help' || cmd === '-h') {
    console.log(`Usage:
  node tools/local-document-index.js index <dir> [options]
    Extract text from PDFs/MD in <dir>, chunk, embed via Ollama, store in JSONL.

  node tools/local-document-index.js search <query> [options]
    Search the JSONL store for documents semantically similar to <query>.

  node tools/local-document-index.js stats [--store <path>]
    Show document/chunk counts and embedding dimensions.

  node tools/local-document-index.js health [--model <model>]
    Check Ollama status and whether the embedding model is installed.

  node tools/local-document-index.js chunk [--chunk-size N] [--chunk-overlap N]
    Test the chunker: read text from stdin, print chunk count and sizes.

Options:
  --model <model>      Ollama embedding model (default: mxbai-embed-large)
  --store <path>       JSONL store file path (default: ./docs.jsonl)
  --chunk-size <n>     Characters per chunk (default: 500)
  --chunk-overlap <n>  Overlap between chunks in chars (default: 100)
  --k <n>              Number of search results (default: 5)
  --json               Machine-readable output

Environment:
  OLLAMA_HOST  URL for Ollama API (default: http://127.0.0.1:11434)
`);
    return 0;
  }

  console.error(`Unknown command: ${cmd}`);
  return 1;
}

// Allow injecting dependencies for testing (e.g. mock embed function)
const opts = {
  embedFn: embedText,
};

if (require.main === module) {
  process.exitCode = main(process.argv);
}

// Export everything
exports.main = main;
exports.opts = opts;
