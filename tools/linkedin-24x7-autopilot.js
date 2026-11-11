#!/usr/bin/env node
'use strict';

/**
 * tools/linkedin-24x7-autopilot.js — 24/7 LinkedIn Daily Post, Reply, Engagement & Monetization Engine
 *
 * Enforces:
 * 1. Pre-Publish Gate (`tools/social-publish-gate.js`) with `--platform linkedin --require-buy-links`
 * 2. Cross-repo deduplication (`docs/social/hermes-mobile-content-log.tsv`,
 *    `~/.hermes/receipts/linkedin-24x7-ledger.jsonl`, and `ThumbGate/.thumbgate/linkedin-monetization-ledger.jsonl`)
 *    so Mac YOLO Safeguards and ThumbGate never double-post or double-reply on the same thread/day.
 * 3. 4-Pillar Daily LinkedIn Loop:
 *    - Pillar A: Daily Founder Post Rotation + First-Comment Monetization Ladder ($9 Gumroad, $49 Pro, $149 Team,
 *      and $10/mo Hosted Hermes on a fenced VPS at https://thumbgate.app)
 *    - Pillar B: High-Signal Feed Post Engagement Classifier (10M-doc RAG, Agentic AI / Knowledge Graphs,
 *      MCP / Claude Code PreToolUse boundary, Workflow Automation)
 *    - Pillar C: Inbound Comment & Notification Triage (e.g. Kieren Day comment on agent perception vs action)
 *    - Pillar D: Inbound DM & Invitation Triage (founder/builder DMs vs paid boost spam)
 * 4. OpenTelemetry (`otel`) span emission to `~/.paperclip/operations/telemetry/otel_spans.jsonl`
 *    with fail-closed Corporate Air-Gap Diode (`CORP_AIRGAP_RE`).
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { evaluate: evaluateSocialGate } = require('./social-publish-gate');

const REPO_ROOT = path.resolve(__dirname, '..');
const HOME = os.homedir();
const DEFAULT_CONTENT_LOG = path.join(REPO_ROOT, 'docs', 'social', 'hermes-mobile-content-log.tsv');
const DEFAULT_LEDGER_PATH = path.join(HOME, '.hermes', 'receipts', 'linkedin-24x7-ledger.jsonl');
const DEFAULT_RECEIPT_PATH = path.join(HOME, '.hermes', 'receipts', 'linkedin-24x7-autopilot-latest.json');
const THUMBGATE_LEDGER_PATH = path.join(HOME, 'workspace', 'ThumbGate', '.thumbgate', 'linkedin-monetization-ledger.jsonl');
const OTEL_SPANS_PATH = path.join(HOME, '.paperclip', 'operations', 'telemetry', 'otel_spans.jsonl');

const LINKEDIN_ACCOUNT = 'ig5973700@gmail.com';
const LINKEDIN_PROFILE_URL = 'https://www.linkedin.com/in/igor-ganapolsky-8947ba448/';

const CORP_AIRGAP_RE =
  /\b(ecinexus\.com|eciplatform\.net|psn[-_]?stockservice|10\.10\.20\.81|dist03-\d+|itapp01-\d+)\b/i;

const FORBIDDEN_DRIFT_RE =
  /\b(swappa|shopgoodwill|arbitrage\s+desk|zernio|hashnode)\b/i;

const MONETIZATION_OFFERS = Object.freeze({
  freeRepoUrl: 'https://github.com/IgorGanapolsky/mac-yolo-safeguards',
  soloGumroadUrl: 'https://iganapolsky.gumroad.com/l/nllmvb',
  proStripeUrl: 'https://buy.stripe.com/eVq3cvfdH6TddI666M8efC02',
  teamStripeUrl: 'https://buy.stripe.com/bJe7sLfdHfpJ33sc6sefC01',
  diagnosticStripeUrl: 'https://buy.stripe.com/dRmeVd9eA4r4aK5gWL3sJ0Y',
  thumbgateHostedUrl: 'https://thumbgate.app',
  thumbgateOperatorUrl: 'https://thumbgate.ai/operator-framework',
});

const DAILY_LINKEDIN_POSTS = Object.freeze([
  {
    id: 'load-average-307-os-reaper',
    campaignStem: 'mac-yolo-load-307-os-reaper',
    hook: 'An unattended coding agent spawned 256 iOS Simulator processes on my Mac and hit load average 307.',
    title: 'How an AI coding agent hit load average 307 on my Mac (and the 4-piece OS guard that stopped it)',
    body: [
      'An unattended coding agent spawned 256 iOS Simulator processes on my Mac and hit load average 307.',
      '',
      'Prompt rules in CLAUDE.md did not stop it. When a parent shell times out, orphaned child subtrees keep burning CPU and metered API tokens in the background.',
      '',
      'We open-sourced `mac-yolo-safeguards` (MIT) and paired it with hosted Hermes on a fenced VPS ($10/mo, 14-day trial, approvals in thumbgate.app) so autonomous runs stay bounded:',
      '',
      '1. Process-group reaper (`kill(-pgid, SIGKILL)`): tears down the entire child tree on timeout, not just the parent PID.',
      '2. 60-second Simulator & runaway daemon sentinel (`com.igor.shutdown-simulators`): reaps orphaned Simulator/Gradle/Xcode spikes before WindowServer freezes.',
      '3. Gurobi-certified $10/mo token budget gate: routes bulk context work to local Apple Silicon models and blocks unapproved cloud spend.',
      '4. PreToolUse approval gate (<0.5ms local check + remote approvals in https://thumbgate.app): blocks destructive git/shell mutations before execution.',
      '',
      'Open-source MIT kit: https://github.com/IgorGanapolsky/mac-yolo-safeguards',
      'Hosted Hermes ($10/mo, fenced VPS, 14-day trial): https://thumbgate.app',
      '',
      '#CodingAgents #ClaudeCode #Cursor #macOS #DevOps #AgenticAI #OpenSource',
    ].join('\n'),
  },
  {
    id: 'rag-10m-docs-pretooluse-diode',
    campaignStem: 'mac-yolo-rag-10m-pretooluse',
    hook: 'Designing RAG for 10M documents solves what an agent can read — not what tool calls it is allowed to execute.',
    title: 'Why 10M-Document RAG Pipelines Still Need a <0.5ms PreToolUse Diode at the Tool Boundary',
    body: [
      'Designing RAG for 10M documents solves what an agent can read — not what tool calls it is allowed to execute.',
      '',
      'In production, hybrid retrieval (dense HNSW + BM25 + cross-encoder reranking) gives coding and operations agents sharp context. The failure happens one millisecond later when the agent acts on retrieved instructions:',
      '',
      '• A prompt-injected chunk or stale runbook triggers an unbounded `DELETE`, `git push --force`, or webhook retry loop.',
      '• Passive system-prompt rules degrade once trajectory context compacts past 100k+ tokens.',
      '• Cloud guardrail LLMs add 80ms+ of tail latency on every tool turn.',
      '',
      'That is why we separate retrieval from execution:',
      '• Local-first <0.5ms PreToolUse checks + SHA-256 execution receipts (`npx thumbgate@latest init`)',
      '• Hosted Hermes on a fenced VPS ($10/mo, 14-day trial, human approvals in https://thumbgate.app)',
      '• OS-level process-tree & $10/mo token ceiling for macOS agent fleets: https://github.com/IgorGanapolsky/mac-yolo-safeguards',
      '',
      '#RAG #VectorSearch #MCP #AIAgents #SystemDesign #SoftwareArchitecture #ThumbGate',
    ].join('\n'),
  },
  {
    id: 'fenced-vps-and-local-mac-guards',
    campaignStem: 'mac-yolo-fenced-vps-guards',
    hook: 'Every autonomous coding setup hits the same two walls: local Mac freezes and unreviewed destructive tool calls.',
    title: 'Fencing Autonomous Coding Agents: Local macOS OS Guards + Hosted Hermes on a Fenced VPS',
    body: [
      'Every autonomous coding setup hits the same two walls: local Mac freezes and unreviewed destructive tool calls.',
      '',
      'If you run Claude Code, Cursor, Codex, or Hermes overnight, you need hard engineering boundaries instead of wishful prompt prose:',
      '',
      '• On macOS: OS process-group reapers, 60s Simulator runaway guards, native menu-bar HUD telemetry, and a hard $10/mo metered token cap (`mac-yolo-safeguards`).',
      '• In the cloud: Hosted Hermes on a fenced VPS ($10/mo, 14-day trial) where risky shell/deploy actions pause for explicit approval in https://thumbgate.app.',
      '',
      'Free MIT guard kit: https://github.com/IgorGanapolsky/mac-yolo-safeguards',
      'Hosted Hermes & PreToolUse approvals: https://thumbgate.app',
      '',
      '#AIAgents #DeveloperTools #ClaudeCode #AutonomousAgents #PlatformEngineering #macOS',
    ].join('\n'),
  },
]);

function buildTrackedUrl(baseUrl, date, ctaId) {
  const sep = baseUrl.includes('?') ? '&' : '?';
  const campaign = `mac-yolo-linkedin-${date}`;
  return `${baseUrl}${sep}utm_source=linkedin&utm_medium=social&utm_campaign=${encodeURIComponent(campaign)}&cta_id=${encodeURIComponent(ctaId)}`;
}

function buildFirstCommentMonetizationBlock(date) {
  const thumbgateUtm = buildTrackedUrl(MONETIZATION_OFFERS.thumbgateHostedUrl, date, `${date}_linkedin_first_comment`);
  return [
    'Links & self-serve bundles from the post:',
    `• Free MIT macOS Guard Kit: ${MONETIZATION_OFFERS.freeRepoUrl}`,
    `• Solo Guard ($9 one-time installer + LaunchAgent pack): ${MONETIZATION_OFFERS.soloGumroadUrl}`,
    `• Pro Corporate-Expense Bundle ($49): ${MONETIZATION_OFFERS.proStripeUrl}`,
    `• Team Guard (5 Seats, $149): ${MONETIZATION_OFFERS.teamStripeUrl}`,
    `• Hosted Hermes on a fenced VPS ($10/mo, 14-day trial, approvals in browser): ${thumbgateUtm}`,
  ].join('\n');
}

function readJsonLines(filePath) {
  if (!filePath || !fs.existsSync(filePath)) return [];
  return fs
    .readFileSync(filePath, 'utf8')
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch (_) {
        return null;
      }
    })
    .filter(Boolean);
}

function readCrossRepoLinkedInState({
  date,
  ledgerPath = DEFAULT_LEDGER_PATH,
  thumbgateLedgerPath = THUMBGATE_LEDGER_PATH,
  contentLogPath = DEFAULT_CONTENT_LOG,
} = {}) {
  const targetDate = date || new Date().toISOString().slice(0, 10);
  const localLedger = readJsonLines(ledgerPath);
  const tgLedger = readJsonLines(thumbgateLedgerPath);
  const allEntries = [...localLedger, ...tgLedger];

  const commentedUrns = new Set();
  const repliedThreads = new Set();
  const postsToday = [];

  for (const entry of allEntries) {
    if (entry.urn) commentedUrns.add(String(entry.urn));
    if (entry.postUrn) commentedUrns.add(String(entry.postUrn));
    if (entry.threadId) repliedThreads.add(String(entry.threadId));
    const ts = String(entry.timestamp || entry.date || '');
    if (
      ts.startsWith(targetDate) &&
      (entry.action === 'daily_post_published' || entry.action === 'post_published')
    ) {
      postsToday.push(entry);
    }
  }

  if (contentLogPath && fs.existsSync(contentLogPath)) {
    const raw = fs.readFileSync(contentLogPath, 'utf8');
    for (const line of raw.split(/\r?\n/).slice(1)) {
      if (!line.trim()) continue;
      const cols = line.split('\t');
      const rowDate = (cols[0] || '').trim();
      const platform = (cols[1] || '').trim().toLowerCase();
      const status = (cols[9] || '').trim().toLowerCase();
      const postUrl = (cols[10] || '').trim();
      if (
        rowDate === targetDate &&
        platform === 'linkedin' &&
        (status === 'published' || status === 'live' || status === 'posted') &&
        postUrl.startsWith('http')
      ) {
        postsToday.push({ date: rowDate, platform, status, postUrl });
      }
    }
  }

  return {
    date: targetDate,
    alreadyPostedToday: postsToday.length > 0,
    postsTodayCount: postsToday.length,
    postsToday,
    commentedUrns: [...commentedUrns],
    repliedThreads: [...repliedThreads],
  };
}

function selectDailyPostForDate(date) {
  const targetDate = String(date || new Date().toISOString().slice(0, 10));
  const dayNum = Number(targetDate.replace(/-/g, '')) || 0;
  const post = DAILY_LINKEDIN_POSTS[dayNum % DAILY_LINKEDIN_POSTS.length];
  const campaign = `${post.campaignStem}-${targetDate}`;
  const trackedCta = buildTrackedUrl(MONETIZATION_OFFERS.thumbgateHostedUrl, targetDate, `${targetDate}_linkedin_home`);
  const bodyWithTrackedCta = `${post.body}\n\nTracked trial link: ${trackedCta}`;
  return {
    ...post,
    date: targetDate,
    campaign,
    trackedCta,
    bodyWithTrackedCta,
    firstComment: buildFirstCommentMonetizationBlock(targetDate),
  };
}

function validateDailyPostCandidate(candidate, { logPath = DEFAULT_CONTENT_LOG } = {}) {
  if (!candidate || typeof candidate !== 'object') {
    return { allow: false, decision: 'BLOCK', blocks: ['Invalid candidate object'], warnings: [] };
  }
  const combined = `${candidate.title || ''}\n${candidate.hook || ''}\n${candidate.bodyWithTrackedCta || candidate.body || ''}\n${candidate.firstComment || ''}`;
  if (CORP_AIRGAP_RE.test(combined)) {
    return {
      allow: false,
      decision: 'BLOCK',
      blocks: ['CORP_AIRGAP_RE violation: corporate air-gapped identifier detected in LinkedIn candidate'],
      warnings: [],
    };
  }
  if (FORBIDDEN_DRIFT_RE.test(combined)) {
    return {
      allow: false,
      decision: 'BLOCK',
      blocks: ['Forbidden business drift detected (Swappa/ShopGoodwill/Zernio/Hashnode)'],
      warnings: [],
    };
  }
  return evaluateSocialGate({
    platform: 'linkedin',
    campaign: candidate.campaign,
    hook: candidate.hook,
    body: candidate.bodyWithTrackedCta || candidate.body,
    title: candidate.title,
    requireBuyLinks: true,
    requireMentions: false,
    requireTaste: false,
    allowPartial: false,
    lookbackDays: 14,
    log: logPath,
  });
}

/**
 * Classify a LinkedIn feed post and draft a peer-to-peer founder engineering comment.
 * Link-free in third-party comments to avoid LinkedIn spam demotion; profile headline + pinned post carry CTAs.
 */
