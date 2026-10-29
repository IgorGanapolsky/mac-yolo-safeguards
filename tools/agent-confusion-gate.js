#!/usr/bin/env node
'use strict';

/**
 * Count pre-action confusion. Zero proceeds; any fired axis holds.
 *
 * The measurable part of Kiyu Gabriel's IBM TechXchange 2026 line, as quoted
 * by Sarbjeet Johal (post 2115073742321713223) and answered by rameshchitor:
 * ambiguous context, conflicting data, and an unclear tool boundary show up
 * before the bad action. No model call and no process spawn.
 *
 *   node tools/agent-confusion-gate.js --instruction "edit tools/foo.js" --command "git status"
 *   node tools/agent-confusion-gate.js --json action.json
 */

const fs = require('node:fs');

const SOURCE = {
  post: '2115073742321713223',
  reply: '2115165243458609579',
};

const AXES = ['ambiguous_context', 'conflicting_data', 'unclear_tool_boundary'];

const VAGUE = /^(?:please\s+)?(?:fix|improve|update|clean|optimize)\s+(?:it|this|our system|the system|the project|everything)\b/i;

const TARGETS = [
  /https?:\/\/[^\s<>]+/i,
  /#\d+\b/,
  /\b[A-Z][A-Z0-9]{1,12}-\d+\b/,
  /(?:^|[\s`'"(])(?:\.{1,2}\/)?(?:[\w.+@-]+\/)*[\w.+@-]+\.[A-Za-z0-9]{1,12}(?=$|[\s`'"),:;!?])/,
];

function clip(text) {
  const clean = String(text || '').replace(/[\r\n]+/g, ' ').trim();
  return clean.length > 180 ? `${clean.slice(0, 177)}...` : clean;
}

function normalizePath(value) {
  return String(value || '').trim().replace(/\\/g, '/').replace(/^\.\//, '');
}

function looksLikePath(value) {
  const path = normalizePath(value);
  return path.includes('/') || /\.[A-Za-z0-9]{1,12}$/.test(path);
}

function hasConcreteTarget(text) {
  const body = String(text || '');
  return TARGETS.some((pattern) => pattern.test(body));
}

function ambiguousContext(instruction) {
  const text = instruction == null ? '' : String(instruction).trim();
  if (!text) {
    return { fired: true, evidence: 'empty instruction' };
  }
  if (VAGUE.test(text) && !hasConcreteTarget(text)) {
    return { fired: true, evidence: 'vague instruction with no file, issue, or URL' };
  }
  return { fired: false, evidence: '' };
}

function canon(value) {
  if (value == null) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return JSON.stringify(value);
}

function conflictingData(records) {
  const grouped = new Map();
  for (const record of Array.isArray(records) ? records : []) {
    if (!record || record.key == null || String(record.key).trim() === '') continue;
    const key = String(record.key).trim();
    if (!grouped.has(key)) grouped.set(key, new Set());
    grouped.get(key).add(canon(record.value));
  }
  const keys = [];
  for (const [key, values] of grouped) {
    if (values.size > 1) keys.push(key);
  }
  if (keys.length === 0) return { fired: false, evidence: '' };
  return { fired: true, evidence: clip(`conflicting values for ${keys.join(', ')}`) };
}

function ownersIn(planText, source) {
  const records = [];
  const label = source || 'plan';
  let sectionOwner = '';
  for (const line of String(planText || '').split(/\r?\n/)) {
    const heading = line.match(/^##\s+\S.*\s[—–-]\s+`([^`]+)`\s*$/);
    if (heading) {
      sectionOwner = heading[1];
      continue;
    }
    const explicit = line.match(/^\s*[-*]\s+`?([^\s`]+)`?\s+[—–-]\s+(\S+)\s*$/);
    if (explicit && looksLikePath(explicit[1])) {
      records.push({ key: normalizePath(explicit[1]), source: label, value: explicit[2] });
      continue;
    }
    const bullet = line.match(/^\s*[-*]\s+`([^`]+)`\s*$/);
    if (bullet && sectionOwner && looksLikePath(bullet[1])) {
      records.push({ key: normalizePath(bullet[1]), source: label, value: sectionOwner });
      continue;
    }
    records.push(...tableClaims(line, label));
  }
  return records;
}

function tableClaims(line, source) {
  if (!line.startsWith('|')) return [];
  const cells = line.split('|').slice(1, -1).map((cell) => cell.trim());
  if (cells.length < 5) return [];
  const owner = cells[3];
  if (!owner || owner === '—' || owner === '-' || /^owner$/i.test(owner) || owner.includes('---')) {
    return [];
  }
  const records = [];
  for (const match of cells[4].matchAll(/`([^`]+)`/g)) {
    if (!looksLikePath(match[1])) continue;
    records.push({ key: normalizePath(match[1]), source, value: owner });
  }
  return records;
}

function hasFlag(command, flag) {
  if (flag === '-f') return /(?:^|\s)-f(?=\s|$)/.test(command);
  if (flag === '--force') return /(?:^|\s)--force(?=\s|$)/.test(command);
  if (flag === '--admin') return /(?:^|\s)--admin(?=\s|$)/.test(command);
  if (flag === '--all') return /(?:^|\s)--all(?=\s|$)/.test(command);
  return false;
}

function deniedCommand(command) {
  const text = String(command || '');
  const hits = [];
  if (/\bgit\s+push\b/.test(text) && (hasFlag(text, '--force') || hasFlag(text, '-f'))) {
    hits.push('force-push');
  }
  if (/\bgh\s+pr\s+merge\b/.test(text) && hasFlag(text, '--admin')) hits.push('admin-merge');
  if (/\bgit\s+reflog\b/.test(text)) hits.push('reflog');
  if (/\bgit\s+log\b/.test(text) && hasFlag(text, '--all') && /(?:^|\s)--grep(?:=|\s|$)/.test(text)) {
    hits.push('log-grep-all');
  }
  return hits;
}

function claimOwners(claims, filePath) {
  const wanted = normalizePath(filePath);
  const owners = [];
  for (const claim of Array.isArray(claims) ? claims : []) {
    if (!claim) continue;
    const claimPath = normalizePath(claim.path || claim.key || '');
    const owner = String(claim.owner || claim.value || '').trim();
    if (claimPath === wanted && owner) owners.push(owner);
  }
  return [...new Set(owners)];
}

function unclearBoundary({ command, path, claims, actor } = {}) {
  const hits = deniedCommand(command);
  const filePath = normalizePath(path);
  if (filePath) {
    const owners = claimOwners(claims, filePath);
    const who = String(actor || '').trim();
    if (owners.length > 0 && !owners.includes(who)) {
      hits.push(`owner mismatch on ${filePath}`);
    }
  }
  if (hits.length === 0) return { fired: false, evidence: '' };
  return { fired: true, evidence: clip(hits.join('; ')) };
}

function measure(input = {}) {
  const records = Array.isArray(input.records) ? input.records.slice() : [];
  if (input.planText) records.push(...ownersIn(input.planText, input.planSource || 'plan'));
  const axes = [
    { id: AXES[0], ...ambiguousContext(input.instruction) },
    { id: AXES[1], ...conflictingData(records) },
    { id: AXES[2], ...unclearBoundary(input) },
  ];
  const confusionScore = axes.filter((axis) => axis.fired).length;
  return {
    ok: confusionScore === 0,
    confusionScore,
    decision: confusionScore === 0 ? 'proceed' : 'hold',
    axes: axes.map((axis) => ({ id: axis.id, fired: axis.fired, evidence: axis.evidence })),
  };
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function parseArgs(argv) {
  const input = {};
  const known = new Set(['--instruction', '--command', '--path', '--actor', '--plan', '--json']);
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!known.has(arg)) throw new Error(`unknown argument ${arg}`);
    const next = argv[i + 1];
    if (next == null) throw new Error(`missing value for ${arg}`);
    i += 1;
    if (arg === '--instruction') input.instruction = next;
    else if (arg === '--command') input.command = next;
    else if (arg === '--path') input.path = next;
    else if (arg === '--actor') input.actor = next;
    else if (arg === '--plan') input.planText = fs.readFileSync(next, 'utf8');
    else Object.assign(input, readJson(next));
  }
  return input;
}

function main(argv) {
  let input;
  try {
    input = parseArgs(argv);
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ ok: false, decision: 'hold', error: clip(error.message) })}\n`);
    process.exitCode = 2;
    return;
  }
  const result = measure(input);
  process.stdout.write(`${JSON.stringify(result)}\n`);
  process.exitCode = result.ok ? 0 : 1;
}

module.exports = {
  SOURCE,
  ambiguousContext,
  conflictingData,
  unclearBoundary,
  ownersIn,
  measure,
};

if (require.main === module) main(process.argv.slice(2));
