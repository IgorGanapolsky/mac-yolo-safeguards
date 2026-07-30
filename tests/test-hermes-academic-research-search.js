'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const {
  evaluateCases,
  readAcademicRecords,
  searchCorpus,
} = require('../tools/hermes-academic-research-search');

const records = [
  record('paper:rag-eval', 'Retrieval Augmented Generation Benchmarks', 'Faithful answer evaluation with grounded citations.', ['retrieval', 'benchmark']),
  record('paper:prompt-injection', 'Indirect Instruction Attack Defenses', 'Security controls stop malicious context from hijacking tool-using agents.', ['security', 'agents']),
  record('paper:judge-calibration', 'Calibrating Model Graders', 'Human agreement, blinded labels, and ordinal rubric reliability for automated evaluators.', ['evaluation', 'calibration']),
  record('paper:code-search', 'Identifier-Aware Semantic Code Search', 'Combines lexical symbol matching with dense representations for source code.', ['code-search', 'hybrid']),
  record('paper:reranking', 'Cross Encoder Ranking for Small Candidate Sets', 'A second-stage relevance model improves precision after candidate generation.', ['reranking']),
  record('paper:chunking', 'Structure-Preserving Document Segmentation', 'Parent passages reconstruct evidence from small child windows without losing section context.', ['chunking', 'parent-child']),
  record('paper:freshness', 'Atomic Incremental Vector Index Updates', 'Content hashes, tombstones, version stamps, and crash-safe index swaps prevent stale retrieval.', ['indexing', 'freshness']),
  record('paper:metadata', 'Policy-Aware Metadata Filters', 'Tenant, sensitivity, source, and license constraints are applied before ranking.', ['metadata', 'privacy']),
  record('paper:embeddings', 'Local Text Representations for Private Corpora', 'On-device embedding models avoid sending sensitive documents to cloud APIs.', ['embeddings', 'privacy']),
  record('paper:rewrite', 'Deterministic Query Expansion', 'Synonym expansion closes vocabulary gaps without model drift or inference latency.', ['query-rewriting']),
  record('paper:dedupe', 'Near Duplicate Detection with Content Fingerprints', 'Stable hashes and similarity checks stop repeated document revisions from polluting results.', ['deduplication']),
  record('paper:observability', 'Retrieval Service Canaries and SLOs', 'Known-answer probes measure source lag, index coverage, latency, and empty-result failures.', ['observability', 'canary']),
  {
    ...record('hf:licensed-model', 'Licensed Agent Evaluation Model', 'An Apache licensed model for evaluation experiments.', ['agents', 'evaluation']),
    source: 'huggingface_model',
    license: 'apache-2.0',
  },
];

const cases = [
  qrel('How do we evaluate RAG answers?', 'paper:rag-eval'),
  qrel('Defend agents from prompt injection', 'paper:prompt-injection'),
  qrel('Make our LLM judge agree with people', 'paper:judge-calibration'),
  qrel('Hybrid BM25 vector search for source code', 'paper:code-search'),
  qrel('Should we use a cross encoder reranker?', 'paper:reranking'),
  qrel('Return parent context from small chunks', 'paper:chunking'),
  qrel('Prevent stale data during reindexing', 'paper:freshness'),
  qrel('Filter private documents by metadata', 'paper:metadata'),
  qrel('Keep embeddings on device', 'paper:embeddings'),
  qrel('Rewrite vague searches with synonyms', 'paper:rewrite'),
  qrel('Remove duplicate document versions', 'paper:dedupe'),
  qrel('Canary metrics for retrieval health', 'paper:observability'),
  {
    query: 'Privacy metadata filters and local embeddings',
    qrels: {
      'paper:metadata': 3,
      'paper:embeddings': 2,
    },
  },
  { query: 'Unpublished coconut scheduling protocol', qrels: {} },
];

const results = searchCorpus(records, 'Hybrid BM25 vector search for source code', {
  top: 5,
  asOf: '2026-07-30T12:00:00Z',
});
assert.strictEqual(results[0].id, 'paper:code-search');
assert(results[0].score > 0);
assert(results[0].matchedTerms.includes('hybrid'));
assert.strictEqual(results[0].contentHash, 'hash-paper:code-search');

const metrics = evaluateCases(records, cases, {
  recallK: 5,
  rankK: 10,
  asOf: '2026-07-30T12:00:00Z',
});
assert.strictEqual(metrics.caseCount, 14);
assert.strictEqual(metrics.relevantCaseCount, 13);
assert.strictEqual(metrics.noAnswerCaseCount, 1);
assert(metrics.recallAtK >= 0.95, JSON.stringify(metrics));
assert(metrics.mrrAtK >= 0.90, JSON.stringify(metrics));
assert(metrics.ndcgAtK >= 0.90, JSON.stringify(metrics));
assert.strictEqual(metrics.noAnswerFalsePositiveRate, 0);
assert.strictEqual(metrics.failures.length, 0, JSON.stringify(metrics));

const mutatedMetrics = evaluateCases(
  records.filter((item) => !['paper:rag-eval', 'paper:prompt-injection'].includes(item.id)),
  cases,
  { recallK: 5, rankK: 10, asOf: '2026-07-30T12:00:00Z' },
);
assert(mutatedMetrics.recallAtK < 0.95, 'removing relevant documents must fail the recall floor');

