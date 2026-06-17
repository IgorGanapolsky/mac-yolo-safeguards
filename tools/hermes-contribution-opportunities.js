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
const DEFAULT_DRAFT_DIR = path.join(DEFAULT_OUT_DIR, 'hermes-contribution-drafts');
const DEFAULT_ACTION_LOG = path.join(DEFAULT_OUT_DIR, 'hermes-contribution-actions.jsonl');

const usage = `Usage:
  node tools/hermes-contribution-opportunities.js [--repo owner/repo] [--limit N] [--out file] [--markdown-out file] [--rag file] [--draft-dir dir] [--action-log file] [--mode report|drafts] [--top N] [--min-score N] [--json]

Continuously discover Hermes GitHub contribution opportunities with a read-only
GitHub API pass, local RAG evidence retrieval, duplicate detection, and a simple
data-science scoring model. In drafts mode it also creates maintainer-ready
local contribution packets and comment drafts.

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
    draftDir: DEFAULT_DRAFT_DIR,
    actionLog: DEFAULT_ACTION_LOG,
    mode: 'report',
    top: 20,
    minScore: 100,
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
    } else if (arg === '--draft-dir') {
      args.draftDir = requireValue(argv, ++i, '--draft-dir');
    } else if (arg === '--action-log') {
      args.actionLog = requireValue(argv, ++i, '--action-log');
    } else if (arg === '--mode') {
      args.mode = requireValue(argv, ++i, '--mode');
      if (!['report', 'drafts'].includes(args.mode)) {
        throw new Error('--mode must be report or drafts');
      }
    } else if (arg === '--top') {
      args.top = Number(requireValue(argv, ++i, '--top'));
      if (!Number.isInteger(args.top) || args.top < 1) {
        throw new Error('--top must be a positive integer');
      }
    } else if (arg === '--min-score') {
      args.minScore = Number(requireValue(argv, ++i, '--min-score'));
      if (!Number.isFinite(args.minScore)) {
        throw new Error('--min-score must be a number');
      }
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

function runLocal(args, options = {}) {
  const result = spawnSync(args[0], args.slice(1), {
    encoding: 'utf8',
    timeout: options.timeout || 10000,
    maxBuffer: 1024 * 1024,
  });
  return {
    ok: result.status === 0,
    status: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
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
    action: classifyAction(item, hits, duplicateCandidates, ragHits, score),
    evidenceChecklist: evidenceChecklist(item, hits),
    recommendation: recommend(item, hits, duplicateCandidates, ragHits),
  };
}

function classifyAction(item, hits, duplicates, ragHits, score) {
  if (duplicates.length > 0) {
    return {
      type: 'consolidate',
      confidence: Math.min(0.95, 0.65 + duplicates[0].similarity / 4),
      safety: 'low-risk',
      reason: `possible duplicate of #${duplicates[0].number}`,
    };
  }
  if (score < 100) {
    return {
      type: 'watch',
      confidence: 0.45,
      safety: 'low-risk',
      reason: 'below action threshold',
    };
  }
  if (item.kind === 'pr') {
    return {
      type: item.mergeable === 'MERGEABLE' && !item.isDraft ? 'review-evidence' : 'review-blocker',
      confidence: item.mergeable === 'MERGEABLE' ? 0.78 : 0.62,
      safety: 'low-risk',
      reason: item.mergeable === 'MERGEABLE' ? 'maintainer patch can be helped with reproduction evidence' : 'PR needs blocker review before code',
    };
  }
  if (hits.includes('telegram') && hits.includes('gateway')) {
    return {
      type: 'diagnostic-comment',
      confidence: ragHits.length > 0 ? 0.82 : 0.68,
      safety: 'medium-risk',
      reason: 'local Telegram gateway failures can produce useful maintainer evidence',
    };
  }
  return {
    type: ragHits.length > 0 ? 'evidence-comment' : 'triage',
    confidence: ragHits.length > 0 ? 0.66 : 0.52,
    safety: 'low-risk',
    reason: ragHits.length > 0 ? 'RAG has reusable local evidence' : 'needs manual review',
  };
}

