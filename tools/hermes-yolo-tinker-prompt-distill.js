#!/usr/bin/env node
'use strict';

/**
 * Tinker Cookbook prompt-distillation adapter for hermes-yolo.
 *
 * Steal: thinking-machines-lab/tinker-cookbook prompt_distillation —
 * train a student to behave as if it saw a long prompt, without putting
 * that prompt in the student context.
 *
 * We already have teacher traces (LiteLLM traffic → Tinker JSONL). Those
 * rows still carry 30–60k-char Hermes skill dumps as system messages.
 * This tool strips/replaces those dumps with a short stub and writes a
 * sidecar dataset. It never calls Tinker, never uploads, never changes
 * the hermes-yolo default route.
 *
 * Reports never include message bodies.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const SCHEMA = 'hermes-yolo-tinker-distill/coverage-v1';
const DEFAULT_STUB =
  'You are Hermes, a local coding agent. Fleet rules are internalized. Use tools when they help. Never print secrets.';
const DEFAULT_MAX_SYSTEM_CHARS = 800;
const CONVERSATIONS_BASENAME = 'conversations.jsonl';

function homeDir(env = process.env) {
  return env.HOME || os.homedir();
}

function defaultDataset(env = process.env) {
  return env.TINKER_DATASET
    || path.join(homeDir(env), '.hermes', 'tinker', 'datasets', CONVERSATIONS_BASENAME);
}

function defaultReceiptHistory(env = process.env) {
  return env.HERMES_YOLO_RECEIPT_HISTORY
    || path.join(homeDir(env), '.hermes', 'receipts', 'hermes-yolo', 'history.jsonl');
}

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    dataset: null,
    out: null,
    receipts: null,
    json: false,
    write: false,
    limit: 0,
    maxSystemChars: DEFAULT_MAX_SYSTEM_CHARS,
    stub: process.env.TINKER_PROMPT_DISTILL_STUB || DEFAULT_STUB,
    help: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--dataset') args.dataset = requireValue(argv, ++i, arg);
    else if (arg === '--out') { args.out = requireValue(argv, ++i, arg); args.write = true; }
    else if (arg === '--receipts') args.receipts = requireValue(argv, ++i, arg);
    else if (arg === '--json') args.json = true;
    else if (arg === '--write') args.write = true;
    else if (arg === '--limit') args.limit = positiveInt(requireValue(argv, ++i, arg), arg);
    else if (arg === '--max-system-chars') {
      args.maxSystemChars = positiveInt(requireValue(argv, ++i, arg), arg);
    } else if (arg === '--stub') args.stub = requireValue(argv, ++i, arg);
    else if (arg === '--help' || arg === '-h') args.help = true;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return args;
}

function requireValue(argv, index, flag) {
  if (!argv[index]) throw new Error(`${flag} requires a value`);
  return argv[index];
}

function positiveInt(raw, flag) {
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 1) throw new Error(`${flag} must be a positive integer`);
  return n;
}

function usage() {
  return [
    'tinker-prompt-distill — local Tinker Cookbook prompt distillation (no upload)',
    '',
    '  --dataset PATH          source JSONL (default: ~/.hermes/tinker/datasets/conversations.jsonl)',
    '  --out PATH              write distilled sidecar (0600). Never overwrites conversations.jsonl',
    '  --receipts PATH         hermes-yolo history.jsonl for coverage (metadata only)',
    '  --limit N               process at most N source rows',
    '  --max-system-chars N    keep short system prompts; longer ones become the stub (default 800)',
    '  --stub TEXT             replacement system prompt',
    '  --json                  machine-readable coverage report',
    '  --write                 write --out even if it already exists (still refuses conversations.jsonl)',
    '',
    'Does not train, upload, or change the hermes-yolo default route.',
  ].join('\n');
}

function messageText(message) {
  const content = message && message.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content.map((part) => {
      if (typeof part === 'string') return part;
      if (part && typeof part.text === 'string') return part.text;
      return '';
    }).join('');
  }
  return '';
}

function distillMessages(messages, options = {}) {
  const stub = options.stub || DEFAULT_STUB;
  const maxSystemChars = options.maxSystemChars || DEFAULT_MAX_SYSTEM_CHARS;
  const out = [];
  let systemCharsBefore = 0;
  let systemCharsAfter = 0;
  let longSystemMessages = 0;
  let systemMessages = 0;
  let keptShortSystem = 0;
  let sawSystem = false;

  for (const message of Array.isArray(messages) ? messages : []) {
    const role = message && message.role;
    if (role === 'system') {
      systemMessages += 1;
      const len = messageText(message).length;
      systemCharsBefore += len;
      const tooLong = len > maxSystemChars;
      if (tooLong) longSystemMessages += 1;
      if (sawSystem) continue;
      sawSystem = true;
      if (tooLong) {
        out.push({ role: 'system', content: stub });
        systemCharsAfter += stub.length;
      } else {
        out.push({
          role: 'system',
          content: typeof message.content === 'string' ? message.content : stub,
        });
        systemCharsAfter += typeof message.content === 'string' ? len : stub.length;
        keptShortSystem += 1;
      }
      continue;
    }
    if (!role) continue;
    const copy = { role };
    if (Object.prototype.hasOwnProperty.call(message, 'content')) copy.content = message.content;
    if (message.tool_calls) copy.tool_calls = message.tool_calls;
    if (message.tool_call_id) copy.tool_call_id = message.tool_call_id;
    if (message.name) copy.name = message.name;
    out.push(copy);
  }

  if (!sawSystem && longSystemMessages === 0 && systemMessages === 0) {
    out.unshift({ role: 'system', content: stub });
    systemCharsAfter += stub.length;
  }

  const hasUser = out.some((m) => m.role === 'user' && messageText(m).length > 0);
  const hasTarget = out.some((m) => m.role === 'assistant' || m.role === 'tool');
  return {
    ok: hasUser && hasTarget,
    messages: out,
    systemMessages,
    longSystemMessages,
    keptShortSystem,
    systemCharsBefore,
    systemCharsAfter,
  };
}

function isConversationsPath(filePath) {
  return path.basename(filePath) === CONVERSATIONS_BASENAME;
}

function ensurePrivateDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true, mode: 0o700 });
  try { fs.chmodSync(dirPath, 0o700); } catch (_) { /* ignore */ }
}

