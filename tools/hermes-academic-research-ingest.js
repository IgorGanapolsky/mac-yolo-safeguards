#!/usr/bin/env node
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const DEFAULT_OUTPUT_DIR = path.join(os.homedir(), '.hermes', 'research-rag');
const DEFAULT_QUERY = 'agent evaluation retrieval security tool use coding agents';
const DEFAULT_MAX_RESULTS = 10;
const DEFAULT_TOP = 5;
const MAX_REQUESTS = 2;
const MAX_RESPONSE_BYTES = 2 * 1024 * 1024;
const ALLOWED_HOSTS = new Set(['export.arxiv.org', 'huggingface.co']);

function usage() {
  return `Usage:
  node tools/hermes-academic-research-ingest.js [options]

Options:
  --out-dir PATH       Private output directory (default: ~/.hermes/research-rag)
  --query TEXT         Bounded research query
  --max-results N      Results per source, 1-20 (default: 10)
  --top N              Evidence/proposals emitted, 1-10 (default: 5)
  --fixture PATH       Offline JSON array of normalized items
  --force              Run again even when today's receipt exists
  --json               Print the full receipt as JSON
  --help               Show this help

The job reads public metadata only. It never downloads model artifacts, executes
dataset code, enables trust_remote_code, changes production routing, or purchases
inference.`;
}

