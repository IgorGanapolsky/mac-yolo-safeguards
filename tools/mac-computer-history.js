#!/usr/bin/env node
'use strict';

/**
 * mac-computer-history.js — FAIL-CLOSED.
 *
 * Futurism 2026-08-19: ChatGPT macOS Computer History records clicks,
 * keystrokes, and "events" so an agent can finish tasks you started.
 * Those files can contain sensitive info and are NOT encrypted.
 * Compared to Windows Recall.
 *
 * Hosted Hermes $10 is the opposite:
 *   1. Never capture keystrokes, clicks, or a timeline of local Mac activity.
 *   2. Never claim to "learn from everything you do on your computer."
 *   3. We are not ChatGPT Computer History, not Windows Recall, not a Mac keylogger.
 *      Isolated fenced VPS does not grab the cursor.
 *   4. Do not store unencrypted local "computer history" / input events.
 *   5. Least privilege: cannot read secrets. Private/incognito analogue:
 *      do not ingest other people's Slack / DMs.
 *
 * Refuse: Computer History product, Recall screenshots, Pulse memory of
 * every app, Chrome extension that watches typing, OTel of keystrokes.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');

const PRODUCT = 'hosted-hermes-chat-on-fenced-vps';
const SCHEMA = 'mac-computer-history/fail-closed/v2';

/** OpenAI ChatGPT desktop support roots (macOS). Probe-only — never enable capture. */
const OPENAI_SUPPORT_DIR_NAMES = Object.freeze([
  'com.openai.chat',
  'com.openai.chat.desktop',
  'ChatGPT',
  'openai.chatgpt',
]);

const OPENAI_HISTORY_NAME_RE =
  /computer[-_ ]?history|interaction[-_ ]?events?|activity[-_ ]?timeline|input[-_ ]?events?|keystroke|event[-_ ]?log/i;

const DEFAULT_EXCLUSIONS = Object.freeze([
  '*.env*',
  '*credentials*',
  '*secret*',
  '*.pem',
  '*.key',
  '*token*',
  'node_modules/*',
  '.git/*',
]);

const INPUT_CAPTURE_TYPES = new Set([
  'keystroke',
  'keystrokes',
  'click',
  'clicks',
  'input_event',
  'input-event',
  'interaction',
  'app_focus',
  'app-focus',
  'keyboard_shortcut',
  'keyboard-shortcut',
  'mousemove',
  'mouse_move',
  'eventtap',
  'accessibility',
  'hid',
  'cgEvent',
  'cgeventtap',
]);

const SECRET_RE =
  /(\.env\b|credentials?|secret|\.pem\b|\.key\b|token|password|passwd|api[_-]?key|authorization|private[_-]?key)/i;
const SLACK_DM_RE =
  /\b(slack|imessage|i-message|whatsapp|signal|telegram|discord)\b.*\b(dm|dms|direct message|direct messages|private message|inbox)\b|\b(other people'?s|someone else'?s)\b.*\b(slack|dm|dms|chat|inbox)\b/i;
const INPUT_CAPTURE_RE =
  /\b(keystroke|keystrokes|click tracker|clicks?|input events?|eventtap|cgeventtap|hid tap|accessibility api|macos input capture|screenshot recall|windows recall|computer history|otel of keystrokes|chrome extension that watches typing|pulse memory)\b/i;
const LEARN_EVERYTHING_RE = /learn from everything you do on your computer/i;

/**
 * Probe whether OpenAI ChatGPT Computer History artifacts appear on this Mac.
 * Futurism 2026-08-19: those files can hold sensitive info and are not encrypted.
 * This never enables capture, never ships content off-box, never reads payloads —
 * only path / size / mode metadata for operator warning.
 *
 * @param {{ homeDir?: string, maxFiles?: number }} [opts]
 */
