#!/usr/bin/env node
'use strict';

/**
 * Retrieve from the academic research-rag pack (InfoQ: make write-only stores queryable).
 *
 * Reads ~/.hermes/research-rag/latest.json + corpus.jsonl. No network.
 *
 *   node tools/hermes-academic-research-retrieve.js --query "tool use evaluation" --json
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const DEFAULT_DIR = path.join(os.homedir(), '.hermes', 'research-rag');

function parseArgs(argv) {
  const args = { dir: DEFAULT_DIR, query: '', limit: 8, json: false };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--dir') args.dir = path.resolve(argv[++i] || '');
    else if (a === '--query') args.query = argv[++i] || '';
    else if (a === '--limit') args.limit = Number(argv[++i] || 8);
    else if (a === '--json') args.json = true;
    else if (a === '--help') args.help = true;
    else throw new Error(`Unknown ${a}`);
  }
  return args;
}

function tokenize(q) {
  return String(q || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 2);
}

function loadItems(dir) {
  const items = [];
  const latestPath = path.join(dir, 'latest.json');
  if (fs.existsSync(latestPath)) {
    try {
      const latest = JSON.parse(fs.readFileSync(latestPath, 'utf8'));
      for (const key of ['evidence', 'proposals', 'allItems']) {
        if (Array.isArray(latest[key])) {
          for (const it of latest[key]) items.push({ ...it, _from: `latest.${key}` });
        }
      }
    } catch {
      /* ignore */
    }
  }
  const corpusPath = path.join(dir, 'corpus.jsonl');
  if (fs.existsSync(corpusPath)) {
    for (const line of fs.readFileSync(corpusPath, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try {
        items.push({ ...JSON.parse(line), _from: 'corpus' });
      } catch {
        /* skip */
      }
    }
  }
  return items;
}

function scoreItem(item, tokens) {
  const blob = [
    item.title,
    item.summary,
    item.abstract,
    item.id,
    item.url,
    item.source,
    ...(item.tags || []),
    ...(item.authors || []),
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  let score = 0;
  const hits = [];
  for (const t of tokens) {
    if (blob.includes(t)) {
      score += 1;
      hits.push(t);
    }
  }
  // Prefer proposals / evidence pack slightly
  if (item._from && item._from.startsWith('latest.')) score += 0.25;
  return { score, hits };
}

function retrieve(options = {}) {
  const dir = options.dir || DEFAULT_DIR;
  const query = String(options.query || '').trim();
  const limit = options.limit || 8;
  const tokens = tokenize(query);
  if (!query) throw new Error('--query required');
  if (!fs.existsSync(dir)) {
    return {
      ok: false,
      error: `research-rag dir missing: ${dir}`,
      query,
      matches: [],
    };
  }
  const items = loadItems(dir);
  const ranked = items
    .map((item, i) => {
      const { score, hits } = scoreItem(item, tokens);
      return {
        rank: 0,
        score,
        hits,
        id: item.id || item.sourceId || `item-${i}`,
        title: item.title || item.name || '',
        url: item.url || item.link || '',
        source: item.source || item.provider || '',
        from: item._from,
        snippet: String(item.summary || item.abstract || item.title || '').slice(0, 280),
      };
    })
    .filter((m) => m.score > 0)
    .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
    .slice(0, limit)
    .map((m, i) => ({ ...m, rank: i + 1 }));

  return {
    ok: true,
    query,
    dir,
    corpusSize: items.length,
    matchCount: ranked.length,
    matches: ranked,
  };
}

if (require.main === module) {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
      console.log('Usage: node tools/hermes-academic-research-retrieve.js --query "..." [--json]');
      process.exit(0);
    }
    const report = retrieve(args);
    if (args.json) console.log(JSON.stringify(report, null, 2));
    else {
      if (!report.ok) {
        console.error(report.error);
        process.exit(1);
      }
      console.log(`academic-retrieve: ${report.matchCount}/${report.corpusSize} hits for "${report.query}"`);
      for (const m of report.matches) {
        console.log(`  #${m.rank} ${m.score.toFixed(2)} ${m.title.slice(0, 80)} ${m.url}`);
      }
    }
    process.exit(report.ok ? 0 : 1);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(2);
  }
}

module.exports = { retrieve, tokenize, loadItems, scoreItem };
