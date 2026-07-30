#!/usr/bin/env node
'use strict';
// Restore the jsonl-jaccard lessons store (memory-log.jsonl) from a sqlite
// lessons backup (table `lessons`, e.g. ~/thumbgate-backup-20260726/dot-thumbgate/lessons.sqlite).
//
// This is the proven July-2026 restore transform: it mirrors thumbgate@1.30.0
// scripts/feedback-schema.js resolveFeedbackAction() + scripts/feedback-loop.js
// memoryRecord assembly. No invented data: every value comes from the sqlite
// row; generated title/content follow the package's own deterministic writer
// templates. Rows whose whatWentWrong column holds pre-templated content
// ("What went wrong:" / "Context:" / "What worked:" / "Approach:") are
// special-cased and reused verbatim, exactly as upsertLesson stored them.
//
// Usage:
//   restore-lessons-memory-log.js --backup <lessons.sqlite> [--out <memory-log.jsonl>] [--dry-run]
//
// Default (no --out, or --dry-run): print a summary + the first 2 transformed
// lines and write NOTHING. The backup is always opened read-only. An existing
// --out file is never overwritten (a restore must never clobber a live store).

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

function usage(msg) {
  if (msg) process.stderr.write(`ERROR: ${msg}\n`);
  process.stderr.write(
    'Usage: restore-lessons-memory-log.js --backup <lessons.sqlite> [--out <memory-log.jsonl>] [--dry-run]\n'
  );
  process.exit(2);
}

const args = process.argv.slice(2);
let backupPath = null;
let outPath = null;
let dryRun = false;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--backup') backupPath = args[++i];
  else if (args[i] === '--out') outPath = args[++i];
  else if (args[i] === '--dry-run') dryRun = true;
  else usage(`unknown argument: ${args[i]}`);
}
if (!backupPath) usage('--backup <lessons.sqlite> is required');
backupPath = path.resolve(backupPath);
if (!fs.existsSync(backupPath)) {
  process.stderr.write(`ERROR: backup not found: ${backupPath}\n`);
  process.exit(1);
}
if (!outPath) dryRun = true;

let rawRows;
try {
  rawRows = execFileSync(
    'sqlite3',
    [
      '-readonly',
      '-json',
      backupPath,
      'SELECT id, signal, context, whatWentWrong, whatToChange, whatWorked, domain, tags, rootCause, importance, skill, timestamp, sourceFeedbackId, pruned FROM lessons ORDER BY rowid;',
    ],
    { encoding: 'utf8' }
  );
} catch (err) {
  process.stderr.write(`ERROR: sqlite3 read failed for ${backupPath}: ${err.message}\n`);
  process.exit(1);
}
const rows = rawRows.trim() ? JSON.parse(rawRows) : [];
if (rows.length === 0) {
  process.stderr.write(
    `ERROR: backup ${backupPath} has 0 lessons rows — refusing to produce an empty store\n`
  );
  process.exit(1);
}

const MAX_TITLE_DESCRIPTION_LENGTH = 120; // feedback-schema.js
function truncateAtWord(text, maxLen) {
  if (!text || text.length <= maxLen) return text;
  var truncated = text.slice(0, maxLen);
  var lastSpace = truncated.lastIndexOf(' ');
  return lastSpace > maxLen * 0.5 ? truncated.slice(0, lastSpace) + '...' : truncated + '...';
}

function uniq(arr) { return [...new Set(arr.filter(Boolean))]; }

// --- verbatim replicas of thumbgate@1.30.0 feedback-schema.js internals ---
const GENERIC_TAGS = new Set(['feedback', 'positive', 'negative']);
const INFERRED_TAG_RULES = [
  { tag: 'thumbgate', keywords: ['thumbgate', 'feedback-loop', 'statusline', 'dashboard', 'mcp'] },
  { tag: 'testing', keywords: ['test', 'testing', 'jest', 'coverage', 'verify', 'verification'] },
  { tag: 'security', keywords: ['security', 'secret', 'credential', 'token', 'auth'] },
  { tag: 'performance', keywords: ['perf', 'performance', 'latency', 'slow'] },
  { tag: 'ui-components', keywords: ['ui', 'component', 'layout', 'style', 'figma'] },
  { tag: 'api-integration', keywords: ['api', 'endpoint', 'request', 'response', 'server'] },
  { tag: 'git-workflow', keywords: ['git', 'commit', 'branch', 'pr', 'pull request'] },
  { tag: 'documentation', keywords: ['doc', 'docs', 'readme'] },
  { tag: 'debugging', keywords: ['debug', 'debugging', 'error', 'bug', 'fix'] },
  { tag: 'architecture', keywords: ['design', 'architecture', 'system'] },
  { tag: 'data-modeling', keywords: ['schema', 'data', 'model', 'migration'] },
];
function normalizeFeedbackText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}
function inferFallbackDomainTag(params = {}) {
  const explicitDomainTags = (params.tags || []).filter((tag) => !GENERIC_TAGS.has(tag));
  if (explicitDomainTags.length > 0) return explicitDomainTags[0];
  const text = normalizeFeedbackText([
    params.context,
    params.whatWorked,
    params.whatWentWrong,
    params.whatToChange,
  ].filter(Boolean).join(' '));
  if (!text) return 'general';
  for (const rule of INFERRED_TAG_RULES) {
    if (rule.keywords.some((keyword) => text.includes(keyword))) {
      return rule.tag;
    }
  }
  return 'general';
}
// --- end replicas ---