function evidenceChecklist(item, hits) {
  const checks = [
    'Confirm the issue/PR is still open immediately before acting.',
    'Read the full thread and latest maintainer comments.',
    'Do not paste secrets, tokens, private logs, or personal identifiers.',
    'Prefer reproduction evidence, failing test names, and exact version/config snippets.',
  ];
  if (hits.includes('telegram') || labelsOf(item).includes('platform/telegram')) {
    checks.push('Attach Telegram evidence: single gateway process count, polling/webhook state, recent gateway log excerpts, and whether conflicts recovered.');
  }
  if (hits.includes('gateway') || labelsOf(item).includes('comp/gateway')) {
    checks.push('Attach gateway evidence: launchd/service status, session flags, reset/resume state, and focused regression command.');
  }
  if (item.kind === 'pr') {
    checks.push('Run or identify the narrowest relevant test before review; avoid competing patches unless maintainers ask.');
  } else {
    checks.push('Search for related PRs/issues and link them instead of creating duplicate noise.');
  }
  return checks;
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

function loadActionLog(file) {
  if (!fs.existsSync(file)) return new Map();
  const records = new Map();
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/).filter(Boolean)) {
    try {
      const record = JSON.parse(line);
      if (record.key) records.set(record.key, record);
    } catch {
      // Ignore corrupt historical lines; the report remains read-only.
    }
  }
  return records;
}

function recentlyPrepared(record, now = new Date(), cooldownHours = 24) {
  if (!record || !record.timestamp) return false;
  const timestamp = new Date(record.timestamp);
  if (Number.isNaN(timestamp.getTime())) return false;
  return now - timestamp < cooldownHours * 3600000;
}

function slugify(text) {
  return normalizeText(text).replace(/\s+/g, '-').slice(0, 90) || 'untitled';
}

function renderCommentDraft(item) {
  const lines = [
    `# Draft comment for ${item.kind} #${item.number}`,
    '',
    `Source: ${item.url}`,
    `Action: ${item.action.type}`,
    `Confidence: ${item.action.confidence.toFixed(2)}`,
    '',
    'Maintainer-ready draft:',
    '',
    '```md',
  ];
  if (item.action.type === 'consolidate') {
    const duplicate = item.duplicateCandidates[0];
    lines.push(
      `I may be seeing overlap with #${duplicate.number}. Before adding a separate patch, I would consolidate the reproduction evidence here:`,
      '',
      '- affected surface:',
      '- exact Hermes version/config:',
      '- focused failing command or log excerpt:',
      '- whether the related PR/issue already covers the failure:',
    );
  } else if (item.action.type === 'review-evidence') {
    lines.push(
      'I can help validate this with a focused reproduction pass. The evidence I would attach before asking for maintainer time:',
      '',
      '- exact command/test run:',
      '- before/after behavior:',
      '- relevant gateway/session state:',
      '- confirmation that no unrelated behavior changed:',
    );
  } else {
    lines.push(
      'I can provide a focused diagnostic packet for this issue. The useful evidence appears to be:',
      '',
      '- one-process gateway status:',
      '- Telegram polling/webhook state:',
      '- recent log excerpt around the failure:',
      '- session reset/resume flags:',
      '- related issues/PRs checked for duplicates:',
    );
  }
  lines.push('```', '', 'Evidence checklist:');
  for (const check of item.evidenceChecklist) {
    lines.push(`- ${check}`);
  }
  return `${lines.join('\n')}\n`;
}