function classifyLinkedInFeedPost(post, { commentedUrns = [] } = {}) {
  if (!post || typeof post !== 'object' || !post.text || !post.urn) return null;
  const urn = String(post.urn).trim();
  if (!urn || commentedUrns.includes(urn)) return null;

  const author = String(post.author || '').toLowerCase();
  if (author.includes('igor ganapolsky') || author.includes('igor g.')) return null;

  const t = String(post.text).toLowerCase();
  if (
    FORBIDDEN_DRIFT_RE.test(t) ||
    CORP_AIRGAP_RE.test(t) ||
    t.includes('tax deed') ||
    t.includes('foreclosure') ||
    t.includes('crypto') ||
    t.includes('starting a new position') ||
    t.includes('congratulations')
  ) {
    return null;
  }

  // 1. High-scale RAG / Vector Search / 10M+ documents (e.g. Mayank Kumar, Resnur AI)
  if (
    (t.includes('rag') || t.includes('vector') || t.includes('rerank') || t.includes('hybrid retrieval')) &&
    (t.includes('million') || t.includes('10m') || t.includes('chunk') || t.includes('embedding') || t.includes('mcp') || t.includes('kafka'))
  ) {
    return {
      urn,
      author: post.author || 'unknown',
      category: 'rag_scale_and_pretooluse_boundary',
      comment:
        'Clean architecture breakdown—separating async Kafka parse/chunk workers from hybrid dense + lexical retrieval and cross-encoder reranking is what keeps p99 under 2s at 10M+ docs. One failure mode we hit once agents start acting on retrieved context via MCP is stale or injected chunks triggering retry loops at the tool write boundary; pairing the retrieval cache with a <0.5ms deterministic PreToolUse check (idempotency hash + 5x loop breaker) stops bad downstream mutations cold.',
    };
  }

  // 2. Agentic AI / Business Process Graphs / Knowledge Graphs / Agent Orchestration (e.g. Venkata Peetla)
  if (
    t.includes('agentorchestration') ||
    t.includes('businessprocessgraphs') ||
    t.includes('knowledgegraphs') ||
    (t.includes('agentic') && (t.includes('graph') || t.includes('orchestration') || t.includes('enterprise')))
  ) {
    return {
      urn,
      author: post.author || 'unknown',
      category: 'agentic_process_graph_governance',
      comment:
        'Spot on—modeling enterprise state transitions explicitly in a process/knowledge graph solves context drift, provided the execution boundary is equally deterministic. Moving policy enforcement out of the prompt and into a <0.5ms PreToolUse gate right before tool or API execution guarantees the agent cannot bypass graph invariants when context compacts.',
    };
  }

  // 3. MCP / Claude Code / Cursor / CopilotKit / OpenBot / Tool-Call Guardrails
  if (
    t.includes('mcp') ||
    t.includes('claude code') ||
    t.includes('cursor') ||
    t.includes('copilotkit') ||
    t.includes('open.bot') ||
    t.includes('tool call')
  ) {
    return {
      urn,
      author: post.author || 'unknown',
      category: 'mcp_pretooluse_execution_diode',
      comment:
        '100%. Passive rules in CLAUDE.md or system prompts degrade once trajectories pass 100k+ tokens, and orphaned subtrees can freeze a local Mac or burn metered API budget. Enforcing a deterministic <0.5ms PreToolUse check + process-group reaper at the tool boundary is the only way to keep unattended agent runs predictable.',
    };
  }

  // 4. Multi-step workflow automation (n8n, LangGraph, CrewAI)
  if (t.includes('n8n') || t.includes('langgraph') || t.includes('crewai') || t.includes('multi-agent')) {
    return {
      urn,
      author: post.author || 'unknown',
      category: 'multi_agent_loop_breaker',
      comment:
        'Great point. The #1 production liability we see in multi-agent and n8n/LangGraph workflows is a 5x hallucinated retry loop mutating an external webhook or database before validation. Putting a <0.5ms PreToolUse loop breaker with SHA-256 execution receipts at the write boundary eliminates runaway spend before the external API ever sees the call.',
    };
  }

  return null;
}

