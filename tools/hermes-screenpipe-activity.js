#!/usr/bin/env node
'use strict';

/**
 * Screenpipe Activity steal — local fleet wiring (NOT Screenpipe itself).
 *
 * Source email (2026-08-19): louis@screenpi.pe — Activity timeline, multi-harness
 * context, local-first "you decide what context leaves".
 *
 * Transferable mechanics we run:
 *   1. Activity bands: task | meeting | break | other (from semantic events)
 *   2. Recall/search local history for agents
 *   3. Opt-in egress — local by default; cloud harnesses need --egress-ok + receipt
 *
 * What this is NOT:
 *   - Screenpipe product / screen+audio OCR capture
 *   - Keystroke logger / Computer History clone
 *   - Auto-sync of Mac timeline to cloud models
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { resolveHarness, createHarnessEnvelope } = require('./hermes-universal-harness-adapter');
const { distillActivityIntoSkill } = require('./hermes-activity-skill-distiller');

const SOURCE = 'https://screenpi.pe/';
const DEFAULT_HISTORY = path.join(os.homedir(), '.hermes', 'computer_history.json');

const MEETING_RE = /\b(meeting|standup|sync|call|zoom|meet\.google|calendar|1:1|one.on.one)\b/i;
const BREAK_RE = /\b(break|lunch|coffee|afk|idle|paused)\b/i;
const TASK_RE = /\b(fix|pr|commit|deploy|test|build|debug|implement|ship|merge|review)\b/i;

function parseArgs(argv) {
  const args = {
    json: false,
    help: false,
    cmd: 'timeline',
    query: '',
    sinceMs: 24 * 60 * 60 * 1000,
    egressOk: false,
    harness: 'grok',
    historyFile: DEFAULT_HISTORY,
    distill: false,
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') args.json = true;
    else if (a === '--help' || a === '-h') args.help = true;
    else if (a === '--egress-ok') args.egressOk = true;
    else if (a === '--distill') args.distill = true;
    else if (a === '--harness') args.harness = String(argv[++i] || 'grok');
    else if (a === '--history') args.historyFile = String(argv[++i] || DEFAULT_HISTORY);
    else if (a === '--since') {
      const raw = String(argv[++i] || '24h');
      args.sinceMs = parseSince(raw);
    } else if (a === 'timeline' || a === 'recall' || a === 'pack' || a === 'doctor') {
      args.cmd = a;
    } else if (!a.startsWith('-') && args.cmd === 'recall' && !args.query) {
      args.query = a;
    } else if (a.startsWith('-')) {
      throw new Error(`Unknown argument: ${a}`);
    } else if (!args.query) {
      args.query = a;
    }
  }
  return args;
}

function parseSince(raw) {
  const m = String(raw).trim().match(/^(\d+)(h|d|m)?$/i);
  if (!m) return 24 * 60 * 60 * 1000;
  const n = Number(m[1]);
  const unit = (m[2] || 'h').toLowerCase();
  if (unit === 'd') return n * 24 * 60 * 60 * 1000;
  if (unit === 'm') return n * 60 * 1000;
  return n * 60 * 60 * 1000;
}

function loadHistoryEvents(historyFile = DEFAULT_HISTORY) {
  if (!fs.existsSync(historyFile)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(historyFile, 'utf8'));
    return Array.isArray(parsed) ? parsed : Array.isArray(parsed.events) ? parsed.events : [];
  } catch {
    return [];
  }
}

function classifyActivity(event) {
  const hay = `${event.type || ''} ${event.detail || ''} ${JSON.stringify(event.metadata || {})}`;
  if (MEETING_RE.test(hay)) return 'meeting';
  if (BREAK_RE.test(hay)) return 'break';
  if (TASK_RE.test(hay) || /^(file_edit|git_commit|test_run|pr_|task_)/i.test(String(event.type || ''))) {
    return 'task';
  }
  return 'other';
}

function buildActivityTimeline(events, options = {}) {
  const sinceMs = options.sinceMs ?? 24 * 60 * 60 * 1000;
  const now = options.now ? options.now.getTime() : Date.now();
  const cutoff = now - sinceMs;

  const entries = events
    .filter((e) => {
      const ts = Date.parse(e.timestamp || e.ts || '') || 0;
      return ts >= cutoff;
    })
    .map((e) => {
      const kind = classifyActivity(e);
      return {
        id: e.id || `act_${crypto.randomBytes(4).toString('hex')}`,
        kind,
        timestamp: e.timestamp || e.ts || null,
        title: summarizeTitle(e, kind),
        sourceType: e.type || 'unknown',
        detail: String(e.detail || '').slice(0, 240),
      };
    })
    .sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));

  const counts = { task: 0, meeting: 0, break: 0, other: 0 };
  for (const e of entries) counts[e.kind] = (counts[e.kind] || 0) + 1;

  return {
    source: SOURCE,
    generatedAt: new Date(now).toISOString(),
    sinceMs,
    entryCount: entries.length,
    counts,
    entries,
  };
}

function summarizeTitle(event, kind) {
  const detail = String(event.detail || event.type || 'activity').slice(0, 80);
  if (kind === 'meeting') return `Meeting — ${detail}`;
  if (kind === 'break') return `Break — ${detail}`;
  if (kind === 'task') return `Task — ${detail}`;
  return `Other — ${detail}`;
}

function recallActivity(timeline, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) {
    return { ok: true, query: '', matches: timeline.entries.slice(-20) };
  }
  const matches = timeline.entries.filter((e) => {
    const hay = `${e.kind} ${e.title} ${e.detail} ${e.sourceType}`.toLowerCase();
    return hay.includes(q);
  });
  return { ok: true, query: q, matchCount: matches.length, matches };
}

/**
 * Screenpipe "you decide what context leaves" — fail closed for cloud harnesses.
 */
