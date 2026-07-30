#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');

const DEFAULT_STORE = path.join(os.homedir(), '.hermes', 'research-rag', 'latest.json');
const DEFAULT_TOP = 5;
const STOP_WORDS = new Set([
  'about', 'absolutely', 'after', 'also', 'and', 'are', 'can', 'data', 'docs', 'document',
  'for', 'from', 'how', 'into', 'make', 'matches', 'nothing', 'our', 'query', 'should',
  'that', 'the', 'their', 'this', 'use', 'using', 'what', 'when', 'with',
]);
const TOKEN_ALIASES = new Map(Object.entries({
  rag: ['retrieval', 'augmented', 'generation'],
  prompt: ['instruction'],
  injection: ['attack', 'hijacking'],
  llm: ['model'],
  judge: ['grader', 'evaluator', 'evaluation'],
  agree: ['agreement', 'human'],
  people: ['human'],
  bm25: ['lexical'],
  vector: ['dense', 'semantic'],
  reranker: ['ranking', 'reranking'],
  chunks: ['child', 'window', 'passage'],
  stale: ['freshness', 'obsolete'],
  reindexing: ['index', 'update'],
  private: ['privacy', 'sensitivity'],
  device: ['local', 'on-device'],
  rewrite: ['expansion'],
  searches: ['retrieval'],
  synonyms: ['synonym', 'expansion'],
  versions: ['revision', 'versioning'],
  metrics: ['measure', 'slo'],
  health: ['observability', 'probe'],
}));

function usage() {
  return `Usage:
  node tools/hermes-academic-research-search.js --query TEXT [options]

Options:
  --store PATH         Atomic academic snapshot (default: ~/.hermes/research-rag/latest.json)
  --corpus PATH        Explicit legacy/test JSONL corpus instead of --store
  --query TEXT         Search question
  --top N              Maximum results, 1-20 (default: 5)
  --source NAME        Require exact source metadata
  --tag TAG            Require an exact normalized tag
  --license LICENSE    Require an exact license
  --max-age-days N     Exclude missing or older source timestamps
  --as-of ISO          Stable clock for tests/audits (default: now)
  --canary-id ID       Exit nonzero unless this known document is returned
  --json               Print structured output
  --help               Show this help

This consumer is intentionally local and deterministic. At the current corpus
size it avoids a second durable index and its associated staleness failure mode.`;
}

function parseArgs(argv) {
  const args = {
    store: DEFAULT_STORE,
    corpus: null,
    query: '',
    top: DEFAULT_TOP,
    source: null,
    tag: null,
    license: null,
    maxAgeDays: null,
    asOf: null,
    canaryId: null,
    json: false,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--store') args.store = path.resolve(requireValue(argv, ++index, arg));
    else if (arg === '--corpus') args.corpus = path.resolve(requireValue(argv, ++index, arg));
    else if (arg === '--query') args.query = requireValue(argv, ++index, arg).trim();
    else if (arg === '--top') args.top = boundedInteger(requireValue(argv, ++index, arg), 1, 20, arg);
    else if (arg === '--source') args.source = requireValue(argv, ++index, arg).trim();
    else if (arg === '--tag') args.tag = requireValue(argv, ++index, arg).trim();
    else if (arg === '--license') args.license = requireValue(argv, ++index, arg).trim();
    else if (arg === '--max-age-days') args.maxAgeDays = boundedInteger(requireValue(argv, ++index, arg), 0, 36500, arg);
    else if (arg === '--as-of') args.asOf = validDate(requireValue(argv, ++index, arg), arg).toISOString();
    else if (arg === '--canary-id') args.canaryId = requireValue(argv, ++index, arg).trim();
    else if (arg === '--json') args.json = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!args.help && !args.query) throw new Error('--query is required');
  return args;
}

function requireValue(argv, index, flag) {
  if (!argv[index]) throw new Error(`${flag} requires a value`);
  return argv[index];
}