function renderActionPacket(item) {
  const lines = [
    `# Contribution Packet: ${item.kind.toUpperCase()} #${item.number}`,
    '',
    `Title: ${item.title}`,
    `URL: ${item.url}`,
    `Score: ${item.score}`,
    `Action: ${item.action.type}`,
    `Reason: ${item.action.reason}`,
    `Safety: ${item.action.safety}`,
    '',
    '## Why This Is High ROI',
    '',
    `- Labels: ${item.labels.join(', ') || 'none'}`,
    `- Keyword hits: ${item.keywordHits.join(', ') || 'none'}`,
    `- Comments: ${item.comments}`,
    '',
    '## RAG Evidence',
    '',
  ];
  if (item.ragHits.length === 0) {
    lines.push('- none retrieved');
  } else {
    for (const hit of item.ragHits) {
      lines.push(`- ${hit.title || hit.url || 'local record'} (score ${hit.score})`);
    }
  }
  lines.push('', '## Duplicate Candidates', '');
  if (item.duplicateCandidates.length === 0) {
    lines.push('- none above threshold');
  } else {
    for (const duplicate of item.duplicateCandidates) {
      lines.push(`- #${duplicate.number} ${duplicate.kind}: ${duplicate.title} (${duplicate.similarity.toFixed(2)})`);
    }
  }
  lines.push('', '## Evidence Checklist', '');
  for (const check of item.evidenceChecklist) {
    lines.push(`- ${check}`);
  }
  if (item.localEvidence) {
    lines.push('', '## Local Evidence Snapshot', '');
    lines.push(`- Generated: ${item.localEvidence.generatedAt}`);
    lines.push(`- Gateway processes: ${item.localEvidence.gatewayProcessCount}`);
    if (item.localEvidence.session) {
      lines.push(`- Telegram session: ${item.localEvidence.session.sessionId}`);
      lines.push(`- Session flags: auto_reset=${item.localEvidence.session.wasAutoReset}, resume_pending=${item.localEvidence.session.resumePending}, prompt_tokens=${item.localEvidence.session.lastPromptTokens}`);
    }
    if (item.localEvidence.routeAudit) {
      lines.push(`- Route audit: ok=${item.localEvidence.routeAudit.ok}, findings=${item.localEvidence.routeAudit.findings}`);
    }
    if (item.localEvidence.recentLog) {
      lines.push(`- Recent log: conflicts=${item.localEvidence.recentLog.conflicts}, resets=${item.localEvidence.recentLog.resets}, send_next_prompt=${item.localEvidence.recentLog.sendNextPrompt}, auto_resume_disabled=${item.localEvidence.recentLog.autoResumeDisabled}`);
    }
  }
  lines.push('', '## Next Command Suggestions', '');
  const repo = item.repo || DEFAULT_REPO;
  lines.push(`- gh ${item.kind === 'pr' ? 'pr' : 'issue'} view ${item.number} --repo ${repo} --comments`);
  if (item.kind === 'pr') {
    lines.push(`- gh pr diff ${item.number} --repo ${repo}`);
  }
  return `${lines.join('\n')}\n`;
}

function writeDraftArtifacts(args, report) {
  ensureDir(args.draftDir);
  ensureDir(path.dirname(args.actionLog));
  const actionLog = loadActionLog(args.actionLog);
  const now = new Date();
  const prepared = [];
  for (const item of report.top.filter((entry) => entry.score >= args.minScore).slice(0, args.top)) {
    const enrichedItem = { ...item, localEvidence: report.localEvidence };
    const key = `${item.kind}:${item.number}:${item.action.type}`;
    if (recentlyPrepared(actionLog.get(key), now)) {
      continue;
    }
    const base = `${String(item.score).padStart(3, '0')}-${item.kind}-${item.number}-${slugify(item.title)}`;
    const packetPath = path.join(args.draftDir, `${base}.packet.md`);
    const commentPath = path.join(args.draftDir, `${base}.comment.md`);
    fs.writeFileSync(packetPath, renderActionPacket(enrichedItem));
    fs.writeFileSync(commentPath, renderCommentDraft(enrichedItem));
    const record = {
      key,
      timestamp: now.toISOString(),
      item: {
        kind: item.kind,
        number: item.number,
        url: item.url,
        score: item.score,
        action: item.action.type,
      },
      packetPath,
      commentPath,
    };
    fs.appendFileSync(args.actionLog, `${JSON.stringify(record)}\n`);
    prepared.push(record);
  }
  return prepared;
}

