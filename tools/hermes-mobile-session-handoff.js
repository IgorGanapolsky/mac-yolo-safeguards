#!/usr/bin/env node
'use strict';

/**
 * Write Hermes Mobile session continuity handoff to the Obsidian vault + local mirror.
 * Used by pair server POST /session-handoff and CLI on MBP/mini.
 *
 * Never writes secrets. Safe to commit vault file (redacted content only).
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const DEFAULT_VAULT = path.join(os.homedir(), 'Documents', 'AI-Agent-Sync');
const VAULT_REL = path.join('Handoffs', 'hermes-mobile-last.md');
const HERMES_MIRROR = path.join(os.homedir(), '.hermes', 'mobile-session-handoff.md');
const HERMES_JSON = path.join(os.homedir(), '.hermes', 'mobile-session-handoff.json');
const PAIR_OUT = path.join(
  os.homedir(),
  'Library',
  'Application Support',
  'mac-yolo-safeguards',
  'hermes-mobile-pair',
  'session-handoff.json',
);

const SECRET_PATTERNS = [
  /\bsk-[a-zA-Z0-9_-]{12,}\b/g,
  /\bAPI[_-]?KEY\s*[:=]\s*\S+/gi,
  /\bBearer\s+[A-Za-z0-9._-]{12,}/gi,
  /\b(?:password|passwd|secret|token)\s*[:=]\s*\S+/gi,
  /hermes:\/\/setup\?[^\s)]+/gi,
];

function redact(text) {
  let out = String(text ?? '');
  for (const pattern of SECRET_PATTERNS) {
    out = out.replace(pattern, '[redacted]');
  }
  return out;
}

function clip(text, max) {
  const t = redact(text).replace(/\s+/g, ' ').trim();
  if (!t) return '';
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1).trimEnd()}…`;
}

function normalizeHandoff(raw) {
  const obj = raw && typeof raw === 'object' ? raw : {};
  const openTodos = Array.isArray(obj.openTodos)
    ? obj.openTodos
        .filter((t) => typeof t === 'string')
        .map((t) => clip(t, 120))
        .filter(Boolean)
        .slice(0, 6)
    : [];
  return {
    version: 1,
    writtenAt:
      typeof obj.writtenAt === 'string' && obj.writtenAt.trim()
        ? obj.writtenAt.trim()
        : new Date().toISOString(),
    lastGoal: clip(obj.lastGoal || '(no user goal captured)', 240) || '(no user goal captured)',
    workspacePath: typeof obj.workspacePath === 'string' ? clip(obj.workspacePath, 260) || undefined : undefined,
    vaultSlug: typeof obj.vaultSlug === 'string' ? clip(obj.vaultSlug, 80) || undefined : undefined,
    openTodos,
    lastAssistantSummary:
      clip(obj.lastAssistantSummary || '(no assistant summary)', 480) || '(no assistant summary)',
    previousSessionId:
      typeof obj.previousSessionId === 'string' ? clip(obj.previousSessionId, 80) || undefined : undefined,
    macName: typeof obj.macName === 'string' ? clip(obj.macName, 80) || undefined : undefined,
    vaultRelativePath: 'Handoffs/hermes-mobile-last.md',
  };
}

function formatMarkdown(handoff) {
  const todos =
    handoff.openTodos.length > 0
      ? handoff.openTodos.map((t) => `- ${t}`).join('\n')
      : '- (none captured)';
  return [
    '---',
    'type: hermes-mobile-session-continuity',
    `version: ${handoff.version}`,
    `writtenAt: ${handoff.writtenAt}`,
    'secret_safe: true',
    '---',
    '',
    '# Hermes Mobile — last session handoff',
    '',
    'Short continuity note for a fresh mobile chat. No secrets.',
    'Do not let MEMORY.md or a dynamic project lane wipe this context — system_prompt + this file win.',
    '',
    '## Last goal',
    '',
    handoff.lastGoal,
    '',
    '## Project lane',
    '',
    `- Workspace / cwd: ${handoff.workspacePath || '(none)'}`,
    `- Vault slug: ${handoff.vaultSlug || '(none)'}`,
    `- Mac name: ${handoff.macName || '(unknown)'}`,
    `- Previous session id: ${handoff.previousSessionId || '(none)'}`,
    `- Vault path: ${handoff.vaultRelativePath}`,
    '',
    '## Open todos',
    '',
    todos,
    '',
    '## Last assistant summary (clip)',
    '',
    handoff.lastAssistantSummary,
    '',
  ].join('\n');
}

function writeFileAtomic(filePath, contents) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, contents, { encoding: 'utf8', mode: 0o644 });
  fs.renameSync(tmp, filePath);
}

/**
 * Persist handoff to vault + ~/.hermes mirror + pair-server JSON.
 * MEMORY.md is intentionally NOT rewritten (dynamic project lane must not wipe continuity).
 */
function writeSessionHandoff(raw, options = {}) {
  const vaultPath = options.vaultPath || process.env.AI_AGENT_VAULT || DEFAULT_VAULT;
  const handoff = normalizeHandoff(raw);
  const markdown = formatMarkdown(handoff);
  const json = `${JSON.stringify(handoff, null, 2)}\n`;

  const vaultFile = path.join(vaultPath, VAULT_REL);
  writeFileAtomic(vaultFile, markdown);
  writeFileAtomic(HERMES_MIRROR, markdown);
  writeFileAtomic(HERMES_JSON, json);
  writeFileAtomic(PAIR_OUT, json);

  return {
    ok: true,
    vaultFile,
    hermesMirror: HERMES_MIRROR,
    pairJson: PAIR_OUT,
    handoff,
  };
}

function readSessionHandoffJson(options = {}) {
  const candidates = [
    options.pairJsonPath || PAIR_OUT,
    HERMES_JSON,
  ];
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    try {
      return normalizeHandoff(JSON.parse(fs.readFileSync(file, 'utf8')));
    } catch {
      // try next
    }
  }
  return null;
}

function usage() {
  return `Usage:
  node tools/hermes-mobile-session-handoff.js --write --stdin
  node tools/hermes-mobile-session-handoff.js --write --json '{"lastGoal":"..."}'
  node tools/hermes-mobile-session-handoff.js --read --json

Writes Handoffs/hermes-mobile-last.md in the Obsidian vault and mirrors under ~/.hermes/.`;
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help') || args.includes('-h')) {
    console.log(usage());
    process.exit(0);
  }
  if (args.includes('--read')) {
    const handoff = readSessionHandoffJson();
    if (!handoff) {
      console.error('No session handoff on disk');
      process.exit(1);
    }
    process.stdout.write(`${JSON.stringify(handoff, null, 2)}\n`);
    return;
  }
  if (!args.includes('--write')) {
    console.error(usage());
    process.exit(2);
  }
  let raw;
  if (args.includes('--stdin')) {
    raw = JSON.parse(fs.readFileSync(0, 'utf8'));
  } else {
    const idx = args.indexOf('--json');
    if (idx < 0 || !args[idx + 1]) {
      console.error('--write requires --stdin or --json');
      process.exit(2);
    }
    raw = JSON.parse(args[idx + 1]);
  }
  const result = writeSessionHandoff(raw);
  console.log(
    `session-handoff: wrote ${result.vaultFile} (+ ${result.hermesMirror})`,
  );
}

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message || error);
    process.exit(1);
  }
}

module.exports = {
  writeSessionHandoff,
  readSessionHandoffJson,
  normalizeHandoff,
  formatMarkdown,
  DEFAULT_VAULT,
  PAIR_OUT,
  HERMES_MIRROR,
  VAULT_REL,
};
