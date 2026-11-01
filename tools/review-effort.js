#!/usr/bin/env node
'use strict';

/**
 * Pick a Copilot review depth from the changed paths.
 *
 * GitHub Universe 2026 exposes Lite, Balanced, and Max review depths.
 * RequestReviewsInput and AddPullRequestReviewInput still have no effort
 * field (schema check 2026-10-29), so the depth travels in the comment.
 *
 *   node tools/review-effort.js --files-from changed.txt
 *   node tools/review-effort.js --files README.md --files docs/guide.md
 *   node tools/review-effort.js --decide review-effort.json comment-bodies.jsonl
 */

const fs = require('node:fs');

const RANK = { lite: 1, balanced: 2, max: 3 };
const MARKER = /<!--\s*review-effort:(lite|balanced|max)\s*-->/i;
const SENSITIVE = /auth|session|secret|token|stripe|checkout|billing|payment/i;

function atPath(filePath, prefix) {
  return filePath === prefix
    || filePath.startsWith(`${prefix}/`)
    || filePath.includes(`/${prefix}/`);
}

const MAX_RULES = [
  { id: 'workflow', test: (p) => atPath(p, '.github/workflows') },
  { id: 'tools-lib', test: (p) => atPath(p, 'tools/lib') },
  { id: 'auth-or-payment', test: (p) => SENSITIVE.test(p) },
  { id: 'revenue-tool', test: (p) => atPath(p, 'tools') && p.split('/').pop().startsWith('revenue-') },
  { id: 'security-audit', test: (p) => p.includes('security-audit') },
  { id: 'path-normalizer', test: (p) => p.includes('path-normalizer') },
  {
    id: 'mobile-package-pin',
    test: (p) => p === 'hermes-mobile/package.json' || p === 'hermes-mobile/package-lock.json',
  },
];

function normalizePath(file) {
  return String(file || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\.\//, '');
}

function isDocumentation(filePath) {
  if (filePath === 'plan.md' || filePath === 'README.md' || filePath === 'SKILLS.md') return true;
  if (filePath.startsWith('docs/')) return true;
  if (!filePath.endsWith('.md')) return false;
  if (filePath.startsWith('tools/') || filePath.startsWith('.github/')) return false;
  if (filePath.includes('/tools/') || filePath.includes('/.github/')) return false;
  return true;
}

function cleanReason(reason) {
  return String(reason).replace(/[\r\n]+/g, ' ').trim().slice(0, 200);
}

function chooseEffort(files) {
  const list = (Array.isArray(files) ? files : [])
    .map(normalizePath)
    .filter(Boolean);
  if (list.length === 0) {
    return { effort: 'balanced', reasons: ['no changed files listed'] };
  }
  const reasons = [];
  for (const filePath of list) {
    for (const rule of MAX_RULES) {
      if (rule.test(filePath)) reasons.push(cleanReason(`${filePath}: ${rule.id}`));
    }
  }
  if (reasons.length > 0) {
    return { effort: 'max', reasons: reasons.slice(0, 8) };
  }
  if (list.every(isDocumentation)) {
    return { effort: 'lite', reasons: ['documentation-only diff'] };
  }
  return { effort: 'balanced', reasons: ['default balanced review'] };
}

function effortFromComment(body) {
  const text = String(body || '');
  const marked = text.match(MARKER);
  if (marked) return marked[1].toLowerCase();
  if (/@copilot\s+review/i.test(text)) return 'balanced';
  return null;
}

function highestRequested(bodies) {
  let best = null;
  for (const body of bodies || []) {
    const effort = effortFromComment(body);
    if (!effort) continue;
    if (!best || RANK[effort] > RANK[best]) best = effort;
  }
  return best;
}

function decideReviewRequest(classification, bodies) {
  const rawEffort = classification && classification.effort;
  const effort = Object.prototype.hasOwnProperty.call(RANK, rawEffort) ? rawEffort : 'balanced';
  const reasons = Array.isArray(classification && classification.reasons)
    ? classification.reasons.map(cleanReason).filter(Boolean).slice(0, 8)
    : [];
  const previous = highestRequested(bodies);
  const request = previous == null || RANK[effort] > RANK[previous];
  return { request, effort, previous, reasons };
}

function commentBody(decision) {
  const effort = Object.prototype.hasOwnProperty.call(RANK, decision && decision.effort)
    ? decision.effort
    : 'balanced';
  const lines = [
    `<!-- review-effort:${effort} -->`,
    '@copilot review',
    '',
    `Review depth for this diff: ${effort}.`,
    'Max is for security-sensitive diffs (workflows, tools/lib, auth, payments, revenue, package pins, path-normalizer).',
    'Lite is for documentation-only diffs. Balanced is the default.',
    'The review-request API has no effort field, so this comment is the request.',
  ];
  const reasons = Array.isArray(decision && decision.reasons) ? decision.reasons : [];
  if (reasons.length > 0) {
    lines.push('', 'Why:');
    for (const reason of reasons) lines.push(`- ${cleanReason(reason)}`);
  }
  return `${lines.join('\n')}\n`;
}

function readJsonLines(file) {
  const text = fs.readFileSync(file, 'utf8');
  const bodies = [];
  for (const line of text.split('\n')) {
    if (!line.trim()) continue;
    try {
      const parsed = JSON.parse(line);
      bodies.push(typeof parsed === 'string' ? parsed : '');
    } catch {
      bodies.push(line);
    }
  }
  return bodies;
}

function collectFiles(argv) {
  const files = [];
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--files') {
      files.push(argv[i + 1] || '');
      i += 1;
    } else if (argv[i] === '--files-from') {
      const file = argv[i + 1];
      i += 1;
      if (!file) continue;
      files.push(...fs.readFileSync(file, 'utf8').split('\n'));
    }
  }
  return files;
}

function runDecide(classFile, commentsFile) {
  let classification = { effort: 'balanced', reasons: ['no changed files listed'] };
  try {
    classification = JSON.parse(fs.readFileSync(classFile, 'utf8'));
  } catch {
    classification = { effort: 'balanced', reasons: ['classifier output was not JSON'] };
  }
  const decision = decideReviewRequest(classification, readJsonLines(commentsFile));
  fs.writeFileSync('request.txt', decision.request ? 'yes\n' : 'no\n');
  if (decision.request) fs.writeFileSync('comment.md', commentBody(decision));
  process.stdout.write(`${JSON.stringify({
    request: decision.request,
    effort: decision.effort,
    previous: decision.previous,
  })}\n`);
}

function main(argv) {
  const decideAt = argv.indexOf('--decide');
  if (decideAt !== -1) {
    const classFile = argv[decideAt + 1];
    const commentsFile = argv[decideAt + 2];
    if (!classFile || !commentsFile) {
      process.stderr.write('usage: node tools/review-effort.js --decide <classification.json> <comments.jsonl>\n');
      process.exitCode = 2;
      return;
    }
    runDecide(classFile, commentsFile);
    return;
  }
  process.stdout.write(`${JSON.stringify(chooseEffort(collectFiles(argv)))}\n`);
}

module.exports = {
  chooseEffort,
  commentBody,
  decideReviewRequest,
  effortFromComment,
  highestRequested,
};

if (require.main === module) main(process.argv.slice(2));
