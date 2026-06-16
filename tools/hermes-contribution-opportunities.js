#!/usr/bin/env node
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const DEFAULT_REPO = 'NousResearch/hermes-agent';
const DEFAULT_LIMIT = 120;
const DEFAULT_OUT_DIR = path.join(os.homedir(), 'Library', 'Application Support', 'mac-yolo-safeguards');
const DEFAULT_OUT = path.join(DEFAULT_OUT_DIR, 'hermes-contribution-opportunities.json');
const DEFAULT_MARKDOWN_OUT = path.join(DEFAULT_OUT_DIR, 'hermes-contribution-opportunities.md');
const DEFAULT_RAG = path.join(DEFAULT_OUT_DIR, 'hermes-contribution-rag.jsonl');

const usage = `Usage:
  node tools/hermes-contribution-opportunities.js [--repo owner/repo] [--limit N] [--out file] [--markdown-out file] [--rag file] [--json]

Continuously discover Hermes GitHub contribution opportunities with a read-only
GitHub API pass, local RAG evidence retrieval, duplicate detection, and a simple
data-science scoring model.

The tool is safe by default:
- reads GitHub through gh
- writes only local reports/RAG outside the repo by default
- never comments, pushes, merges, closes, or uses pasted secrets`;

const KEYWORDS = [
  'telegram',
  'gateway',
  'polling',
  'conflict',
  'getupdates',
  'webhook',
  'drop_pending_updates',
  'passive routing',
  'watchdog',
  'launchd',
  'httpx',
  'transport',
  'reconnect',
  'freeze',
];

const LABEL_WEIGHTS = new Map([
  ['P0', 45],
  ['P1', 35],
  ['P2', 22],
  ['type/bug', 18],
  ['comp/gateway', 18],
  ['platform/telegram', 28],
  ['security', 18],
  ['performance', 8],
  ['documentation', 5],
]);