function parseArgs(argv) {
  const args = {
    outDir: DEFAULT_OUTPUT_DIR,
    query: DEFAULT_QUERY,
    maxResults: DEFAULT_MAX_RESULTS,
    top: DEFAULT_TOP,
    fixture: null,
    force: false,
    json: false,
    help: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--out-dir') args.outDir = path.resolve(requireValue(argv, ++index, arg));
    else if (arg === '--query') args.query = requireValue(argv, ++index, arg).trim();
    else if (arg === '--max-results') args.maxResults = boundedInteger(requireValue(argv, ++index, arg), 1, 20, arg);
    else if (arg === '--top') args.top = boundedInteger(requireValue(argv, ++index, arg), 1, 10, arg);
    else if (arg === '--fixture') args.fixture = path.resolve(requireValue(argv, ++index, arg));
    else if (arg === '--force') args.force = true;
    else if (arg === '--json') args.json = true;
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!args.query) throw new Error('--query cannot be empty');
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

function decodeXml(value) {
  return String(value || '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function tagValue(block, tag) {
  const match = block.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i'));
  return match ? decodeXml(match[1]).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : '';
}

function parseArxivAtom(xml) {
  const entries = String(xml || '').match(/<entry\b[\s\S]*?<\/entry>/gi) || [];
  return entries.map((entry) => {
    const idUrl = tagValue(entry, 'id');
    const arxivId = idUrl.split('/').pop() || idUrl;
    const authors = [...entry.matchAll(/<author\b[\s\S]*?<name(?:\s[^>]*)?>([\s\S]*?)<\/name>[\s\S]*?<\/author>/gi)]
      .map((match) => decodeXml(match[1]).replace(/\s+/g, ' ').trim())
      .filter(Boolean)
      .slice(0, 12);
    return normalizeItem({
      source: 'arxiv',
      id: `arxiv:${arxivId}`,
      title: tagValue(entry, 'title'),
      summary: tagValue(entry, 'summary'),
      url: idUrl.replace(/^http:/i, 'https:'),
      publishedAt: tagValue(entry, 'published') || tagValue(entry, 'updated'),
      updatedAt: tagValue(entry, 'updated'),
      authors,
      license: null,
      likes: 0,
      downloads: 0,
      tags: [...entry.matchAll(/<category\s+[^>]*term=["']([^"']+)["'][^>]*\/?\s*>/gi)].map((match) => match[1]).slice(0, 16),
    });
  }).filter((item) => item.id && item.title && item.url);
}

function parseHuggingFaceModels(payload) {
  if (!Array.isArray(payload)) return [];
  return payload.map((model) => normalizeItem({
    source: 'huggingface_model',
    id: `hf:model:${model.id || model.modelId || ''}`,
    title: model.id || model.modelId || '',
    summary: Array.isArray(model.tags) ? model.tags.join(' ') : '',
    url: model.id ? `https://huggingface.co/${model.id}` : '',
    publishedAt: model.createdAt || model.lastModified || null,
    updatedAt: model.lastModified || null,
    authors: model.author ? [model.author] : [],
    license: extractLicense(model),
    likes: Number(model.likes || 0),
    downloads: Number(model.downloads || 0),
    tags: Array.isArray(model.tags) ? model.tags.slice(0, 32) : [],
    pipelineTag: model.pipeline_tag || null,
  })).filter((item) => item.id !== 'hf:model:' && item.title && item.url);
}

function extractLicense(model) {
  if (model.cardData && typeof model.cardData.license === 'string') return model.cardData.license;
  const licenseTag = Array.isArray(model.tags) ? model.tags.find((tag) => String(tag).startsWith('license:')) : null;
  return licenseTag ? String(licenseTag).slice('license:'.length) : null;
}

function normalizeItem(item) {
  const normalized = {
    source: String(item.source || '').trim(),
    id: String(item.id || '').trim(),
    title: String(item.title || '').replace(/\s+/g, ' ').trim(),
    summary: String(item.summary || '').replace(/\s+/g, ' ').trim(),
    url: String(item.url || '').trim(),
    publishedAt: validIso(item.publishedAt),
    updatedAt: validIso(item.updatedAt),
    authors: Array.isArray(item.authors) ? item.authors.map(String).filter(Boolean).slice(0, 12) : [],
    license: item.license ? String(item.license) : null,
    likes: Math.max(0, Number(item.likes || 0)),
    downloads: Math.max(0, Number(item.downloads || 0)),
    tags: Array.isArray(item.tags) ? item.tags.map(String).filter(Boolean).slice(0, 32) : [],
    pipelineTag: item.pipelineTag ? String(item.pipelineTag) : null,
  };
  normalized.contentHash = sha256(JSON.stringify({
    source: normalized.source,
    id: normalized.id,
    title: normalized.title,
    summary: normalized.summary,
    url: normalized.url,
    updatedAt: normalized.updatedAt,
    license: normalized.license,
    tags: normalized.tags,
  }));
  return normalized;
}

function validIso(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function sha256(value) {
  return crypto.createHash('sha256').update(String(value)).digest('hex');
}

function queryTerms(query) {
  return [...new Set(String(query).toLowerCase().match(/[a-z0-9][a-z0-9_-]{2,}/g) || [])].slice(0, 24);
}

function scoreItem(item, options = {}) {
  const now = options.now ? new Date(options.now) : new Date();
  const terms = options.terms || queryTerms(options.query || DEFAULT_QUERY);
  const seenIds = options.seenIds || new Set();
  const seenHashes = options.seenHashes || new Set();
  const haystack = `${item.title} ${item.summary} ${item.tags.join(' ')} ${item.pipelineTag || ''}`.toLowerCase();
  const matchedTerms = terms.filter((term) => haystack.includes(term));
  const relevance = terms.length ? Math.min(1, matchedTerms.length / Math.min(6, terms.length)) : 0;
  const dateValue = item.updatedAt || item.publishedAt;
  const ageDays = dateValue ? Math.max(0, (now.getTime() - new Date(dateValue).getTime()) / 86400000) : 3650;
  const recency = ageDays <= 7 ? 1 : ageDays <= 30 ? 0.8 : ageDays <= 90 ? 0.5 : ageDays <= 365 ? 0.25 : 0.1;
  const community = item.source === 'huggingface_model'
    ? Math.min(1, (Math.log10(item.downloads + 1) / 7) * 0.75 + (Math.log10(item.likes + 1) / 4) * 0.25)
    : 0;
  const novelty = seenIds.has(item.id) || seenHashes.has(item.contentHash) ? 0 : 1;
  const actionPatterns = ['eval', 'benchmark', 'agent', 'tool', 'retrieval', 'security', 'govern', 'cost', 'latency', 'coding'];
  const actionability = Math.min(1, actionPatterns.filter((term) => haystack.includes(term)).length / 4);
  const riskFlags = [];
  if (item.source === 'huggingface_model' && !item.license) riskFlags.push('missing_license_metadata');
  if (item.source === 'huggingface_model' && item.tags.some((tag) => /(?:quantized|merge|gguf|mlx)/i.test(tag))) {
    riskFlags.push('derived_or_quantized_artifact');
  }
  const riskPenalty = Math.min(0.3,
    (riskFlags.includes('missing_license_metadata') ? 0.2 : 0)
      + (riskFlags.includes('derived_or_quantized_artifact') ? 0.1 : 0));
  const total = Math.max(0, (relevance * 0.4) + (recency * 0.2) + (community * 0.15) + (novelty * 0.15) + (actionability * 0.1) - riskPenalty);
  return {
    relevance: round(relevance),
    recency: round(recency),
    citations: 0,
    community: round(community),
    novelty: round(novelty),
    actionability: round(actionability),
    riskPenalty: round(riskPenalty),
    riskFlags,
    total: round(total),
    matchedTerms,
  };
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}

function boundedErrorMessage(error, maximumLength = 500) {
  const message = error?.message ? String(error.message) : String(error || 'unknown error');
  return message.length <= maximumLength ? message : `${message.slice(0, maximumLength - 1)}…`;
}

function exitCodeForStatus(status) {
  if (status === 'partial') return 2;
  if (status === 'failed') return 1;
  return 0;
}

function buildArxivUrl(query, maxResults) {
  const terms = queryTerms(query).slice(0, 8);
  const phrase = terms.length ? terms.map((term) => `all:${JSON.stringify(term)}`).join(' OR ') : 'all:"agent"';
  const search = `(cat:cs.AI OR cat:cs.CL OR cat:cs.SE) AND (${phrase})`;
  const url = new URL('https://export.arxiv.org/api/query');
  url.searchParams.set('search_query', search);
  url.searchParams.set('start', '0');
  url.searchParams.set('max_results', String(maxResults));
  url.searchParams.set('sortBy', 'submittedDate');
  url.searchParams.set('sortOrder', 'descending');
  return url;
}

function buildHuggingFaceUrl(query, maxResults) {
  const url = new URL('https://huggingface.co/api/models');
  // Hub search is conjunctive enough that a multi-term phrase can silently return
  // zero records. Discover broadly with the highest-signal term, then let the local
  // deterministic scorer enforce the full query.
  url.searchParams.set('search', queryTerms(query)[0] || 'agent');
  url.searchParams.set('sort', 'lastModified');
  url.searchParams.set('direction', '-1');
  url.searchParams.set('limit', String(maxResults));
  url.searchParams.set('full', 'true');
  url.searchParams.set('config', 'false');
  return url;
}

async function fetchBounded(url, options = {}) {
  const parsed = url instanceof URL ? url : new URL(url);
  if (!ALLOWED_HOSTS.has(parsed.hostname)) throw new Error(`Host is not allowlisted: ${parsed.hostname}`);
  const timeoutMs = options.timeoutMs || 12000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(parsed, {
      redirect: 'error',
      signal: controller.signal,
      headers: { 'User-Agent': 'HermesResearchRAG/1.0 (metadata-only; contact: iganapolsky@gmail.com)' },
    });
    if (!response.ok) throw new Error(`${parsed.hostname} returned HTTP ${response.status}`);
    const length = Number(response.headers.get('content-length') || 0);
    if (length > MAX_RESPONSE_BYTES) throw new Error(`${parsed.hostname} response exceeds ${MAX_RESPONSE_BYTES} bytes`);
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength > MAX_RESPONSE_BYTES) throw new Error(`${parsed.hostname} response exceeds ${MAX_RESPONSE_BYTES} bytes`);
    return { body: buffer.toString('utf8'), contentType: response.headers.get('content-type') || '' };
  } catch (error) {
    const details = [];
    if (error?.name && error.name !== 'Error') details.push(error.name);
    if (error?.message) details.push(error.message);
    if (error?.cause?.code) details.push(`cause=${error.cause.code}`);
    if (error?.cause?.message && error.cause.message !== error.message) {
      details.push(`causeMessage=${error.cause.message}`);
    }
    throw new Error(`${parsed.hostname} metadata request failed: ${details.join('; ') || 'unknown error'}`);
  } finally {
    clearTimeout(timeout);
  }
}

function readCorpus(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, 'utf8').split('\n').filter(Boolean).map((line) => JSON.parse(line));
}

