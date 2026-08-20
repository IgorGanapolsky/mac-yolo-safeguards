#!/usr/bin/env node
'use strict';

/**
 * async-agent-messaging.js — async developer messaging for coding agents.
 *
 * Based on TheNewStack article "Codex can now keep coding while it waits for your answer":
 * OpenAI merged send_user_message_async into Codex, allowing the agent to send
 * a question/update to the developer, receive an "accepted" confirmation, and
 * CONTINUE working on non-dependent tasks rather than blocking idle.
 *
 * This tool brings that pattern to our agent harness:
 *
 * 1. ASK (non-blocking) — Agent sends a question to the developer via desktop
 *    notification + JSONL queue, gets immediate "accepted" confirmation, then
 *    continues with work that doesn't depend on the answer.
 *    The developer's reply lands as a new prompt for the next agent turn.
 *
 * 2. PENDING — Lists outstanding questions with staleness (TTL-based).
 *
 * 3. REPLY — Processes a developer reply from the CLI queue, linking it
 *    back to the original question so the next agent knows context.
 *
 * Usage:
 *   node tools/async-agent-messaging.js ask "Need to choose: postgres or sqlite?" --tag db-migration
 *   node tools/async-agent-messaging.js pending
 *   node tools/async-agent-messaging.js reply --id msg_abc123 --answer "use postgres"
 *   node tools/async-agent-messaging.js ask "..." --json
 *
 * The question never expires in Codex's implementation (per the article),
 * and our tool adds a TTL so agents can flag stale questions as obsolete.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const STORAGE_DIR = path.join(os.homedir(), '.mac-yolo-safeguards', 'harness-router');
const PENDING_FILE = path.join(STORAGE_DIR, 'async-pending-messages.jsonl');
const REPLIES_FILE = path.join(STORAGE_DIR, 'async-replies.jsonl');

const DEFAULT_TTL_SECONDS = 3600; // 1 hour

function ensureDir() {
  fs.mkdirSync(STORAGE_DIR, { recursive: true });
}

function readJsonl(file) {
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, 'utf8')
    .trim().split('\n')
    .filter(Boolean)
    .map((line) => { try { return JSON.parse(line); } catch { return null; } })
    .filter(Boolean);
}

function appendJsonl(file, entry) {
  ensureDir();
  fs.appendFileSync(file, JSON.stringify(entry, null, 0) + '\n');
}

function notifyMac(title, body) {
  // Desktop notification via osascript (non-hijack: user-initiated notification only,
  // not driving Chrome/automation). This is a simple user alert, not UI automation.
  const script = `display notification "${body}" with title "${title}"`;
  try {
    spawnSync('osascript', ['-e', script], { encoding: 'utf8', timeout: 5000 });
  } catch {
    /* notifications are best-effort */
  }
}

function ask(args) {
  const id = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const entry = {
    id,
    timestamp: new Date().toISOString(),
    question: args.question,
    taskType: args.taskType || 'coding',
    tags: args.tags || [],
    ttlSeconds: args.ttl || DEFAULT_TTL_SECONDS,
    status: 'pending',
  };

  appendJsonl(PENDING_FILE, entry);
  notifyMac('Agent needs your input', args.question.slice(0, 200));

  if (args.json) {
    console.log(JSON.stringify({ accepted: true, id, status: 'pending' }, null, 2));
  } else {
    console.log(`ASK accepted: ${id}`);
    console.log(`  Question: ${entry.question}`);
    console.log(`  Tags: ${entry.tags.join(', ') || '(none)'}`);
    console.log(`  TTL: ${entry.ttlSeconds}s`);
    console.log(`  The agent will continue working on non-dependent tasks.`);
    console.log(`  Your reply (when ready) will be added as a new prompt for the next agent turn.`);
  }
  return entry;
}