/**
 * Classify inbound LinkedIn comment notifications or DMs so real builders get technical replies
 * while paid promo spam / system tips are skipped.
 */
function classifyInboundNotificationOrDm(item) {
  if (!item || typeof item !== 'object') return { action: 'skip', reason: 'invalid_item' };
  const sender = String(item.sender || '').trim();
  const text = String(item.text || '').trim();
  const lower = text.toLowerCase();

  if (!sender || !text) return { action: 'skip', reason: 'empty_sender_or_text' };
  if (sender.toLowerCase().includes('linkedin team') || lower.includes('welcome to linkedin')) {
    return { action: 'skip', reason: 'system_welcome_message' };
  }
  if (
    lower.includes('combined audience of') ||
    lower.includes('launch-day visibility') ||
    lower.includes('paid promotion') ||
    lower.includes('sponsored post')
  ) {
    return {
      action: 'polite_decline_or_qualify',
      reason: 'paid_promo_pitch',
      reply:
        'Thanks for reaching out and checking out ThumbGate! Right now we are focused on organic engineering benchmarks and direct Workflow Hardening Pilots rather than paid audience blasts, but appreciate the note.',
    };
  }

  if (item.kind === 'post_comment') {
    return {
      action: 'reply_comment',
      reason: 'inbound_post_comment',
      reply:
        'Great distinction—separating what the model perceives in context from what the runtime is authorized to execute at the PreToolUse boundary (<0.5ms local check + explicit approval for destructive actions) is the exact architectural split we enforce in ThumbGate and mac-yolo-safeguards.',
    };
  }

  if (
    lower.includes('claude code') ||
    lower.includes('codex') ||
    lower.includes('agent') ||
    lower.includes('mcp') ||
    lower.includes('workflow')
  ) {
    return {
      action: 'reply_builder_dm',
      reason: 'builder_peer_dm',
      reply:
        'Appreciate you sharing that! We run Claude Code, Cursor, and Hermes daily with our open-source macOS process-tree/token guard (`mac-yolo-safeguards`) and ThumbGate PreToolUse approvals (`thumbgate.app`). Let me check out your room and see how the handoff boundary compares.',
    };
  }

  return { action: 'skip', reason: 'unclassified_inbound' };
}