function buildReceipt(items, options = {}) {
  const corpus = options.corpus || [];
  const seenIds = new Set(corpus.map((item) => item.id));
  const seenHashes = new Set(corpus.map((item) => item.contentHash));
  const terms = queryTerms(options.query || DEFAULT_QUERY);
  const scored = items.map((item) => ({ ...normalizeItem(item), score: scoreItem(normalizeItem(item), { now: options.now, terms, seenIds, seenHashes }) }))
    .sort((left, right) => right.score.total - left.score.total || left.id.localeCompare(right.id));
  const unique = scored.filter((item, index, list) => list.findIndex((candidate) => candidate.id === item.id || candidate.contentHash === item.contentHash) === index);
  const newItems = unique.filter((item) => item.score.novelty === 1);
  const topLimit = options.top || DEFAULT_TOP;
  const sourceCap = Math.max(1, Math.ceil(topLimit / 2));
  const sourceCounts = new Map();
  const top = [];
  for (const item of unique) {
    const count = sourceCounts.get(item.source) || 0;
    if (count >= sourceCap) continue;
    top.push(item);
    sourceCounts.set(item.source, count + 1);
    if (top.length >= topLimit) break;
  }
  const sourceDigest = sha256(unique.map((item) => `${item.id}:${item.contentHash}`).sort().join('\n'));
  const previousDigest = options.previousDigest || null;
  const unchanged = Boolean(previousDigest && previousDigest === sourceDigest);
  return {
    schemaVersion: 3,
    generatedAt: (options.now ? new Date(options.now) : new Date()).toISOString(),
    query: options.query || DEFAULT_QUERY,
    mode: 'metadata_only_proposal_only',
    policy: {
      requestCap: MAX_REQUESTS,
      maxResponseBytes: MAX_RESPONSE_BYTES,
      automaticModelDownloads: false,
      arbitraryCodeExecution: false,
      trustRemoteCode: false,
      productionMutation: false,
      paidInference: false,
    },
    summary: {
      discovered: items.length,
      unique: unique.length,
      new: newItems.length,
      unchanged,
      sourceDigest,
    },
    evidence: top,
    proposals: unchanged ? [] : top.filter((item) => item.score.novelty === 1)
      .filter((item) => item.source !== 'huggingface_model' || (item.license && item.score.riskFlags.length === 0))
      .map((item) => ({
      type: 'evaluate_evidence',
      sourceId: item.id,
      hypothesis: `Review whether ${item.title} improves an existing Hermes eval, retrieval, governance, or cost-control lane.`,
      requiredProof: ['primary source read', 'bounded local benchmark', 'cost and license check', 'independent regression gate'],
      automaticAction: false,
    })),
    allItems: unique,
  };
}

