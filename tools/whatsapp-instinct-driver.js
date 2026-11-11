#!/usr/bin/env node
'use strict';

/**
 * whatsapp-instinct-driver.js — Safe, Single-Target WhatsApp Instinct Copilot Driver
 *
 * Drives the Instinct AI assistant inside WhatsApp Desktop on macOS to perform
 * public market research, buyer-intent discovery, and grant/directory scouting
 * for ThumbGate (https://thumbgate.app) and Florida distressed real estate.
 *
 * HARD SAFETY INVARIANTS (NON-NEGOTIABLE):
 *   1. Locked strictly to Instinct's WhatsApp session:
 *      - Phone: `16508702892` (+1 650-870-2892)
 *      - JID:   `23949492670633@lid`
 *      - Any attempt to target any other phone number, JID, or contact throws
 *        `ERR_WHATSAPP_NON_INSTINCT_TARGET_FORBIDDEN`.
 *   2. Zero External Outreach:
 *      - Any prompt instructing Instinct to send emails, messages, texts, or invites
 *        to external contacts or calendar entries throws `ERR_EXTERNAL_OUTREACH_FORBIDDEN`.
 *   3. Read-Only SQLite Inspection:
 *      - Reads `~/Library/Group Containers/group.net.whatsapp.WhatsApp.shared/ChatStorage.sqlite`
 *        via `sqlite3 -readonly` scoped exclusively to `ZCHATSESSION = 3` (`23949492670633@lid`).
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const INSTINCT_PHONE = '16508702892';
const INSTINCT_JID = '23949492670633@lid';
const INSTINCT_SESSION_PK = 3;

const DEFAULT_DB_PATH = path.join(
  os.homedir(),
  'Library',
  'Group Containers',
  'group.net.whatsapp.WhatsApp.shared',
  'ChatStorage.sqlite',
);

const OUTREACH_FORBIDDEN_RE =
  /\b(?:send\s+(?:an?\s+)?(?:email|text|message|invite|dm)\s+to|email\s+my\s+contacts|message\s+my\s+calendar|blast\s+contacts)\b/i;

function assertInstinctTargetOnly(target = {}) {
  const phone = String(target.phone || INSTINCT_PHONE).replace(/[^\d]/g, '');
  const jid = String(target.jid || INSTINCT_JID).trim();
  const sessionPk = Number(target.sessionPk == null ? INSTINCT_SESSION_PK : target.sessionPk);

  if (phone !== INSTINCT_PHONE || jid !== INSTINCT_JID || sessionPk !== INSTINCT_SESSION_PK) {
    const err = new Error(
      `ERR_WHATSAPP_NON_INSTINCT_TARGET_FORBIDDEN: Only Instinct (${INSTINCT_PHONE} / ${INSTINCT_JID}) may be accessed. Target (${phone} / ${jid} / session=${sessionPk}) is forbidden.`,
    );
    err.code = 'ERR_WHATSAPP_NON_INSTINCT_TARGET_FORBIDDEN';
    throw err;
  }
  return { phone: INSTINCT_PHONE, jid: INSTINCT_JID, sessionPk: INSTINCT_SESSION_PK };
}

function validateInstinctPrompt(promptText) {
  const text = String(promptText || '').trim();
  if (!text) {
    const err = new Error('ERR_EMPTY_INSTINCT_PROMPT: Prompt text is required.');
    err.code = 'ERR_EMPTY_INSTINCT_PROMPT';
    throw err;
  }
  // Allow explicit negation ("Never send emails, texts, or invites"), block affirmative outreach requests
  const withoutNegations = text.replace(
    /\b(?:never|do\s+not|don't|no)\s+(?:send|email|message|invite)[^.\n]*/gi,
    '',
  );
  if (OUTREACH_FORBIDDEN_RE.test(withoutNegations)) {
    const err = new Error(
      'ERR_EXTERNAL_OUTREACH_FORBIDDEN: Instinct prompts may not request outbound emails, messages, or invites to external people.',
    );
    err.code = 'ERR_EXTERNAL_OUTREACH_FORBIDDEN';
    throw err;
  }
  return text;
}