function scanHermesYoloReceipts(filePath) {
  const empty = {
    exists: false,
    rows: 0,
    withMessages: 0,
    backends: {},
    gap: 'missing-receipt-history',
  };
  if (!filePath || !fs.existsSync(filePath)) return empty;
  const stat = fs.lstatSync(filePath);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    return { ...empty, exists: true, gap: 'unsafe-receipt-path' };
  }
  const backends = Object.create(null);
  let rows = 0;
  let withMessages = 0;
  const raw = fs.readFileSync(filePath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    if (!line.trim()) continue;
    let obj;
    try { obj = JSON.parse(line); } catch (_) { continue; }
    rows += 1;
    const backend = (obj.route && obj.route.selectedBackend) || 'unknown';
    backends[backend] = (backends[backend] || 0) + 1;
    if (Array.isArray(obj.messages) && obj.messages.length) withMessages += 1;
  }
  return {
    exists: true,
    rows,
    withMessages,
    backends,
    gap: withMessages === 0
      ? 'hermes-yolo-route-receipts-have-no-chat-traces'
      : null,
  };
}

function consumeLine(line, report, options, outFd) {
  if (!line.trim()) return 'continue';
  const limit = Number(options.limit || 0);
  if (limit > 0 && report.source.rows >= limit) return 'stop';
  let row;
  try { row = JSON.parse(line); } catch (_) {
    report.skippedRows += 1;
    return 'continue';
  }
  report.source.rows += 1;
  const distilled = distillMessages(row.messages, {
    stub: options.stub || DEFAULT_STUB,
    maxSystemChars: options.maxSystemChars || DEFAULT_MAX_SYSTEM_CHARS,
  });
  report.systemMessages += distilled.systemMessages;
  report.longSystemMessages += distilled.longSystemMessages;
  report.keptShortSystem += distilled.keptShortSystem;
  report.systemCharsBefore += distilled.systemCharsBefore;
  report.systemCharsAfter += distilled.systemCharsAfter;
  if (!distilled.ok) {
    report.skippedRows += 1;
    return 'continue';
  }
  report.distilledRows += 1;
  if (outFd !== null) {
    fs.writeSync(outFd, `${JSON.stringify({ messages: distilled.messages })}\n`);
  }
  return 'continue';
}

function emptyReport(options = {}) {
  return {
    schema: SCHEMA,
    paidTrain: false,
    hermesBaselineChanged: false,
    source: { exists: false, rows: 0, bytes: 0, privateMode: false },
    distilledRows: 0,
    skippedRows: 0,
    systemMessages: 0,
    longSystemMessages: 0,
    keptShortSystem: 0,
    systemCharsBefore: 0,
    systemCharsAfter: 0,
    compressionRatio: 1,
    wrote: false,
    out: null,
    hermesYoloReceipts: scanHermesYoloReceipts(options.receipts || defaultReceiptHistory(options.env)),
    recommendation: '',
  };
}

function finalizeReport(report, outTmp, outPath) {
  if (outTmp && outPath) {
    fs.renameSync(outTmp, outPath);
    fs.chmodSync(outPath, 0o600);
    report.wrote = true;
    report.out = outPath;
  }
  report.compressionRatio = report.systemCharsBefore > 0
    ? Number((report.systemCharsAfter / report.systemCharsBefore).toFixed(4))
    : 1;
  report.recommendation = buildRecommendation(report);
  return report;
}