function ensurePrivateDirectory(directory) {
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
  fs.chmodSync(directory, 0o700);
}

function atomicWriteFile(filePath, value, options = {}) {
  ensurePrivateDirectory(path.dirname(filePath));
  const temporaryPath = path.join(
    path.dirname(filePath),
    `.${path.basename(filePath)}.tmp-${process.pid}-${crypto.randomBytes(6).toString('hex')}`,
  );
  let descriptor = null;
  try {
    descriptor = fs.openSync(temporaryPath, 'wx', 0o600);
    fs.writeFileSync(descriptor, value, 'utf8');
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = null;
    if (typeof options.beforeRename === 'function') options.beforeRename(temporaryPath, filePath);
    fs.renameSync(temporaryPath, filePath);
    fs.chmodSync(filePath, 0o600);
    const directoryDescriptor = fs.openSync(path.dirname(filePath), 'r');
    try {
      fs.fsyncSync(directoryDescriptor);
    } finally {
      fs.closeSync(directoryDescriptor);
    }
  } catch (error) {
    if (descriptor !== null) fs.closeSync(descriptor);
    if (fs.existsSync(temporaryPath)) fs.unlinkSync(temporaryPath);
    throw error;
  }
}

function writePrivateJson(filePath, value, options = {}) {
  atomicWriteFile(filePath, `${JSON.stringify(value, null, 2)}\n`, options);
}