function pending(args) {
  const entries = readJsonl(PENDING_FILE);
  const now = Date.now();

  const enhanced = entries.map((e) => {
    const ageSeconds = (now - new Date(e.timestamp).getTime()) / 1000;
    const isStale = ageSeconds > e.ttlSeconds;
    const replied = readJsonl(REPLIES_FILE).some((r) => r.inReplyTo === e.id);
    return {
      ...e,
      ageSeconds: Math.round(ageSeconds),
      isStale,
      isReplied: replied,
    };
  });

  // Only show unanswered questions
  const unanswered = enhanced.filter((e) => !e.isReplied);

  if (args.json) {
    console.log(JSON.stringify(unanswered, null, 2));
  } else {
    console.log(`Pending messages: ${unanswered.length}\n`);
    for (const e of unanswered) {
      const staleTag = e.isStale ? ' [STALE]' : '';
      console.log(`  ${e.id}${staleTag}`);
      console.log(`    Q: ${e.question}`);
      console.log(`    Age: ${e.ageSeconds}s | TTL: ${e.ttlSeconds}s | Tags: ${e.tags.join(', ') || 'none'}`);
      console.log();
    }
    if (unanswered.some((e) => e.isStale)) {
      console.log('⚠ Some questions are STALE — they may be obsolete before a reply arrives.');
    }
  }
  return unanswered;
}

function reply(args) {
  const pending = readJsonl(PENDING_FILE);
  const target = pending.find((e) => e.id === args.id && !e.status === 'answered');
  if (!target) {
    const allPending = readJsonl(PENDING_FILE);
    const found = allPending.find((e) => e.id === args.id);
    if (found && found.status === 'answered') {
      console.error(`Message ${args.id} already has a reply.`);
      process.exit(1);
    }
    console.error(`Message ${args.id} not found in pending queue.`);
    process.exit(1);
  }

  const entry = {
    id: `reply_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    inReplyTo: target.id,
    timestamp: new Date().toISOString(),
    answer: args.answer,
    taskType: target.taskType,
    tags: target.tags,
    question: target.question,
  };

  appendJsonl(REPLIES_FILE, entry);

  // Mark the original as answered
  const updated = pending.map((e) =>
    e.id === target.id ? { ...e, status: 'answered', answeredAt: entry.timestamp } : e
  );
  ensureDir();
  fs.writeFileSync(PENDING_FILE, updated.map((e) => JSON.stringify(e, null, 0)).join('\n') + '\n');

  if (args.json) {
    console.log(JSON.stringify(entry, null, 2));
  } else {
    console.log(`REPLY recorded: ${entry.id}`);
    console.log(`  In reply to: ${target.id}`);
    console.log(`  Question: ${target.question}`);
    console.log(`  Answer: ${entry.answer}`);
    console.log(`  The reply will be picked up as a new user message for the next agent turn.`);
  }
  return entry;
}

function parseArgs(argv) {
  const out = { command: null, json: false, ttl: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') out.json = true;
    else if (a === '--ttl') out.ttl = parseInt(argv[++i], 10);
    else if (a === '--id') out.id = argv[++i];
    else if (a === '--answer') out.answer = argv[++i];
    else if (a === '--task-type') out.taskType = argv[++i];
    else if (a === '--tags') out.tags = argv[++i].split(',').map((s) => s.trim()).filter(Boolean);
    else if (!a.startsWith('-')) {
      if (!out.command) out.command = a;
      else if (!out.question) out.question = a;
    }
    // Also capture --question and --answer via flags
    if (a === '--question') out.question = argv[++i];
  }
  return out;
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.length === 0 || argv[0] === '--help' || argv[0] === '-h') {
    console.log(`async-agent-messaging — non-blocking developer messaging for coding agents

Based on OpenAI Codex send_user_message_async pattern.

Usage:
  node tools/async-agent-messaging.js ask "Need to choose: postgres or sqlite?" --tags db-migration
  node tools/async-agent-messaging.js pending
  node tools/async-agent-messaging.js reply --id msg_abc123 --answer "use postgres"
  node tools/async-agent-messaging.js ask "..." --json

Commands:
  ask    Send a non-blocking question. Agent continues working immediately.
  pending List outstanding questions with staleness (TTL-based).
  reply  Process a developer reply, linking it to the original question.
`);
    return;
  }

  const args = parseArgs(argv);
  switch (args.command) {
    case 'ask':
      if (!args.question) {
        console.error('ask requires a question string');
        process.exit(1);
      }
      ask(args);
      break;
    case 'pending':
      pending(args);
      break;
    case 'reply':
      if (!args.id) {
        console.error('reply requires --id <message-id>');
        process.exit(1);
      }
      if (!args.answer) {
        console.error('reply requires --answer "your response"');
        process.exit(1);
      }
      reply(args);
      break;
    default:
      console.error(`Unknown command: ${args.command}`);
      process.exit(1);
  }
}

if (require.main === module) main();

module.exports = { ask, pending, reply, PENDING_FILE, REPLIES_FILE, DEFAULT_TTL_SECONDS, STORAGE_DIR, readJsonl, appendJsonl };
