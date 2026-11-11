#!/usr/bin/env node
'use strict';

/**
 * whatsapp-instinct-driver.js — Safe, Product-Scoped WhatsApp Instinct Copilot Driver
 *
 * Drives the Instinct AI assistant inside WhatsApp Desktop on macOS strictly for
 * the `mac-yolo-safeguards` product (https://github.com/IgorGanapolsky/mac-yolo-safeguards
 * and https://thumbgate.app).
 *
 * Because Instinct is shared across multiple products/agents simultaneously in the
 * same WhatsApp thread (`ZCHATSESSION = 3`), this driver enforces strict product
 * isolation (`MONEY v6.0 §2`):
 *   1. Locked strictly to Instinct's WhatsApp session:
 *      - Phone: `16508702892` (+1 650-870-2892)
 *      - JID:   `23949492670633@lid`
 *      - Throws `ERR_WHATSAPP_NON_INSTINCT_TARGET_FORBIDDEN` on any other contact.
 *   2. Product-Boundary Isolation (`PRODUCT_ID = 'mac-yolo-safeguards'`):
 *      - Rejects prompts mentioning unrelated products (`ERR_CROSS_PRODUCT_MIX_FORBIDDEN`).
 *      - Filters shared Instinct thread replies strictly to `mac-yolo-safeguards` /
 *        `thumbgate.app` / macOS coding-agent safeguard topics, ignoring concurrent
 *        threads from other products.
 *   3. Zero External Outreach:
 *      - Throws `ERR_EXTERNAL_OUTREACH_FORBIDDEN` if a prompt requests outbound
 *        emails, texts, or invites to external people.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const PRODUCT_ID = 'mac-yolo-safeguards';
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

const UNRELATED_PRODUCT_RE =
  /\b(?:foreclosure|tax-deed|tax\s+deed|tax-lien|probate|miami-dade|broward|palm\s+beach|distressed-property|somelco|monceau|prop-hunters|labros)\b/i;

const MAC_YOLO_RELEVANT_RE =
  /\b(?:mac-yolo-safeguards|thumbgate|claude-code|cursor|codex|windowserver|mac\s+freeze|orphaned\s+git|runaway-process|devhunt|show\s+hn|aws\s+activate|pre-action|tool\s+calls|subprocess)\b/i;

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
  if (UNRELATED_PRODUCT_RE.test(text)) {
    const err = new Error(
      'ERR_CROSS_PRODUCT_MIX_FORBIDDEN: Prompts from mac-yolo-safeguards must focus exclusively on mac-yolo-safeguards / thumbgate.app and never mix unrelated products.',
    );
    err.code = 'ERR_CROSS_PRODUCT_MIX_FORBIDDEN';
    throw err;
  }
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
  return text.startsWith(`[PRODUCT: ${PRODUCT_ID}]`) ? text : `[PRODUCT: ${PRODUCT_ID}] ${text}`;
}

function isMacYoloSafeguardsMessage(text) {
  const clean = String(text || '');
  if (!clean) return false;
  if (UNRELATED_PRODUCT_RE.test(clean) && !clean.includes('mac-yolo-safeguards')) {
    return false;
  }
  return MAC_YOLO_RELEVANT_RE.test(clean);
}

function extractStructuredIntelFromMessages(messages = []) {
  const urls = new Set();
  const assistantReplies = [];
  let ignoredOtherProductCount = 0;

  for (const m of messages) {
    if (!m || typeof m.text !== 'string') continue;
    if (!isMacYoloSafeguardsMessage(m.text)) {
      if (!m.isFromMe) ignoredOtherProductCount++;
      continue;
    }
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
    productId: PRODUCT_ID,
    assistantReplyCount: assistantReplies.length,
    ignoredOtherProductCount,
    latestAssistantReply: assistantReplies.length > 0 ? assistantReplies[assistantReplies.length - 1] : null,
    extractedUrls: Array.from(urls),
    assistantReplies,
  };
}

function readInstinctThread(options = {}) {
  assertInstinctTargetOnly(options);
  const dbPath = options.dbPath || DEFAULT_DB_PATH;
  const limit = Math.max(1, Math.min(50, Number(options.limit) || 25));

  if (!fs.existsSync(dbPath)) {
    return {
      ok: false,
      productId: PRODUCT_ID,
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
    productId: PRODUCT_ID,
    target: {
      name: 'Instinct',
      phone: INSTINCT_PHONE,
      jid: INSTINCT_JID,
      sessionPk: INSTINCT_SESSION_PK,
    },
    totalThreadMessagesScanned: rows.length,
    intel,
  };
}

if (require.main === module) {
  const status = readInstinctThread({ limit: 30 });
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
  PRODUCT_ID,
  INSTINCT_PHONE,
  INSTINCT_JID,
  INSTINCT_SESSION_PK,
  assertInstinctTargetOnly,
  validateInstinctPrompt,
  isMacYoloSafeguardsMessage,
  extractStructuredIntelFromMessages,
  readInstinctThread,
};