function extractStructuredIntelFromMessages(messages = []) {
  const urls = new Set();
  const assistantReplies = [];

  for (const m of messages) {
    if (!m || typeof m.text !== 'string') continue;
    if (!m.isFromMe) {
      assistantReplies.push({
        pk: m.pk,
        timestamp: m.timestamp,
        text: m.text,
      });
    }
    const matches = m.text.match(/https?:\/\/[^\s)>\]"']+/g) || [];
    for (const rawUrl of matches) {
      const clean = rawUrl.replace(/[.,;:!?]+$/, '');
      urls.add(clean);
    }
  }

  return {
    assistantReplyCount: assistantReplies.length,
    latestAssistantReply: assistantReplies.length > 0 ? assistantReplies[assistantReplies.length - 1] : null,
    extractedUrls: Array.from(urls),
    assistantReplies,
  };
}

function readInstinctThread(options = {}) {
  assertInstinctTargetOnly(options);
  const dbPath = options.dbPath || DEFAULT_DB_PATH;
  const limit = Math.max(1, Math.min(50, Number(options.limit) || 15));

  if (!fs.existsSync(dbPath)) {
    return {
      ok: false,
      reason: 'whatsapp_db_not_found',
      dbPath,
      messages: [],
    };
  }

  const sql = `SELECT json_object('pk', m.Z_PK, 'isFromMe', m.ZISFROMME, 'ts', m.ZMESSAGEDATE, 'text', m.ZTEXT)
FROM ZWAMESSAGE m
JOIN ZWACHATSESSION s ON m.ZCHATSESSION = s.Z_PK
WHERE s.Z_PK = ${INSTINCT_SESSION_PK} AND s.ZCONTACTJID = '${INSTINCT_JID}' AND m.ZTEXT IS NOT NULL
ORDER BY m.Z_PK DESC
LIMIT ${limit};`;

  const stdout = execFileSync('sqlite3', ['-readonly', dbPath, sql], {
    encoding: 'utf8',
    timeout: 5000,
  });

  const rows = stdout
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        const parsed = JSON.parse(line);
        // CoreData timestamp epoch is 2001-01-01T00:00:00Z (+978307200s from Unix epoch)
        const unixMs = parsed.ts ? Math.round((Number(parsed.ts) + 978307200) * 1000) : null;
        return {
          pk: parsed.pk,
          isFromMe: parsed.isFromMe === 1,
          timestamp: unixMs ? new Date(unixMs).toISOString() : null,
          text: parsed.text,
        };
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .reverse();

  const intel = extractStructuredIntelFromMessages(rows);
  return {
    ok: true,
    target: {
      name: 'Instinct',
      phone: INSTINCT_PHONE,
      jid: INSTINCT_JID,
      sessionPk: INSTINCT_SESSION_PK,
    },
    messageCount: rows.length,
    messages: rows,
    intel,
  };
}

if (require.main === module) {
  const status = readInstinctThread({ limit: 12 });
  const outDir = path.join(os.homedir(), '.hermes', 'business_os', 'revenue');
  try {
    if (fs.existsSync(outDir)) {
      fs.writeFileSync(
        path.join(outDir, 'instinct-whatsapp-latest.json'),
        `${JSON.stringify(status, null, 2)}\n`,
        'utf8',
      );
    }
  } catch {
    // ignore write errors in read-only environments
  }
  process.stdout.write(`${JSON.stringify(status, null, 2)}\n`);
}

module.exports = {
  INSTINCT_PHONE,
  INSTINCT_JID,
  INSTINCT_SESSION_PK,
  assertInstinctTargetOnly,
  validateInstinctPrompt,
  extractStructuredIntelFromMessages,
  readInstinctThread,
};