const out = [];
for (const row of rows) {
  const signal = row.signal; // 'positive' | 'negative'
  let tags;
  try { tags = JSON.parse(row.tags || '[]'); } catch { tags = []; }
  if (!Array.isArray(tags)) tags = [];

  let title;
  let content;
  let category;
  let importance = row.importance || (signal === 'negative' ? 'high' : 'normal');

  let rawWhatWentWrong = row.whatWentWrong ?? null;
  if (signal === 'negative') {
    category = 'error';
    const w = row.whatWentWrong || '';
    // When the feedback event had no whatWentWrong, upsertLesson stored the
    // ORIGINAL memory content (template lines) in this column. Detect and
    // reuse it verbatim; the original title used context in that case.
    if (/^(What went wrong:|Context:)/.test(w)) {
      content = w;
      rawWhatWentWrong = null;
      title = `MISTAKE: ${truncateAtWord(row.context || '', MAX_TITLE_DESCRIPTION_LENGTH)}`;
    } else {
      title = `MISTAKE: ${truncateAtWord(w || row.context || '', MAX_TITLE_DESCRIPTION_LENGTH)}`;
      content = [
        w ? `What went wrong: ${w}` : `Context: ${row.context}`,
        row.whatToChange ? `How to avoid: ${row.whatToChange}` : 'Action needed: investigate and prevent recurrence',
      ].join('\n');
    }
  } else {
    category = 'learning';
    const description = truncateAtWord(row.whatWorked || row.context || '', MAX_TITLE_DESCRIPTION_LENGTH);
    title = `SUCCESS: ${description}`;
    // For positive rows the sqlite whatWentWrong column holds the ORIGINAL
    // memory content (upsertLesson stored feedbackEvent.whatWentWrong || memoryRecord.content).
    // Reuse it verbatim when it matches the writer's content templates.
    const w = row.whatWentWrong || '';
    if (/^(What worked:|Approach:)/.test(w)) {
      content = w;
    } else {
      content = row.whatWorked ? `What worked: ${row.whatWorked}` : `Approach: ${row.context}`;
    }
  }

  // Reconstruct tags exactly as the writer would have:
  // ['feedback', signal, ...unique([userNonGenericTags, inferredDomainTag])]
  const inferredDomainTag = inferFallbackDomainTag({
    tags,
    context: row.context,
    whatWentWrong: signal === 'negative' ? rawWhatWentWrong : null,
    whatToChange: row.whatToChange,
    whatWorked: row.whatWorked,
  });
  const domainTags = uniq([
    ...tags.filter((t) => !GENERIC_TAGS.has(t)),
    inferredDomainTag,
  ]);

  const record = {
    id: row.id,
    title,
    content,
    category,
    importance,
    tags: uniq(['feedback', signal, ...domainTags]),
    signal,
    context: row.context ?? null,
    whatWentWrong: signal === 'negative' ? rawWhatWentWrong : null,
    whatToChange: row.whatToChange ?? null,
    whatWorked: row.whatWorked ?? null,
    domain: row.domain ?? null,
    skill: row.skill ?? null,
    diagnosis: row.rootCause ? { rootCauseCategory: row.rootCause } : null,
    structuredRule: null,
    sourceFeedbackId: row.sourceFeedbackId ?? null,
    timestamp: row.timestamp,
    occurrences: 1,
  };
  if (row.pruned === 1) record.pruned = true; // preserve pruned flag when set

  out.push(record);
}

const lines = out.map((r) => JSON.stringify(r));
const byCategory = {};
for (const r of out) byCategory[r.category] = (byCategory[r.category] || 0) + 1;

console.log(`backup:  ${backupPath}`);
console.log(`rows:    ${rows.length} sqlite lessons -> ${out.length} jsonl records`);
console.log(`by category: ${Object.entries(byCategory).map(([k, v]) => `${k}=${v}`).join(' ')}`);

if (dryRun) {
  console.log('mode:    DRY RUN — nothing written');
  console.log('first 2 transformed lines:');
  for (const line of lines.slice(0, 2)) console.log(`  ${line}`);
} else {
  outPath = path.resolve(outPath);
  if (fs.existsSync(outPath)) {
    process.stderr.write(
      `ERROR: refusing to overwrite existing ${outPath} — move it aside first if you really mean to replace it\n`
    );
    process.exit(1);
  }
  fs.writeFileSync(outPath, lines.join('\n') + '\n');
  console.log(`wrote:   ${out.length} records to ${outPath}`);
}