function boundedInteger(value, minimum, maximum, flag) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${flag} must be an integer from ${minimum} to ${maximum}`);
  }
  return parsed;
}

function validDate(value, flag) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error(`${flag} must be an ISO date`);
  return date;
}

function stem(token) {
  if (token.length > 5 && token.endsWith('ies')) return `${token.slice(0, -3)}y`;
  if (token.length > 5 && token.endsWith('ing')) return token.slice(0, -3);
  if (token.length > 4 && token.endsWith('ed')) return token.slice(0, -2);
  if (token.length > 4 && token.endsWith('s') && !token.endsWith('ss')) return token.slice(0, -1);
  return token;
}

function rawTokens(value) {
  return String(value || '').toLowerCase().match(/[a-z0-9][a-z0-9-]{1,}/g) || [];
}

function tokenize(value) {
  return rawTokens(value)
    .filter((token) => !STOP_WORDS.has(token))
    .map(stem)
    .filter((token) => token.length >= 2);
}

function rewriteQuery(query) {
  const expanded = [];
  for (const token of rawTokens(query)) {
    if (!STOP_WORDS.has(token)) expanded.push(stem(token));
    for (const alias of TOKEN_ALIASES.get(token) || []) expanded.push(stem(alias));
  }
  return [...new Set(expanded.filter((token) => token.length >= 2))];
}

function readCorpus(corpusPath) {
  if (!fs.existsSync(corpusPath)) throw new Error(`Academic corpus not found: ${corpusPath}`);
  return fs.readFileSync(corpusPath, 'utf8').split('\n').filter(Boolean).map((line, index) => {
    try {
      return JSON.parse(line);
    } catch (error) {
      throw new Error(`Invalid JSONL at ${corpusPath}:${index + 1}: ${error.message}`);
    }
  });
}

function readAcademicRecords(options = {}) {
  if (options.corpus) {
    return { records: readCorpus(options.corpus), sourcePath: options.corpus, sourceType: 'jsonl_override' };
  }
  const storePath = options.store || DEFAULT_STORE;
  if (!fs.existsSync(storePath)) throw new Error(`Academic snapshot not found: ${storePath}`);
  let snapshot;
  try {
    snapshot = JSON.parse(fs.readFileSync(storePath, 'utf8'));
  } catch (error) {
    throw new Error(`Invalid academic snapshot ${storePath}: ${error.message}`);
  }
  if (Array.isArray(snapshot.corpus)) {
    return { records: snapshot.corpus, sourcePath: storePath, sourceType: 'atomic_snapshot' };
  }
  const legacyCorpus = path.join(path.dirname(storePath), 'corpus.jsonl');
  return { records: readCorpus(legacyCorpus), sourcePath: legacyCorpus, sourceType: 'legacy_jsonl_fallback' };
}

function searchCorpus(records, query, options = {}) {
  const terms = rewriteQuery(query);
  if (terms.length === 0) return [];
  const asOf = options.asOf ? validDate(options.asOf, 'asOf') : new Date();
  const candidates = dedupeRecords(records).filter((record) => metadataMatches(record, options, asOf));
  if (candidates.length === 0) return [];
  const tokenized = candidates.map((record) => ({
    record,
    fields: {
      title: tokenize(record.title),
      tags: tokenize(Array.isArray(record.tags) ? record.tags.join(' ') : ''),
      summary: tokenize(record.summary),
      authors: tokenize(Array.isArray(record.authors) ? record.authors.join(' ') : ''),
      identity: tokenize(`${record.id || ''} ${record.source || ''} ${record.pipelineTag || ''}`),
    },
  }));
  const documentFrequency = new Map();
  for (const { fields } of tokenized) {
    const present = new Set(Object.values(fields).flat());
    for (const term of terms) {
      if (present.has(term)) documentFrequency.set(term, (documentFrequency.get(term) || 0) + 1);
    }
  }
  const weights = { title: 4, tags: 3, summary: 1.5, authors: 0.5, identity: 0.5 };
  return tokenized.map(({ record, fields }) => {
    let score = 0;
    const matchedTerms = [];
    for (const term of terms) {
      let weightedFrequency = 0;
      for (const [field, tokens] of Object.entries(fields)) {
        const frequency = tokens.filter((token) => token === term).length;
        weightedFrequency += frequency * weights[field];
      }
      if (weightedFrequency === 0) continue;
      matchedTerms.push(term);
      const frequency = documentFrequency.get(term) || 0;
      const inverseDocumentFrequency = Math.log(1 + ((candidates.length - frequency + 0.5) / (frequency + 0.5)));
      score += inverseDocumentFrequency * ((weightedFrequency * 2.2) / (weightedFrequency + 1.2));
    }
    return {
      id: record.id,
      source: record.source,
      title: record.title,
      summary: record.summary,
      url: record.url,
      publishedAt: record.publishedAt || null,
      updatedAt: record.updatedAt || null,
      authors: Array.isArray(record.authors) ? record.authors : [],
      license: record.license || null,
      tags: Array.isArray(record.tags) ? record.tags : [],
      contentHash: record.contentHash || null,
      score: Math.round(score * 1000000) / 1000000,
      matchedTerms,
    };
  }).filter((result) => result.score > 0)
    .sort((left, right) => right.score - left.score || left.id.localeCompare(right.id))
    .slice(0, options.top || DEFAULT_TOP);
}

function metadataMatches(record, options, asOf) {
  if (options.source && record.source !== options.source) return false;
  if (options.license && String(record.license || '').toLowerCase() !== String(options.license).toLowerCase()) return false;
  if (options.tag) {
    const wanted = normalizeMetadataValue(options.tag);
    const tags = (Array.isArray(record.tags) ? record.tags : []).map(normalizeMetadataValue);
    if (!tags.includes(wanted)) return false;
  }
  if (options.maxAgeDays !== null && options.maxAgeDays !== undefined) {
    const sourceDate = record.updatedAt || record.publishedAt;
    if (!sourceDate) return false;
    const parsed = new Date(sourceDate);
    if (Number.isNaN(parsed.getTime())) return false;
    const ageDays = (asOf.getTime() - parsed.getTime()) / 86400000;
    if (ageDays < 0 || ageDays > options.maxAgeDays) return false;
  }
  return true;
}

function normalizeMetadataValue(value) {
  return String(value || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function dedupeRecords(records) {
  const byId = new Map();
  for (const record of records) {
    if (!record || !record.id) continue;
    const existing = byId.get(record.id);
    if (!existing || compareRevision(record, existing) > 0) byId.set(record.id, record);
  }
  return [...byId.values()];
}

function compareRevision(left, right) {
  const leftTime = Date.parse(left.updatedAt || left.publishedAt || '') || 0;
  const rightTime = Date.parse(right.updatedAt || right.publishedAt || '') || 0;
  if (leftTime !== rightTime) return leftTime - rightTime;
  return String(left.contentHash || '').localeCompare(String(right.contentHash || ''));
}

function evaluateCases(records, cases, options = {}) {
  const recallK = options.recallK || options.k || DEFAULT_TOP;
  const rankK = options.rankK || options.k || DEFAULT_TOP;
  const candidateK = Math.max(recallK, rankK);
  let recallTotal = 0;
  let reciprocalRankTotal = 0;
  let ndcgTotal = 0;
  let relevantCaseCount = 0;
  let noAnswerCaseCount = 0;
  let noAnswerFalsePositives = 0;
  const failures = [];
  const details = cases.map((testCase) => {
    const qrels = testCase.qrels || {};
    const relevant = Object.keys(qrels).filter((id) => Number(qrels[id]) > 0);
    const results = searchCorpus(records, testCase.query, {
      ...options,
      ...(testCase.filters || {}),
      top: candidateK,
    });
    const returnedIds = results.map((result) => result.id).slice(0, rankK);
    const recallIds = results.map((result) => result.id).slice(0, recallK);
    const hits = relevant.filter((id) => recallIds.includes(id));
    const hasRelevant = relevant.length > 0;
    const recall = hasRelevant ? hits.length / relevant.length : (returnedIds.length === 0 ? 1 : 0);
    const firstRelevantRank = returnedIds.findIndex((id) => Number(qrels[id] || 0) > 0);
    const reciprocalRank = hasRelevant ? (firstRelevantRank >= 0 ? 1 / (firstRelevantRank + 1) : 0) : null;
    const dcg = returnedIds.reduce((sum, id, index) => sum + ((2 ** Number(qrels[id] || 0) - 1) / Math.log2(index + 2)), 0);
    const idealGrades = Object.values(qrels).map(Number).filter((grade) => grade > 0).sort((a, b) => b - a).slice(0, rankK);
    const idealDcg = idealGrades.reduce((sum, grade, index) => sum + ((2 ** grade - 1) / Math.log2(index + 2)), 0);
    const ndcg = idealDcg > 0 ? dcg / idealDcg : (returnedIds.length === 0 ? 1 : 0);
    if (hasRelevant) {
      relevantCaseCount += 1;
      recallTotal += recall;
      reciprocalRankTotal += reciprocalRank;
      ndcgTotal += ndcg;
    } else {
      noAnswerCaseCount += 1;
      if (returnedIds.length > 0) noAnswerFalsePositives += 1;
    }
    if (recall < 1 || ndcg < 1) failures.push({
      query: testCase.query,
      expected: relevant,
      returned: returnedIds,
      recallAtK: round(recall),
      reciprocalRank: reciprocalRank === null ? null : round(reciprocalRank),
      ndcgAtK: round(ndcg),
    });
    return {
      query: testCase.query,
      returned: returnedIds,
      recallAtK: round(recall),
      reciprocalRank: reciprocalRank === null ? null : round(reciprocalRank),
      ndcgAtK: round(ndcg),
    };
  });
  const denominator = relevantCaseCount || 1;
  return {
    caseCount: cases.length,
    relevantCaseCount,
    noAnswerCaseCount,
    recallK,
    rankK,
    recallAtK: round(recallTotal / denominator),
    mrrAtK: round(reciprocalRankTotal / denominator),
    ndcgAtK: round(ndcgTotal / denominator),
    noAnswerFalsePositiveRate: noAnswerCaseCount > 0 ? round(noAnswerFalsePositives / noAnswerCaseCount) : 0,
    failures,
    details,
  };
}

function round(value) {
  return Math.round(value * 10000) / 10000;
}

function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
      console.log(usage());
      return;
    }
    const loaded = readAcademicRecords(args);
    const records = loaded.records;
    const results = searchCorpus(records, args.query, args);
    if (args.canaryId && !results.some((result) => result.id === args.canaryId)) {
      throw new Error(`Known-answer canary failed: expected ${args.canaryId} in top ${args.top}`);
    }
    const output = {
      query: args.query,
      corpus: loaded.sourcePath,
      sourceType: loaded.sourceType,
      corpusRecords: records.length,
      filters: {
        source: args.source,
        tag: args.tag,
        license: args.license,
        maxAgeDays: args.maxAgeDays,
      },
      canary: args.canaryId ? { id: args.canaryId, ok: true } : null,
      count: results.length,
      results,
    };
    if (args.json) console.log(JSON.stringify(output, null, 2));
    else {
      for (const result of results) console.log(`${result.score.toFixed(4)}\t${result.id}\t${result.title}\t${result.url}`);
    }
  } catch (error) {
    console.error(`Hermes academic search failed: ${error.message}`);
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = {
  dedupeRecords,
  evaluateCases,
  parseArgs,
  readAcademicRecords,
  readCorpus,
  rewriteQuery,
  searchCorpus,
  tokenize,
};
