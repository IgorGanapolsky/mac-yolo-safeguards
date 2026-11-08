#!/usr/bin/env node
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const lib = require(path.join(ROOT, 'tools', 'lib', 'confidence-offer-gate'));
const cli = path.join(ROOT, 'tools', 'confidence-offer-gate.js');

function runCli(args) {
  return spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
}

let passed = 0;
function ok(name) {
  passed += 1;
  console.log(`ok ${passed} ${name}`);
}

assert.strictEqual(lib.PAGE_READ.plan, 'Free');
assert.strictEqual(lib.PAGE_READ.workspace, 'ThumbGate Workspace');
assert.strictEqual(lib.PAGE_READ.rows.length, 6);
assert.ok(lib.PAGE_READ.rows.every((row) => row.name !== 'Mac YOLO Safeguards'));
assert.strictEqual(lib.PAGE_READ.rows.find((row) => row.name.endsWith('(Ship)')).demo, true);
assert.strictEqual(lib.AGENT_EMAIL_READ.readOn, '2026-11-08');
assert.strictEqual(lib.AGENT_EMAIL_READ.subject, 'Meet the Confidence Agent, wherever you work');
assert.strictEqual(lib.AGENT_EMAIL_READ.from, 'jsoderholm@confidence.spotify.com');
assert.strictEqual(lib.AGENT_EMAIL_READ.replyTo, 'experimentation-cs@spotify.com');
assert.strictEqual(lib.AGENT_EMAIL_READ.mcpUrl, 'https://mcp.confidence.dev/mcp/flags');
assert.strictEqual(
  lib.AGENT_EMAIL_READ.outcomePrompt,
  'Summarise the checkout test and flag any guardrail regressions.',
);
ok('the signed-in experiments page and the 2026-11-08 Confidence Agent email are recorded truthfully');

const standing = lib.judgeOffer({ surfaces: [lib.OFFER_URL] });
assert.strictEqual(standing.effect, 'sell');
assert.strictEqual(standing.recommendation, 'Continue');
assert.strictEqual(standing.launched, false);
assert.strictEqual(standing.listingChanged, false);
assert.strictEqual(standing.calledConfidence, false);
assert.strictEqual(standing.mcpAdded, false);
assert.strictEqual(standing.slackAdded, false);
assert.strictEqual(standing.githubConnected, false);
assert.strictEqual(standing.autopilot, false);
assert.strictEqual(standing.reviewBeforeAct, true);
assert.strictEqual(standing.recordedCents, 0);
assert.strictEqual(lib.judgeOffer({ surfaces: [lib.OFFER_URL, `${lib.OFFER_URL}/`] }).effect, 'sell');
ok('one buyer URL stays the current listing');

const priced = lib.judgeOffer({ discount: true, priceCents: 3920 });
assert.strictEqual(priced.effect, 'refuse');
assert.strictEqual(priced.recommendation, 'Abort');
assert.strictEqual(priced.listingChanged, false);
assert.strictEqual(priced.priceCents, 4900);
assert.strictEqual(lib.judgeOffer({ rewriteListing: true }).effect, 'refuse');
ok('a price change is refused and the listing stays');

const demo = lib.judgeOffer({ name: 'Reduce checkout time (Ship)' });
assert.strictEqual(demo.effect, 'hold');
assert.strictEqual(demo.recommendation, "Don't ship");
assert.strictEqual(demo.countsAsRevenue, false);
const other = lib.judgeOffer({ name: 'ThumbGate Direct Checkout A/B' });
assert.strictEqual(other.effect, 'hold');
assert.strictEqual(other.countsAsRevenue, false);
assert.strictEqual(lib.judgeOffer({ guardrailHarm: true }).recommendation, 'Abort');
assert.strictEqual(lib.judgeOffer({ sampleRatioMismatch: true }).effect, 'refuse');
ok('demo Ship and a harmed split do not count');

const mcpRefused = lib.judgeOffer({ addMcp: true, mcpUrl: 'https://mcp.confidence.dev/mcp/flags' });
assert.strictEqual(mcpRefused.effect, 'refuse');
assert.strictEqual(mcpRefused.mcpAdded, false);
const slackRefused = lib.judgeOffer({ addSlack: true });
assert.strictEqual(slackRefused.effect, 'refuse');
assert.strictEqual(slackRefused.slackAdded, false);
const githubRefused = lib.judgeOffer({ connectGithub: true });
assert.strictEqual(githubRefused.effect, 'refuse');
assert.strictEqual(githubRefused.githubConnected, false);
const autoRefused = lib.judgeOffer({ autopilot: true });
assert.strictEqual(autoRefused.effect, 'refuse');
assert.strictEqual(autoRefused.autopilot, false);
assert.strictEqual(autoRefused.reviewBeforeAct, true);
const emailRefused = lib.judgeOffer({ senderEmail: 'jsoderholm@confidence.spotify.com' });
assert.strictEqual(emailRefused.effect, 'refuse');
ok('remote Confidence MCP, Slack bot, GitHub connect, autopilot, and vendor onboarding mail are refused');