function probeOpenAiComputerHistory(opts = {}) {
  const homeDir = opts.homeDir || os.homedir();
  const maxFiles = Number.isFinite(opts.maxFiles) ? opts.maxFiles : 40;
  const supportRoot = path.join(homeDir, 'Library', 'Application Support');
  const findings = [];
  const supportRootsFound = [];

  if (!fs.existsSync(supportRoot)) {
    return {
      schema: 'openai-computer-history-probe/v1',
      status: 'ABSENT',
      openaiSupportRootsFound: [],
      historyLikeFiles: [],
      unencryptedLikely: false,
      counsel:
        'No OpenAI ChatGPT Application Support tree found. Hermes stays fail-closed (no keystroke capture).',
      product: PRODUCT,
      weEnableCapture: false,
    };
  }

  for (const name of OPENAI_SUPPORT_DIR_NAMES) {
    const dir = path.join(supportRoot, name);
    if (!fs.existsSync(dir)) continue;
    supportRootsFound.push(dir);
    walkHistoryCandidates(dir, findings, maxFiles, 0);
  }

  // Also scan one shallow level for oddly named OpenAI folders
  try {
    for (const ent of fs.readdirSync(supportRoot, { withFileTypes: true })) {
      if (!ent.isDirectory()) continue;
      if (!/openai|chatgpt/i.test(ent.name)) continue;
      const dir = path.join(supportRoot, ent.name);
      if (supportRootsFound.includes(dir)) continue;
      supportRootsFound.push(dir);
      walkHistoryCandidates(dir, findings, maxFiles, 0);
    }
  } catch {
    // ignore permission errors
  }

  const historyLike = findings.filter((f) => f.historyLike);
  const unencryptedLikely = historyLike.some((f) => f.unencryptedLikely);
  let status = 'ABSENT';
  if (historyLike.length > 0) {
    status = unencryptedLikely ? 'PRESENT_UNENCRYPTED_WARN' : 'PRESENT_WARN';
  } else if (supportRootsFound.length > 0) {
    status = 'OPENAI_PRESENT_NO_HISTORY_FILES';
  }

  const counsel =
    status === 'ABSENT'
      ? 'No OpenAI Computer History artifacts detected. Hermes remains fail-closed.'
      : status === 'OPENAI_PRESENT_NO_HISTORY_FILES'
        ? 'ChatGPT desktop support dir present; no Computer History–named files found. Hermes still will not capture keystrokes.'
        : unencryptedLikely
          ? 'WARN: OpenAI Computer History–like files present and look unencrypted (Futurism 2026-08-19). Other programs running as your macOS user may read them. Hermes does NOT enable or copy this — disable Computer History in ChatGPT settings if unintended.'
          : 'WARN: OpenAI Computer History–like files present. Hermes does NOT enable or copy this capture surface.';

  return {
    schema: 'openai-computer-history-probe/v1',
    status,
    openaiSupportRootsFound: supportRootsFound,
    historyLikeFiles: historyLike.map((f) => ({
      path: f.path,
      bytes: f.bytes,
      mode: f.mode,
      unencryptedLikely: f.unencryptedLikely,
    })),
    unencryptedLikely,
    counsel,
    product: PRODUCT,
    weEnableCapture: false,
    weAreChatGPTComputerHistory: false,
  };
}

function walkHistoryCandidates(dir, out, maxFiles, depth) {
  if (out.length >= maxFiles || depth > 4) return;
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const ent of entries) {
    if (out.length >= maxFiles) return;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (/^(Cache|Code Cache|GPUCache|ShaderCache|Crashpad)$/i.test(ent.name)) continue;
      walkHistoryCandidates(full, out, maxFiles, depth + 1);
      continue;
    }
    if (!ent.isFile()) continue;
    const historyLike = OPENAI_HISTORY_NAME_RE.test(ent.name) || OPENAI_HISTORY_NAME_RE.test(dir);
    let st;
    try {
      st = fs.statSync(full);
    } catch {
      continue;
    }
    const mode = (st.mode & 0o777).toString(8).padStart(3, '0');
    const looksBinaryEncrypted =
      /\.(enc|sealed|age|gpg)$/i.test(ent.name) || /encrypt/i.test(ent.name);
    // Plain JSON/SQLite/plist/log without encrypt marker → treat as unencrypted-likely
    const plain =
      /\.(json|jsonl|sqlite|db|plist|log|txt|ndjson)$/i.test(ent.name) || historyLike;
    // OpenAI's own docs (Futurism 2026-08-19): Computer History files are not encrypted.
    const unencryptedLikely = historyLike && plain && !looksBinaryEncrypted;
    if (historyLike || (plain && OPENAI_HISTORY_NAME_RE.test(dir))) {
      out.push({
        path: full,
        bytes: st.size,
        mode,
        historyLike: true,
        unencryptedLikely,
      });
    }
  }
}