assert.deepStrictEqual(searchCorpus(records, 'licensed evaluation model', {
  source: 'huggingface_model',
  license: 'apache-2.0',
  top: 5,
  asOf: '2026-07-30T12:00:00Z',
}).map((item) => item.id), ['hf:licensed-model']);
assert.deepStrictEqual(searchCorpus(records, 'metadata privacy filters', {
  tag: 'privacy',
  top: 5,
  asOf: '2026-07-30T12:00:00Z',
}).map((item) => item.id), ['paper:metadata', 'paper:embeddings']);

const multiwordTag = {
  ...record('paper:multiword-tag', 'Model Evaluation Governance', 'Privacy policy controls for graders.', ['privacy policy', 'model evaluation']),
};
assert.deepStrictEqual(searchCorpus([multiwordTag], 'privacy policy controls', {
  tag: 'privacy',
  top: 5,
  asOf: '2026-07-30T12:00:00Z',
}), []);
assert.deepStrictEqual(searchCorpus([multiwordTag], 'model evaluation governance', {
  tag: 'model evaluation',
  top: 5,
  asOf: '2026-07-30T12:00:00Z',
}).map((item) => item.id), ['paper:multiword-tag']);

const duplicateIdRecords = [
  record('paper:duplicate-id', 'Retrieval Benchmark First Revision', 'Evaluation ranking benchmark.', ['retrieval']),
  {
    ...record('paper:duplicate-id', 'Retrieval Benchmark New Revision', 'Evaluation ranking benchmark with corrected labels.', ['retrieval']),
    updatedAt: '2026-07-29T00:00:00.000Z',
  },
];
const duplicateResults = searchCorpus(duplicateIdRecords, 'retrieval evaluation benchmark', {
  top: 10,
  asOf: '2026-07-30T12:00:00Z',
});
assert.strictEqual(duplicateResults.length, 1);
assert.strictEqual(duplicateResults[0].title, 'Retrieval Benchmark New Revision');
const duplicateMetrics = evaluateCases(duplicateIdRecords, [
  { query: 'retrieval evaluation benchmark', qrels: { 'paper:duplicate-id': 3 } },
], { recallK: 5, rankK: 10, asOf: '2026-07-30T12:00:00Z' });
assert(duplicateMetrics.ndcgAtK <= 1, JSON.stringify(duplicateMetrics));
assert.deepStrictEqual(searchCorpus(records, 'query that matches absolutely nothing', {
  top: 5,
  asOf: '2026-07-30T12:00:00Z',
}), []);

const stale = {
  ...record('paper:stale', 'Ancient Retrieval Canary', 'A known answer from an obsolete index.', ['canary']),
  updatedAt: '2024-01-01T00:00:00.000Z',
};
const freshnessFiltered = searchCorpus([...records, stale], 'ancient retrieval canary', {
  maxAgeDays: 30,
  top: 5,
  asOf: '2026-07-30T12:00:00Z',
}).map((item) => item.id);
assert.strictEqual(freshnessFiltered[0], 'paper:observability');
assert(!freshnessFiltered.includes('paper:stale'));

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hermes-academic-search-'));
const corpusPath = path.join(tmp, 'corpus.jsonl');
const storePath = path.join(tmp, 'latest.json');
fs.writeFileSync(corpusPath, `${records.map((item) => JSON.stringify(item)).join('\n')}\n`);
fs.writeFileSync(storePath, `${JSON.stringify({ schemaVersion: 3, status: 'complete', corpus: records })}\n`);
assert.strictEqual(readAcademicRecords({ store: storePath }).sourceType, 'atomic_snapshot');
assert.strictEqual(readAcademicRecords({ corpus: corpusPath }).sourceType, 'jsonl_override');
const cliPath = path.join(__dirname, '..', 'tools', 'hermes-academic-research-search.js');
const cli = spawnSync(process.execPath, [
  cliPath,
  '--store', storePath,
  '--query', 'hybrid code search',
  '--canary-id', 'paper:code-search',
  '--as-of', '2026-07-30T12:00:00Z',
  '--json',
], { encoding: 'utf8' });
assert.strictEqual(cli.status, 0, cli.stderr);
assert.strictEqual(JSON.parse(cli.stdout).results[0].id, 'paper:code-search');
assert.strictEqual(JSON.parse(cli.stdout).sourceType, 'atomic_snapshot');

const failedCanary = spawnSync(process.execPath, [
  cliPath,
  '--store', storePath,
  '--query', 'hybrid code search',
  '--canary-id', 'paper:missing',
  '--as-of', '2026-07-30T12:00:00Z',
  '--json',
], { encoding: 'utf8' });
assert.strictEqual(failedCanary.status, 1);
assert.match(failedCanary.stderr, /known-answer canary failed/i);

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`Hermes academic research search tests: PASS (qrels=${metrics.relevantCaseCount}, no-answer=${metrics.noAnswerCaseCount}, Recall@5=${metrics.recallAtK.toFixed(4)}, MRR@10=${metrics.mrrAtK.toFixed(4)}, nDCG@10=${metrics.ndcgAtK.toFixed(4)}, no-answer-FP=${metrics.noAnswerFalsePositiveRate.toFixed(4)}, mutation-Recall@5=${mutatedMetrics.recallAtK.toFixed(4)})`);

function record(id, title, summary, tags) {
  return {
    id,
    source: 'arxiv',
    title,
    summary,
    url: `https://example.test/${encodeURIComponent(id)}`,
    publishedAt: '2026-07-01T00:00:00.000Z',
    updatedAt: '2026-07-20T00:00:00.000Z',
    authors: ['Test Author'],
    license: null,
    likes: 0,
    downloads: 0,
    tags,
    pipelineTag: null,
    contentHash: `hash-${id}`,
  };
}

function qrel(query, id) {
  return { query, qrels: { [id]: 2 } };
}