function mergeCorpus(existing, items) {
  const byId = new Map(existing.map((item) => [item.id, item]));
  items.forEach((item) => byId.set(item.id, item));
  return [...byId.values()].sort((left, right) => left.id.localeCompare(right.id));
}

function serializeCorpus(items) {
  const payload = items.map((item) => JSON.stringify(item)).join('\n');
  return payload ? `${payload}\n` : '';
}

async function discover(args, options = {}) {
  const now = options.now ? new Date(options.now) : new Date();
  if (args.fixture) {
    const fixture = JSON.parse(fs.readFileSync(args.fixture, 'utf8'));
    if (!Array.isArray(fixture)) throw new Error('--fixture must contain a JSON array');
    return {
      status: 'complete',
      items: fixture.map(normalizeItem),
      sources: [{
        name: 'fixture',
        status: 'complete',
        requestCount: 0,
        itemCount: fixture.length,
        attemptedAt: now.toISOString(),
      }],
    };
  }
  const fetchImpl = options.fetchImpl || fetchBounded;
  const sourceSpecs = [
    {
      name: 'arxiv',
      url: buildArxivUrl(args.query, args.maxResults),
      parse: (response) => {
        if (!/<feed(?:\s|>)/i.test(response.body)) throw new Error('arXiv response schema is not an Atom feed');
        return parseArxivAtom(response.body);
      },
    },
    {
      name: 'huggingface_models',
      url: buildHuggingFaceUrl(args.query, args.maxResults),
      parse: (response) => {
        const payload = JSON.parse(response.body);
        if (!Array.isArray(payload)) throw new Error('Hugging Face response schema is not a model array');
        return parseHuggingFaceModels(payload);
      },
    },
  ];
  const settled = await Promise.all(sourceSpecs.map(async (source) => {
    try {
      const response = await fetchImpl(source.url);
      const sourceItems = source.parse(response);
      return {
        items: sourceItems,
        source: {
          name: source.name,
          status: 'complete',
          requestCount: 1,
          itemCount: sourceItems.length,
          url: source.url.toString(),
          attemptedAt: now.toISOString(),
          error: null,
        },
      };
    } catch (error) {
      return {
        items: [],
        source: {
          name: source.name,
          status: 'failed',
          requestCount: 1,
          itemCount: 0,
          url: source.url.toString(),
          attemptedAt: now.toISOString(),
          error: boundedErrorMessage(error),
        },
      };
    }
  }));
  const items = settled.flatMap((result) => result.items);
  const sources = settled.map((result) => result.source);
  const requests = sources.reduce((sum, source) => sum + source.requestCount, 0);
  if (requests > MAX_REQUESTS) throw new Error(`Request cap exceeded: ${requests}/${MAX_REQUESTS}`);
  const completed = sources.filter((source) => source.status === 'complete').length;
  return {
    status: completed === sources.length ? 'complete' : completed > 0 ? 'partial' : 'failed',
    items,
    sources,
  };
}