function collectLocalEvidence() {
  const home = os.homedir();
  const evidence = {
    generatedAt: new Date().toISOString(),
    gatewayProcessCount: 0,
    session: null,
    routeAudit: null,
    recentLog: null,
  };

  const ps = runLocal(['ps', '-axo', 'pid,ppid,command']);
  if (ps.ok) {
    evidence.gatewayProcessCount = ps.stdout
      .split(/\r?\n/)
      .filter((line) => line.includes('hermes_cli.main') && line.includes('gateway') && line.includes('run'))
      .length;
  }

  const sessionPath = path.join(home, '.hermes', 'sessions', 'sessions.json');
  try {
    const sessions = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
    const row = sessions['agent:main:telegram:dm:8976311422'];
    if (row) {
      evidence.session = {
        sessionId: row.session_id,
        lastPromptTokens: row.last_prompt_tokens,
        wasAutoReset: Boolean(row.was_auto_reset),
        autoResetReason: row.auto_reset_reason || null,
        resumePending: Boolean(row.resume_pending),
        resumeReason: row.resume_reason || null,
        updatedAt: row.updated_at,
      };
    }
  } catch {
    // Missing or invalid local Hermes session state is non-fatal for GitHub scouting.
  }

  const auditPath = path.join(__dirname, 'hermes-project-routing-audit.js');
  if (fs.existsSync(auditPath)) {
    const audit = runLocal([process.execPath, auditPath, '--json']);
    if (audit.ok) {
      try {
        const parsed = JSON.parse(audit.stdout);
        evidence.routeAudit = {
          ok: Boolean(parsed.ok),
          findings: Array.isArray(parsed.findings) ? parsed.findings.length : null,
          expectedCwd: parsed.expectedCwd || null,
          sessionResetMode: parsed.config && parsed.config.sessionResetMode,
        };
      } catch {
        evidence.routeAudit = { ok: false, findings: null, parseError: true };
      }
    } else {
      evidence.routeAudit = { ok: false, findings: null, status: audit.status };
    }
  }

  const logPath = path.join(home, '.hermes', 'logs', 'gateway.log');
  try {
    const lines = fs.readFileSync(logPath, 'utf8').split(/\r?\n/).slice(-400);
    const text = lines.join('\n');
    evidence.recentLog = {
      conflicts: (text.match(/Telegram polling conflict/g) || []).length,
      resets: (text.match(/Session automatically reset|Conversation history cleared/g) || []).length,
      sendNextPrompt: (text.match(/Send me the next prompt/g) || []).length,
      autoResumeDisabled: (text.match(/Startup auto-resume disabled/g) || []).length,
    };
  } catch {
    // Log absence is allowed on fresh machines.
  }

  return evidence;
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
    `Mode: ${report.mode}`,
    `Draft artifacts: ${report.draftArtifacts.length}`,
    `Gateway processes: ${report.localEvidence.gatewayProcessCount}`,
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
    lines.push(`- Action: ${item.action.type} (${item.action.confidence.toFixed(2)}, ${item.action.safety})`);
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
    .map((item) => scoreItem({ ...item, repo: args.repo }, relevantItems, ragRecords))
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
    mode: args.mode,
    top: ranked.slice(0, 20),
    draftDir: args.draftDir,
    actionLogPath: args.actionLog,
    draftArtifacts: [],
    localEvidence: collectLocalEvidence(),
    elapsedMs: Date.now() - startedAt,
  };
  if (args.mode === 'drafts') {
    report.draftArtifacts = writeDraftArtifacts(args, report);
  }
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
  console.log(`Draft artifacts: ${report.draftArtifacts.length} (${report.draftDir})`);
  console.log(`Gateway processes: ${report.localEvidence.gatewayProcessCount}`);
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
  classifyAction,
  evidenceChecklist,
  renderActionPacket,
  renderCommentDraft,
  slugify,
  collectLocalEvidence,
};