const cleanSummary = lib.summariseCheckout({ surfaces: [lib.OFFER_URL] });
assert.strictEqual(cleanSummary.effect, 'sell');
assert.strictEqual(cleanSummary.regressionSummary, 'none');
assert.strictEqual(cleanSummary.reviewBeforeAct, true);
assert.strictEqual(cleanSummary.autopilot, false);
const regressedSummary = lib.summariseCheckout({ guardrailHarm: true, sampleRatioMismatch: true });
assert.strictEqual(regressedSummary.effect, 'refuse');
assert.strictEqual(regressedSummary.recommendation, 'Abort');
assert.strictEqual(regressedSummary.regressionSummary, 'guardrail_harm,sample_ratio_mismatch');
ok('checkout summary flags guardrail regressions and enforces review before acting');

const founder = lib.judgeOffer({
  charge: {
    source: 'measured',
    live: true,
    refunded: false,
    founder: false,
    amountCents: 4900,
    email: 'iganapolsky@gmail.com',
    processor: 'gumroad',
  },
});
assert.strictEqual(founder.countsAsRevenue, false);
assert.strictEqual(founder.recordedCents, 0);
const buyer = lib.judgeOffer({
  surfaces: [lib.OFFER_URL, 'https://example.invalid/mac-yolo-b'],
  successMetric: 'third_party_paid_order',
  charge: {
    source: 'measured',
    live: true,
    refunded: false,
    amountCents: 4900,
    email: 'buyer@example.invalid',
    processor: 'stripe',
  },
});
assert.strictEqual(buyer.recommendation, 'Ship');
assert.strictEqual(buyer.launched, false);
assert.strictEqual(buyer.listingChanged, false);
assert.strictEqual(buyer.countsAsRevenue, true);
assert.strictEqual(buyer.recordedCents, 4900);
assert.strictEqual(lib.judgeOffer({
  surfaces: [lib.OFFER_URL, 'https://example.invalid/mac-yolo-b'],
  successMetric: 'page_view',
}).effect, 'refuse');
assert.strictEqual(lib.judgeOffer({ callConfidence: true, remote: 'https://app.confidence.spotify.com/experiments' }).calledConfidence, false);
ok('only a measured third-party order can count, and nothing launches');

for (const file of ['tools/lib/confidence-offer-gate.js', 'tools/confidence-offer-gate.js']) {
  const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
  assert.ok(!source.includes('fetch('));
  assert.ok(!source.includes('https.request'));
  assert.ok(!source.includes('child_process'));
  assert.ok(!source.includes('9998'));
  assert.ok(!source.includes('89.6'));
}
ok('the check does not call out or store a vendor figure');

const offer = runCli(['offer']);
assert.strictEqual(offer.status, 0);
assert.match(offer.stdout, /^Admitted\. Sell the Mac app\. One buyer URL is not an experiment\./);
assert.match(offer.stdout, /launched=false calledConfidence=false listingChanged=false recorded=0/);
assert.ok(!offer.stdout.includes('4900'));

const summaryCli = runCli(['summary']);
assert.strictEqual(summaryCli.status, 0);
assert.match(summaryCli.stdout, /regressions=none recommendation=Continue reviewBeforeAct=true autopilot=false/);

const projectCli = runCli(['project']);
assert.strictEqual(projectCli.status, 0);
assert.match(projectCli.stdout, /project=Mac YOLO Safeguards surface=https:\/\/iganapolsky\.gumroad\.com\/l\/nllmvb metric=third_party_paid_order reviewBeforeAct=true/);

const discount = runCli(['discount']);
assert.strictEqual(discount.status, 77);
assert.match(discount.stdout, /^Refused\. A price change is not a win/);

const shown = runCli(['demo']);
assert.strictEqual(shown.status, 75);
assert.match(shown.stdout, /^Held\. Demo data is not a Mac YOLO sale\./);

const remote = runCli(['remote']);
assert.strictEqual(remote.status, 77);
assert.match(remote.stdout, /calledConfidence=false/);

const mcpCli = runCli(['mcp']);
assert.strictEqual(mcpCli.status, 77);
assert.match(mcpCli.stdout, /^Refused\. This check does not add the Confidence MCP server\./);

const slackCli = runCli(['slack']);
assert.strictEqual(slackCli.status, 77);
assert.match(slackCli.stdout, /^Refused\. This check does not add the Confidence Slack bot\./);

const githubCli = runCli(['github']);
assert.strictEqual(githubCli.status, 77);
assert.match(githubCli.stdout, /^Refused\. This check does not connect GitHub to Confidence\./);

const autopilotCli = runCli(['autopilot']);
assert.strictEqual(autopilotCli.status, 77);
assert.match(autopilotCli.stdout, /^Refused\. Review before you act\./);

const emailCli = runCli(['email']);
assert.strictEqual(emailCli.status, 77);
assert.match(emailCli.stdout, /^Refused\. The Confidence Agent email is vendor onboarding/);

const split = runCli(['split', '--left', 'https://example.invalid/a', '--right', 'https://example.invalid/b']);
assert.strictEqual(split.status, 75);
assert.match(split.stdout, /^Held\. Two buyer URLs exist/);

const uplift = runCli(['offer', '--uplift', '89.6']);
assert.strictEqual(uplift.status, 77);
assert.ok(!uplift.stdout.includes('89.6'));
ok('the command keeps the listing and prints no invented figure');

console.log(`test-confidence-offer-gate: PASS ${passed}`);