function parseArgs(argv) {
  const args = {
    repo: DEFAULT_REPO,
    limit: DEFAULT_LIMIT,
    out: DEFAULT_OUT,
    markdownOut: DEFAULT_MARKDOWN_OUT,
    rag: DEFAULT_RAG,
    json: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--repo') {
      args.repo = requireValue(argv, ++i, '--repo');
    } else if (arg === '--limit') {
      args.limit = Number(requireValue(argv, ++i, '--limit'));
      if (!Number.isInteger(args.limit) || args.limit < 1) {
        throw new Error('--limit must be a positive integer');
      }
    } else if (arg === '--out') {
      args.out = requireValue(argv, ++i, '--out');
    } else if (arg === '--markdown-out') {
      args.markdownOut = requireValue(argv, ++i, '--markdown-out');
    } else if (arg === '--rag') {
      args.rag = requireValue(argv, ++i, '--rag');
    } else if (arg === '--json') {
      args.json = true;
    } else if (arg === '--help' || arg === '-h') {
      args.help = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return args;
}

function requireValue(argv, index, flag) {
  if (!argv[index]) {
    throw new Error(`${flag} requires a value`);
  }
  return argv[index];
}

function runGh(args, options = {}) {
  const result = spawnSync('gh', args, {
    encoding: 'utf8',
    timeout: options.timeout || 45000,
    maxBuffer: 1024 * 1024 * 12,
  });
  if (result.status !== 0) {
    const stderr = (result.stderr || result.stdout || '').trim();
    throw new Error(`gh ${args.join(' ')} failed: ${stderr}`);
  }
  return result.stdout;
}

function labelsOf(item) {
  return (item.labels || []).map((label) => (typeof label === 'string' ? label : label.name)).filter(Boolean);
}

function normalizeText(text) {
  return String(text || '')
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(text) {
  const stop = new Set(['the', 'and', 'for', 'with', 'after', 'before', 'from', 'into', 'that', 'this', 'can', 'not']);
  return normalizeText(text)
    .split(' ')
    .filter((token) => token.length > 2 && !stop.has(token));
}

function commentCount(item) {
  if (Array.isArray(item.comments)) return item.comments.length;
  if (typeof item.comments === 'number') return item.comments;
  return 0;
}

function daysSince(value, now = new Date()) {
  if (!value) return 999;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 999;
  return Math.max(0, Math.floor((now - date) / 86400000));
}

function keywordHits(item) {
  const haystack = normalizeText(`${item.title || ''} ${labelsOf(item).join(' ')}`);
  return KEYWORDS.filter((keyword) => haystack.includes(normalizeText(keyword)));
}

function fetchOpenItems(repo, limit) {
  const fields = 'number,title,url,state,labels,author,createdAt,updatedAt,comments';
  const issues = JSON.parse(runGh(['issue', 'list', '--repo', repo, '--state', 'open', '--limit', String(limit), '--json', fields]));
  const prs = JSON.parse(runGh(['pr', 'list', '--repo', repo, '--state', 'open', '--limit', String(limit), '--json', `${fields},isDraft,mergeable`]));
  return [
    ...issues.map((item) => ({ ...item, kind: 'issue' })),
    ...prs.map((item) => ({ ...item, kind: 'pr' })),
  ];
}

function loadRag(file) {
  if (!fs.existsSync(file)) {
    return [];
  }
  return fs.readFileSync(file, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch (error) {
        return { text: line, parseError: error.message };
      }
    });
}

function retrieveRag(item, records) {
  const itemTerms = new Set(tokenize(`${item.title} ${labelsOf(item).join(' ')}`));
  return records
    .map((record) => {
      const text = `${record.title || ''} ${record.text || ''} ${(record.tags || []).join(' ')}`;
      const terms = tokenize(text);
      const overlap = terms.filter((term) => itemTerms.has(term)).length;
      const recency = Math.max(0, 14 - daysSince(record.timestamp || record.createdAt));
      return { record, score: overlap * 2 + recency };
    })
    .filter((hit) => hit.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

function similarity(a, b) {
  const aTokens = new Set(tokenize(a));
  const bTokens = new Set(tokenize(b));
  if (aTokens.size < 3 || bTokens.size < 3) return 0;
  let overlap = 0;
  for (const token of aTokens) {
    if (bTokens.has(token)) overlap += 1;
  }
  return overlap / Math.min(aTokens.size, bTokens.size);
}

function findDuplicates(item, allItems) {
  return allItems
    .filter((candidate) => candidate.number !== item.number)
    .map((candidate) => ({
      number: candidate.number,
      kind: candidate.kind,
      title: candidate.title,
      url: candidate.url,
      similarity: similarity(item.title, candidate.title),
    }))
    .filter((candidate) => candidate.similarity >= 0.62)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, 4);
}

function scoreItem(item, allItems, ragRecords, now = new Date()) {
  const labels = labelsOf(item);
  const hits = keywordHits(item);
  const duplicateCandidates = findDuplicates(item, allItems);
  const ragHits = retrieveRag(item, ragRecords);
  const comments = commentCount(item);
  const updatedDays = daysSince(item.updatedAt, now);
  const createdDays = daysSince(item.createdAt, now);
  let score = 0;

  for (const label of labels) {
    score += LABEL_WEIGHTS.get(label) || 0;
  }
  score += Math.min(28, hits.length * 6);
  score += Math.max(0, 16 - updatedDays);
  if (createdDays <= 14) score += 8;
  if (comments === 0) score += 8;
  if (comments > 12) score -= 6;
  if (item.kind === 'pr') {
    score += item.isDraft ? -8 : 8;
    if (item.mergeable === 'MERGEABLE') score += 10;
  }
  if (duplicateCandidates.length > 0) {
    score -= 12;
  }
  if (ragHits.length > 0) {
    score += Math.min(12, ragHits[0].score);
  }

  return {
    number: item.number,
    kind: item.kind,
    title: item.title,
    url: item.url,
    state: item.state,
    labels,
    author: item.author && item.author.login,
    createdAt: item.createdAt,
    updatedAt: item.updatedAt,
    comments,
    isDraft: Boolean(item.isDraft),
    mergeable: item.mergeable || null,
    keywordHits: hits,
    duplicateCandidates,
    ragHits: ragHits.map((hit) => ({
      score: hit.score,
      title: hit.record.title || '',
      url: hit.record.url || '',
      tags: hit.record.tags || [],
    })),
    score,
    recommendation: recommend(item, hits, duplicateCandidates, ragHits),
  };
}

function recommend(item, hits, duplicates, ragHits) {
  if (duplicates.length > 0) {
    return `Consolidate evidence into #${duplicates[0].number} before opening or expanding duplicate work.`;
  }
  if (item.kind === 'pr') {
    if (item.isDraft) {
      return 'Run local focused tests, add reproduction evidence, then ask what is needed to move out of draft.';
    }
    if (item.mergeable === 'MERGEABLE') {
      return 'Add high-signal reproduction or review evidence; avoid rewriting the patch unless maintainers request it.';
    }
    return 'Inspect merge conflicts or review blockers before contributing code.';
  }
  if (hits.includes('telegram') && hits.includes('gateway')) {
    return 'Create or attach a minimal diagnostic matrix: process count, webhook state, getUpdates result, logs, and related PRs.';
  }
  if (ragHits.length > 0) {
    return 'Reuse retrieved local evidence to write a concise maintainer comment or targeted test case.';
  }
  return 'Triage manually before action; current signal is weaker than the Telegram gateway cluster.';
}

function seedRagFromReport(ragPath, ranked) {
  ensureDir(path.dirname(ragPath));
  const existing = new Set(loadRag(ragPath).map((record) => record.key).filter(Boolean));
  const lines = [];
  for (const item of ranked.slice(0, 20)) {
    const key = `${item.kind}:${item.number}:${item.updatedAt}`;
    if (existing.has(key)) continue;
    lines.push(JSON.stringify({
      key,
      timestamp: new Date().toISOString(),
      title: item.title,
      url: item.url,
      tags: [...item.labels, ...item.keywordHits],
      text: `${item.kind} #${item.number} score ${item.score}. ${item.recommendation}`,
    }));
  }
  if (lines.length > 0) {
    fs.appendFileSync(ragPath, `${lines.join('\n')}\n`);
  }
  return lines.length;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function renderMarkdown(report) {
  const lines = [
    `# Hermes Contribution Opportunities - ${report.generatedAt.slice(0, 10)}`,
    '',
    `Repo: ${report.repo}`,
    `Items scanned: ${report.scanned}`,
    `RAG records used: ${report.ragRecords}`,
    `RAG records appended: ${report.ragRecordsAppended}`,
    '',
    'This report is read-only. It does not comment, push, merge, close, or install anything.',
    '',
    '## Top Opportunities',
    '',
  ];
  for (const item of report.top) {
    lines.push(`### ${item.kind.toUpperCase()} #${item.number}: ${item.title}`);
    lines.push('');
    lines.push(`- Score: ${item.score}`);
    lines.push(`- URL: ${item.url}`);
    lines.push(`- Labels: ${item.labels.join(', ') || 'none'}`);
    lines.push(`- Keyword hits: ${item.keywordHits.join(', ') || 'none'}`);
    lines.push(`- Recommendation: ${item.recommendation}`);
    if (item.duplicateCandidates.length > 0) {
      lines.push(`- Possible duplicates: ${item.duplicateCandidates.map((candidate) => `#${candidate.number}`).join(', ')}`);
    }
    if (item.ragHits.length > 0) {
      lines.push(`- RAG evidence: ${item.ragHits.map((hit) => hit.title || hit.url).join(' | ')}`);
    }
    lines.push('');
  }
  return `${lines.join('\n')}\n`;
}

function run(args) {
  const startedAt = Date.now();
  const rawItems = fetchOpenItems(args.repo, args.limit);
  const relevantItems = rawItems.filter((item) => keywordHits(item).length > 0 || labelsOf(item).some((label) => LABEL_WEIGHTS.has(label)));
  const ragRecords = loadRag(args.rag);
  const ranked = relevantItems
    .map((item) => scoreItem(item, relevantItems, ragRecords))
    .sort((a, b) => b.score - a.score || a.number - b.number);
  const appended = seedRagFromReport(args.rag, ranked);
  const report = {
    generatedAt: new Date().toISOString(),
    repo: args.repo,
    scanned: rawItems.length,
    relevant: relevantItems.length,
    ragPath: args.rag,
    ragRecords: ragRecords.length,
    ragRecordsAppended: appended,
    outputPath: args.out,
    markdownPath: args.markdownOut,
    top: ranked.slice(0, 20),
    elapsedMs: Date.now() - startedAt,
  };
  ensureDir(path.dirname(args.out));
  ensureDir(path.dirname(args.markdownOut));
  fs.writeFileSync(args.out, `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(args.markdownOut, renderMarkdown(report));
  return report;
}

function renderConsole(report) {
  console.log(`Hermes contribution scan: ${report.relevant}/${report.scanned} relevant`);
  console.log(`RAG records used/appended: ${report.ragRecords}/${report.ragRecordsAppended}`);
  console.log(`JSON report: ${report.outputPath}`);
  console.log(`Markdown report: ${report.markdownPath}`);
  for (const item of report.top.slice(0, 8)) {
    console.log(`${item.score}\t${item.kind} #${item.number}\t${item.title}`);
    console.log(`  ${item.url}`);
    console.log(`  ${item.recommendation}`);
  }
}

if (require.main === module) {
  try {
    const args = parseArgs(process.argv.slice(2));
    if (args.help) {
      console.log(usage);
      process.exit(0);
    }
    const report = run(args);
    if (args.json) {
      console.log(JSON.stringify(report, null, 2));
    } else {
      renderConsole(report);
    }
  } catch (error) {
    console.error(error.message);
    console.error('');
    console.error(usage);
    process.exit(2);
  }
}

module.exports = {
  KEYWORDS,
  DEFAULT_REPO,
  parseArgs,
  scoreItem,
  keywordHits,
  findDuplicates,
  commentCount,
  retrieveRag,
  renderMarkdown,
};
