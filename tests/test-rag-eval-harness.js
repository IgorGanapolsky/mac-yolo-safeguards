'use strict';

const { tests, describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');

const TOOL = path.join(__dirname, '..', 'tools', 'rag-eval-harness.js');
const mod = require(TOOL);

// --- Fixtures ---

const PERFECT_DATASET = {
  queries: [
    {
      question: 'What is CAS consensus?',
      goldDocs: ['doc-a', 'doc-b'],
      retrievedDocs: [
        { docId: 'doc-a', score: 0.95 },
        { docId: 'doc-c', score: 0.50 },
        { docId: 'doc-b', score: 0.30 },
      ],
    },
    {
      question: 'How does WAL-as-truth work?',
      goldDocs: ['doc-x'],
      retrievedDocs: [
        { docId: 'doc-x', score: 0.99 },
        { docId: 'doc-y', score: 0.40 },
      ],
    },
  ],
};

const ZERO_RETRIEVAL_DATASET = {
  queries: [
    {
      question: 'Nothing relevant?',
      goldDocs: ['doc-z'],
      retrievedDocs: [
        { docId: 'doc-a', score: 0.90 },
        { docId: 'doc-b', score: 0.80 },
      ],
    },
  ],
};

const EMPTY_DATASET = { queries: [] };

// --- Metric-level tests ---

describe('rag-eval: precisionAtK', () => {
  it('returns 1.0 when all top-k are relevant', () => {
    const retrieved = [
      { docId: 'a', score: 0.9 },
      { docId: 'b', score: 0.8 },
    ];
    assert.equal(mod.precisionAtK(retrieved, ['a', 'b'], 2), 1.0);
  });

  it('returns 0.0 when none are relevant', () => {
    const retrieved = [
      { docId: 'a', score: 0.9 },
      { docId: 'b', score: 0.8 },
    ];
    assert.equal(mod.precisionAtK(retrieved, ['x', 'y'], 2), 0.0);
  });

  it('handles k > retrieved length', () => {
    const retrieved = [{ docId: 'a', score: 0.9 }];
    assert.equal(mod.precisionAtK(retrieved, ['a'], 10), 1.0);
  });

  it('handles k = 0 (edge)', () => {
    const retrieved = [{ docId: 'a', score: 0.9 }];
    assert.equal(mod.precisionAtK(retrieved, ['a'], 0), 0);
  });
});

describe('rag-eval: recallAtK', () => {
  it('returns 1.0 when all gold docs are in top-k', () => {
    const retrieved = [
      { docId: 'a', score: 0.9 },
      { docId: 'b', score: 0.8 },
      { docId: 'c', score: 0.7 },
    ];
    assert.equal(mod.recallAtK(retrieved, ['a', 'b'], 3), 1.0);
  });

  it('returns 0.5 when only half of gold docs are found', () => {
    const retrieved = [
      { docId: 'a', score: 0.9 },
      { docId: 'c', score: 0.7 },
    ];
    assert.equal(mod.recallAtK(retrieved, ['a', 'b'], 2), 0.5);
  });

  it('returns 0.0 when no gold docs are found', () => {
    const retrieved = [
      { docId: 'a', score: 0.9 },
    ];
    assert.equal(mod.recallAtK(retrieved, ['x', 'y'], 1), 0.0);
  });

  it('handles empty gold docs', () => {
    const retrieved = [{ docId: 'a', score: 0.9 }];
    assert.equal(mod.recallAtK(retrieved, [], 1), 0);
  });
});

describe('rag-eval: reciprocalRankAtK (MRR)', () => {
  it('returns 1.0 when first retrieved doc is relevant', () => {
    const retrieved = [
      { docId: 'gold', score: 0.9 },
      { docId: 'other', score: 0.8 },
    ];
    assert.equal(mod.reciprocalRankAtK(retrieved, ['gold'], 2), 1.0);
  });

  it('returns 0.5 when second doc is the first relevant one', () => {
    const retrieved = [
      { docId: 'miss', score: 0.99 },
      { docId: 'hit', score: 0.8 },
      { docId: 'other', score: 0.7 },
    ];
    assert.equal(mod.reciprocalRankAtK(retrieved, ['hit'], 3), 0.5);
  });

  it('returns 0.0 when no relevant doc in top-k', () => {
    const retrieved = [
      { docId: 'miss', score: 0.99 },
      { docId: 'miss2', score: 0.8 },
    ];
    assert.equal(mod.reciprocalRankAtK(retrieved, ['gold'], 2), 0.0);
  });
});

describe('rag-eval: ndcgAtK', () => {
  it('returns 1.0 for perfect ranking', () => {
    const retrieved = [
      { docId: 'gold1', score: 0.99 },
      { docId: 'gold2', score: 0.98 },
    ];
    const ndcg = mod.ndcgAtK(retrieved, ['gold1', 'gold2'], 2);
    assert.equal(ndcg, 1.0);
  });

  it('returns 0.0 when no relevant docs in top-k', () => {
    const retrieved = [
      { docId: 'a', score: 0.9 },
      { docId: 'b', score: 0.8 },
    ];
    assert.equal(mod.ndcgAtK(retrieved, ['gold'], 2), 0.0);
  });

  it('penalizes bad ranking (relevant doc last)', () => {
    const retrieved = [
      { docId: 'miss1', score: 0.9 },
      { docId: 'miss2', score: 0.8 },
      { docId: 'gold', score: 0.7 },
    ];
    const ndcg = mod.ndcgAtK(retrieved, ['gold'], 3);
    assert.ok(ndcg > 0);
    assert.ok(ndcg < 1.0);
  });

  it('perfect ranking beats bad ranking at k=3', () => {
    const perfect = [
      { docId: 'gold', score: 0.99 },
      { docId: 'm1', score: 0.5 },
      { docId: 'm2', score: 0.4 },
    ];
    const bad = [
      { docId: 'm1', score: 0.9 },
      { docId: 'm2', score: 0.8 },
      { docId: 'gold', score: 0.7 },
    ];
    const ndcgPerfect = mod.ndcgAtK(perfect, ['gold'], 3);
    const ndcgBad = mod.ndcgAtK(bad, ['gold'], 3);
    assert.ok(ndcgPerfect > ndcgBad);
  });
});

describe('rag-eval: evaluateDataset', () => {
  it('computes all requested k-cutoffs', () => {
    const results = mod.evaluateDataset(PERFECT_DATASET, [1, 5, 10]);
    assert.equal(results.numQueries, 2);
    assert.equal(results.ks.length, 3);
    assert.ok('precision@1' in results.metrics);
    assert.ok('recall@5' in results.metrics);
    assert.ok('mrr@10' in results.metrics);
    assert.ok('ndcg@10' in results.metrics);
  });

  it('perfect dataset → recall@10 = 1.0, mrr@1 = 1.0', () => {
    const results = mod.evaluateDataset(PERFECT_DATASET, [1, 10]);
    assert.equal(results.metrics['recall@10'], 1.0);
    // First query: gold in position 1 → MRR=1; second query: gold in position 1 → MRR=1
    // MRR@1 averaged over all queries
    const expectedMrr1 = (1.0 + 1.0) / 2; // both queries have gold at rank 1
    assert.equal(results.metrics['mrr@1'], expectedMrr1);
  });

  it('zero-retrieval dataset → recall=0, mrr=0 for all k', () => {
    const results = mod.evaluateDataset(ZERO_RETRIEVAL_DATASET, [1, 5, 10]);
    assert.equal(results.metrics['recall@1'], 0.0);
    assert.equal(results.metrics['recall@5'], 0.0);
    assert.equal(results.metrics['mrr@1'], 0.0);
    assert.equal(results.metrics['ndcg@5'], 0.0);
  });

  it('throws on empty dataset', () => {
    assert.throws(
      () => mod.evaluateDataset(EMPTY_DATASET, [10]),
      /no queries/,
    );
  });

  it('returns per-query breakdown', () => {
    const results = mod.evaluateDataset(PERFECT_DATASET, [5]);
    assert.equal(results.perQuery.length, 2); // 2 queries × 1 k
    const q1 = results.perQuery.find(p => p.question === 'What is CAS consensus?');
    assert.ok(q1);
    assert.equal(q1.k, 5);
    assert.equal(q1.goldDocs, 2);
  });

  it('includes summary stats', () => {
    const results = mod.evaluateDataset(PERFECT_DATASET, [1, 10]);
    assert.ok(results.summary);
    assert.equal(results.summary.bestK, 10);
    assert.equal(results.summary.maxRecall, 1.0);
    assert.equal(results.summary.maxMrr, 1.0);
  });
});

describe('rag-eval: parseArgs', () => {
  it('parses dataset file path', () => {
    const args = mod.parseArgs(['node', 'script', 'dataset.json']);
    assert.deepEqual(args._, ['dataset.json']);
  });

  it('parses --k flag with comma-separated values', () => {
    const args = mod.parseArgs(['node', 'script', 'dataset.json', '--k=1,5,10']);
    assert.deepEqual(args.k, [1, 5, 10]);
  });

  it('parses --json flag', () => {
    const args = mod.parseArgs(['node', 'script', 'data.json', '--json']);
    assert.equal(args.json, true);
  });

  it('parses --out flag', () => {
    const args = mod.parseArgs(['node', 'script', 'data.json', '--out', 'result.json']);
    assert.equal(args.out, 'result.json');
  });

  it('defaults to k=[1,5,10]', () => {
    const args = mod.parseArgs(['node', 'script', 'data.json']);
    assert.deepEqual(args.k, [1, 5, 10]);
  });
});

describe('rag-eval: CLI integration', () => {
  let tmpdir;
  let datasetPath;

  beforeEach(() => {
    tmpdir = fs.mkdtempSync(path.join(os.tmpdir(), 'rag-eval-'));
    datasetPath = path.join(tmpdir, 'dataset.json');
    fs.writeFileSync(datasetPath, JSON.stringify(PERFECT_DATASET));
  });

  afterEach(() => {
    fs.rmSync(tmpdir, { recursive: true, force: true });
  });

  it('CLI outputs text summary with metrics', () => {
    const { spawnSync } = require('child_process');
    const result = spawnSync('node', [TOOL, datasetPath, '--k', '1,5,10'], {
      encoding: 'utf8',
      timeout: 10000,
    });
    assert.equal(result.status, 0);
    assert.ok(result.stdout.includes('RAG Evaluation Results'));
    assert.ok(result.stdout.includes('precision@'));
    assert.ok(result.stdout.includes('recall@'));
    assert.ok(result.stdout.includes('mrr@'));
    assert.ok(result.stdout.includes('ndcg@'));
  });

  it('CLI --json outputs valid JSON', () => {
    const { spawnSync } = require('child_process');
    const result = spawnSync('node', [TOOL, datasetPath, '--k', '5', '--json'], {
      encoding: 'utf8',
      timeout: 10000,
    });
    assert.equal(result.status, 0);
    const parsed = JSON.parse(result.stdout);
    assert.equal(parsed.numQueries, 2);
    assert.ok('metrics' in parsed);
  });

  it('CLI writes output file with --out', () => {
    const { spawnSync } = require('child_process');
    const outFile = path.join(tmpdir, 'metrics.json');
    const result = spawnSync('node', [TOOL, datasetPath, '--k', '5', '--out', outFile], {
      encoding: 'utf8',
      timeout: 10000,
    });
    assert.equal(result.status, 0);
    assert.ok(fs.existsSync(outFile));
    const parsed = JSON.parse(fs.readFileSync(outFile, 'utf8'));
    assert.equal(parsed.numQueries, 2);
  });

  it('CLI exits 1 on missing file', () => {
    const { spawnSync } = require('child_process');
    const result = spawnSync('node', [TOOL, '/nonexistent/path.json'], {
      encoding: 'utf8',
      timeout: 5000,
    });
    assert.equal(result.status, 1);
    assert.ok(result.stderr.includes('not found'));
  });

  it('CLI exits 1 with no args (usage)', () => {
    const { spawnSync } = require('child_process');
    const result = spawnSync('node', [TOOL], {
      encoding: 'utf8',
      timeout: 5000,
    });
    assert.equal(result.status, 1);
    assert.ok(result.stderr.includes('Usage'));
  });
});
