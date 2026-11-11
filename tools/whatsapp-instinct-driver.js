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
 *      - Rejects prompts mentioning unrelated products or lacking confirmed
 *        `mac-yolo-safeguards` scope (`ERR_CROSS_PRODUCT_MIX_FORBIDDEN`).
 *      - Filters shared Instinct thread replies using turn provenance and explicit
 *        `mac-yolo-safeguards` tags/topics, ignoring concurrent threads from other products.
 *   3. Zero External Outreach:
 *      - Clause-level negation-safe guard throws `ERR_EXTERNAL_OUTREACH_FORBIDDEN`
 *        if any clause requests outbound emails, texts, DMs, or invites to external people.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

const PRODUCT_ID = 'mac-yolo-safeguards';
const PRODUCT_TAG = `[PRODUCT: ${PRODUCT_ID}]`;
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

const NEGATED_OUTREACH_CLAUSE_RE =
  /^\s*(?:please\s+)?(?:never|do\s+not|don't|no)\s+(?:send|email|text|message|dm|invite|contact|blast|reach\s+out)\b/i;

const OUTREACH_FORBIDDEN_RE =
  /\b(?:send\s+(?:an?\s+)?(?:email|text|message|invite|dm)\b|email\s+(?!address\b|header\b|headers\b|log\b|logs\b)[a-z0-9_@.-]+|invite\s+[a-z0-9_@.-]+|message\s+(?:my\s+)?(?:contacts|calendar|[a-z0-9_@.-]+)|dm\s+[a-z0-9_@.-]+|blast\s+contacts|cold[- ]?email|reach\s+out\s+to)\b/i;

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

function splitPromptClauses(text) {
  return String(text || '')
    .split(/[.;!\n]+|\b(?:and\s+then|then|but|however)\b/i)
    .map((c) => c.trim())
    .filter(Boolean);
}

function validateInstinctPrompt(promptText, options = {}) {
  const text = String(promptText || '').trim();
  if (!text) {
    const err = new Error('ERR_EMPTY_INSTINCT_PROMPT: Prompt text is required.');
    err.code = 'ERR_EMPTY_INSTINCT_PROMPT';
    throw err;
  }
  if (
    (options.productId != null && options.productId !== PRODUCT_ID) ||
    UNRELATED_PRODUCT_RE.test(text)
  ) {
    const err = new Error(
      'ERR_CROSS_PRODUCT_MIX_FORBIDDEN: Prompts from mac-yolo-safeguards must focus exclusively on mac-yolo-safeguards / thumbgate.app and never mix unrelated products.',
    );
    err.code = 'ERR_CROSS_PRODUCT_MIX_FORBIDDEN';
    throw err;
  }

  const hasExplicitProductTag = text.startsWith(PRODUCT_TAG);
  const hasConfirmedProductContext =
    hasExplicitProductTag ||
    options.productId === PRODUCT_ID ||
    MAC_YOLO_RELEVANT_RE.test(text);

  if (!hasConfirmedProductContext) {
    const err = new Error(
      'ERR_CROSS_PRODUCT_MIX_FORBIDDEN: Prompt scope could not be confirmed for mac-yolo-safeguards.',
    );
    err.code = 'ERR_CROSS_PRODUCT_MIX_FORBIDDEN';
    throw err;
  }

  const clauses = splitPromptClauses(text);
  for (const clause of clauses) {
    if (NEGATED_OUTREACH_CLAUSE_RE.test(clause)) {
      continue;
    }
    if (OUTREACH_FORBIDDEN_RE.test(clause)) {
      const err = new Error(
        'ERR_EXTERNAL_OUTREACH_FORBIDDEN: Instinct prompts may not request outbound emails, messages, or invites to external people.',
      );
      err.code = 'ERR_EXTERNAL_OUTREACH_FORBIDDEN';
      throw err;
    }
  }

  return hasExplicitProductTag ? text : `${PRODUCT_TAG} ${text}`;
}

function isMacYoloSafeguardsMessage(text, options = {}) {
  const clean = String(text || '');
  if (!clean) return false;
  // Never accept a message that mentions an unrelated product, even if it also mentions mac-yolo-safeguards
  if (UNRELATED_PRODUCT_RE.test(clean)) {
    return false;
  }
  if (clean.includes(PRODUCT_TAG) || options.provenanceProductId === PRODUCT_ID) {
    return true;
  }
  return MAC_YOLO_RELEVANT_RE.test(clean);
}

function extractStructuredIntelFromMessages(messages = [], options = {}) {
  const urls = new Set();
  const assistantReplies = [];
  let ignoredOtherProductCount = 0;
  let activeTurnScope = null;
  const maxReplies = options.limit ? Math.max(1, Number(options.limit)) : Infinity;

  for (const m of messages) {
    if (!m || typeof m.text !== 'string') continue;

    if (m.isFromMe) {
      if (UNRELATED_PRODUCT_RE.test(m.text)) {
        activeTurnScope = 'other';
      } else if (m.text.includes(PRODUCT_TAG) || isMacYoloSafeguardsMessage(m.text)) {
        activeTurnScope = PRODUCT_ID;
      } else {
        activeTurnScope = 'other';
      }
    }

    const messageProvenance =
      m.productId === PRODUCT_ID || (!m.isFromMe && activeTurnScope === PRODUCT_ID)
        ? PRODUCT_ID
        : null;

    if (!isMacYoloSafeguardsMessage(m.text, { provenanceProductId: messageProvenance })) {
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

  const boundedReplies =
    assistantReplies.length > maxReplies
      ? assistantReplies.slice(assistantReplies.length - maxReplies)
      : assistantReplies;

  return {
    productId: PRODUCT_ID,
    assistantReplyCount: boundedReplies.length,
    ignoredOtherProductCount,
    latestAssistantReply:
      boundedReplies.length > 0 ? boundedReplies[boundedReplies.length - 1] : null,
    extractedUrls: Array.from(urls),
    assistantReplies: boundedReplies,
  };
}

function readInstinctThread(options = {}) {
  assertInstinctTargetOnly(options);
  const dbPath = options.dbPath || DEFAULT_DB_PATH;
  const limit = Math.max(1, Math.min(50, Math.trunc(Number(options.limit) || 25)));
  const scanWindow = Math.max(limit, Math.min(500, limit * 10));

  if (!fs.existsSync(dbPath)) {
    return {
      ok: false,
      productId: PRODUCT_ID,
      reason: 'whatsapp_db_not_found',
      dbPath,
      messages: [],
    };
  }

  const sql = [
    "SELECT json_object('pk', m.Z_PK, 'isFromMe', m.ZISFROMME, 'ts', m.ZMESSAGEDATE, 'text', m.ZTEXT)",
    'FROM ZWAMESSAGE m',
    'JOIN ZWACHATSESSION s ON m.ZCHATSESSION = s.Z_PK',
    'WHERE s.Z_PK = 3 AND s.ZCONTACTJID = \'23949492670633@lid\' AND m.ZTEXT IS NOT NULL',
    'ORDER BY m.Z_PK DESC',
    `LIMIT ${Number(scanWindow)};`,
  ].join('\n');

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

  const intel = extractStructuredIntelFromMessages(rows, { limit });
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

/**
 * Deterministically classify real-world macOS coding-agent freeze signatures
 * distilled from the 20 empirical incident reports harvested via Instinct
 * (anthropics/claude-code#108551, #107755, #107354, #97862; openai/codex#53664, #54461, #54416).
 */
function classifyEmpiricalFreezeSignature(snapshot = {}) {
  const orphanedGitCount = Number(snapshot.orphanedGitCount) || 0;
  const nodeReplOrHelperCount = Number(snapshot.nodeReplOrHelperCount) || 0;
  const maxIdleCliRssGb = Number(snapshot.maxIdleCliRssGb) || 0;
  const maxIdleCliCpuPct = Number(snapshot.maxIdleCliCpuPct) || 0;
  const swapUsedGb = Number(snapshot.swapUsedGb) || 0;
  const mlxOrSwiftChildRssGb = Number(snapshot.mlxOrSwiftChildRssGb) || 0;
  const claudeVmDiskGb = Number(snapshot.claudeVmDiskGb) || 0;

  const matches = [];

  if (orphanedGitCount >= 25) {
    matches.push({
      signature: 'orphaned_git_storm',
      severity: orphanedGitCount >= 100 ? 'critical' : 'high',
      referenceIssue: 'anthropics/claude-code#108551',
      remediation: 'Reap PPID=1 orphaned git process tree spawned by timed-out Bash tool calls',
    });
  }
  if (nodeReplOrHelperCount >= 20) {
    matches.push({
      signature: 'codex_node_repl_or_helper_leak',
      severity: nodeReplOrHelperCount >= 50 ? 'critical' : 'high',
      referenceIssue: 'openai/codex#53664, openai/codex#54461',
      remediation: 'Terminate leaked node_repl and idle Codex helper / per-thread MCP stdio servers',
    });
  }
  if (maxIdleCliRssGb >= 6.0 || (maxIdleCliRssGb >= 3.0 && maxIdleCliCpuPct >= 85)) {
    matches.push({
      signature: 'sleep_wake_zombie_cli_spin',
      severity: maxIdleCliRssGb >= 12.0 ? 'critical' : 'high',
      referenceIssue: 'anthropics/claude-code#107354, anthropics/claude-code#97862',
      remediation: 'SIGKILL detached post-sleep CLI/MCP processes ignoring SIGTERM',
    });
  }
  if (swapUsedGb >= 12.0 || mlxOrSwiftChildRssGb >= 8.0) {
    matches.push({
      signature: 'windowserver_swap_cliff',
      severity: 'critical',
      referenceIssue: 'openai/codex#54416, anthropics/claude-code#107755',
      remediation: 'Throttle/reap runaway MLX/Swift child jobs before WindowServer swap reset',
    });
  }
  if (claudeVmDiskGb >= 25.0) {
    matches.push({
      signature: 'claude_vm_storage_bloat',
      severity: 'medium',
      referenceIssue: 'claude-code-vm-cache-bloat',
      remediation: 'Prune stale claude-code-vm and update cache blobs',
    });
  }

  return {
    freezeRisk: matches.some((m) => m.severity === 'critical')
      ? 'critical'
      : matches.length > 0
        ? 'elevated'
        : 'nominal',
    matchedCount: matches.length,
    matches,
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
  PRODUCT_TAG,
  INSTINCT_PHONE,
  INSTINCT_JID,
  INSTINCT_SESSION_PK,
  assertInstinctTargetOnly,
  validateInstinctPrompt,
  isMacYoloSafeguardsMessage,
  extractStructuredIntelFromMessages,
  classifyEmpiricalFreezeSignature,
  readInstinctThread,
};
