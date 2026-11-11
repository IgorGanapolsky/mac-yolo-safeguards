#!/usr/bin/env node
'use strict';

/**
 * bluesky-flowstate-monetizer.js — Gate-enforced 24/7 Bluesky daily post,
 * thread-aware technical reply engine, and Flowstate.com conversion funnel
 * qualification router for mac-yolo-safeguards & ThumbGate.
 *
 * Hard invariants:
 *   1. Every top-level Bluesky post MUST pass `tools/social-publish-gate.js`
 *      (`--platform bluesky --require-buy-links`) and stay <= 300 graphemes.
 *   2. Hostile/meta comment detection uses word-boundary regexes (`\bbot\b`)
 *      so technical comments containing words like "both", "robot", or
 *      "bottleneck" are never dropped.
 *   3. Thread-aware deduplication checks both the local ledger and AT Protocol
 *      `thread.replies[]` so `iganapolsky.bsky.social` never double-replies.
 *   4. Flowstate.com qualification routing suppresses conversion beacons
 *      (`conversionBeaconAllowed: false`) on disqualified (`under-500` /
 *      `/not-a-fit`) leads while routing qualified (`$1,500+`) leads to the
 *      $499 Diagnostic / $1,500 Sprint / $3,000 Partner Pilot ladder with
 *      persistent first-touch UTM attribution.
 *   5. Emits vendor-neutral OpenTelemetry (`otel`) spans to
 *      `~/.paperclip/operations/telemetry/otel_spans.jsonl` with a fail-closed
 *      `CORP_AIRGAP_RE` diode.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const SOCIAL_GATE_SCRIPT = path.join(ROOT, 'tools', 'social-publish-gate.js');
const CONTENT_LOG_TSV = path.join(ROOT, 'docs', 'social', 'hermes-mobile-content-log.tsv');
const FLOWSTATE_FUNNEL_HTML = path.join(ROOT, 'docs', 'funnel', 'flowstate-intake-monetizer.html');
const DEFAULT_LEDGER_PATH = path.join(os.homedir(), '.hermes', 'receipts', 'bluesky-24x7-ledger.jsonl');
const DEFAULT_OTEL_PATH = path.join(os.homedir(), '.paperclip', 'operations', 'telemetry', 'otel_spans.jsonl');

const OUR_BLUESKY_HANDLE = 'iganapolsky.bsky.social';
const OUR_BLUESKY_DID = 'did:plc:67posxdluf3h6sri6ciqivzx';
const MAX_BLUESKY_GRAPHEMES = 300;

const CORP_AIRGAP_RE = /\b(ecinexus|eciplatform|spruce|rocksolid|thermgrid|stockservice|10\.10\.20\.81|pr-85\d\d|dist03-\d+|itapp01-\d+)\b/i;

const MONETIZATION_LINKS = Object.freeze({
  soloGumroad: 'https://iganapolsky.gumroad.com/l/vcrho',
  proStripe: 'https://buy.stripe.com/28o5nac2eb1E9C1aFa',
  teamStripe: 'https://buy.stripe.com/8wM3f2feqfdM9C14gN',
  diagnostic499: 'https://buy.stripe.com/dRmeVd9eA4r4aK5gWL3sJ0Y',
  sprint1500: 'https://buy.stripe.com/4gM28r1M8g9M3hD0XN3sI38',
  hostedHermes: 'https://thumbgate.app',
  triageCal: 'https://cal.com/igor-g-kvqxfo/30min',
});

const DAILY_BLUESKY_POST_TEMPLATES = Object.freeze([
  {
    id: 'mac-freeze-pretooluse-flowstate',
    campaignPrefix: 'mac-yolo-bluesky-flowstate',
    hook: 'Mac freeze & runaway token loops happen when Claude Code, Cursor & Ollama spawn unbounded subagents.',
    body: [
      'Mac freeze & runaway token loops happen when Claude Code, Cursor & Ollama spawn unbounded subagents.',
      'Mac YOLO Safeguards caps RAM/swap, reaps orphan simulators every 60s & routes hosted Hermes to https://thumbgate.app ($10/mo).',
      '$9 Solo / $49 Pro: https://iganapolsky.gumroad.com/l/vcrho',
    ].join('\n\n'),
  },
  {
    id: 'sha256-rollback-receipt-gate',
    campaignPrefix: 'mac-yolo-bluesky-rollback-gate',
    hook: 'Prompts are advice; PreToolUse hooks with SHA-256 replay receipts are enforceable infrastructure.',
    body: [
      'Prompts are advice; PreToolUse hooks with SHA-256 replay receipts are enforceable infrastructure.',
      'Every blocked tool call becomes a regression fixture before secret egress or unapproved writes fire.',
      'Hosted ($10/mo): https://thumbgate.app | $49 Pro: https://iganapolsky.gumroad.com/l/vcrho',
    ].join('\n\n'),
  },
  {
    id: 'flowstate-2step-diagnostic-funnel',
    campaignPrefix: 'mac-yolo-bluesky-diagnostic-intake',
    hook: 'One runaway coding-agent loop or bad prod mutation costs more than a year of deterministic guardrails.',
    body: [
      'One runaway coding-agent loop or bad prod mutation costs more than a year of deterministic guardrails.',
      'Solo: $9 Guard Kit (https://iganapolsky.gumroad.com/l/vcrho) or $10/mo Hosted Hermes (https://thumbgate.app).',
      'Teams ($499 Diagnostic): https://buy.stripe.com/dRmeVd9eA4r4aK5gWL3sJ0Y',
    ].join('\n\n'),
  },
]);

const HOSTILE_PATTERNS = Object.freeze([
  /\bbot\b/i,
  /\bspam\b/i,
  /\bshill\b/i,
  /\bpromotional\b/i,
  /\breported\b/i,
  /\bsame answer\b/i,
  /\bword for word\b/i,
  /\bcopy[\s-]paste\b/i,
  /\brunning amok\b/i,
  /\bnot what i asked\b/i,
  /\bdidn'?t ask\b/i,
  /\bauto-generated\b/i,
  /\bai[\s-]generated\b/i,
  /\bchatgpt\b/i,
]);

function assertAirgapSafe(text, context = 'bluesky-flowstate-monetizer') {
  if (CORP_AIRGAP_RE.test(String(text || ''))) {
    throw new Error(`[CORP_AIRGAP_DIODE] Blocked corporate identifier in ${context}`);
  }
}

function countGraphemes(text) {
  return [...String(text || '')].length;
}

function buildBlueskyLinkFacets(text) {
  const source = String(text || '');
  const urlRe = /https?:\/\/[^\s)\]"'<>]+/g;
  const facets = [];
  let match;
  while ((match = urlRe.exec(source)) !== null) {
    const rawUrl = match[0].replace(/[.,;:!?]+$/, '');
    const byteStart = Buffer.byteLength(source.slice(0, match.index), 'utf8');
    const byteEnd = byteStart + Buffer.byteLength(rawUrl, 'utf8');
    facets.push({
      index: { byteStart, byteEnd },
      features: [
        {
          $type: 'app.bsky.richtext.facet#link',
          uri: rawUrl,
        },
      ],
    });
  }
  return facets;
}

function isHostileOrMetaComment(commentText) {
  const text = String(commentText || '');
  return HOSTILE_PATTERNS.some((re) => re.test(text));
}

function hasOwnReplyInThread(threadReplies = [], ourDid = OUR_BLUESKY_DID, ourHandle = OUR_BLUESKY_HANDLE) {
  if (!Array.isArray(threadReplies)) return false;
  return threadReplies.some((entry) => {
    const author = entry?.post?.author || entry?.author || {};
    return author.did === ourDid || author.handle === ourHandle;
  });
}

function classifyBlueskyInboundReply(reply = {}) {
  const authorHandle = String(reply.authorHandle || reply.handle || '').trim();
  const text = String(reply.text || reply.incomingText || '').trim();
  const uri = String(reply.uri || '').trim();

  if (!text) {
    return { action: 'skip', reason: 'empty_text', category: 'none', draftReply: null };
  }
  if (authorHandle === OUR_BLUESKY_HANDLE || reply.authorDid === OUR_BLUESKY_DID) {
    return { action: 'skip', reason: 'self_author', category: 'self', draftReply: null };
  }
  if (isHostileOrMetaComment(text)) {
    return { action: 'skip', reason: 'hostile_or_meta', category: 'hostile', draftReply: null };
  }
  if (Array.isArray(reply.threadReplies) && hasOwnReplyInThread(reply.threadReplies)) {
    return { action: 'skip', reason: 'already_replied_in_thread', category: 'dedup_thread', draftReply: null };
  }

  const lower = text.toLowerCase();
  let category = 'agentic_governance';
  let draftReply;

  if (lower.includes('ttl') || lower.includes('override') || lower.includes('audit trail')) {
    category = 'ttl_override_audit';
    draftReply =
      'Spot on — every TTL-scoped override in our audit log feeds directly into our failure-to-spec compiler so temporary exceptions become permanent PreToolUse gates instead of silent drift. Free CLI & $10/mo Hosted Hermes: https://thumbgate.app';
  } else if (lower.includes('rollback') || lower.includes('recovery') || lower.includes('replay')) {
    category = 'rollback_replay_receipt';
    draftReply =
      'A deterministic replay receipt: SHA-256 of the tool-call fixture + rule state before/after, proving the bad call gets DENY under the new gate and reverts cleanly on rollback. We ship those fixtures in https://thumbgate.app and https://iganapolsky.gumroad.com/l/vcrho';
  } else if (lower.includes('heartbeat') || lower.includes('proof-of-work') || lower.includes('200 with no proof') || lower.includes('status + latency')) {
    category = 'proof_of_work_reads';
    draftReply =
      '100% — proof-of-work for reads is the missing contract in most MCP toolchains. We pair a SHA-256 read receipt with a PreToolUse heartbeat gate in Mac YOLO Safeguards / https://thumbgate.app so empty 200s fail closed before downstream writes fire.';
  } else if (lower.includes('freeze') || lower.includes('oom') || lower.includes('swap') || lower.includes('simulator')) {
    category = 'mac_freeze_oom';
    draftReply =
      'Unbounded subagent spawns + orphan Xcode/Android simulators thrash unified memory long before CPU pegs. Mac YOLO Safeguards enforces a 60s simulator reaper + hard RAM caps ($9 Solo / $49 Pro: https://iganapolsky.gumroad.com/l/vcrho).';
  } else {
    draftReply =
      'Prompts are advice; PreToolUse hooks are law. Capturing the failure once and compiling it into a local pre-action gate stops the repeat before execution: https://thumbgate.app';
  }

  assertAirgapSafe(draftReply, 'bluesky-reply-draft');
  return {
    action: 'reply',
    reason: 'matched_technical_thread',
    category,
    uri,
    authorHandle,
    draftReply,
    graphemes: countGraphemes(draftReply),
    facets: buildBlueskyLinkFacets(draftReply),
  };
}

const FIRST_TOUCH_KEYS = Object.freeze([
  ['utm_source', 'attr_utm_source'],
  ['utm_medium', 'attr_utm_medium'],
  ['utm_campaign', 'attr_utm_campaign'],
  ['utm_content', 'attr_utm_content'],
  ['gclid', 'attr_gclid'],
  ['fbclid', 'attr_fbclid'],
]);

function mergeFirstTouchAttribution(existingStore = {}, incomingParams = {}) {
  const next = { ...existingStore };
  const getParam = (key) => {
    if (incomingParams instanceof URLSearchParams) return incomingParams.get(key);
    return incomingParams && typeof incomingParams === 'object' ? incomingParams[key] : undefined;
  };
  for (const [paramName, storageKey] of FIRST_TOUCH_KEYS) {
    const incomingVal = getParam(paramName);
    if (incomingVal && !next[storageKey]) {
      next[storageKey] = String(incomingVal).trim();
    }
  }
  return next;
}

function decorateCheckoutUrlWithAttribution(checkoutUrl, attributionStore = {}, ctaId = 'flowstate_cta') {
  const url = new URL(String(checkoutUrl));
  const source = attributionStore.attr_utm_source || 'bluesky';
  const medium = attributionStore.attr_utm_medium || 'social';
  const campaign = attributionStore.attr_utm_campaign || 'mac_yolo_flowstate_20261111';
  if (!url.searchParams.get('utm_source')) url.searchParams.set('utm_source', source);
  if (!url.searchParams.get('utm_medium')) url.searchParams.set('utm_medium', medium);
  if (!url.searchParams.get('utm_campaign')) url.searchParams.set('utm_campaign', campaign);
  if (ctaId) url.searchParams.set('utm_content', String(ctaId));
  return url.toString();
}

function qualifyFlowstateLead(intake = {}, attributionStore = {}) {
  const firstName = String(intake.firstName || 'Builder').trim() || 'Builder';
  const agentStack = String(intake.agentStack || 'claude-code').trim();
  const incidentCost = String(intake.incidentCost || 'under-500').trim();
  const failureMode = String(intake.failureMode || 'mac-freeze').trim();

  const isDisqualifiedForIntensive = incidentCost === 'under-500' || incidentCost === 'hobbyist';
  if (isDisqualifiedForIntensive) {
    return {
      firstName,
      agentStack,
      incidentCost,
      failureMode,
      qualified: false,
      route: '/not-a-fit',
      conversionBeaconAllowed: false,
      recommendedOffer: '$9 Solo Quickstart / $10/mo Hosted Hermes',
      primaryCheckoutUrl: decorateCheckoutUrlWithAttribution(
        MONETIZATION_LINKS.soloGumroad,
        attributionStore,
        'flowstate_not_a_fit_solo_9',
      ),
      secondaryCheckoutUrl: decorateCheckoutUrlWithAttribution(
        MONETIZATION_LINKS.hostedHermes,
        attributionStore,
        'flowstate_not_a_fit_hosted_10',
      ),
    };
  }

  return {
    firstName,
    agentStack,
    incidentCost,
    failureMode,
    qualified: true,
    route: '/intensive-qualified',
    conversionBeaconAllowed: true,
    recommendedOffer: '$499 60-Min Reliability Diagnostic -> $1,500 7-Day Hardening Sprint',
    primaryCheckoutUrl: decorateCheckoutUrlWithAttribution(
      MONETIZATION_LINKS.diagnostic499,
      attributionStore,
      'flowstate_qualified_diagnostic_499',
    ),
    secondaryCheckoutUrl: decorateCheckoutUrlWithAttribution(
      MONETIZATION_LINKS.sprint1500,
      attributionStore,
      'flowstate_qualified_sprint_1500',
    ),
    partnerTriageUrl: decorateCheckoutUrlWithAttribution(
      MONETIZATION_LINKS.triageCal,
      attributionStore,
      'flowstate_qualified_partner_3000',
    ),
  };
}

function selectDailyBlueskyTemplate(dateStr = new Date().toISOString().slice(0, 10)) {
  const cleanDate = String(dateStr || '').replace(/[^0-9]/g, '') || '20261111';
  const daySeed = Number.parseInt(cleanDate.slice(-2), 10) || 0;
  const template = DAILY_BLUESKY_POST_TEMPLATES[daySeed % DAILY_BLUESKY_POST_TEMPLATES.length];
  const campaign = `${template.campaignPrefix}-${cleanDate}`;
  assertAirgapSafe(template.body, 'bluesky-post-body');
  const graphemes = countGraphemes(template.body);
  if (graphemes > MAX_BLUESKY_GRAPHEMES) {
    throw new Error(`Bluesky template ${template.id} exceeds ${MAX_BLUESKY_GRAPHEMES} graphemes (${graphemes})`);
  }
  return {
    ...template,
    campaign,
    date: dateStr,
    graphemes,
    facets: buildBlueskyLinkFacets(template.body),
  };
}

function readLedgerEntries(ledgerPath = DEFAULT_LEDGER_PATH) {
  if (!fs.existsSync(ledgerPath)) return [];
  return fs
    .readFileSync(ledgerPath, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

function appendLedgerEntry(entry, ledgerPath = DEFAULT_LEDGER_PATH) {
  assertAirgapSafe(JSON.stringify(entry), 'bluesky-ledger-entry');
  fs.mkdirSync(path.dirname(ledgerPath), { recursive: true });
  fs.appendFileSync(ledgerPath, `${JSON.stringify(entry)}\n`, 'utf8');
}

function hasPublishedBlueskyPostForDate(dateStr, { contentLogPath = CONTENT_LOG_TSV, ledgerPath = DEFAULT_LEDGER_PATH } = {}) {
  const entries = readLedgerEntries(ledgerPath);
  const inLedger = entries.some(
    (e) =>
      e &&
      e.date === dateStr &&
      e.type === 'daily_post' &&
      (e.status === 'LIVE' || e.status === 'PUBLISHED') &&
      typeof e.liveUrl === 'string' &&
      e.liveUrl.startsWith('https://bsky.app/profile/'),
  );
  if (inLedger) return true;

  if (fs.existsSync(contentLogPath)) {
    const raw = fs.readFileSync(contentLogPath, 'utf8');
    const lines = raw.split(/\r?\n/);
    for (const line of lines) {
      if (!line.startsWith(dateStr)) continue;
      const cols = line.split('\t');
      const platform = String(cols[1] || '').toLowerCase();
      const status = String(cols[4] || '').toLowerCase();
      const url = String(cols[5] || '').trim();
      if (platform === 'bluesky' && (status === 'published' || status === 'posted' || status === 'live') && url) {
        return true;
      }
    }
  }
  return false;
}

function runBlueskySocialPublishGate({ campaign, hook, body, contentLogPath = CONTENT_LOG_TSV } = {}) {
  assertAirgapSafe(body, 'bluesky-gate-body');
  try {
    const out = execFileSync(
      process.execPath,
      [
        SOCIAL_GATE_SCRIPT,
        '--platform',
        'bluesky',
        '--campaign',
        campaign,
        '--hook',
        hook,
        '--body',
        body,
        '--require-buy-links',
        '--log',
        contentLogPath,
        '--json',
      ],
      { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
    );
    return JSON.parse(out);
  } catch (err) {
    const stdout = err.stdout ? String(err.stdout) : '';
    try {
      return JSON.parse(stdout);
    } catch {
      return {
        allow: false,
        decision: 'BLOCK',
        platform: 'bluesky',
        campaign,
        blocks: [err.message],
      };
    }
  }
}

function emitOtelSpan(name, attributes = {}, otelPath = DEFAULT_OTEL_PATH) {
  const payload = {
    traceId: crypto.randomBytes(16).toString('hex'),
    spanId: crypto.randomBytes(8).toString('hex'),
    name,
    timestamp: new Date().toISOString(),
    service: 'mac-yolo-bluesky-flowstate-monetizer',
    attributes,
  };
  const serialized = JSON.stringify(payload);
  assertAirgapSafe(serialized, 'otel-span');
  try {
    fs.mkdirSync(path.dirname(otelPath), { recursive: true });
    fs.appendFileSync(otelPath, `${serialized}\n`, 'utf8');
  } catch {
    // Non-fatal if telemetry path is read-only in sandbox
  }
  return payload;
}

function runBlueskyFlowstateMonetizer(options = {}) {
  const dateStr = options.date || new Date().toISOString().slice(0, 10);
  const ledgerPath = options.ledgerPath || DEFAULT_LEDGER_PATH;
  const contentLogPath = options.contentLogPath || CONTENT_LOG_TSV;
  const otelPath = options.otelPath || DEFAULT_OTEL_PATH;

  const template = selectDailyBlueskyTemplate(dateStr);
  const alreadyPostedToday = hasPublishedBlueskyPostForDate(dateStr, { contentLogPath, ledgerPath });
  const gateResult = runBlueskySocialPublishGate({
    campaign: template.campaign,
    hook: template.hook,
    body: template.body,
    contentLogPath,
  });

  const inboundReplies = Array.isArray(options.inboundReplies) ? options.inboundReplies : [];
  const triagedReplies = inboundReplies.map((r) => classifyBlueskyInboundReply(r));

  const funnelHtmlPresent = fs.existsSync(FLOWSTATE_FUNNEL_HTML);
  const sampleQualified = qualifyFlowstateLead(
    { firstName: 'Founder', agentStack: 'claude-code', incidentCost: '1500-plus', failureMode: 'token-bleed' },
    { attr_utm_source: 'bluesky', attr_utm_medium: 'social', attr_utm_campaign: template.campaign },
  );
  const sampleDisqualified = qualifyFlowstateLead(
    { firstName: 'Hobbyist', agentStack: 'cursor', incidentCost: 'under-500', failureMode: 'mac-freeze' },
    { attr_utm_source: 'bluesky', attr_utm_medium: 'social', attr_utm_campaign: template.campaign },
  );

  const summary = {
    ok: Boolean(gateResult.allow || alreadyPostedToday) && funnelHtmlPresent,
    date: dateStr,
    handle: OUR_BLUESKY_HANDLE,
    did: OUR_BLUESKY_DID,
    alreadyPostedToday,
    gate: {
      allow: Boolean(gateResult.allow),
      decision: gateResult.decision || 'UNKNOWN',
      campaign: template.campaign,
      blocks: gateResult.blocks || [],
    },
    postDraft: {
      id: template.id,
      campaign: template.campaign,
      hook: template.hook,
      body: template.body,
      graphemes: template.graphemes,
      facetCount: template.facets.length,
    },
    flowstateFunnel: {
      funnelHtmlPresent,
      funnelHtmlPath: FLOWSTATE_FUNNEL_HTML,
      qualifiedRoute: sampleQualified.route,
      qualifiedBeaconAllowed: sampleQualified.conversionBeaconAllowed,
      disqualifiedRoute: sampleDisqualified.route,
      disqualifiedBeaconAllowed: sampleDisqualified.conversionBeaconAllowed,
    },
    engagement: {
      repliesEvaluated: triagedReplies.length,
      repliesReady: triagedReplies.filter((r) => r.action === 'reply').length,
      triagedReplies,
    },
    monetizationLinks: MONETIZATION_LINKS,
  };

  if (options.recordLivePostUrl) {
    appendLedgerEntry(
      {
        timestamp: new Date().toISOString(),
        date: dateStr,
        type: 'daily_post',
        campaign: template.campaign,
        status: 'LIVE',
        liveUrl: options.recordLivePostUrl,
        atUri: options.recordAtUri || null,
        cid: options.recordCid || null,
      },
      ledgerPath,
    );
    summary.alreadyPostedToday = true;
    summary.recordedLivePostUrl = options.recordLivePostUrl;
  }

  emitOtelSpan(
    'gen_ai.social.bluesky_24x7_autopilot',
    {
      'gen_ai.social.platform': 'bluesky',
      'gen_ai.social.handle': OUR_BLUESKY_HANDLE,
      'gen_ai.social.campaign': template.campaign,
      'gen_ai.social.gate_allow': Boolean(gateResult.allow),
      'gen_ai.social.already_posted_today': Boolean(summary.alreadyPostedToday),
      'gen_ai.social.replies_ready': summary.engagement.repliesReady,
      'gen_ai.funnel.flowstate_html_present': funnelHtmlPresent,
    },
    otelPath,
  );

  return summary;
}

if (require.main === module) {
  const argv = process.argv.slice(2);
  const jsonFlag = argv.includes('--json');
  let recordLivePostUrl = null;
  let recordAtUri = null;
  let recordCid = null;
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--record-live-url') recordLivePostUrl = argv[++i];
    else if (argv[i] === '--record-at-uri') recordAtUri = argv[++i];
    else if (argv[i] === '--record-cid') recordCid = argv[++i];
  }
  const result = runBlueskyFlowstateMonetizer({ recordLivePostUrl, recordAtUri, recordCid });
  if (jsonFlag) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(
      `[bluesky-flowstate-monetizer] ok=${result.ok} campaign=${result.gate.campaign} gate=${result.gate.decision} alreadyPostedToday=${result.alreadyPostedToday} funnelHtmlPresent=${result.flowstateFunnel.funnelHtmlPresent}`,
    );
  }
  process.exit(result.ok ? 0 : 1);
}

module.exports = {
  OUR_BLUESKY_HANDLE,
  OUR_BLUESKY_DID,
  MAX_BLUESKY_GRAPHEMES,
  MONETIZATION_LINKS,
  DAILY_BLUESKY_POST_TEMPLATES,
  assertAirgapSafe,
  countGraphemes,
  buildBlueskyLinkFacets,
  isHostileOrMetaComment,
  hasOwnReplyInThread,
  classifyBlueskyInboundReply,
  mergeFirstTouchAttribution,
  decorateCheckoutUrlWithAttribution,
  qualifyFlowstateLead,
  selectDailyBlueskyTemplate,
  hasPublishedBlueskyPostForDate,
  runBlueskySocialPublishGate,
  runBlueskyFlowstateMonetizer,
};
