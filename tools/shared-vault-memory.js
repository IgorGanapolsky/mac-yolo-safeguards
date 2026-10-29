#!/usr/bin/env node
'use strict';

/**
 * Shared vault memory.
 *
 * Obsidian notes in ~/Documents/AI-Agent-Sync are the memory Hermes and the
 * other agents share. A content brief is blocked until a note in that vault
 * matches the query. Packets stay under 2,000 characters. Daily logs keep
 * one short section per agent. This does not publish, email, or invent notes.
 *
 *   node tools/shared-vault-memory.js context --vault DIR --query "thumbgate"
 *   node tools/shared-vault-memory.js daily --vault DIR --agent grok --finished "..."
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const PACKET_CHAR_CAP = 2000;
const EXCERPT_CAP = 280;
const FIELD_CAP = 240;
const MAX_FILE_BYTES = 256 * 1024;
const MAX_FILES = 4000;
const MAX_MATCHES = 5;
const TYPO_ROOT = '/Users/igorganapolsky';
const SECRET = /github_pat_|sk_live_|BEGIN [A-Z ]*PRIVATE KEY|AKIA[0-9A-Z]{16}/;

function resolveSharedVault(options = {}) {
  const env = options.env || process.env;
  const home = options.home || os.homedir();
  const explicit = options.vault || env.HERMES_AGENT_SYNC_VAULT || env.AI_AGENT_VAULT || '';
  const vault = explicit
    ? path.resolve(String(explicit))
    : path.join(home, 'Documents', 'AI-Agent-Sync');
  if (vault === TYPO_ROOT || vault.startsWith(`${TYPO_ROOT}/`)) {
    return { ok: false, reason: 'typo vault path', vault };
  }
  return { ok: true, vault };
}

function tokenize(text) {
  return String(text || '')
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((term) => term.length > 2);
}

function walkMarkdown(root, found, depth) {
  if (depth > 8 || found.length >= MAX_FILES) return;
  let entries = [];
  try {
    entries = fs.readdirSync(root, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (found.length >= MAX_FILES) return;
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) walkMarkdown(full, found, depth + 1);
    else if (entry.isFile() && entry.name.endsWith('.md')) found.push(full);
  }
}

function searchNotes(vault, query, options = {}) {
  if (!vault || !fs.existsSync(vault)) {
    return { ok: false, reason: 'vault missing', matches: [] };
  }
  let stat;
  try {
    stat = fs.statSync(vault);
  } catch {
    return { ok: false, reason: 'vault missing', matches: [] };
  }
  if (!stat.isDirectory()) return { ok: false, reason: 'vault missing', matches: [] };
  const terms = tokenize(query);
  if (terms.length === 0) return { ok: false, reason: 'empty query', matches: [] };
  const files = [];
  walkMarkdown(vault, files, 0);
  const matches = [];
  for (const file of files) {
    let fileStat;
    try {
      fileStat = fs.statSync(file);
    } catch {
      continue;
    }
    if (!fileStat.isFile() || fileStat.size > MAX_FILE_BYTES) continue;
    let text = '';
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }
    const hay = text.toLowerCase();
    const name = path.basename(file).toLowerCase();
    let score = 0;
    for (const term of terms) {
      if (name.includes(term)) score += 5;
      const hits = hay.split(term).length - 1;
      if (hits > 0) score += Math.min(hits, 5);
    }
    if (score <= 0) continue;
    matches.push({
      path: path.relative(vault, file).split(path.sep).join('/'),
      score,
      excerpt: text.replace(/\s+/g, ' ').trim().slice(0, EXCERPT_CAP),
    });
  }
  matches.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
  const top = matches.slice(0, options.limit || MAX_MATCHES);
  if (top.length === 0) return { ok: false, reason: 'no matching note', matches: [] };
  return { ok: true, matches: top };
}

function contextFor(vault, query) {
  const found = searchNotes(vault, query);
  if (!found.ok) return { ok: false, reason: found.reason, sources: [], packet: '' };
  const lines = [];
  const sources = [];
  for (const match of found.matches) {
    const line = `- ${match.path}: ${match.excerpt}`;
    const next = lines.concat(line).join('\n');
    if (next.length > PACKET_CHAR_CAP) break;
    lines.push(line);
    sources.push({ path: match.path, score: match.score });
  }
  if (sources.length === 0) return { ok: false, reason: 'packet empty', sources: [], packet: '' };
  return { ok: true, reason: 'vault notes', sources, packet: lines.join('\n') };
}

function contentBrief(vault, query) {
  const context = contextFor(vault, query);
  if (!context.ok) {
    return { ok: false, status: 'BLOCKED', reason: context.reason, sources: [], packet: '' };
  }
  return {
    ok: true,
    status: 'STAGED_FOR_APPROVAL',
    reason: context.reason,
    query: String(query || ''),
    sources: context.sources,
    packet: context.packet,
    rule: 'Use only the vault excerpts. Do not add prices, latency, or revenue figures that are not in those excerpts.',
  };
}

function looksSecret(text) {
  return SECRET.test(String(text || ''));
}

function cleanField(value) {
  return String(value || '').replace(/[\r\n]+/g, ' ').trim().slice(0, FIELD_CAP);
}

function assertInside(vault, target) {
  const root = path.resolve(vault);
  const dest = path.resolve(target);
  if (dest !== root && !dest.startsWith(`${root}${path.sep}`)) {
    throw new Error('path escapes vault');
  }
  return dest;
}

function writeVaultNote(vault, rel, body) {
  if (!vault || !fs.existsSync(vault)) return { ok: false, reason: 'vault missing' };
  if (looksSecret(body)) return { ok: false, reason: 'secret-like text refused' };
  const normalized = String(rel || '').replace(/\\/g, '/').replace(/^\/+/, '');
  const parts = normalized.split('/');
  if (!normalized.endsWith('.md') || parts.some((part) => part === '' || part === '.' || part === '..')) {
    return { ok: false, reason: 'markdown path only' };
  }
  let dest;
  try {
    dest = assertInside(vault, path.join(vault, normalized));
  } catch {
    return { ok: false, reason: 'path escapes vault' };
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, String(body).endsWith('\n') ? String(body) : `${body}\n`);
  return { ok: true, path: normalized };
}

function sectionBlock(agent, finished, learned, open) {
  return [
    `## ${agent}`,
    `- Finished: ${finished || 'n/a'}`,
    `- Learned: ${learned || 'n/a'}`,
    `- Still open: ${open || 'n/a'}`,
    '',
  ].join('\n');
}

function upsertDaily(prior, agent, block, day) {
  const heading = `## ${agent}\n`;
  if (!String(prior || '').trim()) return `# Daily agent log ${day}\n\n${block}`;
  const start = prior.indexOf(heading);
  if (start === -1) {
    const base = prior.endsWith('\n') ? prior : `${prior}\n`;
    return `${base}\n${block}`;
  }
  const after = prior.slice(start + heading.length);
  const next = after.indexOf('\n## ');
  const tail = next === -1 ? '' : after.slice(next + 1);
  return prior.slice(0, start) + block + tail;
}

function appendDailyLog(vault, entry = {}, now = new Date()) {
  if (!vault || !fs.existsSync(vault)) return { ok: false, reason: 'vault missing' };
  const agent = cleanField(entry.agent || 'agent').replace(/[^a-zA-Z0-9._-]/g, '') || 'agent';
  const finished = cleanField(entry.finished);
  const learned = cleanField(entry.learned);
  const open = cleanField(entry.open);
  if (looksSecret(`${finished} ${learned} ${open}`)) {
    return { ok: false, reason: 'secret-like text refused' };
  }
  if (!finished && !learned && !open) return { ok: false, reason: 'empty log' };
  const day = now.toISOString().slice(0, 10);
  const rel = `Agent-State/daily/${day}.md`;
  const dest = path.join(vault, 'Agent-State', 'daily', `${day}.md`);
  let prior = '';
  if (fs.existsSync(dest)) prior = fs.readFileSync(dest, 'utf8');
  const next = upsertDaily(prior, agent, sectionBlock(agent, finished, learned, open), day);
  return writeVaultNote(vault, rel, next);
}

function readFlag(argv, name) {
  const index = argv.indexOf(name);
  if (index === -1) return '';
  return argv[index + 1] || '';
}

function main(argv) {
  const command = argv[0] || 'context';
  const resolved = resolveSharedVault({ vault: readFlag(argv, '--vault') });
  if (!resolved.ok) {
    process.stdout.write(`${JSON.stringify(resolved)}\n`);
    process.exitCode = 1;
    return;
  }
  let result;
  if (command === 'daily') {
    result = appendDailyLog(resolved.vault, {
      agent: readFlag(argv, '--agent'),
      finished: readFlag(argv, '--finished'),
      learned: readFlag(argv, '--learned'),
      open: readFlag(argv, '--open'),
    });
  } else if (command === 'search') {
    result = searchNotes(resolved.vault, readFlag(argv, '--query'));
  } else {
    result = contentBrief(resolved.vault, readFlag(argv, '--query'));
  }
  process.stdout.write(`${JSON.stringify(result)}\n`);
  if (!result.ok) process.exitCode = 1;
}

module.exports = {
  PACKET_CHAR_CAP,
  appendDailyLog,
  contentBrief,
  contextFor,
  resolveSharedVault,
  searchNotes,
  writeVaultNote,
};

if (require.main === module) main(process.argv.slice(2));