function authorizeEgress(options = {}) {
  const destination = String(options.destination || 'local');
  const egressOk = options.egressOk === true;
  const localDest = /^(local|ollama|hermes-yolo|file|none)$/i.test(destination);

  if (localDest) {
    return {
      allowed: true,
      destination,
      kind: 'local_only',
      framing: 'Context stays on device (local destination).',
      receipt: makeReceipt('say_yes_local', destination),
    };
  }

  if (!egressOk) {
    return {
      allowed: false,
      destination,
      kind: 'hold_egress',
      framing: 'Hold — cloud/harness egress requires explicit --egress-ok (Screenpipe local-first).',
      receipt: makeReceipt('hold_egress', destination),
    };
  }

  return {
    allowed: true,
    destination,
    kind: 'say_yes_egress',
    framing: `Say yes — selected Activity context may leave to ${destination} (operator opted in).`,
    receipt: makeReceipt('say_yes_egress', destination),
  };
}

function makeReceipt(kind, destination) {
  return {
    id: `screenpipe-egress-${crypto.randomBytes(6).toString('hex')}`,
    kind,
    destination,
    source: SOURCE,
    generatedAt: new Date().toISOString(),
  };
}

function packActivityForHarness(timeline, options = {}) {
  const harnessName = options.harness || 'grok';
  const egressOk = options.egressOk === true;
  const query = options.query || '';
  const recalled = recallActivity(timeline, query);
  const selected = recalled.matches.slice(-30);

  const egress = authorizeEgress({ destination: harnessName, egressOk });
  if (!egress.allowed) {
    return {
      ok: false,
      allowed: false,
      egress,
      selectedCount: selected.length,
    };
  }

  const harness = resolveHarness(harnessName);
  const envelope = createHarnessEnvelope(
    {
      id: `activity-pack-${crypto.randomBytes(4).toString('hex')}`,
      prompt: options.prompt || `Use selected local Activity context (${selected.length} entries).`,
      context: {
        activityCounts: timeline.counts,
        entries: selected,
        note: 'Semantic Activity only — no screen/audio capture. Local-first Screenpipe process steal.',
      },
    },
    harness,
  );

  let distilled = null;
  if (options.distill) {
    distilled = distillActivityIntoSkill({
      title: options.skillTitle || `Activity ${query || 'interval'}`,
      description: 'Synthesized from local Hermes Activity interval (Screenpipe-style).',
      actions: selected.map((e) => ({
        type: e.sourceType.includes('file') ? 'file_edit' : 'command',
        command: e.detail,
        file: e.sourceType === 'file_edit' ? e.detail : undefined,
      })),
      tags: ['screenpipe-activity', 'local-first'],
    });
  }

  return {
    ok: true,
    allowed: true,
    egress,
    harness: harness.id,
    selectedCount: selected.length,
    envelope,
    distilled,
  };
}