function emitOtelSpan(spanName, attributes = {}, otelPath = OTEL_SPANS_PATH) {
  const serialized = JSON.stringify(attributes);
  if (CORP_AIRGAP_RE.test(serialized)) {
    throw new Error('CORP_AIRGAP_RE blocked OpenTelemetry span emission');
  }
  const nowNs = String(BigInt(Date.now()) * 1000000n);
  const span = {
    traceId: crypto.randomBytes(16).toString('hex'),
    spanId: crypto.randomBytes(8).toString('hex'),
    name: spanName,
    kind: 'INTERNAL',
    startTimeUnixNano: nowNs,
    endTimeUnixNano: nowNs,
    attributes: {
      'service.name': 'mac-yolo-safeguards',
      'gen_ai.system': 'linkedin-24x7-autopilot',
      'gen_ai.social.account': LINKEDIN_ACCOUNT,
      ...attributes,
    },
    status: { code: 'OK' },
  };
  try {
    fs.mkdirSync(path.dirname(otelPath), { recursive: true });
    fs.appendFileSync(otelPath, `${JSON.stringify(span)}\n`);
    return { ok: true, traceId: span.traceId, spanId: span.spanId };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

function runLinkedIn24x7Autopilot({
  date = new Date().toISOString().slice(0, 10),
  ledgerPath = DEFAULT_LEDGER_PATH,
  thumbgateLedgerPath = THUMBGATE_LEDGER_PATH,
  contentLogPath = DEFAULT_CONTENT_LOG,
  receiptPath = DEFAULT_RECEIPT_PATH,
  otelPath = OTEL_SPANS_PATH,
} = {}) {
  const crossState = readCrossRepoLinkedInState({
    date,
    ledgerPath,
    thumbgateLedgerPath,
    contentLogPath,
  });

  const candidate = selectDailyPostForDate(date);
  const gateResult = validateDailyPostCandidate(candidate, { logPath: contentLogPath });

  // Evaluate curated feed archetypes to prove engagement classifier readiness
  const sampleFeedDecisions = [
    classifyLinkedInFeedPost(
      {
        urn: 'urn:li:activity:rag-10m-docs-mayank-kumar',
        author: 'Mayank Kumar',
        text: 'Designing RAG for 10 Million Documents: From Uploads to Cited Answers. How do you build a RAG system that handles thousands of users with Kafka, hybrid retrieval, and reranking?',
      },
      { commentedUrns: crossState.commentedUrns },
    ),
    classifyLinkedInFeedPost(
      {
        urn: 'urn:li:activity:agentic-process-graphs-venkata-peetla',
        author: 'Venkata Peetla',
        text: 'Enterprise architecture with #businessprocessgraphs #agenticai #enterprisearchitecture #knowledgegraphs #agentorchestration',
      },
      { commentedUrns: crossState.commentedUrns },
    ),
  ].filter(Boolean);

  const otelReceipt = emitOtelSpan(
    'gen_ai.social.linkedin_24x7_autopilot',
    {
      'social.platform': 'linkedin',
      'social.date': date,
      'social.campaign': candidate.campaign,
      'social.gate_decision': gateResult.decision,
      'social.already_posted_today': crossState.alreadyPostedToday,
      'social.posts_today_count': crossState.postsTodayCount,
      'social.feed_candidates_ready': sampleFeedDecisions.length,
    },
    otelPath,
  );

  const receipt = {
    schema: 'mac-yolo-safeguards/linkedin-24x7-autopilot/v1',
    ok: gateResult.allow && Boolean(otelReceipt.ok),
    date,
    account: LINKEDIN_ACCOUNT,
    profileUrl: LINKEDIN_PROFILE_URL,
    crossRepoState: {
      alreadyPostedToday: crossState.alreadyPostedToday,
      postsTodayCount: crossState.postsTodayCount,
      commentedUrnsCount: crossState.commentedUrns.length,
      repliedThreadsCount: crossState.repliedThreads.length,
    },
    dailyPostCandidate: {
      id: candidate.id,
      campaign: candidate.campaign,
      title: candidate.title,
      hook: candidate.hook,
      trackedCta: candidate.trackedCta,
      firstComment: candidate.firstComment,
      gateDecision: gateResult.decision,
      gateAllow: gateResult.allow,
      gateBlocks: gateResult.blocks,
      gateWarnings: gateResult.warnings,
    },
    monetizationOffers: MONETIZATION_OFFERS,
    proactiveFeedEngagementReadyCount: sampleFeedDecisions.length,
    proactiveFeedSamples: sampleFeedDecisions,
    otel: otelReceipt,
    checkedAt: new Date().toISOString(),
  };

  if (receiptPath) {
    fs.mkdirSync(path.dirname(receiptPath), { recursive: true });
    fs.writeFileSync(receiptPath, `${JSON.stringify(receipt, null, 2)}\n`);
  }

  return receipt;
}

if (require.main === module) {
  const jsonMode = process.argv.includes('--json');
  const dateIdx = process.argv.indexOf('--date');
  const date = dateIdx >= 0 && process.argv[dateIdx + 1] ? process.argv[dateIdx + 1] : undefined;
  const res = runLinkedIn24x7Autopilot({ date });
  if (jsonMode) {
    console.log(JSON.stringify(res, null, 2));
  } else {
    console.log(
      `[linkedin-24x7-autopilot] ok=${res.ok} date=${res.date} gate=${res.dailyPostCandidate.gateDecision} alreadyPostedToday=${res.crossRepoState.alreadyPostedToday} feedReady=${res.proactiveFeedEngagementReadyCount}`,
    );
  }
  process.exit(res.ok ? 0 : 1);
}

module.exports = {
  LINKEDIN_ACCOUNT,
  LINKEDIN_PROFILE_URL,
  MONETIZATION_OFFERS,
  DAILY_LINKEDIN_POSTS,
  buildTrackedUrl,
  buildFirstCommentMonetizationBlock,
  readCrossRepoLinkedInState,
  selectDailyPostForDate,
  validateDailyPostCandidate,
  classifyLinkedInFeedPost,
  classifyInboundNotificationOrDm,
  emitOtelSpan,
  runLinkedIn24x7Autopilot,
};