function doctorHonesty(opts = {}) {
  const openaiProbe = probeOpenAiComputerHistory(opts);
  return {
    schema: SCHEMA,
    product: PRODUCT,
    weAreChatGPTComputerHistory: false,
    weAreWindowsRecall: false,
    weAreMacKeylogger: false,
    storesUnencryptedHistory: false,
    capturesKeystrokes: false,
    capturesClicks: false,
    buildsLocalActivityTimeline: false,
    learnsFromEverythingYouDo: false,
    grabsCursor: false,
    canReadSecrets: false,
    ingestForeignSlackOrDms: false,
    fencedVpsDoesNotGrabCursor: true,
    status: 'FAIL_CLOSED',
    counsel:
      'Isolated fenced VPS does not grab the cursor. We are not ChatGPT Computer History, not Windows Recall, not a Mac keylogger.',
    openaiComputerHistoryOnThisMac: openaiProbe,
  };
}

function isExcluded(targetPath, exclusions = DEFAULT_EXCLUSIONS) {
  if (!targetPath) return false;
  const str = String(targetPath).toLowerCase();
  if (SECRET_RE.test(str)) return true;
  for (const pattern of exclusions) {
    const cleanPattern = String(pattern).replace(/\*/g, '').toLowerCase();
    if (cleanPattern && str.includes(cleanPattern)) return true;
  }
  return false;
}

function getExclusions() {
  return [...DEFAULT_EXCLUSIONS];
}

function canReadSecrets() {
  return false;
}

function ingestForeignSlackOrDms() {
  return false;
}

function enableMacOsInputCapture(helper) {
  return {
    enabled: false,
    helper: helper == null ? null : String(helper),
    reason: 'MACOS_INPUT_CAPTURE_DENIED',
    product: PRODUCT,
    weAreChatGPTComputerHistory: false,
    weAreWindowsRecall: false,
    weAreMacKeylogger: false,
  };
}

function denialReason(type, detail, metadata) {
  const blob = `${type || ''} ${detail || ''} ${JSON.stringify(metadata || {})}`;
  if (SECRET_RE.test(blob) || isExcluded(detail) || isExcluded(JSON.stringify(metadata || {}))) {
    return 'SECRETS_FORBIDDEN';
  }
  if (SLACK_DM_RE.test(blob)) {
    return 'PRIVATE_SLACK_DM_FORBIDDEN';
  }
  if (
    INPUT_CAPTURE_TYPES.has(String(type || '').toLowerCase())
    || INPUT_CAPTURE_RE.test(blob)
    || LEARN_EVERYTHING_RE.test(blob)
  ) {
    return 'MACOS_INPUT_CAPTURE_DENIED';
  }
  return 'COMPUTER_HISTORY_DENIED';
}

function recordEvent(type, detail, metadata = {}) {
  return {
    recorded: false,
    reason: denialReason(type, detail, metadata),
    product: PRODUCT,
    storesUnencryptedHistory: false,
    weAreChatGPTComputerHistory: false,
    weAreWindowsRecall: false,
    weAreMacKeylogger: false,
    historyFileWritten: false,
  };
}

function queryWorkHistory(query = '', sinceStr = '24h') {
  return {
    timeWindow: sinceStr,
    cutoffIso: null,
    queryFilter: query || null,
    summary: {
      totalRecordedEvents: 0,
      matchingEventsCount: 0,
      filesEditedCount: 0,
      recentCommitsCount: 0,
      activePRsCount: 0,
    },
    recentCommits: [],
    activePRs: [],
    filesEdited: [],
    events: [],
    storesUnencryptedHistory: false,
    reason: 'COMPUTER_HISTORY_DENIED',
    product: PRODUCT,
  };
}

function generateStandupDigest(sinceStr = '24h') {
  const honesty = doctorHonesty();
  return [
    '# Hosted Hermes is not ChatGPT Computer History',
    `*Fail-closed. Window ${sinceStr} is ignored — we do not build a local activity timeline.*`,
    '',
    honesty.counsel,
    'Least privilege: cannot read secrets. Private/incognito analogue: do not ingest other people\'s Slack or DMs.',
    'No unencrypted computer_history.json is written.',
  ].join('\n');
}