async function run(args, options = {}) {
  ensurePrivateDirectory(args.outDir);
  const now = options.now ? new Date(options.now) : new Date();
  const today = now.toISOString().slice(0, 10);
  const dailyPath = path.join(args.outDir, `${today}.json`);
  const latestPath = path.join(args.outDir, 'latest.json');
  const corpusPath = path.join(args.outDir, 'corpus.jsonl');
  const previous = fs.existsSync(latestPath) ? JSON.parse(fs.readFileSync(latestPath, 'utf8')) : null;
  if (!args.force && previous?.status === 'complete' && previous.generatedAt?.slice(0, 10) === today) return previous;
  const corpus = Array.isArray(previous?.corpus) ? previous.corpus : readCorpus(corpusPath);
  const discoverImpl = options.discoverImpl || discover;
  const discovered = await discoverImpl(args, { now: now.toISOString() });
  if (discovered.status === 'failed') {
    const attempt = {
      schemaVersion: 3,
      status: 'failed',
      generatedAt: now.toISOString(),
      query: args.query,
      mode: 'metadata_only_proposal_only',
      sources: discovered.sources,
      summary: {
        discovered: 0,
        unique: 0,
        new: 0,
        unchanged: true,
        sourceDigest: previous?.summary?.sourceDigest || null,
      },
      lastGoodGeneratedAt: previous?.generatedAt || null,
    };
    const attemptsDirectory = path.join(args.outDir, 'attempts');
    ensurePrivateDirectory(attemptsDirectory);
    const attemptName = `${now.toISOString().replace(/[:.]/g, '-')}-${crypto.randomBytes(4).toString('hex')}.json`;
    const attemptPath = path.join(attemptsDirectory, attemptName);
    writePrivateJson(attemptPath, attempt);
    const failure = new Error(`All academic metadata sources failed; last-good corpus preserved; attempt=${attemptPath}`);
    failure.attemptPath = attemptPath;
    throw failure;
  }
  const receipt = buildReceipt(discovered.items, {
    now: now.toISOString(),
    query: args.query,
    top: args.top,
    corpus,
    previousDigest: previous && previous.summary ? previous.summary.sourceDigest : null,
  });
  receipt.status = discovered.status;
  receipt.sources = discovered.sources;
  receipt.corpus = mergeCorpus(corpus, receipt.allItems);
  const serializedCorpus = serializeCorpus(receipt.corpus);
  receipt.corpusHash = sha256(serializedCorpus);
  receipt.generationId = `academic-${now.toISOString().replace(/[-:.TZ]/g, '')}-${receipt.corpusHash.slice(0, 12)}`;

  // latest.json is the single authoritative snapshot: receipt, source statuses,
  // and the full corpus commit in one atomic rename. JSONL and daily files are
  // compatibility exports and cannot make a committed snapshot inconsistent.
  writePrivateJson(latestPath, receipt, { beforeRename: options.beforeCommit });
  for (const [exportPath, writer] of [
    [corpusPath, () => atomicWriteFile(corpusPath, serializedCorpus)],
    [dailyPath, () => writePrivateJson(dailyPath, receipt)],
  ]) {
    try {
      writer();
    } catch (error) {
      const warning = `Academic compatibility export failed (${exportPath}): ${boundedErrorMessage(error)}`;
      if (typeof options.onExportWarning === 'function') options.onExportWarning(warning);
      else console.error(warning);
    }
  }
  return receipt;
}

async function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
      console.log(usage());
      return;
    }
    const receipt = await run(args);
    if (args.json) console.log(JSON.stringify(receipt, null, 2));
    else console.log(`Hermes academic RAG: ${receipt.summary.new} new / ${receipt.summary.unique} unique; proposals=${receipt.proposals.length}; unchanged=${receipt.summary.unchanged}`);
    process.exitCode = exitCodeForStatus(receipt.status);
  } catch (error) {
    console.error(`Hermes academic RAG failed: ${error.message}`);
    process.exitCode = 1;
  }
}

if (require.main === module) main();

module.exports = {
  ALLOWED_HOSTS,
  MAX_REQUESTS,
  atomicWriteFile,
  boundedErrorMessage,
  buildArxivUrl,
  buildHuggingFaceUrl,
  buildReceipt,
  decodeXml,
  discover,
  extractLicense,
  fetchBounded,
  exitCodeForStatus,
  normalizeItem,
  parseArgs,
  parseArxivAtom,
  parseHuggingFaceModels,
  queryTerms,
  run,
  scoreItem,
  serializeCorpus,
  sha256,
};