function processDataset(options = {}) {
  const dataset = path.resolve(options.dataset || defaultDataset(options.env));
  const report = emptyReport(options);

  if (!fs.existsSync(dataset)) {
    report.recommendation = 'No Tinker conversations.jsonl yet. Run tinker-yolo build (local, no upload).';
    return report;
  }
  const stat = fs.lstatSync(dataset);
  if (!stat.isFile() || stat.isSymbolicLink()) {
    throw new Error('dataset must be a regular file');
  }
  report.source = {
    exists: true,
    rows: 0,
    bytes: stat.size,
    privateMode: (stat.mode & 0o077) === 0,
  };

  const outPath = options.out ? path.resolve(options.out) : null;
  let outFd = null;
  let outTmp = null;
  if (outPath) {
    if (isConversationsPath(outPath)) {
      throw new Error('refusing to overwrite conversations.jsonl; write a sidecar');
    }
    ensurePrivateDir(path.dirname(outPath));
    outTmp = `${outPath}.${process.pid}.tmp`;
    outFd = fs.openSync(outTmp, 'w', 0o600);
  }

  try {
    const fd = fs.openSync(dataset, 'r');
    try {
      const buffer = Buffer.alloc(1024 * 1024);
      let carry = '';
      let stopped = false;
      while (!stopped) {
        const n = fs.readSync(fd, buffer, 0, buffer.length, null);
        if (n === 0) break;
        carry += buffer.slice(0, n).toString('utf8');
        let nl;
        while ((nl = carry.indexOf('\n')) !== -1) {
          const line = carry.slice(0, nl);
          carry = carry.slice(nl + 1);
          if (consumeLine(line, report, options, outFd) === 'stop') {
            stopped = true;
            break;
          }
        }
      }
      if (!stopped && carry) consumeLine(carry, report, options, outFd);
    } finally {
      fs.closeSync(fd);
    }
  } finally {
    if (outFd !== null) fs.closeSync(outFd);
  }

  return finalizeReport(report, outTmp, outPath);
}

function buildRecommendation(report) {
  const parts = [];
  if (report.longSystemMessages > 0) {
    parts.push(
      `Strip ${report.longSystemMessages} long system message(s) (${report.systemCharsBefore}→${report.systemCharsAfter} chars) before the next paid tinker-yolo train. That is Tinker Cookbook prompt distillation for hermes-yolo local fallback.`,
    );
  } else if (report.distilledRows > 0) {
    parts.push('System prompts are already short enough; keep the sidecar for the next approved train.');
  } else {
    parts.push('No usable teacher rows. Run tinker-yolo build from LiteLLM traffic first.');
  }
  if (report.hermesYoloReceipts.gap === 'hermes-yolo-route-receipts-have-no-chat-traces') {
    parts.push(
      'hermes-yolo route receipts have no chat traces (Grok/legacy backends skip LiteLLM). Tinker SFT still comes from gateway traffic.jsonl, not SuperGrok transcripts.',
    );
  }
  parts.push('Do not download Inkling locally. Do not change the hermes-yolo default route from this command.');
  return parts.join(' ');
}

function formatText(report) {
  const r = report.hermesYoloReceipts;
  return [
    `TINKER_PROMPT_DISTILL schema=${report.schema} paid_train=${report.paidTrain}`,
    `source rows=${report.source.rows} bytes=${report.source.bytes} private=${report.source.privateMode}`,
    `distilled=${report.distilledRows} skipped=${report.skippedRows} long_system=${report.longSystemMessages}`,
    `system_chars ${report.systemCharsBefore}->${report.systemCharsAfter} ratio=${report.compressionRatio}`,
    `hermes_yolo_receipts rows=${r.rows} with_messages=${r.withMessages} gap=${r.gap || 'none'}`,
    `wrote=${report.wrote} out=${report.out || '-'}`,
    `recommendation: ${report.recommendation}`,
  ].join('\n');
}

function main(argv = process.argv.slice(2), env = process.env) {
  let args;
  try {
    args = parseArgs(argv);
  } catch (err) {
    process.stderr.write(`tinker-prompt-distill: ${err.message}\n`);
    process.exitCode = 2;
    return;
  }
  if (args.help) {
    process.stdout.write(`${usage()}\n`);
    return;
  }
  const dataset = args.dataset || defaultDataset(env);
  let out = args.out;
  if (args.write && !out) {
    out = path.join(path.dirname(dataset), 'prompt-distill.jsonl');
  }
  try {
    const report = processDataset({
      dataset,
      out,
      receipts: args.receipts || defaultReceiptHistory(env),
      limit: args.limit,
      maxSystemChars: args.maxSystemChars,
      stub: args.stub,
      env,
    });
    process.stdout.write(args.json ? `${JSON.stringify(report)}\n` : `${formatText(report)}\n`);
  } catch (err) {
    process.stderr.write(`tinker-prompt-distill: ${err.message}\n`);
    process.exitCode = 1;
  }
}

module.exports = {
  SCHEMA,
  DEFAULT_STUB,
  DEFAULT_MAX_SYSTEM_CHARS,
  parseArgs,
  messageText,
  distillMessages,
  scanHermesYoloReceipts,
  processDataset,
  isConversationsPath,
  main,
};

if (require.main === module) main();