function doctor(historyFile = DEFAULT_HISTORY) {
  const events = loadHistoryEvents(historyFile);
  const timeline = buildActivityTimeline(events, { sinceMs: 7 * 24 * 60 * 60 * 1000 });
  return {
    ok: true,
    source: SOURCE,
    historyFile,
    historyExists: fs.existsSync(historyFile),
    rawEventCount: events.length,
    weekActivity: timeline.counts,
    honesty: {
      weAreNot: 'Screenpipe product / screen+OCR recorder',
      weDo: 'Semantic Activity bands + opt-in egress over mac-computer-history',
    },
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    console.log(
      'Usage:\n' +
        '  node tools/hermes-screenpipe-activity.js timeline [--since 24h] [--json]\n' +
        '  node tools/hermes-screenpipe-activity.js recall <query> [--since 24h] [--json]\n' +
        '  node tools/hermes-screenpipe-activity.js pack [--harness grok|cursor|claude-code|codex|ollama] [--egress-ok] [--distill] [--json]\n' +
        '  node tools/hermes-screenpipe-activity.js doctor [--json]\n' +
        'Screenpipe process steal: Activity + local-first egress. Not Screenpipe capture.',
    );
    process.exit(0);
  }

  const events = loadHistoryEvents(args.historyFile);
  const timeline = buildActivityTimeline(events, { sinceMs: args.sinceMs });

  let out;
  if (args.cmd === 'doctor') {
    out = doctor(args.historyFile);
  } else if (args.cmd === 'recall') {
    out = { timelineSummary: timeline.counts, ...recallActivity(timeline, args.query) };
  } else if (args.cmd === 'pack') {
    out = packActivityForHarness(timeline, {
      harness: args.harness,
      egressOk: args.egressOk,
      query: args.query,
      distill: args.distill,
    });
  } else {
    out = timeline;
  }

  if (args.json) {
    console.log(JSON.stringify(out, null, 2));
  } else if (args.cmd === 'doctor') {
    console.log(
      `Screenpipe-activity doctor: history=${out.historyExists ? 'yes' : 'no'} events=${out.rawEventCount} ` +
        `week task=${out.weekActivity.task} meeting=${out.weekActivity.meeting} break=${out.weekActivity.break}`,
    );
    console.log(`Honesty: ${out.honesty.weDo} (NOT ${out.honesty.weAreNot})`);
  } else if (args.cmd === 'recall') {
    console.log(`Recall "${out.query || '*'}": ${out.matchCount ?? out.matches.length} matches`);
    for (const m of out.matches.slice(-10)) {
      console.log(`  [${m.kind}] ${m.timestamp || '?'} ${m.title}`);
    }
  } else if (args.cmd === 'pack') {
    if (!out.allowed) {
      console.log(`HOLD egress → ${out.egress.destination}: ${out.egress.framing}`);
      process.exit(1);
    }
    console.log(
      `SAY_YES pack harness=${out.harness} selected=${out.selectedCount} receipt=${out.egress.receipt.id}`,
    );
    console.log(out.egress.framing);
  } else {
    console.log(
      `Activity timeline: ${timeline.entryCount} entries ` +
        `task=${timeline.counts.task} meeting=${timeline.counts.meeting} ` +
        `break=${timeline.counts.break} other=${timeline.counts.other}`,
    );
    for (const e of timeline.entries.slice(-12)) {
      console.log(`  [${e.kind}] ${e.timestamp || '?'} ${e.title}`);
    }
  }
}

module.exports = {
  SOURCE,
  classifyActivity,
  buildActivityTimeline,
  recallActivity,
  authorizeEgress,
  packActivityForHarness,
  doctor,
  loadHistoryEvents,
  parseSince,
};

if (require.main === module) {
  try {
    main();
  } catch (error) {
    console.error(error.message || error);
    process.exit(2);
  }
}
