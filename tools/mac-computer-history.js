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

const PRODUCT = 'hosted-hermes-chat-on-fenced-vps';
const SCHEMA = 'mac-computer-history/fail-closed/v1';

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

function doctorHonesty() {
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

  const doc = doctorHonesty();
  if (json) {
    console.log(JSON.stringify(doc, null, 2));
  } else {
    console.log(
      [
        `Mac Computer History: ${doc.status} (we are not ChatGPT Computer History / Windows Recall / a Mac keylogger)`,
        `  product=${doc.product}`,
        `  storesUnencryptedHistory=${doc.storesUnencryptedHistory}`,
        `  canReadSecrets=${doc.canReadSecrets}`,
        `  ingestForeignSlackOrDms=${doc.ingestForeignSlackOrDms}`,
        `  ${doc.counsel}`,
      ].join('\n'),
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
  queryWorkHistory,
  recordEvent,
};