function generateSkillFromHistory(skillName) {
  const sanitizedName = String(skillName || 'recorded-workflow')
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-');
  return {
    skillName: sanitizedName,
    path: null,
    stepsCount: 0,
    written: false,
    reason: 'COMPUTER_HISTORY_DENIED',
    product: PRODUCT,
  };
}

function main(argv = process.argv.slice(2)) {
  const json = argv.includes('--json');
  const cmd = argv.find((a) => !a.startsWith('--')) || 'doctor';

  if (cmd === 'record') {
    const typeIdx = argv.indexOf('--type');
    const type = typeIdx !== -1 ? argv[typeIdx + 1] : 'interaction';
    const detailIdx = argv.indexOf('--detail');
    const detail = detailIdx !== -1 ? argv[detailIdx + 1] : argv[1] || 'action';
    const res = recordEvent(type, detail);
    console.log(JSON.stringify(res, null, 2));
    process.exitCode = 2;
    return res;
  }

  if (cmd === 'enable-input-capture' || cmd === 'enable-macos-input-capture') {
    const res = enableMacOsInputCapture(argv[1]);
    console.log(JSON.stringify(res, null, 2));
    process.exitCode = 2;
    return res;
  }

  if (cmd === 'query' || cmd === 'standup' || cmd === 'generate-skill' || cmd === 'exclusions') {
    const res = {
      ...(cmd === 'query' ? queryWorkHistory() : {}),
      ...(cmd === 'standup' ? { digest: generateStandupDigest() } : {}),
      ...(cmd === 'generate-skill' ? generateSkillFromHistory('denied') : {}),
      ...(cmd === 'exclusions' ? { exclusions: getExclusions() } : {}),
      recorded: false,
      reason: 'COMPUTER_HISTORY_DENIED',
      product: PRODUCT,
    };
    if (cmd === 'standup' && !json) {
      console.log(res.digest);
    } else {
      console.log(JSON.stringify(res, null, 2));
    }
    process.exitCode = 2;
    return res;
  }

  if (cmd === 'probe-openai' || cmd === 'probe-chatgpt-computer-history') {
    const probe = probeOpenAiComputerHistory();
    console.log(JSON.stringify(probe, null, 2));
    if (probe.status === 'PRESENT_UNENCRYPTED_WARN' || probe.status === 'PRESENT_WARN') {
      process.exitCode = 3;
    }
    return probe;
  }

  const doc = doctorHonesty();
  if (json) {
    console.log(JSON.stringify(doc, null, 2));
  } else {
    const probe = doc.openaiComputerHistoryOnThisMac || {};
    console.log(
      [
        `Mac Computer History: ${doc.status} (we are not ChatGPT Computer History / Windows Recall / a Mac keylogger)`,
        `  product=${doc.product}`,
        `  storesUnencryptedHistory=${doc.storesUnencryptedHistory}`,
        `  canReadSecrets=${doc.canReadSecrets}`,
        `  ingestForeignSlackOrDms=${doc.ingestForeignSlackOrDms}`,
        `  openaiOnThisMac=${probe.status || 'unknown'} historyFiles=${(probe.historyLikeFiles || []).length} unencryptedLikely=${Boolean(probe.unencryptedLikely)}`,
        `  ${doc.counsel}`,
        probe.counsel ? `  openaiProbe: ${probe.counsel}` : null,
      ]
        .filter(Boolean)
        .join('\n'),
    );
  }
  return doc;
}

if (require.main === module) {
  main();
}

module.exports = {
  SCHEMA,
  PRODUCT,
  DEFAULT_EXCLUSIONS,
  OPENAI_SUPPORT_DIR_NAMES,
  canReadSecrets,
  denialReason,
  doctorHonesty,
  enableMacOsInputCapture,
  generateSkillFromHistory,
  generateStandupDigest,
  getExclusions,
  ingestForeignSlackOrDms,
  isExcluded,
  main,
  probeOpenAiComputerHistory,
  queryWorkHistory,
  recordEvent,
};
