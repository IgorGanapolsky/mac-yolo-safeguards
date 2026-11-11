#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  DAILY_LINKEDIN_POSTS,
  MONETIZATION_OFFERS,
  buildFirstCommentMonetizationBlock,
  readCrossRepoLinkedInState,
  selectDailyPostForDate,
  validateDailyPostCandidate,
  classifyLinkedInFeedPost,
  classifyInboundNotificationOrDm,
  emitOtelSpan,
  runLinkedIn24x7Autopilot,
} = require('../tools/linkedin-24x7-autopilot');

function runTests() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'linkedin-24x7-test-'));
  const ledgerPath = path.join(tmpDir, 'local-ledger.jsonl');
  const tgLedgerPath = path.join(tmpDir, 'tg-ledger.jsonl');
  const contentLogPath = path.join(tmpDir, 'content-log.tsv');
  const receiptPath = path.join(tmpDir, 'receipt.json');
  const otelPath = path.join(tmpDir, 'otel.jsonl');

  fs.writeFileSync(
    contentLogPath,
    'Date\tPlatform\tPersona\tPain\tAngle\tEvidence\tHook\tCTA\tCampaign\tStatus\tPostURL\tOutcome\n',
  );

  // 1. Every daily post rotation passes social-publish-gate with --require-buy-links
  for (let i = 0; i < DAILY_LINKEDIN_POSTS.length; i += 1) {
    const date = `2026-11-1${i + 1}`;
    const candidate = selectDailyPostForDate(date);
    const gate = validateDailyPostCandidate(candidate, { logPath: contentLogPath });
    assert.strictEqual(gate.allow, true, `Expected ALLOW for ${candidate.id}: ${JSON.stringify(gate.blocks)}`);
    assert.strictEqual(gate.decision, 'ALLOW');
    assert.ok(candidate.firstComment.includes(MONETIZATION_OFFERS.soloGumroadUrl));
    assert.ok(candidate.firstComment.includes(MONETIZATION_OFFERS.proStripeUrl));
    assert.ok(candidate.firstComment.includes(MONETIZATION_OFFERS.thumbgateHostedUrl));
  }
  console.log('ok 1 all daily LinkedIn posts pass social-publish-gate and include first-comment monetization ladder');

  // 2. Forbidden drift (Swappa/ShopGoodwill/Zernio/Hashnode) and corporate air-gap strings are hard-blocked
  const badSwappa = {
    ...selectDailyPostForDate('2026-11-11'),
    bodyWithTrackedCta: 'Check out our Swappa and ShopGoodwill arbitrage desk https://thumbgate.app',
  };
  const swappaGate = validateDailyPostCandidate(badSwappa, { logPath: contentLogPath });
  assert.strictEqual(swappaGate.allow, false);
  assert.ok(swappaGate.blocks.some((b) => /Swappa/i.test(b)));

  const badCorp = {
    ...selectDailyPostForDate('2026-11-11'),
    bodyWithTrackedCta: 'Internal PSN_StockService endpoint https://thumbgate.app',
  };
  const corpGate = validateDailyPostCandidate(badCorp, { logPath: contentLogPath });
  assert.strictEqual(corpGate.allow, false);
  assert.ok(corpGate.blocks.some((b) => /CORP_AIRGAP_RE/i.test(b)));
  console.log('ok 2 Swappa/ShopGoodwill business drift and corporate air-gap strings are hard-blocked');

  // 3. Feed engagement classifier handles 10M-doc RAG, Agentic Process Graphs, MCP/Claude Code, and skips self/off-topic
  const ragComment = classifyLinkedInFeedPost({
    urn: 'urn:li:activity:mayank-10m-rag',
    author: 'Mayank Kumar',
    text: 'Designing RAG for 10 Million Documents: From Uploads to Cited Answers with Kafka, hybrid retrieval, and reranking.',
  });
  assert.ok(ragComment);
  assert.strictEqual(ragComment.category, 'rag_scale_and_pretooluse_boundary');
  assert.ok(!/https?:\/\//i.test(ragComment.comment), 'Third-party feed comments must stay link-free');

  const graphComment = classifyLinkedInFeedPost({
    urn: 'urn:li:activity:venkata-graphs',
    author: 'Venkata Peetla',
    text: 'Enterprise architecture with #businessprocessgraphs #agenticai #knowledgegraphs #agentorchestration',
  });
  assert.ok(graphComment);
  assert.strictEqual(graphComment.category, 'agentic_process_graph_governance');

  const dupComment = classifyLinkedInFeedPost(
    {
      urn: 'urn:li:activity:mayank-10m-rag',
      author: 'Mayank Kumar',
      text: 'Designing RAG for 10 Million Documents',
    },
    { commentedUrns: ['urn:li:activity:mayank-10m-rag'] },
  );
  assert.strictEqual(dupComment, null, 'Already-commented URN must be skipped');

  const selfPost = classifyLinkedInFeedPost({
    urn: 'urn:li:activity:self-post',
    author: 'Igor Ganapolsky',
    text: 'Designing RAG for 10 Million Documents with MCP and Claude Code',
  });
  assert.strictEqual(selfPost, null, 'Own post must never be self-commented by feed classifier');
  console.log('ok 3 feed post classifier engages RAG/Agentic/MCP posts and skips duplicates and self-posts');

  // 4. Inbound comment & DM classifier distinguishes post comments, builder DMs, and paid boost pitches
  const kierenReply = classifyInboundNotificationOrDm({
    kind: 'post_comment',
    sender: 'Kieren Day',
    text: 'The distinction between what an agent perceives and what it is permitted to execute is critical.',
  });
  assert.strictEqual(kierenReply.action, 'reply_comment');
  assert.ok(kierenReply.reply.includes('PreToolUse'));

  const builderDm = classifyInboundNotificationOrDm({
    kind: 'dm',
    sender: 'Rodrigo Lemela Duarte',
    text: 'If you run Claude Code or Codex yourself, you can try a shared room in your workflow.',
  });
  assert.strictEqual(builderDm.action, 'reply_builder_dm');

  const promoDm = classifyInboundNotificationOrDm({
    kind: 'dm',
    sender: 'Dhirendra Singh',
    text: 'I help PH founders with launch-day visibility via LinkedIn. I manage a combined audience of 600K.',
  });
  assert.strictEqual(promoDm.action, 'polite_decline_or_qualify');
  console.log('ok 4 inbound comment & DM classifier separates post comments, builder DMs, and paid promo pitches');

  // 5. Cross-repo state deduplication & full autopilot run with OpenTelemetry span
  fs.writeFileSync(
    tgLedgerPath,
    `${JSON.stringify({
      timestamp: '2026-11-11T12:05:00.000Z',
      action: 'daily_post_published',
      urn: 'urn:li:activity:7526000000000000000',
    })}\n`,
  );
  const crossState = readCrossRepoLinkedInState({
    date: '2026-11-11',
    ledgerPath,
    thumbgateLedgerPath: tgLedgerPath,
    contentLogPath,
  });
  assert.strictEqual(crossState.alreadyPostedToday, true);
  assert.strictEqual(crossState.postsTodayCount, 1);

  const autopilotReceipt = runLinkedIn24x7Autopilot({
    date: '2026-11-11',
    ledgerPath,
    thumbgateLedgerPath: tgLedgerPath,
    contentLogPath,
    receiptPath,
    otelPath,
  });
  assert.strictEqual(autopilotReceipt.ok, true);
  assert.strictEqual(autopilotReceipt.crossRepoState.alreadyPostedToday, true);
  assert.strictEqual(autopilotReceipt.otel.ok, true);
  assert.ok(fs.existsSync(receiptPath));
  assert.ok(fs.existsSync(otelPath));

  assert.throws(
    () => emitOtelSpan('test.span', { bad: 'psn-stockservice.ecinexus.com' }, otelPath),
    /CORP_AIRGAP_RE/,
  );
  console.log('ok 5 cross-repo deduplication and OpenTelemetry span emission with CORP_AIRGAP_RE diode pass');

  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log('test-linkedin-24x7-autopilot: PASS 5');
}

runTests();
