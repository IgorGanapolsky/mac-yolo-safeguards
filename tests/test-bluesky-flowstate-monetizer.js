'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  OUR_BLUESKY_HANDLE,
  OUR_BLUESKY_DID,
  MAX_BLUESKY_GRAPHEMES,
  DAILY_BLUESKY_POST_TEMPLATES,
  assertAirgapSafe,
  buildBlueskyLinkFacets,
  isHostileOrMetaComment,
  classifyBlueskyInboundReply,
  mergeFirstTouchAttribution,
  qualifyFlowstateLead,
  selectDailyBlueskyTemplate,
  runBlueskyFlowstateMonetizer,
} = require('../tools/bluesky-flowstate-monetizer');

describe('bluesky-flowstate-monetizer', () => {
  it('selects <=300 grapheme daily templates with byte-accurate link facets and passes social-publish-gate', () => {
    for (const dateStr of ['2026-11-11', '2026-11-12', '2026-11-13']) {
      const tpl = selectDailyBlueskyTemplate(dateStr);
      assert.ok(tpl.graphemes <= MAX_BLUESKY_GRAPHEMES, `Expected <= 300 graphemes, got ${tpl.graphemes}`);
      assert.ok(tpl.facets.length >= 1, 'Expected at least 1 clickable link facet');
      for (const facet of tpl.facets) {
        const sliced = Buffer.from(tpl.body, 'utf8')
          .subarray(facet.index.byteStart, facet.index.byteEnd)
          .toString('utf8');
        assert.equal(sliced, facet.features[0].uri);
      }
    }
    assert.equal(DAILY_BLUESKY_POST_TEMPLATES.length, 3);
  });

  it('uses word boundaries for hostile/bot detection so "both" and "bottleneck" are never dropped', () => {
    const sasameComment =
      "For an agent workflow gate, I'd test both the failed action and recovery. PASS = a regression fixture blocks the bad action, a rollout has a traceable version, and rollback restores the prior behavior on replay. What artifact makes rollback evidence convincing to you?";
    assert.equal(isHostileOrMetaComment(sasameComment), false);
    assert.equal(isHostileOrMetaComment('Wait is this a bot account posting spam?'), true);
  });

  it('classifies technical Bluesky replies and skips threads where we already replied', () => {
    const autoflow = classifyBlueskyInboundReply({
      authorHandle: 'autoflow.bsky.social',
      uri: 'at://did:plc:ait3ewyppkd4ubgkldb6pvn3/app.bsky.feed.post/3mzl5hoaq4y2i',
      text: 'TTL for rule scope is genius—prevents permanent drift. That immutable audit trail turns exceptions into data points for hardening the system.',
    });
    assert.equal(autoflow.action, 'reply');
    assert.equal(autoflow.category, 'ttl_override_audit');
    assert.ok(autoflow.draftReply.includes('https://thumbgate.app'));

    const sasame = classifyBlueskyInboundReply({
      authorHandle: 'sasame-mcp.bsky.social',
      uri: 'at://did:plc:uhu2pey3lt44nnr4rtxgpuoc/app.bsky.feed.post/3mzgktgoyls2w',
      text: "For an agent workflow gate, I'd test both the failed action and recovery. What artifact makes rollback evidence convincing to you?",
    });
    assert.equal(sasame.action, 'reply');
    assert.equal(sasame.category, 'rollback_replay_receipt');
    assert.ok(sasame.draftReply.includes('SHA-256'));

    const horizon = classifyBlueskyInboundReply({
      authorHandle: 'horizonshield.bsky.social',
      uri: 'at://did:plc:abvsiafhe53jswv62vckbnc6/app.bsky.feed.post/3mtjklf2yw223',
      text: 'And "200 with no proof it looked = a failure, not data" is the sharp one: proof-of-work for reads. The heartbeat is the runtime half tools/list can\'t show me.',
    });
    assert.equal(horizon.action, 'reply');
    assert.equal(horizon.category, 'proof_of_work_reads');

    const alreadyReplied = classifyBlueskyInboundReply({
      authorHandle: 'sasame-mcp.bsky.social',
      uri: 'at://did:plc:uhu2pey3lt44nnr4rtxgpuoc/app.bsky.feed.post/3mzgktgoyls2w',
      text: 'What artifact makes rollback evidence convincing to you?',
      threadReplies: [{ post: { author: { did: OUR_BLUESKY_DID, handle: OUR_BLUESKY_HANDLE } } }],
    });
    assert.equal(alreadyReplied.action, 'skip');
    assert.equal(alreadyReplied.reason, 'already_replied_in_thread');
  });

  it('implements Flowstate.com qualification routing, pixel suppression on /not-a-fit, and first-touch UTM persistence', () => {
    const firstTouch = mergeFirstTouchAttribution(
      {},
      { utm_source: 'bluesky', utm_medium: 'social', utm_campaign: 'bsky_launch', gclid: 'gclid_123' },
    );
    const secondTouch = mergeFirstTouchAttribution(firstTouch, {
      utm_source: 'google',
      utm_campaign: 'later_campaign',
      fbclid: 'fbclid_456',
    });
    assert.equal(secondTouch.attr_utm_source, 'bluesky');
    assert.equal(secondTouch.attr_utm_campaign, 'bsky_launch');
    assert.equal(secondTouch.attr_gclid, 'gclid_123');
    assert.equal(secondTouch.attr_fbclid, 'fbclid_456');

    const disqualified = qualifyFlowstateLead(
      { firstName: 'Sam', agentStack: 'cursor', incidentCost: 'under-500', failureMode: 'mac-freeze' },
      secondTouch,
    );
    assert.equal(disqualified.qualified, false);
    assert.equal(disqualified.route, '/not-a-fit');
    assert.equal(disqualified.conversionBeaconAllowed, false);
    assert.ok(disqualified.primaryCheckoutUrl.includes('utm_source=bluesky'));

    const qualified = qualifyFlowstateLead(
      { firstName: 'Alex', agentStack: 'claude-code', incidentCost: '5000-plus', failureMode: 'unsafe-mutation' },
      secondTouch,
    );
    assert.equal(qualified.qualified, true);
    assert.equal(qualified.route, '/intensive-qualified');
    assert.equal(qualified.conversionBeaconAllowed, true);
    assert.ok(qualified.primaryCheckoutUrl.includes('buy.stripe.com/dRmeVd9eA4r4aK5gWL3sJ0Y'));
    assert.ok(qualified.secondaryCheckoutUrl.includes('buy.stripe.com/4gM28r1M8g9M3hD0XN3sI38'));
  });

  it('runs end-to-end autopilot and blocks corporate airgap leakage', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bsky-flowstate-test-'));
    const ledgerPath = path.join(tmpDir, 'ledger.jsonl');
    const otelPath = path.join(tmpDir, 'otel.jsonl');

    const res = runBlueskyFlowstateMonetizer({
      date: '2026-11-11',
      ledgerPath,
      otelPath,
      recordLivePostUrl: 'https://bsky.app/profile/iganapolsky.bsky.social/post/3mzzx4lxwle2m',
      recordAtUri: 'at://did:plc:67posxdluf3h6sri6ciqivzx/app.bsky.feed.post/3mzzx4lxwle2m',
      recordCid: 'bafyreid56kyhi7kxbasdxacdp5lueglqaadxqxhpbkmfad55asymepawru',
    });

    assert.equal(res.ok, true);
    assert.equal(res.alreadyPostedToday, true);
    assert.equal(res.flowstateFunnel.funnelHtmlPresent, true);
    assert.equal(res.flowstateFunnel.qualifiedBeaconAllowed, true);
    assert.equal(res.flowstateFunnel.disqualifiedBeaconAllowed, false);

    assert.throws(() => assertAirgapSafe('Deployed StockService to ecinexus.com'), /CORP_AIRGAP_DIODE/);
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
